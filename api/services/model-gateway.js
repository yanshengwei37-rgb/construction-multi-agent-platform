const providers = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "演示默认通道，适合问答和摘要。",
    capabilities: {
      chat: ["deepseek-chat", "deepseek-reasoner"],
      embedding: ["bge-m3"],
      ocr: ["paddle-ocr-local"],
      rerank: ["bge-reranker-v2"]
    }
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "支持更丰富的生成和引用式回答。",
    capabilities: {
      chat: ["gpt-4.1", "gpt-4.1-mini"],
      embedding: ["text-embedding-3-large"],
      ocr: ["gpt-4.1-mini-vision"],
      rerank: ["text-rerank-1"]
    }
  },
  {
    id: "onprem",
    label: "Private LLM",
    description: "适合后续私有化部署与内网数据隔离。",
    capabilities: {
      chat: ["qwen2.5-72b-instruct"],
      embedding: ["bge-large-zh-v1.5"],
      ocr: ["paddle-ocr-private"],
      rerank: ["bge-reranker-large"]
    }
  }
];

export function listProviders() {
  return structuredClone(providers);
}

export function getProvider(providerId) {
  return providers.find((item) => item.id === providerId) || providers[0];
}

export function getProviderModel(providerId, capability = "chat", preferredModel) {
  const provider = getProvider(providerId);
  const models = provider.capabilities?.[capability] || [];
  return preferredModel && models.includes(preferredModel) ? preferredModel : models[0];
}
