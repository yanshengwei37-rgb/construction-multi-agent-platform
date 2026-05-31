const users = [
  {
    id: "company-director",
    name: "集团工程中心",
    title: "公司管理层",
    scope: "portfolio",
    projectIds: ["proj-tianfu", "proj-meixi", "proj-linan"],
    capabilities: ["portfolio:read", "project:read", "agent:run", "notification:read"]
  },
  {
    id: "project-manager",
    name: "张磊",
    title: "项目经理",
    scope: "project",
    projectIds: ["proj-tianfu"],
    capabilities: [
      "project:read",
      "schedule:write",
      "document:write",
      "safety:write",
      "agent:run",
      "notification:read"
    ]
  },
  {
    id: "field-safety",
    name: "刘倩",
    title: "现场安全员",
    scope: "project",
    projectIds: ["proj-tianfu"],
    capabilities: ["project:read", "document:write", "safety:write", "notification:read", "agent:run"]
  }
];

const organizations = [
  {
    id: "org-zcj",
    name: "中城建设集团",
    regions: ["西南", "华中"],
    activeProjects: 3
  }
];

const projects = [
  {
    id: "proj-tianfu",
    orgId: "org-zcj",
    code: "TF-2026-01",
    name: "天府新区综合体项目",
    region: "西南",
    type: "商业综合体",
    stage: "主体结构",
    status: "warning",
    manager: "张磊",
    summary: {
      progress: 68,
      scheduleVarianceDays: -2,
      safetyScore: 74,
      qualityScore: 82,
      openQualityIssues: 2,
      openRisks: 5,
      docCompleteness: 88,
      costDeviation: 1.1,
      pendingTodos: 9
    }
  },
  {
    id: "proj-meixi",
    orgId: "org-zcj",
    code: "MX-2026-02",
    name: "梅溪湖国际公寓项目",
    region: "华中",
    type: "住宅",
    stage: "机电安装",
    status: "normal",
    manager: "陈康",
    summary: {
      progress: 79,
      scheduleVarianceDays: 1,
      safetyScore: 86,
      qualityScore: 91,
      openQualityIssues: 1,
      openRisks: 2,
      docCompleteness: 93,
      costDeviation: 0.6,
      pendingTodos: 4
    }
  },
  {
    id: "proj-linan",
    orgId: "org-zcj",
    code: "LN-2026-03",
    name: "临安智造园项目",
    region: "西南",
    type: "工业厂房",
    stage: "地基基础",
    status: "warning",
    manager: "周凯",
    summary: {
      progress: 42,
      scheduleVarianceDays: -4,
      safetyScore: 69,
      qualityScore: 76,
      openQualityIssues: 3,
      openRisks: 6,
      docCompleteness: 72,
      costDeviation: 2.3,
      pendingTodos: 11
    }
  }
];

