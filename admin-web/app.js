const state = {
  userId: localStorage.getItem("admin-demo-user") || "project-manager",
  currentView: "dashboard",
  projectId: "",
  portfolioFilters: { region: "", type: "" },
  docFilters: { q: "", type: "" },
  chatLog: [
    {
      role: "assistant",
      content: "可以直接问我：本周最需要关注什么、资料缺口有哪些、关键线路偏差在哪一段。"
    }
  ],
  data: {}
};

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Demo-User": state.userId
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: headers(),
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || response.statusText);
  }
  return response.json();
}

function numberDelta(days) {
  if (days === 0) return "正常";
  return days > 0 ? `提前 ${days} 天` : `滞后 ${Math.abs(days)} 天`;
}

function severityClass(value) {
  if (value === "warning" || value === "high") return "warning";
  if (value === "normal" || value === "indexed") return "normal";
  return "high";
}

function statusText(value) {
  const map = {
    warning: "预警",
    normal: "正常",
    high: "高风险",
    medium: "中风险",
    issue_found: "有问题",
    passed: "已通过",
    recheck_pending: "待复验",
    pending: "待整改",
    closed: "已闭环",
    approved: "已审批",
    reviewing: "审批中",
    tracking: "跟踪中",
    indexed: "已索引",
    ocr_queued: "待解析"
  };
  return map[value] || value;
}

function auditActionText(value) {
  const map = {
    "agent.run.queued": "Agent 任务排队",
    "agent.run.succeeded": "Agent 分析完成",
    "agent.run.failed": "Agent 分析失败",
    "agent.run.reviewed": "Agent 结论查看",
    "document.uploaded": "资料上传",
    "document.indexed": "资料完成索引",
    "schedule.imported": "进度导入",
    "quality.inspection.created": "质量检查",
    "quality.issue.rechecked": "质量复验",
    "cost.snapshot.created": "成本快照",
    "safety.inspection.created": "巡检录入",
    "safety.rectification.updated": "整改反馈"
  };
  return map[value] || value;
}

function parseScheduleRows(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, owner, percent, plannedDate, varianceDays, critical] = line.split("|").map((item) => item.trim());
      return {
        name,
        owner,
        percent: Number(percent),
        plannedDate,
        varianceDays: Number(varianceDays),
        critical: critical === "true"
      };
    });
}

function getActiveProject() {
  const accessibleProjects = state.data.session?.accessibleProjects || [];
  return accessibleProjects.find((item) => item.id === state.projectId) || accessibleProjects[0];
}

async function loadSession() {
  state.data.session = await api("/api/session");
  if (!state.projectId || !state.data.session.accessibleProjects.some((item) => item.id === state.projectId)) {
    state.projectId = state.data.session.accessibleProjects[0]?.id || "";
  }
}

async function loadPortfolio() {
  const params = new URLSearchParams();
  if (state.portfolioFilters.region) params.set("region", state.portfolioFilters.region);
  if (state.portfolioFilters.type) params.set("type", state.portfolioFilters.type);
  state.data.portfolio = await api(`/api/portfolio?${params.toString()}`);
}

async function loadProjectData() {
  if (!state.projectId) return;
  const [dashboard, schedule, documents, safety, quality, cost, notifications, insights, runs, auditLogs] = await Promise.all([
    api(`/api/projects/${state.projectId}/dashboard`),
    api(`/api/projects/${state.projectId}/schedule`),
    api(`/api/projects/${state.projectId}/documents`),
    api(`/api/projects/${state.projectId}/safety`),
    api(`/api/projects/${state.projectId}/quality`),
    api(`/api/projects/${state.projectId}/cost`),
    api(`/api/projects/${state.projectId}/notifications`),
    api(`/api/projects/${state.projectId}/agent-insights`),
    api(`/api/agent/runs?projectId=${state.projectId}`),
    api(`/api/projects/${state.projectId}/audit-logs`)
  ]);
  state.data.dashboard = dashboard;
  state.data.schedule = schedule;
  state.data.documents = documents;
  state.data.safety = safety;
  state.data.quality = quality;
  state.data.cost = cost;
  state.data.notifications = notifications;
  state.data.insights = insights;
  state.data.runs = runs;
  state.data.auditLogs = auditLogs;
}

async function reloadAll() {
  await loadSession();
  await Promise.all([loadPortfolio(), loadProjectData()]);
  render();
}

