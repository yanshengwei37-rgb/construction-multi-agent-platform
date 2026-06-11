/**
 * LLM 网关 — 统一模型调用，支持 DeepSeek / Qwen 通道切换
 */
import { ChatOpenAI } from "@langchain/openai";
import fs from "node:fs";
import path from "node:path";

function getDeepSeekKey() {
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

function getQwenKey() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      const profile = auth.profiles?.["qwen:default"];
      if (profile?.key) return profile.key;
    }
  } catch {}
  return process.env.QWEN_API_KEY || "";
}

const PROVIDERS = {
  deepseek: {
    getModel: (modelName = "deepseek-chat", options = {}) =>
      new ChatOpenAI({
        model: modelName,
        apiKey: getDeepSeekKey(),
        configuration: { baseURL: "https://api.deepseek.com/v1" },
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens ?? 4000,
      }),
  },
  qwen: {
    getModel: (modelName = "qwen-plus", options = {}) =>
      new ChatOpenAI({
        model: modelName,
        apiKey: getQwenKey(),
        configuration: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens ?? 4000,
      }),
  },
};

export function getChatModel(providerId = "deepseek", modelName, options = {}) {
  const provider = PROVIDERS[providerId] || PROVIDERS.deepseek;
  return provider.getModel(modelName, options);
}

export function listProviders() {
  return Object.keys(PROVIDERS).map((id) => ({ id, label: id === "deepseek" ? "DeepSeek" : "Qwen" }));
}