function buildState() {
  return {
    currentProvider: "deepseek",
    organizations: structuredClone(organizations),
    users: structuredClone(users),
    projects: structuredClone(projects),
    schedules: {
      "proj-tianfu": {
        importedAt: "2026-05-31 09:40",
        importHistory: [
          {
            id: "imp-tf-1",
            actor: "张磊",
            importedAt: "2026-05-31 09:40",
            source: "5月施工总进度计划.xlsx",
            rows: 5
          }
        ],
        milestones: [
          { id: "milestone-tf-1", name: "主体结构 20F", plannedDate: "2026-06-18", varianceDays: -2, status: "warning" },
          { id: "milestone-tf-2", name: "幕墙样板验收", plannedDate: "2026-06-25", varianceDays: 0, status: "normal" },
          { id: "milestone-tf-3", name: "机电管综深化", plannedDate: "2026-07-02", varianceDays: -1, status: "warning" }
        ],
        nodes: [
          {
            id: "wbs-tf-1",
            name: "地下二层结构",
            owner: "土建工长",
            percent: 85,
            plannedDate: "2026-06-08",
            varianceDays: -1,
            critical: true,
            sourceDocId: "doc-tf-1"
          },
          {
            id: "wbs-tf-2",
            name: "主体结构工程",
            owner: "生产经理",
            percent: 68,
            plannedDate: "2026-06-18",
            varianceDays: -2,
            critical: true,
            sourceDocId: "doc-tf-1"
          },
          {
            id: "wbs-tf-3",
            name: "幕墙样板验收",
            owner: "幕墙分包",
            percent: 45,
            plannedDate: "2026-06-25",
            varianceDays: 0,
            critical: false,
            sourceDocId: "doc-tf-2"
          },
          {
            id: "wbs-tf-4",
            name: "机电管综深化",
            owner: "机电工程师",
            percent: 57,
            plannedDate: "2026-07-02",
            varianceDays: -1,
            critical: true,
            sourceDocId: "doc-tf-2"
          },
          {
            id: "wbs-tf-5",
            name: "精装样板间移交",
            owner: "精装经理",
            percent: 24,
            plannedDate: "2026-07-16",
            varianceDays: 1,
            critical: false,
            sourceDocId: "doc-tf-3"
          }
        ]
      },
      "proj-meixi": {
        importedAt: "2026-05-29 13:20",
        importHistory: [],
        milestones: [
          { id: "milestone-mx-1", name: "机电联调", plannedDate: "2026-06-22", varianceDays: 1, status: "normal" }
        ],
        nodes: [
          {
            id: "wbs-mx-1",
            name: "机电安装",
            owner: "机电经理",
            percent: 79,
            plannedDate: "2026-06-15",
            varianceDays: 1,
            critical: true,
            sourceDocId: "doc-mx-1"
          }
        ]
      },
      "proj-linan": {
        importedAt: "2026-05-28 18:10",
        importHistory: [],
        milestones: [
          { id: "milestone-ln-1", name: "桩基施工", plannedDate: "2026-06-10", varianceDays: -4, status: "warning" }
        ],
        nodes: [
          {
            id: "wbs-ln-1",
            name: "地基基础工程",
            owner: "项目副经理",
            percent: 42,
            plannedDate: "2026-06-10",
            varianceDays: -4,
            critical: true,
            sourceDocId: "doc-ln-1"
          }
        ]
      }
    },
    documents: {
      "proj-tianfu": [
        {
          id: "doc-tf-1",
          name: "5月施工总进度计划",
          type: "WBS计划",
          module: "schedule",
          parseStatus: "indexed",
          classificationConfidence: 0.97,
          linkedRecordId: "wbs-tf-2",
          latestVersionId: "ver-tf-1",
          citations: ["主体结构工程当前完成 68%，目标日期 2026-06-18。"],
          versions: [
            {
              id: "ver-tf-1",
              label: "v3",
              uploadedAt: "2026-05-31 09:40",
              source: "Excel",
              fileNames: ["5月施工总进度计划.xlsx"],
              excerpt: "主体结构工程当前完成 68%，关键线路预计偏差 2 天。"
            }
          ]
        },
        {
          id: "doc-tf-2",
          name: "机电综合会审纪要",
          type: "联系函",
          module: "tech",
          parseStatus: "indexed",
          classificationConfidence: 0.94,
          linkedRecordId: "tech-risk-1",
          latestVersionId: "ver-tf-2",
          citations: ["BIM 碰撞复核发现 8 处净高风险。"],
          versions: [
            {
              id: "ver-tf-2",
              label: "v2",
              uploadedAt: "2026-05-30 16:10",
              source: "PDF",
              fileNames: ["机电综合会审纪要.pdf"],
              excerpt: "BIM 碰撞复核发现 8 处净高风险，需在 6 月 2 日前关闭。"
            }
          ]
        },
        {
          id: "doc-tf-3",
          name: "每日安全巡检记录",
          type: "巡检",
          module: "safety",
          parseStatus: "indexed",
          classificationConfidence: 0.92,
          linkedRecordId: "inspection-tf-1",
          latestVersionId: "ver-tf-3",
          citations: ["2#楼脚手架扣件松动，要求 24 小时内整改。"],
          versions: [
            {
              id: "ver-tf-3",
              label: "v1",
              uploadedAt: "2026-05-31 08:10",
              source: "PDF",
              fileNames: ["每日安全巡检记录-0531.pdf"],
              excerpt: "2#楼脚手架扣件松动，要求 24 小时内整改。"
            }
          ]
        },
        {
          id: "doc-tf-4",
          name: "塔吊基础复核照片",
          type: "照片",
          module: "safety",
          parseStatus: "ocr_queued",
          classificationConfidence: 0.81,
          linkedRecordId: null,
          latestVersionId: "ver-tf-4",
          citations: [],
          versions: [
            {
              id: "ver-tf-4",
              label: "v1",
              uploadedAt: "2026-05-31 11:25",
              source: "Image",
              fileNames: ["tower-base-0531.jpg"],
              excerpt: "等待 OCR 解析和项目归档。"
            }
          ]
        }
      ],
      "proj-meixi": [
        {
          id: "doc-mx-1",
          name: "梅溪湖机电周报",
          type: "周报",
          module: "schedule",
          parseStatus: "indexed",
          classificationConfidence: 0.9,
          linkedRecordId: "wbs-mx-1",
          latestVersionId: "ver-mx-1",
          citations: ["机电安装完成率 79%，计划整体领先 1 天。"],
          versions: [
            {
              id: "ver-mx-1",
              label: "v1",
              uploadedAt: "2026-05-29 13:20",
              source: "Word",
              fileNames: ["梅溪湖机电周报.docx"],
              excerpt: "机电安装完成率 79%，计划整体领先 1 天。"
            }
          ]
        }
      ],
      "proj-linan": [
        {
          id: "doc-ln-1",
          name: "临安桩基日报",
          type: "施工日志",
          module: "schedule",
          parseStatus: "indexed",
          classificationConfidence: 0.89,
          linkedRecordId: "wbs-ln-1",
          latestVersionId: "ver-ln-1",
          citations: ["桩基施工因连续降雨延后 4 天。"],
          versions: [
            {
              id: "ver-ln-1",
              label: "v2",
              uploadedAt: "2026-05-28 18:10",
              source: "PDF",
              fileNames: ["临安桩基日报.pdf"],
              excerpt: "桩基施工因连续降雨延后 4 天。"
            }
          ]
        }
      ]
    },
    safety: {
      "proj-tianfu": {
        matrix: {
          rows: ["加工区", "室外", "屋顶", "4-6层", "2-3层", "1层", "地下室", "基坑"],
          cols: ["高处坠落", "物体打击", "触电", "机械伤害", "坍塌", "火灾"],
          values: [
            ["", "", "soft:2", "high:3", "", "soft:2"],
            ["", "", "", "soft:2", "", "mid:1"],
            ["high:3", "soft:2", "", "", "", ""],
            ["high:3", "soft:2", "", "", "mid:1", ""],
            ["soft:2", "high:3", "", "", "", ""],
            ["", "soft:2", "", "soft:2", "", "mid:1"],
            ["", "", "high:3", "mid:1", "", "soft:2"],
            ["mid:1", "", "", "", "high:3", ""]
          ]
        },
        inspections: [
          {
            id: "inspection-tf-1",
            title: "每日安全巡查",
            location: "2#楼东侧脚手架",
            hazardType: "高处坠落",
            severity: "medium",
            inspector: "刘倩",
            createdAt: "2026-05-31 08:10",
            description: "脚手架扣件松动，要求当天完成加固。",
            photos: ["scaffold-0531.jpg"]
          }
        ],
        riskItems: [
          {
            id: "risk-tf-1",
            title: "脚手架扣件松动（2#楼）",
            severity: "medium",
            status: "open",
            owner: "安全员",
            sourceInspectionId: "inspection-tf-1"
          },
          {
            id: "risk-tf-2",
            title: "地下室临电箱未上锁",
            severity: "high",
            status: "open",
            owner: "机电班组",
            sourceInspectionId: "inspection-tf-1"
          }
        ],
        rectifications: [
          {
            id: "rect-tf-1",
            title: "脚手架扣件松动（2#楼）",
            status: "pending",
            deadline: "2026-06-01",
            owner: "安全员",
            severity: "medium",
            updates: [
              {
                at: "2026-05-31 08:20",
                actor: "刘倩",
                note: "已通知架子班组加固。"
              }
            ]
          },
          {
            id: "rect-tf-2",
            title: "地下室临电箱未上锁",
            status: "pending",
            deadline: "2026-06-01",
            owner: "机电班组",
            severity: "high",
            updates: []
          }
        ]
      },
      "proj-meixi": {
        matrix: {
          rows: ["样板层"],
          cols: ["高处坠落", "物体打击", "触电", "机械伤害", "坍塌", "火灾"],
          values: [["", "", "mid:1", "", "", ""]]
        },
        inspections: [],
        riskItems: [],
        rectifications: []
      },
      "proj-linan": {
        matrix: {
          rows: ["基坑"],
          cols: ["高处坠落", "物体打击", "触电", "机械伤害", "坍塌", "火灾"],
          values: [["", "", "", "", "high:3", ""]]
        },
        inspections: [],
        riskItems: [],
        rectifications: []
      }
    },
    quality: {
      "proj-tianfu": {
        inspections: [
          {
            id: "quality-inspection-tf-1",
            title: "主体结构钢筋隐蔽验收",
            location: "2#楼 6层",
            trade: "钢筋工程",
            result: "issue_found",
            severity: "medium",
            inspector: "质量员",
            createdAt: "2026-05-30 15:20",
            description: "墙柱钢筋保护层局部偏差，需调整垫块后复验。",
            photos: ["rebar-cover-0530.jpg"]
          },
          {
            id: "quality-inspection-tf-2",
            title: "混凝土观感检查",
            location: "1#楼 5层",
            trade: "混凝土工程",
            result: "passed",
            severity: "normal",
            inspector: "质量员",
            createdAt: "2026-05-29 17:30",
            description: "蜂窝麻面数量在允许范围内，已记录养护要求。",
            photos: []
          }
        ],
        issues: [
          {
            id: "quality-issue-tf-1",
            title: "墙柱钢筋保护层偏差",
            status: "pending",
            severity: "medium",
            location: "2#楼 6层",
            owner: "钢筋班组",
            deadline: "2026-06-01",
            sourceInspectionId: "quality-inspection-tf-1",
            updates: [
              {
                at: "2026-05-30 16:00",
                actor: "质量员",
                note: "已要求班组调整垫块并提交复验。"
              }
            ]
          },
          {
            id: "quality-issue-tf-2",
            title: "二次结构砌筑灰缝厚度偏差",
            status: "recheck_pending",
            severity: "medium",
            location: "地下室样板段",
            owner: "砌筑班组",
            deadline: "2026-06-02",
            sourceInspectionId: "quality-inspection-tf-1",
            updates: []
          }
        ],
        rechecks: [
          {
            id: "quality-recheck-tf-1",
            issueId: "quality-issue-tf-2",
            result: "recheck_pending",
            owner: "质量员",
            scheduledAt: "2026-06-01 09:00",
            note: "等待样板段完成返修后复查。"
          }
        ],
        acceptanceLots: [
          { id: "lot-tf-1", name: "2#楼 5层梁板钢筋", trade: "钢筋工程", status: "passed", passRate: 96, updatedAt: "2026-05-30" },
          { id: "lot-tf-2", name: "1#楼 5层混凝土浇筑", trade: "混凝土工程", status: "passed", passRate: 98, updatedAt: "2026-05-29" },
          { id: "lot-tf-3", name: "地下室二次结构样板段", trade: "砌筑工程", status: "issue_found", passRate: 82, updatedAt: "2026-05-31" }
        ]
      },
      "proj-meixi": {
        inspections: [],
        issues: [
          {
            id: "quality-issue-mx-1",
            title: "机电支吊架间距复核",
            status: "pending",
            severity: "medium",
            location: "样板层",
            owner: "机电班组",
            deadline: "2026-06-03",
            sourceInspectionId: null,
            updates: []
          }
        ],
        rechecks: [],
        acceptanceLots: []
      },
      "proj-linan": {
        inspections: [],
        issues: [],
        rechecks: [],
        acceptanceLots: []
      }
    },
    techCost: {
      "proj-tianfu": {
        schemes: [
          {
            id: "scheme-tf-1",
            name: "施工组织设计 v3",
            status: "approved",
            owner: "技术负责人",
            updatedAt: "2026-05-26",
            summary: "已审批，适用于主体结构与二次结构阶段。"
          },
          {
            id: "scheme-tf-2",
            name: "深基坑专项施工方案",
            status: "reviewing",
            owner: "总工",
            updatedAt: "2026-05-29",
            summary: "专家论证意见待补录。"
          }
        ],
        standards: [
          "GB 50204 混凝土结构工程施工质量验收规范",
          "JGJ 59 建筑施工安全检查标准",
          "GB 50666 混凝土结构工程施工规范"
        ],
        costSnapshots: [
          { month: "1月", budget: 8600, actual: 8200 },
          { month: "2月", budget: 8800, actual: 8500 },
          { month: "3月", budget: 9100, actual: 9020 },
          { month: "4月", budget: 9300, actual: 9480 },
          { month: "5月", budget: 9600, actual: 9710 }
        ],
        contracts: [
          { id: "contract-tf-1", name: "总包合同", status: "tracking", summary: "累计计量 1.42 亿，付款偏差 -3.1%" },
          { id: "contract-tf-2", name: "幕墙专业分包", status: "warning", summary: "待确认变更 4 项，预计影响 86 万" },
          { id: "contract-tf-3", name: "机电安装分包", status: "normal", summary: "材料调差需补充市场询价依据" }
        ]
      },
      "proj-meixi": {
        schemes: [],
        standards: [],
        costSnapshots: [{ month: "5月", budget: 7200, actual: 7150 }],
        contracts: []
      },
      "proj-linan": {
        schemes: [],
        standards: [],
        costSnapshots: [{ month: "5月", budget: 6400, actual: 6550 }],
        contracts: []
      }
    },
    notifications: {
      "proj-tianfu": [
        {
          id: "notice-tf-1",
          type: "warning",
          title: "进度 Agent：主体结构关键线路偏差 2 天",
          module: "schedule",
          createdAt: "2026-05-31 09:50",
          read: false,
          recordId: "wbs-tf-2"
        },
        {
          id: "notice-tf-2",
          type: "todo",
          title: "安全整改待确认：地下室临电箱未上锁",
          module: "safety",
          createdAt: "2026-05-31 08:15",
          read: false,
          recordId: "rect-tf-2"
        },
        {
          id: "notice-tf-3",
          type: "digest",
          title: "资料 Agent：机电综合会审纪要已索引，可用于问答",
          module: "documents",
          createdAt: "2026-05-30 16:40",
          read: true,
          recordId: "doc-tf-2"
        }
      ],
      "proj-meixi": [],
      "proj-linan": []
    },
    agentInsights: {
      "proj-tianfu": [
        {
          id: "insight-tf-1",
          agentId: "pmo-agent",
          severity: "warning",
          title: "本周项目总览",
          summary: "建议优先关注主体结构关键线路、脚手架整改闭环与塔吊基础照片归档。",
          citations: [
            { id: "wbs-tf-2", label: "主体结构工程 68%", module: "schedule" },
            { id: "rect-tf-1", label: "脚手架扣件松动整改任务", module: "safety" },
            { id: "doc-tf-4", label: "塔吊基础复核照片", module: "documents" }
          ],
          createdAt: "2026-05-31 10:00"
        },
        {
          id: "insight-tf-2",
          agentId: "document-agent",
          severity: "normal",
          title: "资料完整度",
          summary: "当前资料完整度 88%，仍有 1 份现场照片待 OCR 归档。",
          citations: [{ id: "doc-tf-4", label: "塔吊基础复核照片", module: "documents" }],
          createdAt: "2026-05-31 11:30"
        }
      ],
      "proj-meixi": [],
      "proj-linan": []
    },
    agentRuns: [
      {
        id: "run-tf-1",
        projectId: "proj-tianfu",
        runType: "weekly-brief",
        agentId: "pmo-agent",
        status: "reviewed",
        prompt: "汇总本周需要关注的事项",
        result: {
          summary: "已生成本周项目简报。",
          citations: [{ id: "doc-tf-1", label: "5月施工总进度计划", module: "documents" }]
        },
        createdAt: "2026-05-31 10:00",
        completedAt: "2026-05-31 10:02"
      }
    ],
    auditLogs: {
      "proj-tianfu": [
        {
          id: "audit-tf-1",
          projectId: "proj-tianfu",
          actorId: "system",
          actorName: "系统",
          module: "agents",
          action: "agent.run.reviewed",
          recordId: "run-tf-1",
          summary: "PMO 协调 Agent 周报摘要已完成人工查看。",
          metadata: { agentId: "pmo-agent", runType: "weekly-brief" },
          createdAt: "2026-05-31 10:03"
        }
      ],
      "proj-meixi": [],
      "proj-linan": []
    }
  };
}