function renderTopControls() {
  const personaSelect = document.querySelector("#persona-select");
  const providerSelect = document.querySelector("#provider-select");
  const projectSelect = document.querySelector("#project-select");
  const { session } = state.data;
  personaSelect.innerHTML = session.personas.map((persona) => `
    <option value="${persona.id}" ${persona.id === state.userId ? "selected" : ""}>${persona.title}</option>
  `).join("");
  providerSelect.innerHTML = session.providers.map((provider) => `
    <option value="${provider.id}" ${provider.id === session.currentProvider ? "selected" : ""}>${provider.label}</option>
  `).join("");
  projectSelect.innerHTML = session.accessibleProjects.map((project) => `
    <option value="${project.id}" ${project.id === state.projectId ? "selected" : ""}>${project.name}</option>
  `).join("");
}

function renderContextCard() {
  const target = document.querySelector("#project-context-card");
  const activeProject = getActiveProject();
  if (!activeProject) {
    target.innerHTML = "<strong>暂无项目上下文</strong><p>当前角色没有可访问的项目。</p>";
    return;
  }
  target.innerHTML = `
    <strong>${activeProject.name}</strong>
    <p>${activeProject.code} · ${activeProject.region} · ${activeProject.type}</p>
    <p>阶段：${activeProject.stage} · 项目经理：${activeProject.manager}</p>
  `;
}

function renderHeadline() {
  const target = document.querySelector("#headline-strip");
  const scopeLabel = document.querySelector("#scope-label");
  const pageTitle = document.querySelector("#page-title");

  if (state.currentView === "portfolio") {
    const { metrics } = state.data.portfolio;
    scopeLabel.textContent = "公司层视图";
    pageTitle.textContent = "项目群总览";
    target.innerHTML = `
      <article class="hero-card"><span>在建项目</span><strong>${metrics.totalProjects}</strong><p>当前筛选范围内项目数</p></article>
      <article class="hero-card"><span>预警项目</span><strong>${metrics.warningProjects}</strong><p>需要管理层重点跟进</p></article>
      <article class="hero-card"><span>平均进度</span><strong>${metrics.averageProgress}%</strong><p>项目群加权平均进度</p></article>
      <article class="hero-card"><span>待整改 / 待索引</span><strong>${metrics.pendingRectifications} / ${metrics.docsPendingIndex}</strong><p>跨项目隐患与资料任务</p></article>
    `;
    return;
  }

  const { summary } = state.data.dashboard;
  scopeLabel.textContent = "项目层视图";
  pageTitle.textContent = {
    dashboard: "项目仪表盘",
    schedule: "进度管理",
    quality: "质量管理",
    cost: "成本管理",
    documents: "资料管理",
    safety: "安全管理",
    agents: "Agent 中心"
  }[state.currentView];
  target.innerHTML = `
    <article class="hero-card"><span>总进度</span><strong>${summary.progress}%</strong><p>${numberDelta(summary.scheduleVarianceDays)}</p></article>
    <article class="hero-card"><span>质量评分</span><strong>${summary.qualityScore}</strong><p>未闭环 ${summary.openQualityIssues} 项</p></article>
    <article class="hero-card"><span>成本偏差</span><strong>${summary.costDeviation}%</strong><p>合同与计量跟踪</p></article>
    <article class="hero-card"><span>安全评分</span><strong>${summary.safetyScore}</strong><p>待闭环隐患 ${summary.openRisks} 项</p></article>
    <article class="hero-card"><span>资料完整度</span><strong>${summary.docCompleteness}%</strong><p>项目资料已可供问答引用</p></article>
  `;
}

