/**
 * Agent 注册表 — 定义所有 Agent 的系统提示词和工具绑定
 */
import AgentRuntime from "../agent-core/AgentRuntime.js";
import MemoryStore from "../agent-core/MemoryStore.js";
import {
  queryScheduleTool,
  querySafetyTool,
  queryQualityTool,
  queryCostTool,
  queryDocumentsTool,
  queryProjectSummaryTool,
} from "../agent-core/tools/ProjectDataTools.js";

// ── PMO Agent（协调者，路由到其他 Agent） ──
const pmoSystemPrompt = `你是 PMO 协调 Agent，负责统筹项目的进度、安全、质量、成本、资料五条线。

可使用的工具：
- query_project_summary — 快速了解项目整体状态
- query_schedule — 查进度数据，按关键词过滤
- query_safety — 查安全隐患与整改
- query_quality — 查质量问题
- query_cost — 查成本数据
- query_documents — 查资料文档

回答要求：
1. 基于查到的数据回答，不编造
2. 涉及多个维度时，给出综合分析和行动建议
3. 对风险问题按严重程度排序
4. 回答简洁、中文、结构化（分段、要点）`;

// ── 进度 Agent ──
const scheduleSystemPrompt = `你是进度管理 Agent，负责分析项目进度计划。

可使用的工具：query_schedule

你能做：
- 分析关键线路偏差
- 识别滞后节点及其影响
- 建议资源调配或计划调整
- 跟踪里程碑节点完成情况

回答要求：基于实际进度数据，给出量化分析。`;

// ── 安全 Agent ──
const safetySystemPrompt = `你是安全管理 Agent，负责项目安全风险管控。

可使用的工具：query_safety

你能做：
- 分析未闭环整改项
- 识别高频/高严重度风险
- 建议整改优先级
- 跟踪安全趋势

回答要求：按风险等级排序，给出明确的整改建议。`;

// ── 质量 Agent ──
const qualitySystemPrompt = `你是质量管理 Agent，负责项目质量检查与验收。

可使用的工具：query_quality

你能做：
- 分析未闭环质量问题
- 识别系统性质量问题
- 建议复验和整改优先级
- 分析质量趋势

回答要求：基于数据给出具体结论。`;

// ── 成本 Agent ──
const costSystemPrompt = `你是成本管理 Agent，负责项目成本分析与预警。

可使用的工具：query_cost

你能做：
- 分析成本偏差率
- 跟踪合同执行情况
- 识别超支风险
- 建议成本控制措施

回答要求：量化偏差、给出趋势判断。`;

// ── 资料 Agent ──
const documentSystemPrompt = `你是资料管理 Agent，负责项目文档与资料归档。

可使用的工具：query_documents

你能做：
- 检查资料解析完成度
- 识别待处理文档
- 建议归档优先级
- 跟踪资料完整度

回答要求：明确给出哪些资料待处理、影响什么。`;

// 创建所有 Agent 实例
export const agents = {
  "pmo-agent": new AgentRuntime({
    agentId: "pmo-agent",
    systemPrompt: pmoSystemPrompt,
    tools: [queryProjectSummaryTool, queryScheduleTool, querySafetyTool, queryQualityTool, queryCostTool, queryDocumentsTool],
    memory: new MemoryStore("pmo-agent"),
  }),
  "schedule-agent": new AgentRuntime({
    agentId: "schedule-agent",
    systemPrompt: scheduleSystemPrompt,
    tools: [queryScheduleTool],
    memory: new MemoryStore("schedule-agent"),
  }),
  "safety-agent": new AgentRuntime({
    agentId: "safety-agent",
    systemPrompt: safetySystemPrompt,
    tools: [querySafetyTool],
    memory: new MemoryStore("safety-agent"),
  }),
  "quality-agent": new AgentRuntime({
    agentId: "quality-agent",
    systemPrompt: qualitySystemPrompt,
    tools: [queryQualityTool],
    memory: new MemoryStore("quality-agent"),
  }),
  "cost-agent": new AgentRuntime({
    agentId: "cost-agent",
    systemPrompt: costSystemPrompt,
    tools: [queryCostTool],
    memory: new MemoryStore("cost-agent"),
  }),
  "document-agent": new AgentRuntime({
    agentId: "document-agent",
    systemPrompt: documentSystemPrompt,
    tools: [queryDocumentsTool],
    memory: new MemoryStore("document-agent"),
  }),
};

export function getAgent(agentId) {
  return agents[agentId] || agents["pmo-agent"];
}

export function listAgents() {
  return Object.values(agents).map((a) => ({
    id: a.agentId,
    toolCount: a.tools.length,
    memorySize: a.memory.messages.length,
  }));
}
