import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { getProvider, listProviders } from "./services/model-gateway.js";
import { readJson, sendError, sendJson, serveStatic } from "./lib/http.js";
import { createInMemoryPlatformRepository } from "./repositories/platform-repository.js";
import { agentCatalog, answerProjectQuestion, classifyDocumentUpload, generateAsyncAnalysis } from "../worker-agent/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = normalize(join(__dirname, ".."));

export function createPlatformServer(options = {}) {
  const repository = options.repository || createInMemoryPlatformRepository();
  const delays = {
    runMs: options.runMs ?? 450,
    documentMs: options.documentMs ?? 300
  };

  function queueRun({ projectId, runType, prompt, agentId = "pmo-agent" }) {
    const run = repository.agents.createRun({
      projectId,
      runType,
      prompt,
      agentId
    });
    setTimeout(() => {
      try {
        const context = repository.projects.buildContext(projectId);
        const provider = getProvider(repository.model.getProviderSelection());
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
          title: `${result.title}（${result.provider}）`,
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
        accessibleProjects: repository.auth.listAccessibleProjects(user)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/portfolio") {
      sendJson(response, 200, repository.portfolio.buildView(user, Object.fromEntries(url.searchParams.entries())));
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
      const provider = getProvider(repository.model.getProviderSelection());
      const context = repository.projects.buildContext(body.projectId);
      sendJson(response, 200, answerProjectQuestion({
        question: body.question,
        provider,
        ...context
      }));
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

      if (request.method === "GET" && segments.length === 4 && segments[3] === "dashboard") {
        sendJson(response, 200, repository.projects.buildDashboard(projectId, user));
        return;
      }

      if (request.method === "GET" && segments.length === 4 && segments[3] === "schedule") {
        sendJson(response, 200, repository.schedule.buildView(projectId, user));
        return;
      }

      if (request.method === "POST" && segments.length === 5 && segments[3] === "schedule" && segments[4] === "import") {
        const body = await readJson(request);
        const schedule = repository.schedule.import(projectId, body.rows || [], user, body.source || "manual");
        queueRun({
          projectId,
          runType: "schedule-scan",
          prompt: `分析 ${body.rows?.length || 0} 个新导入的 WBS 节点`,
          agentId: "schedule-agent"
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
          agentId: "safety-agent"
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
