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
    name: "质量/技术 Agent",
    scope: "质量验收、技术方案摘要、规范检索",
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

function topQualityIssue(quality) {
  return quality?.issues
    ?.filter((item) => item.status !== "closed")
    .sort((left, right) => (left.severity === "high" ? -1 : 1))[0];
}

function latestCostVariance(techCost) {
  const latest = techCost?.costSnapshots?.[techCost.costSnapshots.length - 1];
  if (!latest) return null;
  return {
    ...latest,
    varianceRate: latest.budget ? Number((((latest.actual - latest.budget) / latest.budget) * 100).toFixed(1)) : 0
  };
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
  if (lowerName.includes("质量") || lowerName.includes("验收") || lowerName.includes("实测")) {
    return {
      type: payload.type || "质量验收",
      module: "quality",
      classificationConfidence: 0.91,
      excerpt: payload.notes || "识别为质量验收或实测实量资料。",
      citations: ["质量/技术 Agent 已将该资料归入质量模块。"]
    };
  }
  if (lowerName.includes("成本") || lowerName.includes("计量") || lowerName.includes("合同")) {
    return {
      type: payload.type || "成本资料",
      module: "cost",
      classificationConfidence: 0.89,
      excerpt: payload.notes || "识别为成本、计量或合同资料。",
      citations: ["成本 Agent 已将该资料归入成本模块。"]
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

// Get DeepSeek API key from OpenClaw auth profile
function getDeepSeekKey() {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
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

function buildProjectContext(project, schedule, documents, safety, quality, techCost) {
  var parts = [];
  parts.push(`项目名称：${project.name}（${project.type}）`);
  parts.push(`当前阶段：${project.stage}　总进度：${project.summary?.progress || 0}%`);
  parts.push(`质量评分：${project.summary?.qualityScore || 0}　安全评分：${project.summary?.safetyScore || 0}`);
  parts.push(`资料完整度：${project.summary?.docCompleteness || 0}%　成本偏差：${project.summary?.costDeviation || 0}%`);
  
  // Schedule
  if (schedule?.nodes?.length) {
    var warning = schedule.nodes.filter(function(n) { return n.critical && n.varianceDays < 0; });
    if (warning.length) {
      parts.push("\n【关键线路滞后节点】");
      warning.slice(0, 5).forEach(function(n) {
        parts.push(`  ${n.name}：完成${n.percent || 0}%，滞后${Math.abs(n.varianceDays)}天，责任人${n.owner || "-"}`);
      });
    }
    parts.push(`\n计划共 ${schedule.nodes.length} 个节点，滞后 ${schedule.nodes.filter(function(n) { return n.varianceDays < 0; }).length} 个。`);
  }
  
  // Safety
  if (safety?.rectifications?.length) {
    var open = safety.rectifications.filter(function(r) { return r.status !== "closed"; });
    parts.push(`\n【安全】未闭环整改 ${open.length} 项`);
    open.slice(0, 5).forEach(function(r) {
      parts.push(`  ${r.title}（${r.status}，截止${r.deadline}）`);
    });
  }
  
  // Quality
  if (quality?.issues?.length) {
    var openQ = quality.issues.filter(function(q) { return q.status !== "closed"; });
    parts.push(`\n【质量】未闭环 ${openQ.length} 项`);
    openQ.slice(0, 5).forEach(function(q) {
      parts.push(`  ${q.title}：${q.status}，责任人${q.owner}`);
    });
  }
  
  // Cost
  if (techCost?.costSnapshots?.length) {
    var latest = techCost.costSnapshots[techCost.costSnapshots.length - 1];
    if (latest) {
      var rate = latest.budget ? Number((((latest.actual - latest.budget) / latest.budget) * 100).toFixed(1)) : 0;
      parts.push(`\n【成本】最新月份 ${latest.month}：预算${latest.budget}万，实际${latest.actual}万，偏差${rate}%`);
    }
  }
  
  // Documents
  if (documents?.length) {
    var pending = documents.filter(function(d) { return d.parseStatus !== "indexed"; });
    parts.push(`\n【资料】共 ${documents.length} 份，待解析 ${pending.length} 份`);
    pending.slice(0, 3).forEach(function(d) {
      parts.push(`  ${d.name}（${d.parseStatus}）`);
    });
  }
  
  return parts.join("\n");
}

async function callDeepSeekChat(systemPrompt, userMessage) {
  var apiKey = getDeepSeekKey();
  if (!apiKey) {
    return "AI 服务未配置 API 密钥，请配置 DeepSeek 密钥后重试。";
  }
  try {
    var response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });
    if (!response.ok) {
      var errText = await response.text().catch(function() { return ""; });
      return "AI 请求失败：" + response.status + (errText ? " " + errText : "");
    }
    var data = await response.json();
    return data.choices?.[0]?.message?.content || "AI 未返回有效回答。";
  } catch (err) {
    return "AI 请求异常：" + (err.message || String(err));
  }
}

export function answerProjectQuestion({ project, question, schedule, documents, safety, quality, techCost, provider }) {
  var text = (question || "").trim();
  if (!text) {
    return { answer: "请输入您的问题。", citations: [], agents: ["pmo-agent"] };
  }

  const warningNode = topScheduleWarning(schedule);
  const rectification = topSafetyRisk(safety);
  const qualityIssue = topQualityIssue(quality);
  const document = pendingDocument(documents);
  const costVariance = latestCostVariance(techCost);
  const citations = [
    warningNode ? { id: warningNode.id, label: warningNode.name, module: "schedule" } : null,
    rectification ? { id: rectification.id, label: rectification.title, module: "safety" } : null,
    qualityIssue ? { id: qualityIssue.id, label: qualityIssue.title, module: "quality" } : null,
    document ? { id: document.id, label: document.name, module: "documents" } : null
  ].filter(Boolean);

  const summaryLines = [
    `本周建议优先关注 ${warningNode?.name || "关键线路执行"}。`,
    rectification ? `安全侧待闭环事项是 ${rectification.title}。` : "安全侧暂无高风险未闭环事项。",
    qualityIssue ? `质量侧需跟踪 ${qualityIssue.title}。` : "质量侧暂无新增未闭环问题。",
    typeof costVariance === "number" ? `当前成本偏差约 ${costVariance.toFixed(1)}%。` : "当前成本偏差信息不足。",
    document ? `资料侧建议优先补齐 ${document.name} 的索引与引用。` : "资料侧暂无待补索引资料。"
  ];

  return {
    answer: summaryLines.join("\n"),
    citations,
    agents: ["pmo-agent", "schedule-agent", "safety-agent", "document-agent", "tech-agent", "cost-agent"]
  };
}

export function generateAsyncAnalysis({ runType, project, schedule, documents, safety, quality, techCost, provider, prompt }) {
  const warningNode = topScheduleWarning(schedule);
  const rectification = topSafetyRisk(safety);
  const qualityIssue = topQualityIssue(quality);
  const costVariance = latestCostVariance(techCost);
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
  if (runType === "quality-review") {
    return {
      agentId: "tech-agent",
      severity: qualityIssue?.severity === "high" ? "warning" : "normal",
      title: "质量复核完成",
      summary: qualityIssue ? `${qualityIssue.title} 需按 ${qualityIssue.deadline} 完成整改复验，建议同步留存照片与验收记录。` : "当前质量台账暂无未闭环问题。",
      citations: qualityIssue ? [{ id: qualityIssue.id, label: qualityIssue.title, module: "quality" }] : [],
      provider: provider.label
    };
  }
  if (runType === "cost-review") {
    return {
      agentId: "cost-agent",
      severity: Math.abs(costVariance?.varianceRate || 0) > 2 ? "warning" : "normal",
      title: "成本偏差分析完成",
      summary: costVariance ? `${costVariance.month} 成本偏差 ${costVariance.varianceRate}%，建议核对合同变更、材料调差和已完工程量口径。` : "当前暂无成本快照可分析。",
      citations: costVariance ? [{ id: `cost-${costVariance.month}`, label: `${costVariance.month}成本快照`, module: "cost" }] : [],
      provider: provider.label
    };
  }
  return {
    agentId: "pmo-agent",
    severity: "warning",
    title: "项目周报摘要完成",
    summary: `${project.name} 当前需要同步关注进度、质量、安全、成本与资料闭环，来源于问题：${prompt}`,
    citations: uniqueCitations([
      warningNode && { id: warningNode.id, label: warningNode.name, module: "schedule" },
      rectification && { id: rectification.id, label: rectification.title, module: "safety" },
      qualityIssue && { id: qualityIssue.id, label: qualityIssue.title, module: "quality" },
      costVariance && { id: `cost-${costVariance.month}`, label: `${costVariance.month}成本快照`, module: "cost" },
      document && { id: document.id, label: document.name, module: "documents" }
    ].filter(Boolean)),
    provider: provider.label
  };
}
