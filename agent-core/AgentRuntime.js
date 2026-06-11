/**
 * Agent 运行时 — 直接调用 DeepSeek API，支持 function calling 循环 + 记忆
 * 不依赖 LangChain 的消息抽象层，避免格式兼容问题
 */
import MemoryStore from "./MemoryStore.js";
import fs from "node:fs";
import path from "node:path";

function getApiKey() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      const profile = auth.profiles?.["deepseek:default"];
      if (profile?.key) return profile.key;
    }
  } catch {}
  return process.env.DEEPSEEK_API_KEY || "";
}

const API_BASE = "https://api.deepseek.com/v1";
const API_KEY = getApiKey();

function buildToolDefinition(tool) {
  // Convert Zod schema or other schema to JSON Schema for DeepSeek
  var parameters = { type: "object", properties: {} };
  try {
    if (tool.schema && typeof tool.schema === "object") {
      // DynamicStructuredTool stores schema - try to serialize it
      var description = tool.schema.description;
      if (tool.schema._def && tool.schema._def.typeName === "ZodObject") {
        // ZodObject: extract shape
        var shape = tool.schema._def.shape();
        parameters.properties = {};
        for (var key of Object.keys(shape)) {
          var field = shape[key];
          parameters.properties[key] = { type: "string", description: field.description || "" };
          if (field._def && field._def.typeName === "ZodNumber") {
            parameters.properties[key].type = "number";
          }
        }
        parameters.description = description || "";
      }
    }
  } catch {}
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: parameters
    }
  };
}

export default class AgentRuntime {
  constructor({ agentId, systemPrompt, tools = [], memory }) {
    this.agentId = agentId;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.memory = memory || new MemoryStore(agentId);
    this.contextData = {};
  }

  setContext(data) { this.contextData = data; }
  getContext() { return this.contextData; }

  async chat(userMessage) {
    this.memory.addUserMessage(userMessage);

    const toolDefs = this.tools.map(buildToolDefinition);

    // Main loop
    let finalAnswer = "";
    let hasUserMsg = false; // Track if we've added the user message to memory

    for (let round = 0; round < 10; round++) {
      // Build messages from memory (system + history, NO duplicate user message)
      const messages = [
        { role: "system", content: this.systemPrompt }
      ];
      const history = this.memory.getHistory(30);
      for (const msg of history) {
        if (msg.role === "user") {
          messages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          const asst = { role: "assistant", content: msg.content === undefined || msg.content === null ? null : msg.content };
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            asst.tool_calls = msg.toolCalls;
          }
          messages.push(asst);
        } else if (msg.role === "tool") {
          messages.push({ role: "tool", tool_call_id: msg.toolCallId, content: String(msg.content) });
        }
      }

      const response = await this._callAPI(messages, toolDefs);
      if (!response) {
        finalAnswer = "AI 服务暂时不可用。";
        break;
      }

      const choice = response.choices?.[0];
      const replyMsg = choice?.message;
      if (!replyMsg) {
        finalAnswer = "AI 返回内容为空。";
        break;
      }

      const content = replyMsg.content || "";
      const toolCalls = replyMsg.tool_calls || [];

      if (!toolCalls.length) {
        // No tool calls → final answer
        finalAnswer = content;
        this.memory.addAssistantMessage(content);
        break;
      }

      // Build the assistant message with tool_calls as DeepSeek expects it
      const assistantMsg = { role: "assistant", content: content || null };
      assistantMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function?.name || tc.name || "",
          arguments: tc.function?.arguments || (typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args || {}))
        }
      }));

      // Save assistant message with tool calls to memory
      this.memory.addAssistantMessage(content || null, assistantMsg.tool_calls);

      // Add assistant message to the messages array (MUST be before tool messages)
      messages.push(assistantMsg);

      // Execute each tool
      for (const tc of toolCalls) {
        const tcId = tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const toolName = tc.function?.name || tc.name || "";
        let args = {};
        try {
          const rawArgs = tc.function?.arguments || tc.args || "{}";
          args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
        } catch {}

        const tool = this.tools.find((t) => t.name === toolName);
        let result = "";

        if (tool) {
          try {
            result = await tool.invoke(args);
            result = typeof result === "string" ? result : JSON.stringify(result);
          } catch (err) {
            result = `工具执行失败: ${err.message}`;
          }
        } else {
          result = `未知工具: ${toolName}`;
        }

        this.memory.addToolResult(tcId, result);
        messages.push({
          role: "tool",
          tool_call_id: tcId,
          content: result
        });
      }
    }

    return { answer: finalAnswer || "未生成回答。", agentId: this.agentId };
  }

  async _callAPI(messages, tools) {
    const body = {
      model: "deepseek-chat",
      messages,
      temperature: 0.3,
      max_tokens: 4000,
    };
    if (tools.length > 0) {
      body.tools = tools;
    }

    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return null;
      }
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  clearMemory() { this.memory.clear(); this.memory.messages = []; }
}
