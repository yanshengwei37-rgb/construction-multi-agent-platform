import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { getProvider, listProviders } from "./services/model-gateway.js";
import { readJson, sendError, sendJson, serveStatic } from "./lib/http.js";
import { createInMemoryPlatformRepository } from "./repositories/platform-repository.js";
import { agentCatalog, classifyDocumentUpload, generateAsyncAnalysis } from "../worker-agent/index.js";
import { getAgent, listAgents } from "../agents/index.js";
import { getDemoData } from "./data/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = normalize(join(__dirname, ".."));

export function createPlatformServer(options = {}) {
  const repository = options.repository || createInMemoryPlatformRepository();
  const delays = {
    runMs: options.runMs ?? 450,
    documentMs: options.documentMs ?? 300
  };

  function resolveAgentProvider(agentId) {
    const binding = repository.model.getAgentBinding(agentId);
    const provider = getProvider(binding.providerId || repository.model.getProviderSelection());
    return {
      ...provider,
      label: `${provider.label} / ${binding.chatModel}`,
      model: binding.chatModel,
      binding
    };
  }

  function validateModelPatch(body) {
    if (body.providerId && !listProviders().some((item) => item.id === body.providerId)) {
      return "invalid_provider";
    }
    if (body.providerId && body.chatModel) {
      const provider = getProvider(body.providerId);
      if (!provider.capabilities?.chat?.includes(body.chatModel)) {
        return "invalid_chat_model";
      }
    }
    return "";
  }

  function queueRun({ projectId, runType, prompt, agentId = "pmo-agent", actorId, actorName }) {
    const run = repository.agents.createRun({
      projectId,
      runType,
      prompt,
      agentId,
      actorId,
      actorName
    });
    setTimeout(() => {
      try {
        const context = repository.projects.buildContext(projectId);
        const provider = resolveAgentProvider(agentId);
        const result = generateAsyncAnalysis({
          runType,
          prompt,
          provider,
          ...context
        });
        repository.agents.completeRun(run.id, {
          summary: result.summary,
          citations: result.citations,
          provider: result.provider
        });
        repository.agents.appendInsight(projectId, {
          agentId: result.agentId,
          severity: result.severity,
          title: result.title,
          summary: result.summary,
          citations: result.citations
        });
        repository.notifications.append(projectId, {
          type: result.severity === "warning" ? "warning" : "digest",
          title: result.title,
          module: "agents",
          createdAt: new Date().toISOString(),
          recordId: run.id
        });
      } catch (error) {
        repository.agents.failRun(run.id, error.message);
      }
    }, delays.runMs);
    return run;
  }

  function queueDocumentIndex(projectId, documentId, payload) {
    setTimeout(() => {
      const metadata = classifyDocumentUpload(payload);
      const document = repository.documents.markIndexed(projectId, documentId, metadata);
      if (!document) {
        return;
      }
      repository.agents.appendInsight(projectId, {
        agentId: "document-agent",
        severity: document.parseStatus === "indexed" ? "normal" : "warning",
        title: "资料解析完成",
        summary: `${document.name} 已完成 ${document.type} 分类，并可供项目问答引用。`,
        citations: [{ id: document.id, label: document.name, module: "documents" }]
      });
      repository.notifications.append(projectId, {
        type: "digest",
        title: `资料 Agent：${document.name} 已完成索引`,
        module: "documents",
        createdAt: new Date().toISOString(),
        recordId: document.id
      });
    }, delays.documentMs);
  }

  async function handleApi(request, response, pathname) {
    const user = repository.auth.resolveUser(request.headers);
    const url = new URL(request.url, "http://localhost");
    const segments = pathname.split("/").filter(Boolean);

    if (request.method === "GET" && pathname === "/api/session") {
      sendJson(response, 200, {
        user,
        personas: repository.auth.listUsers(),
        providers: listProviders(),
        currentProvider: repository.model.getProviderSelection(),
        agents: agentCatalog,
        agentConfig: repository.agents.getConfig(),
        accessibleProjects: repository.auth.listAccessibleProjects(user)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/portfolio") {
      sendJson(response, 200, repository.portfolio.buildView(user, Object.fromEntries(url.searchParams.entries())));
      return;
    }

    if (request.method === "GET" && pathname === "/api/platform/blueprint") {
      sendJson(response, 200, repository.platform.getBlueprint());
      return;
    }

    if (request.method === "GET" && pathname === "/api/schedule/libraries") {
      const projectType = url.searchParams.get("projectType") || "residential";
      sendJson(response, 200, repository.schedule.getLibrariesSummary(projectType));
      return;
    }

    if (request.method === "GET" && pathname === "/api/model/providers") {
      sendJson(response, 200, {
        providers: listProviders(),
        currentProvider: repository.model.getProviderSelection()
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/model/provider") {
      const body = await readJson(request);
      if (!listProviders().some((item) => item.id === body.provider)) {
        sendError(response, 400, "invalid_provider");
        return;
      }
      repository.model.setProviderSelection(body.provider);
      sendJson(response, 200, {
        currentProvider: repository.model.getProviderSelection()
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/agent/chat") {
      const body = await readJson(request);
      repository.auth.ensureProjectAccess(user, body.projectId);
      const agent = getAgent(body.agentId || "pmo-agent");
      // Clear memory for fresh conversation
      agent.clearMemory();
      // Bind project context data from store
      const demoData = getDemoData();
      agent.setContext(demoData);
      const result = await agent.chat(body.question);
      sendJson(response, 200, {
        answer: result.answer,
        citations: [],
        agents: listAgents().map((a) => a.id)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/agent/config") {
      sendJson(response, 200, {
        providers: listProviders(),
        ...repository.agents.getConfig()
      });
      return;
    }

    if (request.method === "PATCH" && segments.length === 5 && segments[1] === "agent" && segments[2] === "config" && segments[3] === "models") {
      const body = await readJson(request);
      const validationError = validateModelPatch(body);
      if (validationError) {
        sendError(response, 400, validationError);
        return;
      }
      const binding = repository.agents.updateModelBinding(segments[4], body);
      sendJson(response, 200, binding);
      return;
    }

    if (request.method === "PATCH" && segments.length === 5 && segments[1] === "agent" && segments[2] === "config" && segments[3] === "workflows") {
      const body = await readJson(request);
      const workflow = repository.agents.updateWorkflow(segments[4], body);
      sendJson(response, 200, workflow);
      return;
    }

    if (request.method === "POST" && segments.length === 5 && segments[1] === "agent" && segments[2] === "workflows" && segments[4] === "test") {
      const body = await readJson(request);
      repository.auth.ensureProjectAccess(user, body.projectId);
      const plan = repository.agents.buildWorkflowTestPlan(segments[3], body.projectId);
      if (!plan.workflow.enabled) {
        sendError(response, 400, "workflow_disabled");
        return;
      }
      const run = queueRun({
        projectId: body.projectId,
        runType: plan.workflow.runType,
        prompt: body.prompt || `测试工作流：${plan.workflow.name}`,
        agentId: plan.workflow.ownerAgentId,
        actorId: user.id,
        actorName: user.name
      });
      sendJson(response, 202, { plan, run });
      return;
    }

    if (request.method === "POST" && pathname === "/api/agent/runs") {
      const body = await readJson(request);
      repository.auth.ensureProjectAccess(user, body.projectId);
      const run = queueRun({
        projectId: body.projectId,
        runType: body.runType || "weekly-brief",
        prompt: body.prompt || "生成项目摘要",
        agentId: body.agentId || "pmo-agent",
        actorId: user.id,
        actorName: user.name
      });
      sendJson(response, 202, run);
      return;
    }

    if (request.method === "GET" && pathname === "/api/agent/runs") {
      const projectId = url.searchParams.get("projectId");
      if (projectId) {
        repository.auth.ensureProjectAccess(user, projectId);
      }
      sendJson(response, 200, { items: repository.agents.listRuns(projectId || undefined) });
      return;
    }

    if (segments[1] === "projects" && segments[2]) {
      const projectId = segments[2];
      repository.auth.ensureProjectAccess(user, projectId);

      if (request.method === "PATCH" && segments.length === 3) {
        const body = await readJson(request);
        const project = repository.projects.get(projectId);
        const updatable = ["name","code","type","region","stage","manager","status"];
        for (const key of updatable) {
          if (body[key] !== undefined) project[key] = body[key];
        }
        if (body.buildings !== undefined) {
          project.buildings = body.buildings.map(b => ({
            name: b.name,
            floors: b.floors || 1,
            area: b.area || 0,
            type: b.type || b.usage || "其他",
            usage: b.usage || b.type || "其他",
            structureType: b.structureType || "框架结构",
            prefabComponents: b.prefabComponents || [],
            floorDetails: b.floorDetails || null
          }));
        }
        if (body.basement !== undefined) {
          project.basement = { ...(project.basement || {}), ...body.basement };
        }
        if (body.verticalTransport !== undefined) {
          project.verticalTransport = {
            towerCranes: Array.isArray(body.verticalTransport.towerCranes) ? body.verticalTransport.towerCranes : [],
            constructionElevators: Array.isArray(body.verticalTransport.constructionElevators) ? body.verticalTransport.constructionElevators : []
          };
        }
        sendJson(response, 200, project);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "dashboard") {
        sendJson(response, 200, repository.projects.buildDashboard(projectId, user));
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "scheduled-tasks") {
        sendJson(response, 200, { items: repository.agents.listScheduledTasks(projectId) });
        return;
      }

      if (request.method === "POST" && segments.length === 4 && segments[3] === "scheduled-tasks") {
        const body = await readJson(request);
        sendJson(response, 201, repository.agents.addScheduledTask(projectId, body, user));
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "schedule") {
        sendJson(response, 200, repository.schedule.buildView(projectId, user));
        return;
      }

      if (request.method === "POST" && segments.length === 6 && segments[3] === "schedule" && segments[4] === "wizard" && segments[5] === "preview") {
        const body = await readJson(request);
        sendJson(response, 200, repository.schedule.preview(projectId, body.wizardData || body));
        return;
      }

      if (request.method === "POST" && segments.length === 6 && segments[3] === "schedule" && segments[4] === "wizard" && segments[5] === "generate") {
        const body = await readJson(request);
        sendJson(response, 200, repository.schedule.generate(projectId, body.wizardData || body));
        return;
      }

      if (request.method === "POST" && segments.length === 6 && segments[3] === "schedule" && segments[4] === "wizard" && segments[5] === "apply") {
        const body = await readJson(request);
        const wizardData = body.wizardData || body;
        const plan = repository.schedule.generate(projectId, wizardData);
        if (plan.audit?.status === "blocked") {
          sendError(response, 409, "schedule_audit_blocked");
          return;
        }
        const rows = Array.isArray(body.rows) && body.rows.length
          ? body.rows
          : plan.nodes.map((node) => ({
              name: node.name,
              owner: node.owner,
              percent: node.percent,
              plannedDate: node.plannedDate,
              varianceDays: node.varianceDays ?? 0,
              critical: Boolean(node.critical),
              sourceDocId: node.sourceDocId || null
            }));
        const schedule = repository.schedule.import(
          projectId,
          rows,
          user,
          body.source || "AI-进度计划自动编制",
          {
            milestones: plan.milestones,
            auditStatus: plan.audit?.status || "unknown"
          }
        );
        queueRun({
          projectId,
          runType: "schedule-scan",
          prompt: `分析 ${rows.length} 个新导入的 WBS 节点`,
          agentId: "schedule-agent",
          actorId: user.id,
          actorName: user.name
        });
        sendJson(response, 200, { schedule, plan });
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "schedule" && segments[4] === "import") {
        const body = await readJson(request);
        const schedule = repository.schedule.import(projectId, body.rows || [], user, body.source || "manual", {
          milestones: body.milestones || [],
          auditStatus: body.auditStatus || "unknown"
        });
        queueRun({
          projectId,
          runType: "schedule-scan",
          prompt: `分析 ${body.rows?.length || 0} 个新导入的 WBS 节点`,
          agentId: "schedule-agent",
          actorId: user.id,
          actorName: user.name
        });
        sendJson(response, 200, schedule);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "documents") {
        sendJson(response, 200, repository.documents.buildView(projectId, user, Object.fromEntries(url.searchParams.entries())));
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "documents" && segments[4] === "upload") {
        const body = await readJson(request);
        const record = repository.documents.addUpload(projectId, body, user);
        queueDocumentIndex(projectId, record.id, body);
        sendJson(response, 202, record);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "safety") {
        sendJson(response, 200, repository.safety.buildView(projectId, user));
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "safety" && segments[4] === "inspections") {
        const body = await readJson(request);
        const result = repository.safety.addInspection(projectId, body, user);
        queueRun({
          projectId,
          runType: "safety-review",
          prompt: `复核新增隐患：${body.title}`,
          agentId: "safety-agent",
          actorId: user.id,
          actorName: user.name
        });
        sendJson(response, 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 7 &&
        segments[3] === "safety" &&
        segments[4] === "rectifications" &&
        segments[6] === "feedback"
      ) {
        const body = await readJson(request);
        const updated = repository.safety.addRectificationFeedback(projectId, segments[5], body, user);
        sendJson(response, 200, updated);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "tech-cost") {
        sendJson(response, 200, repository.techCost.buildView(projectId, user));
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "quality") {
        sendJson(response, 200, repository.quality.buildView(projectId, user));
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "quality" && segments[4] === "inspections") {
        const body = await readJson(request);
        const result = repository.quality.addInspection(projectId, body, user);
        queueRun({
          projectId,
          runType: "quality-review",
          prompt: `复核新增质量检查：${body.title}`,
          agentId: "tech-agent",
          actorId: user.id,
          actorName: user.name
        });
        sendJson(response, 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 7 &&
        segments[3] === "quality" &&
        segments[4] === "issues" &&
        segments[6] === "recheck"
      ) {
        const body = await readJson(request);
        const updated = repository.quality.addIssueRecheck(projectId, segments[5], body, user);
        sendJson(response, 200, updated);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "cost") {
        sendJson(response, 200, repository.cost.buildView(projectId, user));
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "cost" && segments[4] === "snapshots") {
        const body = await readJson(request);
        const result = repository.cost.addSnapshot(projectId, body, user);
        queueRun({
          projectId,
          runType: "cost-review",
          prompt: `分析 ${body.month} 成本快照`,
          agentId: "cost-agent",
          actorId: user.id,
          actorName: user.name
        });
        sendJson(response, 201, result);
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "notifications") {
        sendJson(response, 200, { items: repository.notifications.list(projectId) });
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "agent-insights") {
        sendJson(response, 200, { items: repository.agents.listInsights(projectId) });
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "audit-logs") {
        sendJson(response, 200, { items: repository.audit.list(projectId, Object.fromEntries(url.searchParams.entries())) });
        return;
      }
    }

    // ============================================================
    // 工序编码库 API（6系统 × 18分项 × 29工序）
    // ============================================================

    if (request.method === "GET" && pathname === "/api/mep/process-library") {
      const format = url.searchParams.get("format") || "tree";
      if (format === "flat") {
        sendJson(response, 200, { systems: repository.processLibrary.getFlat() });
      } else {
        sendJson(response, 200, { systems: repository.processLibrary.getTree() });
      }
      return;
    }

    if (request.method === "GET" && segments.length === 4 && pathname.startsWith("/api/mep/process-library/") && segments[3] && segments[3] !== "instantiate") {
      const fullCode = segments[3];
      const view = url.searchParams.get("view") || "detail";
      if (view === "hierarchy") {
        const hierarchy = repository.processLibrary.getCodeHierarchy(fullCode);
        if (!hierarchy.length) { sendError(response, 404, "code_not_found"); return; }
        sendJson(response, 200, { fullCode, hierarchy });
      } else {
        const proc = repository.processLibrary.getByCode(fullCode);
        if (!proc) { sendError(response, 404, "code_not_found"); return; }
        sendJson(response, 200, proc);
      }
      return;
    }

    if (request.method === "GET" && segments.length === 5 && pathname.startsWith("/api/mep/process-library/") && segments[3] === "system") {
      const systemCode = segments[4];
      const items = repository.processLibrary.getProcessesBySystem(systemCode);
      if (!items.length) { sendError(response, 404, "system_not_found"); return; }
      sendJson(response, 200, { systemCode, items });
      return;
    }

    if (request.method === "POST" && segments.length === 5 && pathname.startsWith("/api/mep/process-library/") && segments[3] === "instantiate") {
      const body = await readJson(request);
      const projectId = segments[4];
      repository.auth.ensureProjectAccess(user, projectId);
      const instances = repository.processLibrary.instantiateToProject(projectId, {
        spaceKey: body.spaceKey || "tower",
        entityName: body.entityName || "塔楼",
        startDate: body.startDate || "",
        durationOverrides: body.durationOverrides || {}
      });
      sendJson(response, 200, { count: instances.length, instances });
      return;
    }

    // 工序库 API
    if (request.method === "GET" && pathname === "/api/templates") {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const indexPath = path.join(__dirname, "data", "工序库", "templates", "index.json");
      const data = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      sendJson(response, 200, data);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/templates/")) {
      const templateId = segments[2];
      const fs = await import("node:fs");
      const path = await import("node:path");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const filePath = path.join(__dirname, "data", "工序库", "templates", `${templateId}.json`);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        sendJson(response, 200, data);
      } catch {
        sendError(response, 404, "template_not_found");
      }
      return;
    }

    if (request.method === "PUT" && pathname.startsWith("/api/templates/") && pathname.endsWith("/mode-tasks")) {
      // PUT /api/templates/:id/mode-tasks — save mode tasks as default
      const templateId = segments[2];
      const body = await readJson(request);
      const modeId = body.modeId;
      const tasks = body.tasks;
      if (!templateId || !modeId || !Array.isArray(tasks)) {
        sendError(response, 400, "invalid_payload");
        return;
      }
      const fs = await import("node:fs");
      const path = await import("node:path");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const filePath = path.join(__dirname, "data", "工序库", "templates", `${templateId}.json`);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const mode = (data.modes || []).find(m => m.mode_id === modeId);
        if (!mode) {
          sendError(response, 404, "mode_not_found");
          return;
        }
        // Update task fields: map from client format back to server format
        mode.tasks = tasks.map(function(t, idx) {
          return {
            task_id: t.id || t.task_id || (modeId + "-" + String(idx + 1).padStart(3, "0")),
            task_name: t.name || t.task_name || "",
            enabled: t.enabled !== false,
            sequence_no: idx + 1,
            stage: mode.mode_name || "",
            mode_id: modeId,
            default_duration_days: t.durationDays || t.default_duration_days || 1,
            predecessors: t.predecessors || [],
            is_key_task: t.isKeyTask || t.is_key_task || false,
            is_inspection_node: t.is_inspection_node || false
          };
        });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
        sendJson(response, 200, { ok: true, counts: mode.tasks.length });
      } catch (err) {
        sendError(response, 500, err.message || "save_failed");
      }
      return;
    }

    sendError(response, 404, "not_found");
  }

  return createHttpServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname.startsWith("/api/")) {
        await handleApi(request, response, pathname);
        return;
      }

      if (pathname === "/") {
        serveStatic(response, join(rootDir, "index.html"));
        return;
      }

      if (pathname === "/app.js" || pathname === "/styles.css") {
        serveStatic(response, join(rootDir, pathname.slice(1)));
        return;
      }

      if (pathname === "/admin-web" || pathname === "/field-h5") {
        serveStatic(response, join(rootDir, pathname.slice(1), "index.html"));
        return;
      }

      if (pathname.startsWith("/admin-web/") || pathname.startsWith("/field-h5/")) {
        const relativePath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
        serveStatic(response, join(rootDir, relativePath));
        return;
      }

      sendError(response, 404, "not_found");
    } catch (error) {
      sendError(response, error.statusCode || 500, error.message || "server_error");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5180);
  const server = createPlatformServer();
  server.listen(port, () => {
    console.log(`Construction multi-agent platform running at http://localhost:${port}`);
  });
}
