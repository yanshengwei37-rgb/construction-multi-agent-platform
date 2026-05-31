const providers = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "演示默认通道，适合问答和摘要。"
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "支持更丰富的生成和引用式回答。"
  },
  {
    id: "onprem",
    label: "Private LLM",
    description: "适合后续私有化部署与内网数据隔离。"
  }
];

export function listProviders() {
  return structuredClone(providers);
}

export function getProvider(providerId) {
  return providers.find((item) => item.id === providerId) || providers[0];
}
