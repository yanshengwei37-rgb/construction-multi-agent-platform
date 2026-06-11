import test from "node:test";
import assert from "node:assert/strict";
import {
  addCostSnapshot,
  addDocumentUpload,
  addQualityInspection,
  addQualityIssueRecheck,
  addSafetyInspection,
  addScheduledTask,
  appendNotification,
  buildWorkflowTestPlan,
  completeAgentRun,
  createAgentRun,
  ensureProjectAccess,
  getAgentConfiguration,
  getProject,
  getProvidersSelection,
  getState,
  getUser,
  listAuditLogs,
  listAccessibleProjects,
  listNotifications,
  listScheduledTasks,
  markDocumentIndexed,
  resetStore,
  updateAgentModelBinding
} from "../api/data/store.js";
import { getProvider } from "../api/services/model-gateway.js";
import { getPlatformBlueprint } from "../api/data/platform-blueprint.js";
import {
  generateScheduleWizard,
  getScheduleLibrariesSummary,
  previewScheduleWizard
} from "../api/services/schedule-engine.js";
import { answerProjectQuestion, classifyDocumentUpload, generateAsyncAnalysis } from "../worker-agent/index.js";

function currentProjectContext(projectId) {
  const state = getState();
  return {
    project: getProject(projectId),
    schedule: state.schedules[projectId],
    documents: state.documents[projectId],
    safety: state.safety[projectId],
    quality: state.quality[projectId],
    techCost: state.techCost[projectId]
  };
}

test("permissions restrict project access by persona", () => {
  resetStore();
  const companyUser = getUser("company-director");
  const projectUser = getUser("project-manager");

  assert.equal(listAccessibleProjects(companyUser).length, 3);
  assert.equal(listAccessibleProjects(projectUser).length, 1);

  assert.throws(() => ensureProjectAccess(projectUser, "proj-linan"), /forbidden/);
});

test("document upload is indexed and can be cited by agent chat", () => {
  resetStore();
  const actor = getUser("project-manager");
  const uploaded = addDocumentUpload(
    "proj-tianfu",
    {
      name: "主体结构周报",
      type: "周报",
      module: "schedule",
      notes: "主体结构当前完成 69%，本周投入钢筋班组 2 组。",
      fileNames: ["主体结构周报-0531.docx"]
    },
    actor
  );

  const indexed = markDocumentIndexed("proj-tianfu", uploaded.id, classifyDocumentUpload({
    name: uploaded.name,
    type: "周报",
    module: "schedule",
    notes: "主体结构当前完成 69%，本周投入钢筋班组 2 组。"
  }));

  assert.equal(indexed.parseStatus, "indexed");
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "document.indexed"));

  const provider = getProvider(getProvidersSelection());
  const answer = answerProjectQuestion({
    question: "本周最需要关注什么？",
    provider,
    ...currentProjectContext("proj-tianfu")
  });

  assert.ok(answer.answer.includes("本周建议优先关注"));
  assert.ok(answer.citations.length >= 2);
});

test("safety inspection creates rectification and notification", () => {
  resetStore();
  const actor = getUser("field-safety");
  const result = addSafetyInspection(
    "proj-tianfu",
    {
      title: "基坑临边防护缺失",
      location: "基坑东侧",
      hazardType: "坍塌",
      severity: "high",
      deadline: "2026-06-02",
      description: "防护栏局部缺失，需当天补齐。",
      photos: ["pit-east-0531.jpg"]
    },
    actor
  );

  assert.equal(result.rectification.status, "pending");
  assert.ok(result.risk.title.includes("基坑临边防护缺失"));

  const notifications = listNotifications("proj-tianfu");
  assert.ok(notifications.some((item) => item.title.includes("新增安全整改")));
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "safety.inspection.created"));
});

test("quality inspection creates issue and recheck trail", () => {
  resetStore();
  const actor = getUser("project-manager");
  const result = addQualityInspection(
    "proj-tianfu",
    {
      title: "砌筑样板实测实量",
      location: "地下室样板段",
      trade: "砌筑工程",
      result: "issue_found",
      severity: "medium",
      deadline: "2026-06-03",
      owner: "砌筑班组",
      description: "灰缝厚度偏差，需要返修后复验。"
    },
    actor
  );

  assert.equal(result.issue.status, "pending");
  const recheck = addQualityIssueRecheck("proj-tianfu", result.issue.id, {
    status: "closed",
    note: "返修完成，复验合格。"
  }, actor);

  assert.equal(recheck.issue.status, "closed");
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "quality.issue.rechecked"));
});

test("cost snapshot records variance and audit log", () => {
  resetStore();
  const actor = getUser("project-manager");
  const result = addCostSnapshot(
    "proj-tianfu",
    {
      month: "6月",
      budget: 9900,
      actual: 10150,
      note: "钢材调差和模板周转增加。"
    },
    actor
  );

  assert.equal(result.varianceRate, 2.5);
  assert.ok(listNotifications("proj-tianfu").some((item) => item.module === "cost"));
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "cost.snapshot.created"));
});

