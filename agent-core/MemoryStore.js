/**
 * 记忆存储 — 每个 agent 持有自己的对话历史，支持持久化到文件
 */
import fs from "node:fs";
import path from "node:path";

const MEMORY_DIR = path.join(process.cwd(), "agent-core", ".memories");

export default class MemoryStore {
  constructor(agentId, options = {}) {
    this.agentId = agentId;
    this.maxMessages = options.maxMessages ?? 50;
    this.filePath = path.join(MEMORY_DIR, `${agentId}.json`);
    this.messages = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.messages = JSON.parse(raw);
      }
    } catch {}
  }

  _save() {
    try {
      if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
      // Keep only last N messages
      const trimmed = this.messages.slice(-this.maxMessages);
      fs.writeFileSync(this.filePath, JSON.stringify(trimmed, null, 2));
    } catch {}
  }

  addUserMessage(text) {
    this.messages.push({ role: "user", content: text });
    this._save();
  }

  addAssistantMessage(text, toolCalls) {
    this.messages.push({ role: "assistant", content: text, toolCalls: toolCalls || [] });
    this._save();
  }

  addToolResult(toolCallId, result) {
    this.messages.push({ role: "tool", toolCallId, content: typeof result === "string" ? result : JSON.stringify(result) });
    this._save();
  }

  getHistory(limit = 20) {
    return this.messages.slice(-limit);
  }

  clear() {
    this.messages = [];
    this._save();
  }
}
