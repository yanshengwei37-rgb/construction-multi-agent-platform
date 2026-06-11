/**
 * 项目数据工具 — 每个工具对应一个 function calling 定义，查询 store.js 数据
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, "..", "..", "api", "data", "store.js");

let storeModule = null;
async function getStore() {
  if (!storeModule) {
    storeModule = await import(`file://${storePath}`);
  }
  return storeModule;
}

// ── 进度查询 ──
export const queryScheduleTool = new DynamicStructuredTool({
  name: "query_schedule",
  description: "查询项目进度数据，按关键词过滤节点（如主体结构、地下室、机电、消防等）",
  schema: z.object({
    keyword: z.string().optional().describe("过滤关键词，如'地下室'、'消防'、'结构'等"),
    limit: z.number().optional().default(10).describe("返回条数上限"),
  }),
  func: async ({ keyword, limit }) => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const nodes = data.nodes || [];
      let filtered = nodes;
      if (keyword) {
        const kw = keyword.toLowerCase();
        filtered = nodes.filter((n) => (n.name || "").toLowerCase().includes(kw));
      }
      const result = filtered.slice(0, limit).map((n) => ({
        name: n.name,
        percent: n.percent ?? 0,
        varianceDays: n.varianceDays ?? 0,
        owner: n.owner || "",
        critical: !!n.critical,
        plannedDate: n.plannedDate || "",
      }));
      return JSON.stringify({
        total: nodes.length,
        filtered: filtered.length,
        items: result,
      });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

// ── 安全查询 ──
export const querySafetyTool = new DynamicStructuredTool({
  name: "query_safety",
  description: "查询项目安全隐患与整改记录",
  schema: z.object({
    status: z.string().optional().describe("筛选状态：open/closed"),
    limit: z.number().optional().default(10),
  }),
  func: async ({ status, limit }) => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const rectifications = data.rectifications || [];
      let filtered = rectifications;
      if (status === "open") filtered = rectifications.filter((r) => r.status !== "closed");
      else if (status === "closed") filtered = rectifications.filter((r) => r.status === "closed");
      const items = filtered.slice(0, limit).map((r) => ({
        title: r.title,
        status: r.status,
        deadline: r.deadline || "",
        severity: r.severity || "",
        owner: r.owner || "",
        location: r.location || "",
      }));
      return JSON.stringify({ total: rectifications.length, filtered: items.length, items });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

// ── 质量查询 ──
export const queryQualityTool = new DynamicStructuredTool({
  name: "query_quality",
  description: "查询项目质量问题与整改记录",
  schema: z.object({
    status: z.string().optional().describe("筛选状态"),
    limit: z.number().optional().default(10),
  }),
  func: async ({ status, limit }) => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const issues = data.qualityIssues || [];
      let filtered = issues;
      if (status) filtered = issues.filter((q) => q.status === status);
      const items = filtered.slice(0, limit).map((q) => ({
        title: q.title,
        status: q.status,
        deadline: q.deadline || "",
        owner: q.owner || "",
        severity: q.severity || "",
      }));
      return JSON.stringify({ total: issues.length, filtered: items.length, items });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

// ── 成本查询 ──
export const queryCostTool = new DynamicStructuredTool({
  name: "query_cost",
  description: "查询项目成本数据：成本快照、合同、偏差",
  schema: z.object({
    limit: z.number().optional().default(5),
  }),
  func: async ({ limit }) => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const snapshots = (data.costSnapshots || []).slice(-limit);
      const contracts = (data.contracts || []).slice(0, limit);
      return JSON.stringify({
        costSnapshots: snapshots.map((c) => ({
          month: c.month,
          budget: c.budget,
          actual: c.actual,
          varianceRate: c.budget ? Number((((c.actual - c.budget) / c.budget) * 100).toFixed(1)) : 0,
        })),
        contracts: contracts.map((c) => ({ name: c.name, summary: c.summary, amount: c.amount })),
      });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

// ── 资料查询 ──
export const queryDocumentsTool = new DynamicStructuredTool({
  name: "query_documents",
  description: "查询项目资料文档",
  schema: z.object({
    status: z.string().optional().describe("解析状态：indexed/ocr_queued/failed"),
    limit: z.number().optional().default(10),
  }),
  func: async ({ status, limit }) => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const docs = data.documents || [];
      let filtered = docs;
      if (status) filtered = docs.filter((d) => d.parseStatus === status);
      const items = filtered.slice(0, limit).map((d) => ({
        name: d.name,
        type: d.type || "",
        parseStatus: d.parseStatus || "",
        uploadDate: d.uploadDate || "",
      }));
      return JSON.stringify({ total: docs.length, filtered: items.length, items });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

// ── 项目概要 ──
export const queryProjectSummaryTool = new DynamicStructuredTool({
  name: "query_project_summary",
  description: "查询项目概要信息，用于快速了解项目整体状态",
  schema: z.object({}),
  func: async () => {
    try {
      const store = await getStore();
      const data = store.getDemoData?.() || {};
      const project = data.project || {};
      return JSON.stringify({
        name: project.name,
        type: project.type,
        stage: project.stage,
        progress: project.summary?.progress,
        qualityScore: project.summary?.qualityScore,
        safetyScore: project.summary?.safetyScore,
        docCompleteness: project.summary?.docCompleteness,
        costDeviation: project.summary?.costDeviation,
        buildings: (project.buildings || []).map((b) => `${b.name}(${b.floors}F)`).join(", "),
      });
    } catch (err) {
      return `查询失败: ${err.message}`;
    }
  },
});

export const ALL_TOOLS = [
  queryScheduleTool,
  querySafetyTool,
  queryQualityTool,
  queryCostTool,
  queryDocumentsTool,
  queryProjectSummaryTool,
];