test("agent model, organization and workflow configuration can be resolved", () => {
  resetStore();
  const config = getAgentConfiguration();

  assert.equal(Object.keys(config.modelBindings).length, 6);
  assert.ok(config.organization.nodes.some((node) => node.id === "quality-tech-line"));
  assert.ok(config.workflows.some((workflow) => workflow.runType === "quality-review"));

  const updated = updateAgentModelBinding("cost-agent", {
    providerId: "openai",
    chatModel: "gpt-4.1-mini"
  });
  assert.equal(updated.providerId, "openai");
  assert.equal(updated.chatModel, "gpt-4.1-mini");

  const plan = buildWorkflowTestPlan("wf-cost-review", "proj-tianfu");
  assert.equal(plan.workflow.ownerAgentId, "cost-agent");
  assert.equal(plan.ownerModel.providerId, "openai");
  assert.ok(plan.routePlan.every((stage) => stage.model));
});

test("async agent run result can be completed and stored", () => {
  resetStore();
  const run = createAgentRun({
    projectId: "proj-tianfu",
    runType: "schedule-scan",
    prompt: "扫描关键线路",
    agentId: "schedule-agent"
  });
  assert.equal(run.status, "queued");

  const provider = getProvider(getProvidersSelection());
  const analysis = generateAsyncAnalysis({
    runType: "schedule-scan",
    prompt: "扫描关键线路",
    provider,
    ...currentProjectContext("proj-tianfu")
  });
  const completed = completeAgentRun(run.id, {
    summary: analysis.summary,
    citations: analysis.citations,
    provider: analysis.provider
  });

  appendNotification("proj-tianfu", {
    type: "warning",
    title: `${analysis.title}（${analysis.provider}）`,
    module: "agents",
    createdAt: new Date().toISOString(),
    recordId: run.id
  });

  assert.equal(completed.status, "succeeded");
  assert.ok(completed.result.summary.includes("关键"));
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "agent.run.succeeded"));
});

test("scheduled project agent tasks can be created and audited", () => {
  resetStore();
  const actor = getUser("project-manager");
  const task = addScheduledTask("proj-tianfu", {
    name: "项目日报",
    taskType: "daily-brief",
    frequency: "每日",
    runAt: "每日 18:00",
    prompt: "汇总进度、质量、安全、成本、资料五条线当日重点。"
  }, actor);

  assert.equal(task.ownerAgentId, "pmo-agent");
  assert.equal(task.enabled, true);
  assert.ok(listScheduledTasks("proj-tianfu").some((item) => item.id === task.id));
  assert.ok(listAuditLogs("proj-tianfu").some((item) => item.action === "scheduled-task.created"));
});

test("platform blueprint locks phased build strategy and V1 contracts", () => {
  const blueprint = getPlatformBlueprint();
  const interfaceIds = blueprint.interfaceGroups.map((group) => group.id);

  assert.equal(blueprint.strategy.recommendation, "前后端一起做，但由前端体验牵引，后端从第一天开始提供稳定契约。");
  assert.deepEqual(blueprint.phases.map((phase) => phase.id), [
    "phase-0",
    "phase-1",
    "phase-2",
    "phase-3",
    "phase-4",
    "phase-5"
  ]);
  assert.ok(interfaceIds.includes("schedule"));
  assert.ok(interfaceIds.includes("quality"));
  assert.ok(interfaceIds.includes("cost"));
  assert.ok(interfaceIds.includes("safety"));
  assert.ok(interfaceIds.includes("documents"));
  assert.ok(interfaceIds.includes("agents-messages"));
  assert.ok(interfaceIds.includes("model-gateway"));
  assert.ok(blueprint.acceptanceScenarios.some((item) => item.includes("同步问答必须带引用")));
});

test("schedule libraries expose residential rule engine summary", () => {
  const summary = getScheduleLibrariesSummary("住宅");

  assert.equal(summary.projectType, "residential");
  assert.ok(summary.templates.some((item) => item.id === "TP-MEP-01" && item.spaceFirst));
  assert.ok(summary.relationCount >= 5);
  assert.ok(summary.flowRuleCount >= 5);
});