let state = buildState();
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function resetStore() {
  state = buildState();
  sequence = 0;
  return state;
}

export function getState() {
  return state;
}

export function snapshot() {
  return structuredClone(state);
}

export function getUsers() {
  return structuredClone(state.users);
}

export function getUser(userId) {
  return state.users.find((item) => item.id === userId) || state.users[1];
}

export function resolveUser(headers) {
  const userId = headers["x-demo-user"] || headers["X-Demo-User"];
  return getUser(Array.isArray(userId) ? userId[0] : userId);
}

export function getProvidersSelection() {
  return state.currentProvider;
}

export function setProviderSelection(providerId) {
  state.currentProvider = providerId;
}

export function listAccessibleProjects(user) {
  return state.projects.filter((project) => user.projectIds.includes(project.id));
}

export function ensureProjectAccess(user, projectId) {
  if (!user.projectIds.includes(projectId)) {
    const error = new Error("forbidden");
    error.statusCode = 403;
    throw error;
  }
}

export function getProject(projectId) {
  return state.projects.find((project) => project.id === projectId);
}

export function getOrganization(orgId) {
  return state.organizations.find((item) => item.id === orgId);
}

export function listNotifications(projectId) {
  return structuredClone(state.notifications[projectId] || []);
}

export function appendAuditLog(projectId, entry) {
  const actor = entry.actor || {};
  const item = {
    id: nextId("audit"),
    projectId,
    actorId: actor.id || entry.actorId || "system",
    actorName: actor.name || entry.actorName || "系统",
    module: entry.module,
    action: entry.action,
    recordId: entry.recordId || null,
    summary: entry.summary,
    metadata: entry.metadata || {},
    createdAt: entry.createdAt || new Date().toISOString()
  };
  if (!state.auditLogs[projectId]) {
    state.auditLogs[projectId] = [];
  }
  state.auditLogs[projectId].unshift(item);
  return structuredClone(item);
}

