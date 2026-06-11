const platformBlueprint = {
  title: "建筑工程项目多智能体管理平台建设规划",
  strategy: {
    recommendation: "前后端一起做，但由前端体验牵引，后端从第一天开始提供稳定契约。",
    rationale: "平台是业务闭环系统，进度、质量、成本、安全、资料、Agent 问答、待办、通知、审计、权限都需要数据流支撑。",
    priority: "项目层优先，单项目五条线跑通后再接公司级多项目管理层。"
  },
  productScope: {
    projectUsers: ["项目经理", "生产经理", "质量负责人", "安全负责人", "商务经理", "资料员", "现场人员"],
    companyUsers: ["公司管理层", "区域负责人", "PMO"],
    v1Modules: ["项目仪表盘", "智能问答", "进度", "质量", "成本", "安全", "资料", "待办", "通知", "审计"],
    companyLayer: ["多项目总览", "风险排行", "项目下钻入口"]
  },
  phases: [
    {
      id: "phase-0",
      name: "第 0 阶段：产品蓝图与数据契约",
      duration: "3-5 天",
      goal: "把用户、范围、实体和 API 契约定死，避免边做边推翻。",
      outputs: ["核心用户角色", "V1 范围", "统一实体", "API 契约", "验收口径"],
      acceptance: "前端、后端、Agent 三方都按同一组业务对象和接口边界推进。"
    },
    {
      id: "phase-1",
      name: "第 1 阶段：前端主体验 + 后端轻服务同步",
      duration: "1-2 周",
      goal: "做出项目经理能看懂的完整平台形态，所有页面都接真实 API 契约。",
      outputs: ["桌面端五条线", "移动端现场入口", "Agent 组织关系页", "审计日志", "站内通知"],
      acceptance: "每条线至少有列表、录入、状态变化、通知和审计留痕。"
    },
    {
      id: "phase-2",
      name: "第 2 阶段：进度 + 安全 + 资料深闭环",
      duration: "3-5 周",
      goal: "优先做深最能体现多智能体价值的三条线。",
      outputs: ["WBS 导入与偏差", "安全巡检与整改", "资料解析索引", "带引用问答"],
      acceptance: "三条线能从录入到 Agent 分析、通知、人工确认、审计留痕完整跑通。"
    },
    {
      id: "phase-3",
      name: "第 3 阶段：质量与成本闭环",
      duration: "2-4 周",
      goal: "把质量和成本从看板台账升级为可运行闭环。",
      outputs: ["质量检查", "质量问题复验", "成本快照", "合同关注项", "成本 Agent 摘要"],
      acceptance: "质量问题能闭环，成本偏差能形成 Agent 摘要，并进入问答上下文。"
    },
    {
      id: "phase-4",
      name: "第 4 阶段：真实后端工程化",
      duration: "4-6 周",
      goal: "从本地演示服务升级为可私有化部署的后端基础。",
      outputs: ["PostgreSQL", "对象存储/MinIO", "任务队列", "真实模型网关", "API 合约测试"],
      acceptance: "重启数据不丢，异步任务可追踪，关键操作均可审计。"
    },
    {
      id: "phase-5",
      name: "第 5 阶段：公司层管理接入",
      duration: "2-4 周",
      goal: "在单项目数据稳定后接入公司级多项目汇总。",
      outputs: ["多项目总览", "进度偏差排行", "安全风险排行", "资料完整度排行", "项目下钻"],
      acceptance: "公司层指标全部来自项目层真实数据聚合，权限不能绕过。"
    }
  ],
  coreEntities: [
    "Project",
    "WBSNode",
    "QualityIssue",
    "CostSnapshot",
    "RiskItem",
    "Document",
    "AgentRun",
    "AgentInsight",
    "Notification",
    "AuditLog"
  ],
  interfaceGroups: [
    {
      id: "organization-project",
      name: "组织与项目",
      capabilities: ["项目列表", "项目详情", "成员", "权限上下文"],
      minimumEndpoints: ["GET /api/session", "GET /api/portfolio", "GET /api/projects/:projectId/dashboard"]
    },
    {
      id: "schedule",
      name: "进度",
      capabilities: ["WBS 导入", "节点列表", "节点更新", "偏差计算", "里程碑预警"],
      minimumEndpoints: ["GET /api/projects/:projectId/schedule", "POST /api/projects/:projectId/schedule/import"]
    },
    {
      id: "quality",
      name: "质量",
      capabilities: ["检查录入", "问题台账", "复验记录"],
      minimumEndpoints: ["GET /api/projects/:projectId/quality", "POST /api/projects/:projectId/quality/inspections", "POST /api/projects/:projectId/quality/issues/:issueId/recheck"]
    },
    {
      id: "cost",
      name: "成本",
      capabilities: ["成本快照", "预算实际偏差", "合同关注项"],
      minimumEndpoints: ["GET /api/projects/:projectId/cost", "POST /api/projects/:projectId/cost/snapshots"]
    },
    {
      id: "safety",
      name: "安全",
      capabilities: ["巡检", "隐患", "整改", "复查", "风险矩阵"],
      minimumEndpoints: ["GET /api/projects/:projectId/safety", "POST /api/projects/:projectId/safety/inspections", "POST /api/projects/:projectId/safety/rectifications/:taskId/feedback"]
    },
    {
      id: "documents",
      name: "资料",
      capabilities: ["上传", "列表", "筛选", "版本", "解析状态", "引用来源"],
      minimumEndpoints: ["GET /api/projects/:projectId/documents", "POST /api/projects/:projectId/documents"]
    },
    {
      id: "agents-messages",
      name: "Agent 与消息",
      capabilities: ["同步问答", "异步 AgentRun", "AgentInsight", "Notification", "AuditLog"],
      minimumEndpoints: ["POST /api/agent/chat", "POST /api/agent/runs", "GET /api/agent/runs", "GET /api/projects/:projectId/notifications", "GET /api/projects/:projectId/audit-logs"]
    },
    {
      id: "model-gateway",
      name: "模型网关",
      capabilities: ["chat", "embedding", "ocr", "rerank"],
      minimumEndpoints: ["GET /api/model/providers", "POST /api/model/provider", "GET /api/agent/config"]
    }
  ],
  acceptanceScenarios: [
    "权限：公司、项目、现场三类角色访问范围正确。",
    "进度：导入 WBS 后生成节点、偏差、Agent 预警。",
    "安全：移动端录入隐患后，桌面端出现整改任务和通知。",
    "资料：上传资料后能分类、解析、索引，并被问答引用。",
    "质量：检查发现问题后能整改、复验、闭环。",
    "成本：录入快照后能计算偏差并生成 Agent 摘要。",
    "Agent：同步问答必须带引用；异步 AgentRun 状态完整流转。",
    "公司层：多项目指标来自项目层聚合，不使用假数据。"
  ],
  defaults: [
    "V1 优先项目层，不急着做公司层深分析。",
    "V1 不接正式 ERP、BIM、OA，只预留连接器接口。",
    "V1 不做高度自治，所有关键业务动作必须人工确认。",
    "技术管理先并入质量技术线，二期再拆独立模块。",
    "当前仓库继续作为本地演示和工程化雏形，后续逐步替换为数据库、队列、对象存储和真实模型网关。"
  ]
};

export function getPlatformBlueprint() {
  return structuredClone(platformBlueprint);
}