function buildResidentialWizardData(overrides = {}) {
  return {
    startDate: "2026-06-08",
    buildingType: "residential",
    floorCount: 26,
    lagFloors: 5,
    concurrentWork: "normal",
    includeWeather: false,
    includeWinter: false,
    selectedTemplates: ["MASTER-PREP", "TP-STR-001", "TP-MEP-01", "TP-SEC-01", "TP-EXT-01"],
    selectedBuildings: ["1#楼", "2#楼"],
    selectedBasementLevels: ["B2-1区", "B1-1区"],
    templateEdits: {},
    mepSpaces: [
      { id: "space-basement", name: "地下室", spaceType: "basement", enabled: true },
      { id: "space-tower", name: "塔楼标准层", spaceType: "tower", enabled: true },
      { id: "space-ceiling", name: "吊顶区域", spaceType: "ceiling", enabled: true },
      { id: "space-equipment", name: "机房", spaceType: "equipment", enabled: true }
    ],
    mepEditorSystems: {
      "space-basement": ["plumbing", "electrical", "fire"],
      "space-tower": ["plumbing", "electrical", "fire"],
      "space-ceiling": ["fire", "hvac"],
      "space-equipment": ["hvac", "elevator"]
    },
    mepEditorConstraints: {
      "space-basement": ["coordination", "hanger"],
      "space-tower": ["concealedAcceptance"],
      "space-ceiling": ["concealedAcceptance"],
      "space-equipment": ["equipmentFoundation", "equipmentArrival", "formalPower", "fireLinkage"]
    },
    mepEditorTasks: {},
    towerCranes: [
      {
        id: "tower-1",
        enabled: true,
        code: "TC-01",
        coveredBuildings: ["1#楼", "2#楼"],
        coveredBasementZones: ["B2-1区", "B1-1区"]
      }
    ],
    constructionElevators: [
      {
        id: "elevator-1",
        enabled: true,
        code: "EL-01",
        coveredBuildings: ["1#楼", "2#楼"]
      }
    ],
    ...overrides
  };
}

function buildResidentialProject() {
  return {
    id: "proj-residential",
    type: "住宅小区",
    buildings: [
      { name: "1#楼", floors: 26, area: 12000, structureType: "剪力墙结构" },
      { name: "2#楼", floors: 25, area: 11800, structureType: "剪力墙结构" }
    ],
    basement: {
      levels: [
        { name: "B2", zones: [{ name: "1区", area: 18000 }] },
        { name: "B1", zones: [{ name: "1区", area: 18000 }] }
      ]
    }
  };
}

test("preview schedule wizard groups mep nodes by space and filters disabled systems", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData({
    mepEditorSystems: {
      "space-basement": ["plumbing", "electrical"],
      "space-tower": ["plumbing", "electrical"],
      "space-ceiling": ["hvac"],
      "space-equipment": ["elevator"]
    }
  });

  const result = previewScheduleWizard(project, wizardData);

  assert.ok(result.preview.mepBySpace.some((group) => group.label.includes("B2") || group.label.includes("B1")));
  assert.ok(result.preview.mepBySpace.some((group) => group.items.some((item) => item.name.includes("主体预留预埋同步") || item.name.includes("标准层机电粗装施工"))));
  assert.ok(result.nodes.some((node) => node.name.includes("1#楼") && node.packageId));
  assert.ok(!result.detailNodes.some((node) => node.systemKey === "fire"));
  assert.ok(result.detailNodes.length > result.nodes.length);
});

test("schedule preview applies editable backend relation overrides", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData({
    enabledRuleRelations: ["structure-to-tower-embed"],
    relationRuleEdits: {
      "structure-to-tower-embed": {
        relationship: "FS",
        lagDays: 3
      }
    }
  });

  const result = previewScheduleWizard(project, wizardData);
  const relation = result.preview.relationOptions.find((item) => item.id === "structure-to-tower-embed");

  assert.ok(relation);
  assert.equal(relation.relationship, "FS");
  assert.equal(relation.lagDays, 3);
});

test("default residential schedule generation passes audit", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData();

  const result = generateScheduleWizard(project, wizardData);

  assert.equal(result.audit.status, "passed");
  assert.equal(result.audit.blockers.length, 0);
  assert.ok(result.nodes.some((node) => node.name.includes("系统联调与专项验收收口")));
  assert.ok(result.detailNodes.length > result.nodes.length);
});

test("schedule generation is blocked when formal power prerequisite is missing", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData({
    mepEditorConstraints: {
      "space-basement": ["coordination", "hanger"],
      "space-tower": ["concealedAcceptance"],
      "space-ceiling": ["concealedAcceptance"],
      "space-equipment": ["equipmentFoundation", "equipmentArrival"]
    }
  });

  const result = generateScheduleWizard(project, wizardData);

  assert.equal(result.audit.status, "blocked");
  assert.ok(result.audit.blockers.some((item) => item.id === "formal-power"));
});

test("schedule engine warns when high-rise residential project lacks elevator coverage", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData({
    constructionElevators: []
  });

  const result = generateScheduleWizard(project, wizardData);

  assert.ok(result.reviews.some((item) => item.includes("未配置施工电梯覆盖")));
});

test("schedule preview and generate return consistent result shape", () => {
  const project = buildResidentialProject();
  const wizardData = buildResidentialWizardData();

  const preview = previewScheduleWizard(project, wizardData);
  const generated = generateScheduleWizard(project, wizardData);

  assert.deepEqual(Object.keys(preview).sort(), Object.keys(generated).sort());
  assert.ok(generated.nodes.length >= preview.preview.mepBySpace.reduce((sum, group) => sum + group.items.length, 0));
  assert.ok(generated.detailNodes.length >= generated.nodes.length);
  assert.ok(Array.isArray(preview.preview.mepDetailBySpace));
  assert.ok(generated.milestones.length > 0);
});