export function listAuditLogs(projectId, filters = {}) {
  const moduleName = filters.module || "";
  const action = filters.action || "";
  const logs = (state.auditLogs[projectId] || []).filter((item) => {
    const matchModule = !moduleName || item.module === moduleName;
    const matchAction = !action || item.action === action;
    return matchModule && matchAction;
  });
  return structuredClone(logs.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

export function listAgentInsights(projectId) {
  return structuredClone(state.agentInsights[projectId] || []);
}

export function listAgentRuns(projectId) {
  const runs = state.agentRuns.filter((item) => (projectId ? item.projectId === projectId : true));
  return structuredClone(runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

export function buildPortfolioView(user, filters = {}) {
  const region = filters.region || "";
  const type = filters.type || "";
  const accessibleProjects = listAccessibleProjects(user).filter((project) => {
    const matchRegion = !region || project.region === region;
    const matchType = !type || project.type === type;
    return matchRegion && matchType;
  });
  const projectsPayload = accessibleProjects.map((project) => {
    const safety = state.safety[project.id];
    const quality = state.quality[project.id];
    const documents = state.documents[project.id];
    return {
      ...project,
      openRectifications: safety.rectifications.filter((item) => item.status !== "closed").length,
      openQualityIssues: quality.issues.filter((item) => item.status !== "closed").length,
      docsPendingIndex: documents.filter((item) => item.parseStatus !== "indexed").length
    };
  });
  const totalProgress = projectsPayload.reduce((sum, project) => sum + project.summary.progress, 0);
  const warningProjects = projectsPayload.filter((project) => project.status === "warning").length;
  const pendingRectifications = projectsPayload.reduce((sum, project) => sum + project.openRectifications, 0);
  const docsPendingIndex = projectsPayload.reduce((sum, project) => sum + project.docsPendingIndex, 0);
  return {
    organization: getOrganization(projectsPayload[0]?.orgId || state.organizations[0].id),
    filters: {
      regions: [...new Set(state.projects.map((item) => item.region))],
      types: [...new Set(state.projects.map((item) => item.type))],
      active: { region, type }
    },
    metrics: {
      totalProjects: projectsPayload.length,
      warningProjects,
      averageProgress: projectsPayload.length ? Math.round(totalProgress / projectsPayload.length) : 0,
      pendingRectifications,
      docsPendingIndex
    },
    rankings: {
      scheduleVariance: projectsPayload
        .slice()
        .sort((left, right) => left.summary.scheduleVarianceDays - right.summary.scheduleVarianceDays)
        .map((project) => ({ id: project.id, name: project.name, value: project.summary.scheduleVarianceDays })),
      safetyRisk: projectsPayload
        .slice()
        .sort((left, right) => right.summary.openRisks - left.summary.openRisks)
        .map((project) => ({ id: project.id, name: project.name, value: project.summary.openRisks })),
      docCompleteness: projectsPayload
        .slice()
        .sort((left, right) => right.summary.docCompleteness - left.summary.docCompleteness)
        .map((project) => ({ id: project.id, name: project.name, value: project.summary.docCompleteness }))
    },
    projects: projectsPayload
  };
}

export function buildDashboard(projectId, user) {
  ensureProjectAccess(user, projectId);
  const project = getProject(projectId);
  const schedule = state.schedules[projectId];
  const documents = state.documents[projectId];
  const safety = state.safety[projectId];
  const quality = state.quality[projectId];
  const techCost = state.techCost[projectId];
  const latestCost = techCost.costSnapshots[techCost.costSnapshots.length - 1];
  return structuredClone({
    project,
    summary: {
      manager: project.manager,
      stage: project.stage,
      progress: project.summary.progress,
      scheduleVarianceDays: project.summary.scheduleVarianceDays,
      docCompleteness: project.summary.docCompleteness,
      safetyScore: project.summary.safetyScore,
      qualityScore: project.summary.qualityScore,
      openQualityIssues: quality.issues.filter((item) => item.status !== "closed").length,
      openRisks: project.summary.openRisks,
      costDeviation: project.summary.costDeviation,
      pendingTodos: project.summary.pendingTodos
    },
    schedule: {
      criticalCount: schedule.nodes.filter((item) => item.critical).length,
      warningCount: schedule.nodes.filter((item) => item.varianceDays < 0).length,
      nextMilestone: schedule.milestones[0],
      nodes: schedule.nodes
    },
    documents: {
      total: documents.length,
      pendingIndex: documents.filter((item) => item.parseStatus !== "indexed").length,
      latest: documents.slice().sort((left, right) => right.versions[0].uploadedAt.localeCompare(left.versions[0].uploadedAt)).slice(0, 3)
    },
    safety: {
      inspections: safety.inspections.length,
      openRectifications: safety.rectifications.filter((item) => item.status !== "closed").length,
      topRisks: safety.riskItems.slice(0, 3),
      matrix: safety.matrix
    },
    quality: {
      inspections: quality.inspections.length,
      openIssues: quality.issues.filter((item) => item.status !== "closed").length,
      recheckPending: quality.issues.filter((item) => item.status === "recheck_pending").length,
      latestIssues: quality.issues.slice(0, 3),
      acceptanceLots: quality.acceptanceLots.slice(0, 3)
    },
    cost: {
      latest: latestCost,
      varianceRate: latestCost ? Number((((latestCost.actual - latestCost.budget) / latestCost.budget) * 100).toFixed(1)) : 0,
      contracts: techCost.contracts.slice(0, 3)
    },
    notifications: listNotifications(projectId).slice(0, 5),
    agentInsights: listAgentInsights(projectId).slice(0, 4)
  });
}

export function buildScheduleView(projectId, user) {
  ensureProjectAccess(user, projectId);
  const project = getProject(projectId);
  const schedule = state.schedules[projectId];
  return structuredClone({
    project,
    summary: {
      importedAt: schedule.importedAt,
      nodeCount: schedule.nodes.length,
      criticalWarnings: schedule.nodes.filter((item) => item.critical && item.varianceDays < 0).length
    },
    milestones: schedule.milestones,
    importHistory: schedule.importHistory,
    nodes: schedule.nodes
  });
}

export function buildDocumentsView(projectId, user, filters = {}) {
  ensureProjectAccess(user, projectId);
  const q = (filters.q || "").trim().toLowerCase();
  const type = filters.type || "";
  const docs = (state.documents[projectId] || []).filter((document) => {
    const matchQuery = !q || document.name.toLowerCase().includes(q);
    const matchType = !type || document.type === type;
    return matchQuery && matchType;
  });
  const availableTypes = [...new Set((state.documents[projectId] || []).map((item) => item.type))];
  return structuredClone({
    items: docs.sort((left, right) => right.versions[0].uploadedAt.localeCompare(left.versions[0].uploadedAt)),
    filters: { types: availableTypes, active: { q: filters.q || "", type } }
  });
}

export function buildSafetyView(projectId, user) {
  ensureProjectAccess(user, projectId);
  const safety = state.safety[projectId];
  return structuredClone({
    summary: {
      high: safety.riskItems.filter((item) => item.severity === "high" && item.status === "open").length,
      medium: safety.riskItems.filter((item) => item.severity === "medium" && item.status === "open").length,
      closed: safety.rectifications.filter((item) => item.status === "closed").length,
      inspections: safety.inspections.length
    },
    matrix: safety.matrix,
    inspections: safety.inspections.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    riskItems: safety.riskItems,
    rectifications: safety.rectifications
  });
}

export function buildQualityView(projectId, user) {
  ensureProjectAccess(user, projectId);
  const quality = state.quality[projectId];
  const openIssues = quality.issues.filter((item) => item.status !== "closed");
  const passedLots = quality.acceptanceLots.filter((item) => item.status === "passed").length;
  return structuredClone({
    summary: {
      inspections: quality.inspections.length,
      openIssues: openIssues.length,
      recheckPending: quality.issues.filter((item) => item.status === "recheck_pending").length,
      passRate: quality.acceptanceLots.length ? Math.round((passedLots / quality.acceptanceLots.length) * 100) : 100
    },
    inspections: quality.inspections.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    issues: quality.issues.slice().sort((left, right) => right.deadline.localeCompare(left.deadline)),
    rechecks: quality.rechecks,
    acceptanceLots: quality.acceptanceLots
  });
}

export function buildTechCostView(projectId, user) {
  ensureProjectAccess(user, projectId);
  return structuredClone(state.techCost[projectId]);
}

export function buildCostView(projectId, user) {
  ensureProjectAccess(user, projectId);
  const techCost = state.techCost[projectId];
  const latest = techCost.costSnapshots[techCost.costSnapshots.length - 1] || null;
  const varianceRate = latest ? Number((((latest.actual - latest.budget) / latest.budget) * 100).toFixed(1)) : 0;
  return structuredClone({
    summary: {
      latestMonth: latest?.month || "-",
      budget: latest?.budget || 0,
      actual: latest?.actual || 0,
      varianceRate,
      warningContracts: techCost.contracts.filter((item) => item.status === "warning").length
    },
    snapshots: techCost.costSnapshots,
    contracts: techCost.contracts
  });
}


export function appendNotification(projectId, notification) {
  const item = { id: nextId("notice"), read: false, ...notification };
  state.notifications[projectId].unshift(item);
  return structuredClone(item);
}

export function appendAgentInsight(projectId, insight) {
  const item = { id: nextId("insight"), createdAt: new Date().toISOString(), ...insight };
  state.agentInsights[projectId].unshift(item);
  return structuredClone(item);
}

export function createAgentRun(payload) {
  const run = {
    id: nextId("run"),
    status: "queued",
    createdAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    ...payload
  };
  state.agentRuns.unshift(run);
  appendAuditLog(run.projectId, {
    actorId: payload.actorId || "system",
    actorName: payload.actorName || "系统",
    module: "agents",
    action: "agent.run.queued",
    recordId: run.id,
    summary: `${run.agentId} 已创建 ${run.runType} 异步分析任务。`,
    metadata: { agentId: run.agentId, runType: run.runType }
  });
  return structuredClone(run);
}

export function completeAgentRun(runId, result) {
  const run = state.agentRuns.find((item) => item.id === runId);
  if (!run) {
    return null;
  }
  run.status = "succeeded";
  run.completedAt = new Date().toISOString();
  run.result = result;
  appendAuditLog(run.projectId, {
    actorId: "system",
    actorName: "系统",
    module: "agents",
    action: "agent.run.succeeded",
    recordId: run.id,
    summary: `${run.agentId} 已完成 ${run.runType} 异步分析任务。`,
    metadata: { agentId: run.agentId, runType: run.runType, citationCount: result.citations?.length || 0 }
  });
  return structuredClone(run);
}

export function failAgentRun(runId, message) {
  const run = state.agentRuns.find((item) => item.id === runId);
  if (!run) {
    return null;
  }
  run.status = "failed";
  run.completedAt = new Date().toISOString();
  run.result = { summary: message, citations: [] };
  appendAuditLog(run.projectId, {
    actorId: "system",
    actorName: "系统",
    module: "agents",
    action: "agent.run.failed",
    recordId: run.id,
    summary: `${run.agentId} 执行失败：${message}`,
    metadata: { agentId: run.agentId, runType: run.runType }
  });
  return structuredClone(run);
}

export function addDocumentUpload(projectId, payload, actor) {
  const record = {
    id: nextId("doc"),
    name: payload.name,
    type: payload.type,
    module: payload.module || "documents",
    parseStatus: "ocr_queued",
    classificationConfidence: 0.8,
    linkedRecordId: null,
    latestVersionId: nextId("ver"),
    citations: [],
    versions: [
      {
        id: nextId("ver"),
        label: payload.versionLabel || "v1",
        uploadedAt: new Date().toISOString(),
        source: payload.source || "Upload",
        fileNames: payload.fileNames || [],
        excerpt: payload.notes || `${payload.name} 正在等待 OCR 和分类处理。`
      }
    ],
    uploadedBy: actor.name
  };
  record.latestVersionId = record.versions[0].id;
  state.documents[projectId].unshift(record);
  appendNotification(projectId, {
    type: "digest",
    title: `资料上传中：${record.name}`,
    module: "documents",
    createdAt: new Date().toISOString(),
    recordId: record.id
  });
  appendAuditLog(projectId, {
    actor,
    module: "documents",
    action: "document.uploaded",
    recordId: record.id,
    summary: `${actor.name} 上传资料：${record.name}。`,
    metadata: { type: record.type, module: record.module, fileNames: record.versions[0].fileNames }
  });
  return structuredClone(record);
}

export function markDocumentIndexed(projectId, documentId, metadata) {
  const document = (state.documents[projectId] || []).find((item) => item.id === documentId);
  if (!document) {
    return null;
  }
  document.parseStatus = "indexed";
  document.classificationConfidence = metadata.classificationConfidence;
  document.module = metadata.module;
  document.type = metadata.type;
  document.citations = metadata.citations;
  document.versions[0].excerpt = metadata.excerpt;
  appendAuditLog(projectId, {
    actorId: "system",
    actorName: "资料 Agent",
    module: "documents",
    action: "document.indexed",
    recordId: document.id,
    summary: `资料 Agent 完成资料索引：${document.name}。`,
    metadata: { type: document.type, module: document.module, classificationConfidence: document.classificationConfidence }
  });
  return structuredClone(document);
}

export function importSchedule(projectId, rows, actor, source) {
  const schedule = state.schedules[projectId];
  const importedAt = new Date().toISOString();
  schedule.nodes = rows.map((row) => ({
    id: nextId("wbs"),
    name: row.name,
    owner: row.owner,
    percent: row.percent,
    plannedDate: row.plannedDate,
    varianceDays: row.varianceDays,
    critical: row.critical,
    sourceDocId: row.sourceDocId || null
  }));
  schedule.importedAt = importedAt;
  schedule.milestones = schedule.nodes
    .filter((item) => item.critical)
    .slice(0, 3)
    .map((item) => ({
      id: nextId("milestone"),
      name: item.name,
      plannedDate: item.plannedDate,
      varianceDays: item.varianceDays,
      status: item.varianceDays < 0 ? "warning" : "normal"
    }));
  schedule.importHistory.unshift({
    id: nextId("import"),
    actor: actor.name,
    importedAt,
    source,
    rows: rows.length
  });
  appendNotification(projectId, {
    type: "warning",
    title: `进度计划已导入：${rows.length} 个节点待分析`,
    module: "schedule",
    createdAt: importedAt,
    recordId: schedule.importHistory[0].id
  });
  appendAuditLog(projectId, {
    actor,
    module: "schedule",
    action: "schedule.imported",
    recordId: schedule.importHistory[0].id,
    summary: `${actor.name} 导入进度计划：${source}，共 ${rows.length} 个节点。`,
    metadata: { source, rows: rows.length }
  });
  return structuredClone(schedule);
}

export function addSafetyInspection(projectId, payload, actor) {
  const safety = state.safety[projectId];
  const inspection = {
    id: nextId("inspection"),
    title: payload.title,
    location: payload.location,
    hazardType: payload.hazardType,
    severity: payload.severity,
    inspector: actor.name,
    createdAt: new Date().toISOString(),
    description: payload.description,
    photos: payload.photos || []
  };
  safety.inspections.unshift(inspection);
  const risk = {
    id: nextId("risk"),
    title: `${payload.title}（${payload.location}）`,
    severity: payload.severity,
    status: "open",
    owner: payload.owner || actor.title,
    sourceInspectionId: inspection.id
  };
  safety.riskItems.unshift(risk);
  const rectification = {
    id: nextId("rect"),
    title: risk.title,
    status: "pending",
    deadline: payload.deadline,
    owner: payload.owner || actor.title,
    severity: payload.severity,
    updates: [
      {
        at: inspection.createdAt,
        actor: actor.name,
        note: payload.description
      }
    ]
  };
  safety.rectifications.unshift(rectification);
  appendNotification(projectId, {
    type: "todo",
    title: `新增安全整改：${risk.title}`,
    module: "safety",
    createdAt: inspection.createdAt,
    recordId: rectification.id
  });
  appendAuditLog(projectId, {
    actor,
    module: "safety",
    action: "safety.inspection.created",
    recordId: inspection.id,
    summary: `${actor.name} 新增巡检隐患：${inspection.title}。`,
    metadata: { rectificationId: rectification.id, riskId: risk.id, severity: inspection.severity }
  });
  return structuredClone({ inspection, risk, rectification });
}

export function addRectificationFeedback(projectId, taskId, payload, actor) {
  const task = state.safety[projectId].rectifications.find((item) => item.id === taskId);
  if (!task) {
    const error = new Error("not_found");
    error.statusCode = 404;
    throw error;
  }
  task.status = payload.status || task.status;
  task.updates.unshift({
    at: new Date().toISOString(),
    actor: actor.name,
    note: payload.note
  });
  if (task.status === "closed") {
    appendNotification(projectId, {
      type: "digest",
      title: `整改已闭环：${task.title}`,
      module: "safety",
      createdAt: new Date().toISOString(),
      recordId: task.id
    });
  }
  appendAuditLog(projectId, {
    actor,
    module: "safety",
    action: "safety.rectification.updated",
    recordId: task.id,
    summary: `${actor.name} 更新整改任务：${task.title}，状态为 ${task.status}。`,
    metadata: { status: task.status, note: payload.note }
  });
  return structuredClone(task);
}

export function addQualityInspection(projectId, payload, actor) {
  const quality = state.quality[projectId];
  const createdAt = new Date().toISOString();
  const inspection = {
    id: nextId("quality-inspection"),
    title: payload.title,
    location: payload.location,
    trade: payload.trade,
    result: payload.result || "issue_found",
    severity: payload.severity || "medium",
    inspector: actor.name,
    createdAt,
    description: payload.description,
    photos: payload.photos || []
  };
  quality.inspections.unshift(inspection);

  let issue = null;
  if (inspection.result !== "passed") {
    issue = {
      id: nextId("quality-issue"),
      title: payload.issueTitle || inspection.title,
      status: "pending",
      severity: inspection.severity,
      location: inspection.location,
      owner: payload.owner || "施工班组",
      deadline: payload.deadline,
      sourceInspectionId: inspection.id,
      updates: [
        {
          at: createdAt,
          actor: actor.name,
          note: payload.description
        }
      ]
    };
    quality.issues.unshift(issue);
    appendNotification(projectId, {
      type: "todo",
      title: `新增质量整改：${issue.title}`,
      module: "quality",
      createdAt,
      recordId: issue.id
    });
    const project = getProject(projectId);
    project.summary.openQualityIssues = quality.issues.filter((item) => item.status !== "closed").length;
    project.summary.qualityScore = Math.max(60, project.summary.qualityScore - (inspection.severity === "high" ? 4 : 2));
  } else {
    appendNotification(projectId, {
      type: "digest",
      title: `质量验收通过：${inspection.title}`,
      module: "quality",
      createdAt,
      recordId: inspection.id
    });
  }

  appendAuditLog(projectId, {
    actor,
    module: "quality",
    action: "quality.inspection.created",
    recordId: inspection.id,
    summary: `${actor.name} 新增质量检查：${inspection.title}，结果为 ${inspection.result}。`,
    metadata: { issueId: issue?.id || null, severity: inspection.severity, trade: inspection.trade }
  });
  return structuredClone({ inspection, issue });
}

export function addQualityIssueRecheck(projectId, issueId, payload, actor) {
  const quality = state.quality[projectId];
  const issue = quality.issues.find((item) => item.id === issueId);
  if (!issue) {
    const error = new Error("not_found");
    error.statusCode = 404;
    throw error;
  }
  const checkedAt = new Date().toISOString();
  issue.status = payload.status || "closed";
  issue.updates.unshift({
    at: checkedAt,
    actor: actor.name,
    note: payload.note
  });
  const recheck = {
    id: nextId("quality-recheck"),
    issueId,
    result: issue.status,
    owner: actor.name,
    scheduledAt: payload.checkedAt || checkedAt,
    note: payload.note
  };
  quality.rechecks.unshift(recheck);
  const project = getProject(projectId);
  project.summary.openQualityIssues = quality.issues.filter((item) => item.status !== "closed").length;
  if (issue.status === "closed") {
    project.summary.qualityScore = Math.min(100, project.summary.qualityScore + 1);
  }
  appendNotification(projectId, {
    type: issue.status === "closed" ? "digest" : "todo",
    title: issue.status === "closed" ? `质量问题已复验闭环：${issue.title}` : `质量问题待继续复验：${issue.title}`,
    module: "quality",
    createdAt: checkedAt,
    recordId: issue.id
  });
  appendAuditLog(projectId, {
    actor,
    module: "quality",
    action: "quality.issue.rechecked",
    recordId: issue.id,
    summary: `${actor.name} 复验质量问题：${issue.title}，状态为 ${issue.status}。`,
    metadata: { status: issue.status, note: payload.note }
  });
  return structuredClone({ issue, recheck });
}

export function addCostSnapshot(projectId, payload, actor) {
  const techCost = state.techCost[projectId];
  const snapshot = {
    month: payload.month,
    budget: Number(payload.budget),
    actual: Number(payload.actual),
    note: payload.note || "",
    createdAt: new Date().toISOString(),
    actor: actor.name
  };
  techCost.costSnapshots.push(snapshot);
  const varianceRate = snapshot.budget ? Number((((snapshot.actual - snapshot.budget) / snapshot.budget) * 100).toFixed(1)) : 0;
  const project = getProject(projectId);
  project.summary.costDeviation = varianceRate;
  appendNotification(projectId, {
    type: Math.abs(varianceRate) > 2 ? "warning" : "digest",
    title: `成本快照已更新：${snapshot.month} 偏差 ${varianceRate}%`,
    module: "cost",
    createdAt: snapshot.createdAt,
    recordId: `cost-${snapshot.month}`
  });
  appendAuditLog(projectId, {
    actor,
    module: "cost",
    action: "cost.snapshot.created",
    recordId: `cost-${snapshot.month}`,
    summary: `${actor.name} 录入 ${snapshot.month} 成本快照，预算 ${snapshot.budget} 万，实际 ${snapshot.actual} 万。`,
    metadata: { varianceRate, note: snapshot.note }
  });
  return structuredClone({ snapshot, varianceRate });
}