function renderPortfolioView() {
  const data = state.data.portfolio;
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Portfolio Filters</p>
          <h3 class="section-title">项目横向对比</h3>
        </div>
      </div>
      <div class="form-grid filter-row">
        <select id="portfolio-region">
          <option value="">全部区域</option>
          ${data.filters.regions.map((region) => `<option value="${region}" ${region === state.portfolioFilters.region ? "selected" : ""}>${region}</option>`).join("")}
        </select>
        <select id="portfolio-type">
          <option value="">全部类型</option>
          ${data.filters.types.map((type) => `<option value="${type}" ${type === state.portfolioFilters.type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="portfolio-grid">
        ${data.projects.map((project) => `
          <article class="project-card">
            <header>
              <div>
                <h3>${project.name}</h3>
                <p>${project.region} · ${project.type} · ${project.stage}</p>
              </div>
              <span class="pill ${severityClass(project.status)}">${statusText(project.status)}</span>
            </header>
            <div class="project-meta">
              <span>进度 ${project.summary.progress}%</span>
              <span>偏差 ${numberDelta(project.summary.scheduleVarianceDays)}</span>
              <span>隐患 ${project.summary.openRisks}</span>
              <span>资料 ${project.summary.docCompleteness}%</span>
            </div>
            <div class="project-actions">
              <button class="primary-button" data-action="open-project" data-project-id="${project.id}">下钻项目</button>
              <button class="secondary-button" data-action="focus-project" data-project-id="${project.id}">设为当前</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <h3 class="section-title">排序看板</h3>
      </div>
      <div class="rank-grid">
        ${renderRankingBlock("进度偏差排行", data.rankings.scheduleVariance, "天")}
        ${renderRankingBlock("安全风险排行", data.rankings.safetyRisk, "项")}
        ${renderRankingBlock("资料完整度排行", data.rankings.docCompleteness, "%")}
      </div>
    </section>
  `;
}

function renderRankingBlock(title, items, suffix) {
  return `
    <article class="panel">
      <div class="panel-heading">
        <h3 class="panel-title">${title}</h3>
      </div>
      <div class="ranking-list">
        ${items.map((item) => `
          <div class="table-row">
            <strong>${item.name}</strong>
            <p>${item.value}${suffix}</p>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderDashboardView() {
  const data = state.data.dashboard;
  return `
    <section class="panel fade-in">
      <div class="panel-heading">
        <h3 class="panel-title">项目全景摘要</h3>
      </div>
      <div class="metric-grid four">
        <article class="metric-card"><span>项目经理</span><strong>${data.summary.manager}</strong><p>阶段：${data.summary.stage}</p></article>
        <article class="metric-card"><span>关键线路</span><strong>${data.schedule.criticalCount}</strong><p>预警节点 ${data.schedule.warningCount} 个</p></article>
        <article class="metric-card"><span>质量问题</span><strong>${data.quality.openIssues}</strong><p>待复验 ${data.quality.recheckPending} 项</p></article>
        <article class="metric-card"><span>安全整改</span><strong>${data.safety.openRectifications}</strong><p>巡检 ${data.safety.inspections} 次</p></article>
      </div>
    </section>

    <section class="panel-grid two fade-in">
      <article class="panel">
        <div class="panel-heading">
          <h3 class="panel-title">进度节点快照</h3>
        </div>
        <div class="table-list">
          ${data.schedule.nodes.slice(0, 5).map((node) => `
            <div class="table-row">
              <strong>${node.name}</strong>
              <p>${node.percent}% · ${numberDelta(node.varianceDays)} · ${node.owner}</p>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <h3 class="panel-title">质量整改优先项</h3>
        </div>
        <div class="table-list">
          ${data.quality.latestIssues.map((issue) => `
            <div class="table-row">
              <strong>${issue.title}</strong>
              <p>${statusText(issue.status)} · ${issue.location} · 截止 ${issue.deadline}</p>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <h3 class="panel-title">整改优先项</h3>
        </div>
        <div class="table-list">
          ${data.safety.topRisks.map((risk) => `
            <div class="table-row">
              <strong>${risk.title}</strong>
              <p>${statusText(risk.severity)} · 责任人 ${risk.owner}</p>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <h3 class="panel-title">成本与资料</h3>
        </div>
        <div class="table-list">
          <div class="table-row">
            <strong>${data.cost.latest?.month || "-"} 成本快照</strong>
            <p>预算 ${data.cost.latest?.budget || 0} 万 · 实际 ${data.cost.latest?.actual || 0} 万 · 偏差 ${data.cost.varianceRate}%</p>
          </div>
          ${data.documents.latest.slice(0, 2).map((document) => `
            <div class="table-row">
              <strong>${document.name}</strong>
              <p>${document.type} · ${statusText(document.parseStatus)}</p>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderScheduleView() {
  const data = state.data.schedule;
  return `
    <section class="form-panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Schedule Import</p>
          <h3 class="section-title">导入 WBS / 进度计划</h3>
        </div>
      </div>
      <form id="schedule-import-form" class="form-grid">
        <input id="schedule-import-source" value="演示-WBS-导入模板.csv" />
        <div class="mini-card">
          <span>格式说明</span>
          <strong>名称 | 责任人 | 完成率 | 日期 | 偏差天数 | 是否关键</strong>
          <p>示例在下方文本框中，导入后会自动触发进度 Agent 分析。</p>
        </div>
        <div class="line-parser">
          <textarea id="schedule-import-rows">主体结构工程|生产经理|69|2026-06-18|-1|true
幕墙样板验收|幕墙分包|48|2026-06-25|0|false
机电管综深化|机电工程师|58|2026-07-02|-1|true
精装样板间移交|精装经理|24|2026-07-16|1|false</textarea>
          <code>每行 6 列，用竖线分隔。</code>
        </div>
        <button class="primary-button full" type="submit">导入并触发分析</button>
      </form>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Critical Path</p>
          <h3 class="section-title">里程碑与关键节点</h3>
        </div>
      </div>
      <div class="panel-grid three">
        ${data.milestones.map((item) => `
          <article class="mini-card">
            <span>${item.plannedDate}</span>
            <strong>${item.name}</strong>
            <p>${numberDelta(item.varianceDays)}</p>
          </article>
        `).join("")}
      </div>
      <div class="table-list">
        ${data.nodes.map((node) => `
          <div class="table-row">
            <strong>${node.name}</strong>
            <p>${node.owner} · ${node.percent}% · ${node.plannedDate} · ${node.critical ? "关键路径" : "非关键路径"} · ${numberDelta(node.varianceDays)}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDocumentsView() {
  const data = state.data.documents;
  return `
    <section class="form-panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Document Upload</p>
          <h3 class="section-title">统一资料接入</h3>
        </div>
      </div>
      <form id="document-upload-form" class="form-grid">
        <input id="document-name" placeholder="资料名称" value="主体结构日报 05-31" />
        <select id="document-type">
          <option value="周报">周报</option>
          <option value="WBS计划">WBS计划</option>
          <option value="巡检">巡检</option>
          <option value="施工方案">施工方案</option>
          <option value="照片">照片</option>
        </select>
        <select id="document-module">
          <option value="schedule">关联进度</option>
          <option value="documents">综合资料</option>
          <option value="safety">关联安全</option>
          <option value="quality">关联质量</option>
          <option value="cost">关联成本</option>
          <option value="tech">关联技术</option>
        </select>
        <input id="document-files" type="file" multiple />
        <textarea class="full" id="document-notes" placeholder="填写资料摘要或识别提示，帮助资料 Agent 分类和引用。">主体结构当前完成 68%，本周钢筋班组完成 2 个流水段。</textarea>
        <button class="primary-button full" type="submit">上传并进入解析流水线</button>
      </form>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Document Index</p>
          <h3 class="section-title">资料台账</h3>
        </div>
      </div>
      <div class="form-grid filter-row">
        <input id="document-search" value="${state.docFilters.q}" placeholder="搜索资料名称" />
        <select id="document-filter-type">
          <option value="">全部类型</option>
          ${data.filters.types.map((type) => `<option value="${type}" ${type === state.docFilters.type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="document-grid">
        ${data.items.map((document) => `
          <article class="document-card">
            <header>
              <div>
                <h3>${document.name}</h3>
                <p>${document.type} · ${document.module}</p>
              </div>
              <span class="status-badge ${severityClass(document.parseStatus)}">${statusText(document.parseStatus)}</span>
            </header>
            <p>${document.versions[0].excerpt}</p>
            <footer>
              <span>${document.versions[0].uploadedAt}</span>
              <span>${document.versions[0].fileNames.join(", ")}</span>
            </footer>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderHeatmap(matrix) {
  const header = `<div class="heat-axis"></div>${matrix.cols.map((col) => `<div class="heat-axis">${col}</div>`).join("")}`;
  const rows = matrix.rows.map((row, index) => `
    <div class="heat-axis">${row}</div>
    ${matrix.values[index].map((value) => {
      if (!value) return '<div class="heat-cell"></div>';
      const [tone, content] = value.split(":");
      return `<div class="heat-cell ${tone}">${content}</div>`;
    }).join("")}
  `).join("");
  return `<div class="heatmap">${header}${rows}</div>`;
}

function renderSafetyView() {
  const data = state.data.safety;
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Risk Matrix</p>
          <h3 class="section-title">风险热力图</h3>
        </div>
      </div>
      ${renderHeatmap(data.matrix)}
    </section>

    <section class="risk-grid fade-in">
      <article class="panel">
        <div class="section-heading">
          <h3 class="section-title">隐患整改</h3>
        </div>
        <div class="rectification-list">
          ${data.rectifications.map((item) => `
            <article class="risk-card">
              <strong>${item.title}</strong>
              <p>${statusText(item.severity)} · ${statusText(item.status)} · 截止 ${item.deadline}</p>
              <p>最近更新：${item.updates[0]?.note || "暂无"}</p>
            </article>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="section-heading">
          <h3 class="section-title">巡检记录</h3>
        </div>
        <div class="inspection-list">
          ${data.inspections.map((item) => `
            <article class="inspection-card">
              <strong>${item.title}</strong>
              <p>${item.location} · ${item.hazardType} · ${item.inspector}</p>
              <p>${item.description}</p>
            </article>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderQualityView() {
  const data = state.data.quality;
  return `
    <section class="form-panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Quality Inspection</p>
          <h3 class="section-title">质量检查录入</h3>
        </div>
      </div>
      <form id="quality-inspection-form" class="form-grid">
        <input id="quality-title" value="砌筑样板实测实量" />
        <input id="quality-location" value="地下室样板段" />
        <input id="quality-trade" value="砌筑工程" />
        <select id="quality-result">
          <option value="issue_found">发现问题</option>
          <option value="passed">验收通过</option>
        </select>
        <select id="quality-severity">
          <option value="medium">一般问题</option>
          <option value="high">重大问题</option>
          <option value="normal">合格记录</option>
        </select>
        <input id="quality-owner" value="砌筑班组" />
        <input id="quality-deadline" value="2026-06-03" />
        <textarea class="full" id="quality-description">灰缝厚度局部偏差，需要返修后复验。</textarea>
        <button class="primary-button full" type="submit">提交质量检查</button>
      </form>
    </section>

    <section class="panel-grid two fade-in">
      <article class="panel">
        <div class="section-heading">
          <h3 class="section-title">质量问题台账</h3>
          <span>${data.summary.openIssues} 项未闭环</span>
        </div>
        <div class="task-list">
          ${data.issues.map((issue) => `
            <article class="risk-card">
              <strong>${issue.title}</strong>
              <p>${statusText(issue.severity)} · ${statusText(issue.status)} · ${issue.location}</p>
              <p>责任 ${issue.owner} · 截止 ${issue.deadline}</p>
              <div class="task-feedback">
                <textarea data-quality-note="${issue.id}" placeholder="填写复验意见"></textarea>
                <button class="secondary-button" data-quality-recheck="${issue.id}">复验闭环</button>
              </div>
            </article>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="section-heading">
          <h3 class="section-title">验收批与检查记录</h3>
          <span>合格率 ${data.summary.passRate}%</span>
        </div>
        <div class="table-list">
          ${data.acceptanceLots.map((lot) => `
            <div class="table-row">
              <strong>${lot.name}</strong>
              <p>${lot.trade} · ${statusText(lot.status)} · ${lot.passRate}% · ${lot.updatedAt}</p>
            </div>
          `).join("")}
          ${data.inspections.slice(0, 3).map((inspection) => `
            <div class="table-row">
              <strong>${inspection.title}</strong>
              <p>${inspection.location} · ${inspection.trade} · ${statusText(inspection.result)}</p>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderCostView() {
  const data = state.data.cost;
  return `
    <section class="form-panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Cost Snapshot</p>
          <h3 class="section-title">成本快照录入</h3>
        </div>
      </div>
      <form id="cost-snapshot-form" class="form-grid">
        <input id="cost-month" value="6月" />
        <input id="cost-budget" type="number" value="9900" />
        <input id="cost-actual" type="number" value="10150" />
        <textarea class="full" id="cost-note">钢材调差和模板周转增加。</textarea>
        <button class="primary-button full" type="submit">保存成本快照并分析</button>
      </form>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Budget vs Actual</p>
          <h3 class="section-title">预算 / 实际成本</h3>
        </div>
        <span>${data.summary.latestMonth} 偏差 ${data.summary.varianceRate}%</span>
      </div>
      <div class="table-list">
        ${data.snapshots.map((item) => `
          <div class="table-row">
            <strong>${item.month}</strong>
            <p>预算 ${item.budget} 万 · 实际 ${item.actual} 万${item.note ? ` · ${item.note}` : ""}</p>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="contract-grid fade-in">
      ${data.contracts.map((item) => `
        <article class="contract-card">
          <strong>${item.name}</strong>
          <p>${statusText(item.status)}</p>
          <p>${item.summary}</p>
        </article>
      `).join("")}
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <h3 class="section-title">成本 Agent 摘要入口</h3>
      </div>
      <p>成本快照保存后会触发成本 Agent，围绕预算偏差、合同变更、材料调差和计量口径生成分析记录。</p>
    </section>
  `;
}

function renderAgentsView() {
  const runs = state.data.runs?.items || [];
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Async Analysis</p>
          <h3 class="section-title">异步分析任务</h3>
        </div>
      </div>
      <div class="quick-run-row">
        <button class="quick-run" data-run-type="weekly-brief">周报摘要</button>
        <button class="quick-run" data-run-type="schedule-scan">关键线路扫描</button>
        <button class="quick-run" data-run-type="quality-review">质量复核</button>
        <button class="quick-run" data-run-type="cost-review">成本分析</button>
        <button class="quick-run" data-run-type="safety-review">安全复核</button>
        <button class="quick-run" data-run-type="document-digest">资料归档摘要</button>
      </div>
      <div class="run-grid">
        ${runs.map((run) => `
          <article class="run-card">
            <header>
              <div>
                <h3>${run.runType}</h3>
                <p>${run.agentId}</p>
              </div>
              <span class="status-badge ${severityClass(run.status === "succeeded" ? "normal" : "warning")}">${run.status}</span>
            </header>
            <p>${run.prompt}</p>
            <footer>
              <span>${run.createdAt}</span>
              <span>${run.result?.provider || "-"}</span>
            </footer>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Sync Question Answering</p>
          <h3 class="section-title">项目智能问答</h3>
        </div>
      </div>
      <div class="chat-stack">
        ${state.chatLog.map((message) => `
          <article class="message-bubble ${message.role}">
            <strong>${message.role === "assistant" ? "平台助手" : "你"}</strong>
            <p>${message.content.replaceAll("\n", "<br />")}</p>
            ${message.citations?.length ? `<footer>引用：${message.citations.map((item) => item.label).join(" / ")}</footer>` : ""}
          </article>
        `).join("")}
      </div>
      <form id="agent-chat-form" class="chat-input-row">
        <input id="agent-chat-input" placeholder="例如：本周最需要关注什么？" />
        <button class="primary-button" type="submit">发送</button>
      </form>
    </section>
  `;
}

function renderViewRoot() {
  const viewRoot = document.querySelector("#view-root");
  const views = {
    portfolio: renderPortfolioView,
    dashboard: renderDashboardView,
    schedule: renderScheduleView,
    quality: renderQualityView,
    cost: renderCostView,
    documents: renderDocumentsView,
    safety: renderSafetyView,
    agents: renderAgentsView
  };
  viewRoot.innerHTML = views[state.currentView]();
}

function renderInsightsRail() {
  const target = document.querySelector("#insight-list");
  const items = state.data.insights?.items || [];
  target.innerHTML = `<div class="insight-list">${items.map((item) => `
    <div class="insight-row">
      <strong>${item.title}</strong>
      <p>${item.summary}</p>
    </div>
  `).join("")}</div>`;
}

function renderNotificationsRail() {
  const target = document.querySelector("#notification-list");
  const items = state.data.notifications?.items || [];
  document.querySelector("#notification-count").textContent = `${items.length}`;
  target.innerHTML = `<div class="notification-list">${items.map((item) => `
    <div class="notification-row">
      <strong>${item.title}</strong>
      <p>${item.module} · ${item.createdAt}</p>
    </div>
  `).join("")}</div>`;
}

function renderAuditRail() {
  const target = document.querySelector("#audit-list");
  const items = state.data.auditLogs?.items || [];
  document.querySelector("#audit-count").textContent = `${items.length}`;
  target.innerHTML = `<div class="audit-list">${items.slice(0, 8).map((item) => `
    <div class="audit-row">
      <strong>${auditActionText(item.action)}</strong>
      <p>${item.actorName} · ${item.module} · ${item.createdAt}</p>
      <span>${item.summary}</span>
    </div>
  `).join("")}</div>`;
}

function renderAgentCatalog() {
  const target = document.querySelector("#agent-catalog");
  const items = state.data.session?.agents || [];
  target.innerHTML = `<div class="agent-list">${items.map((item) => `
    <div class="agent-row">
      <strong>${item.name}</strong>
      <p>${item.scope}</p>
    </div>
  `).join("")}</div>`;
}

function render() {
  renderTopControls();
  renderContextCard();
  renderHeadline();
  renderViewRoot();
  renderInsightsRail();
  renderNotificationsRail();
  renderAuditRail();
  renderAgentCatalog();
  wireViewActions();
}

async function refreshNotificationsAndInsights() {
  if (!state.projectId) return;
  const [notifications, insights, runs, auditLogs] = await Promise.all([
    api(`/api/projects/${state.projectId}/notifications`),
    api(`/api/projects/${state.projectId}/agent-insights`),
    api(`/api/agent/runs?projectId=${state.projectId}`),
    api(`/api/projects/${state.projectId}/audit-logs`)
  ]);
  state.data.notifications = notifications;
  state.data.insights = insights;
  state.data.runs = runs;
  state.data.auditLogs = auditLogs;
  renderInsightsRail();
  renderNotificationsRail();
  renderAuditRail();
}

function wireGlobalActions() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentView = button.dataset.view;
      if (state.currentView !== "portfolio") {
        await loadProjectData();
      }
      render();
    });
  });

  document.querySelector("#persona-select").addEventListener("change", async (event) => {
    state.userId = event.target.value;
    localStorage.setItem("admin-demo-user", state.userId);
    await reloadAll();
  });

  document.querySelector("#provider-select").addEventListener("change", async (event) => {
    await api("/api/model/provider", {
      method: "POST",
      body: { provider: event.target.value }
    });
    await loadSession();
    renderTopControls();
  });

  document.querySelector("#project-select").addEventListener("change", async (event) => {
    state.projectId = event.target.value;
    await loadProjectData();
    if (state.currentView === "portfolio") {
      state.currentView = "dashboard";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "dashboard"));
    }
    render();
  });

  document.querySelector("#refresh-button").addEventListener("click", reloadAll);
  document.querySelector("#quick-brief-button").addEventListener("click", async () => {
    await api("/api/agent/runs", {
      method: "POST",
      body: {
        projectId: state.projectId,
        runType: "weekly-brief",
        prompt: "生成本周项目简报",
        agentId: "pmo-agent"
      }
    });
    window.setTimeout(refreshNotificationsAndInsights, 550);
  });
}

function wireViewActions() {
  document.querySelector("#view-root").querySelectorAll("[data-action='open-project']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.projectId = button.dataset.projectId;
      state.currentView = "dashboard";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "dashboard"));
      await loadProjectData();
      render();
    });
  });

  document.querySelector("#view-root").querySelectorAll("[data-action='focus-project']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.projectId = button.dataset.projectId;
      await loadProjectData();
      renderContextCard();
      renderTopControls();
      renderHeadline();
    });
  });

  const portfolioRegion = document.querySelector("#portfolio-region");
  const portfolioType = document.querySelector("#portfolio-type");
  if (portfolioRegion) {
    portfolioRegion.addEventListener("change", async (event) => {
      state.portfolioFilters.region = event.target.value;
      await loadPortfolio();
      renderViewRoot();
      wireViewActions();
    });
  }
  if (portfolioType) {
    portfolioType.addEventListener("change", async (event) => {
      state.portfolioFilters.type = event.target.value;
      await loadPortfolio();
      renderViewRoot();
      wireViewActions();
    });
  }

  const importForm = document.querySelector("#schedule-import-form");
  if (importForm) {
    importForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const rows = parseScheduleRows(document.querySelector("#schedule-import-rows").value);
      const source = document.querySelector("#schedule-import-source").value;
      await api(`/api/projects/${state.projectId}/schedule/import`, {
        method: "POST",
        body: { rows, source }
      });
      await loadProjectData();
      window.setTimeout(refreshNotificationsAndInsights, 550);
      render();
    });
  }

  const uploadForm = document.querySelector("#document-upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fileInput = document.querySelector("#document-files");
      const files = [...fileInput.files].map((file) => file.name);
      await api(`/api/projects/${state.projectId}/documents/upload`, {
        method: "POST",
        body: {
          name: document.querySelector("#document-name").value,
          type: document.querySelector("#document-type").value,
          module: document.querySelector("#document-module").value,
          notes: document.querySelector("#document-notes").value,
          source: "Upload",
          fileNames: files
        }
      });
      state.docFilters = { q: "", type: "" };
      await loadProjectData();
      window.setTimeout(refreshNotificationsAndInsights, 380);
      render();
    });
  }

  const documentSearch = document.querySelector("#document-search");
  const documentType = document.querySelector("#document-filter-type");
  if (documentSearch) {
    documentSearch.addEventListener("change", async (event) => {
      state.docFilters.q = event.target.value;
      state.data.documents = await api(`/api/projects/${state.projectId}/documents?q=${encodeURIComponent(state.docFilters.q)}&type=${encodeURIComponent(state.docFilters.type)}`);
      renderViewRoot();
      wireViewActions();
    });
  }
  if (documentType) {
    documentType.addEventListener("change", async (event) => {
      state.docFilters.type = event.target.value;
      state.data.documents = await api(`/api/projects/${state.projectId}/documents?q=${encodeURIComponent(state.docFilters.q)}&type=${encodeURIComponent(state.docFilters.type)}`);
      renderViewRoot();
      wireViewActions();
    });
  }

  const qualityForm = document.querySelector("#quality-inspection-form");
  if (qualityForm) {
    qualityForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await api(`/api/projects/${state.projectId}/quality/inspections`, {
        method: "POST",
        body: {
          title: document.querySelector("#quality-title").value,
          location: document.querySelector("#quality-location").value,
          trade: document.querySelector("#quality-trade").value,
          result: document.querySelector("#quality-result").value,
          severity: document.querySelector("#quality-severity").value,
          owner: document.querySelector("#quality-owner").value,
          deadline: document.querySelector("#quality-deadline").value,
          description: document.querySelector("#quality-description").value
        }
      });
      await loadProjectData();
      window.setTimeout(refreshNotificationsAndInsights, 550);
      render();
    });
  }

  document.querySelectorAll("[data-quality-recheck]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.dataset.qualityRecheck;
      const note = document.querySelector(`[data-quality-note="${issueId}"]`)?.value || "现场复验合格，质量问题闭环。";
      await api(`/api/projects/${state.projectId}/quality/issues/${issueId}/recheck`, {
        method: "POST",
        body: { status: "closed", note }
      });
      await loadProjectData();
      render();
    });
  });

  const costForm = document.querySelector("#cost-snapshot-form");
  if (costForm) {
    costForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await api(`/api/projects/${state.projectId}/cost/snapshots`, {
        method: "POST",
        body: {
          month: document.querySelector("#cost-month").value,
          budget: document.querySelector("#cost-budget").value,
          actual: document.querySelector("#cost-actual").value,
          note: document.querySelector("#cost-note").value
        }
      });
      await loadProjectData();
      window.setTimeout(refreshNotificationsAndInsights, 550);
      render();
    });
  }

  document.querySelectorAll(".quick-run").forEach((button) => {
    button.addEventListener("click", async () => {
      const agentByRunType = {
        "schedule-scan": "schedule-agent",
        "safety-review": "safety-agent",
        "quality-review": "tech-agent",
        "cost-review": "cost-agent",
        "document-digest": "document-agent"
      };
      await api("/api/agent/runs", {
        method: "POST",
        body: {
          projectId: state.projectId,
          runType: button.dataset.runType,
          prompt: `执行 ${button.dataset.runType} 分析`,
          agentId: agentByRunType[button.dataset.runType] || "pmo-agent"
        }
      });
      window.setTimeout(async () => {
        state.data.runs = await api(`/api/agent/runs?projectId=${state.projectId}`);
        await refreshNotificationsAndInsights();
        renderViewRoot();
        wireViewActions();
      }, 550);
    });
  });

  const chatForm = document.querySelector("#agent-chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.querySelector("#agent-chat-input");
      const question = input.value.trim();
      if (!question) return;
      state.chatLog.push({ role: "user", content: question });
      const answer = await api("/api/agent/chat", {
        method: "POST",
        body: { projectId: state.projectId, question }
      });
      state.chatLog.push({ role: "assistant", content: answer.answer, citations: answer.citations });
      renderViewRoot();
      wireViewActions();
    });
  }
}

async function bootstrap() {
  await reloadAll();
  wireGlobalActions();
}

bootstrap();
