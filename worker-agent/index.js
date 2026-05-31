export const agentCatalog = [
  {
    id: "pmo-agent",
    name: "PMO 协调 Agent",
    scope: "项目路由、纪要、跨模块摘要",
    mode: "sync+async"
  },
  {
    id: "schedule-agent",
    name: "进度 Agent",
    scope: "WBS 偏差分析、里程碑预警",
    mode: "sync+async"
  },
  {
    id: "safety-agent",
    name: "安全 Agent",
    scope: "隐患聚类、整改优先级、风险热区",
    mode: "sync+async"
  },
  {
    id: "document-agent",
    name: "资料 Agent",
    scope: "文档分类、OCR 摘要、引用检索",
    mode: "sync+async"
  },
  {
    id: "tech-agent",
    name: "技术 Agent",
    scope: "技术方案摘要、规范检索",
    mode: "sync"
  },
  {
    id: "cost-agent",
    name: "成本 Agent",
    scope: "成本偏差摘要、合同事项跟踪",
    mode: "sync"
  }
];

function uniqueCitations(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.module}:${item.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function topScheduleWarning(schedule) {
  return schedule.nodes
    .filter((node) => node.critical)
    .sort((left, right) => left.varianceDays - right.varianceDays)[0];
}

function topSafetyRisk(safety) {
  return safety.rectifications
    .slice()
    .sort((left, right) => (left.severity === "high" ? -1 : 1))[0];
}

function pendingDocument(documents) {
  return documents.find((document) => document.parseStatus !== "indexed") || documents[0];
}

export function classifyDocumentUpload(payload) {
  const lowerName = `${payload.name} ${payload.notes || ""}`.toLowerCase();
  if (lowerName.includes("进度") || lowerName.includes("wbs")) {
    return {
      type: "WBS计划",
      module: "schedule",
      classificationConfidence: 0.96,
      excerpt: payload.notes || "识别为进度计划或 WBS 节点资料。",
      citations: ["资料 Agent 识别为进度计划，可用于 WBS 问答与偏差分析。"]
    };
  }
  if (lowerName.includes("安全") || lowerName.includes("巡检") || lowerName.includes("照片")) {
    return {
      type: payload.type || "巡检",
      module: "safety",
      classificationConfidence: 0.9,
      excerpt: payload.notes || "识别为安全巡检或现场照片资料。",
      citations: ["资料 Agent 已将该资料归入安全模块。"]
    };
  }
  if (lowerName.includes("方案") || lowerName.includes("规范")) {
    return {
      type: payload.type || "施工方案",
      module: "tech",
      classificationConfidence: 0.88,
      excerpt: payload.notes || "识别为技术方案或规范资料。",
      citations: ["技术 Agent 可引用该资料进行方案摘要。"]
    };
  }
  return {
    type: payload.type || "周报",
    module: payload.module || "documents",
    classificationConfidence: 0.84,
    excerpt: payload.notes || "识别为综合业务资料，已完成索引。",
    citations: ["资料 Agent 已建立通用索引。"]
  };
}

export function answerProjectQuestion({ project, question, schedule, documents, safety, provider }) {
  const warningNode = topScheduleWarning(schedule);
  const rectification = topSafetyRisk(safety);
  const document = pendingDocument(documents);
  const text = question.trim();
  const citations = [];
  const lines = [];

  if (text.includes("本周") || text.includes("关注") || text.includes("重点")) {
    lines.push("本周建议优先关注 3 件事：");
    if (warningNode) {
      lines.push(`1. 进度：${warningNode.name} 当前完成 ${warningNode.percent}%，关键线路偏差 ${Math.abs(warningNode.varianceDays)} 天。`);
      citations.push({ id: warningNode.id, label: `${warningNode.name} ${warningNode.percent}%`, module: "schedule" });
    }
    if (rectification) {
      lines.push(`2. 安全：${rectification.title} 仍处于 ${rectification.status} 状态，整改截止 ${rectification.deadline}。`);
      citations.push({ id: rectification.id, label: rectification.title, module: "safety" });
    }
    if (document) {
      lines.push(`3. 资料：${document.name} 当前解析状态为 ${document.parseStatus}，建议补齐归档后再用于问答和复盘。`);
      citations.push({ id: document.id, label: document.name, module: "documents" });
    }
  } else if (text.includes("资料") || text.includes("文档")) {
    lines.push(`项目当前共 ${documents.length} 份核心资料，其中 ${documents.filter((item) => item.parseStatus !== "indexed").length} 份待完成解析。`);
    documents.slice(0, 3).forEach((documentItem, index) => {
      lines.push(`${index + 1}. ${documentItem.name}：${documentItem.parseStatus}。`);
      citations.push({ id: documentItem.id, label: documentItem.name, module: "documents" });
    });
  } else if (text.includes("安全") || text.includes("隐患")) {
    lines.push(`当前未闭环整改 ${safety.rectifications.filter((item) => item.status !== "closed").length} 项。`);
    safety.rectifications.slice(0, 3).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}：${item.status}，截止 ${item.deadline}。`);
      citations.push({ id: item.id, label: item.title, module: "safety" });
    });
  } else {
    lines.push(`项目 ${project.name} 当前总进度 ${project.summary.progress}%，安全评分 ${project.summary.safetyScore}，资料完整度 ${project.summary.docCompleteness}%。`);
    if (warningNode) {
      lines.push(`关键线路最需要关注的是 ${warningNode.name}。`);
      citations.push({ id: warningNode.id, label: warningNode.name, module: "schedule" });
    }
    if (rectification) {
      lines.push(`安全侧优先事项是 ${rectification.title}。`);
      citations.push({ id: rectification.id, label: rectification.title, module: "safety" });
    }
  }

  lines.push(`模型通道：${provider.label}。`);
  return {
    answer: lines.join("\n"),
    citations: uniqueCitations(citations),
    agents: ["pmo-agent", "schedule-agent", "safety-agent", "document-agent"]
  };
}

export function generateAsyncAnalysis({ runType, project, schedule, documents, safety, provider, prompt }) {
  const warningNode = topScheduleWarning(schedule);
  const rectification = topSafetyRisk(safety);
  const document = pendingDocument(documents);
  if (runType === "schedule-scan") {
    return {
      agentId: "schedule-agent",
      severity: "warning",
      title: "关键线路扫描完成",
      summary: `${warningNode.name} 为当前最关键的偏差节点，建议优先保障 ${warningNode.owner} 的资源投入。`,
      citations: [{ id: warningNode.id, label: warningNode.name, module: "schedule" }],
      provider: provider.label
    };
  }
  if (runType === "safety-review") {
    return {
      agentId: "safety-agent",
      severity: rectification?.severity === "high" ? "warning" : "normal",
      title: "安全风险复核完成",
      summary: `${rectification.title} 仍未闭环，建议在班前会中直接确认责任人与完成时间。`,
      citations: [{ id: rectification.id, label: rectification.title, module: "safety" }],
      provider: provider.label
    };
  }
  if (runType === "document-digest") {
    return {
      agentId: "document-agent",
      severity: document.parseStatus === "indexed" ? "normal" : "warning",
      title: "资料归档摘要完成",
      summary: `${document.name} 已完成分类处理，当前状态为 ${document.parseStatus}。`,
      citations: [{ id: document.id, label: document.name, module: "documents" }],
      provider: provider.label
    };
  }
  return {
    agentId: "pmo-agent",
    severity: "warning",
    title: "周报摘要完成",
    summary: `${project.name} 当前需要同步关注进度偏差、安全整改与资料归档，来源于问题：${prompt}`,
    citations: uniqueCitations([
      warningNode && { id: warningNode.id, label: warningNode.name, module: "schedule" },
      rectification && { id: rectification.id, label: rectification.title, module: "safety" },
      document && { id: document.id, label: document.name, module: "documents" }
    ].filter(Boolean)),
    provider: provider.label
  };
}
