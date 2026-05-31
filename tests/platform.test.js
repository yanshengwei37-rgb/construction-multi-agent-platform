import test from "node:test";
import assert from "node:assert/strict";
import {
  addDocumentUpload,
  addSafetyInspection,
  appendNotification,
  completeAgentRun,
  createAgentRun,
  ensureProjectAccess,
  getProject,
  getProvidersSelection,
  getState,
  getUser,
  listAuditLogs,
  listAccessibleProjects,
  listNotifications,
  markDocumentIndexed,
  resetStore
} from "../api/data/store.js";
import { getProvider } from "../api/services/model-gateway.js";
import { answerProjectQuestion, classifyDocumentUpload, generateAsyncAnalysis } from "../worker-agent/index.js";

function currentProjectContext(projectId) {
  const state = getState();
  return {
    project: getProject(projectId),
    schedule: state.schedules[projectId],
    documents: state.documents[projectId],
    safety: state.safety[projectId],
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
