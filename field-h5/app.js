const mobileState = {
  userId: "field-safety",
  currentTab: "inspection",
  projectId: "",
  docQuery: "",
  chatLog: [
    {
      role: "assistant",
      content: "现场问题可以直接问，例如：今天有哪些待闭环整改？"
    }
  ],
  data: {}
};

function mobileHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Demo-User": mobileState.userId
  };
}

async function mobileApi(path, options = {}) {
  const response = await fetch(path, {
    headers: mobileHeaders(),
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || response.statusText);
  }
  return response.json();
}

function mobileStatusText(value) {
  const map = {
    pending: "待整改",
    closed: "已闭环",
    high: "高风险",
    medium: "中风险",
    indexed: "已索引",
    ocr_queued: "待解析"
  };
  return map[value] || value;
}

function mobileTagClass(value) {
  if (value === "high" || value === "pending") return "high";
  if (value === "closed" || value === "indexed") return "closed";
  return "warning";
}

async function loadMobileSession() {
  mobileState.data.session = await mobileApi("/api/session");
  if (!mobileState.projectId) {
    mobileState.projectId = mobileState.data.session.accessibleProjects[0]?.id || "";
  }
}

async function loadMobileData() {
  const [dashboard, safety, documents, notifications] = await Promise.all([
    mobileApi(`/api/projects/${mobileState.projectId}/dashboard`),
    mobileApi(`/api/projects/${mobileState.projectId}/safety`),
    mobileApi(`/api/projects/${mobileState.projectId}/documents?q=${encodeURIComponent(mobileState.docQuery)}`),
    mobileApi(`/api/projects/${mobileState.projectId}/notifications`)
  ]);
  mobileState.data.dashboard = dashboard;
  mobileState.data.safety = safety;
  mobileState.data.documents = documents;
  mobileState.data.notifications = notifications;
}

async function reloadMobile() {
  await loadMobileSession();
  await loadMobileData();
  renderMobile();
}

function renderMobileHeader() {
  const select = document.querySelector("#mobile-project-select");
  const projects = mobileState.data.session.accessibleProjects;
  select.innerHTML = projects.map((project) => `
    <option value="${project.id}" ${project.id === mobileState.projectId ? "selected" : ""}>${project.name}</option>
  `).join("");
}

function renderMobileHero() {
  const target = document.querySelector("#mobile-hero");
  const summary = mobileState.data.dashboard.summary;
  target.innerHTML = `
    <article class="mobile-card"><span>进度</span><strong>${summary.progress}%</strong></article>
    <article class="mobile-card"><span>整改</span><strong>${mobileState.data.safety.rectifications.filter((item) => item.status !== "closed").length}</strong></article>
    <article class="mobile-card"><span>消息</span><strong>${mobileState.data.notifications.items.length}</strong></article>
  `;
}

function renderInspectionTab() {
  const safety = mobileState.data.safety;
  return `
    <section class="mobile-panel fade-in">
      <h2>巡检录入</h2>
      <p>录入现场隐患后，平台会自动生成整改任务并推送到桌面端消息中心。</p>
      <form id="inspection-form" class="form-stack">
        <input id="inspection-title" value="脚手架连墙件松动" />
        <input id="inspection-location" value="2#楼东侧立面" />
        <select id="inspection-hazard-type">
          <option value="高处坠落">高处坠落</option>
          <option value="物体打击">物体打击</option>
          <option value="触电">触电</option>
          <option value="坍塌">坍塌</option>
        </select>
        <select id="inspection-severity">
          <option value="medium">一般隐患</option>
          <option value="high">重大隐患</option>
        </select>
        <input id="inspection-deadline" value="2026-06-02" />
        <input id="inspection-photos" type="file" multiple />
        <textarea id="inspection-description">巡检发现脚手架连墙件局部松动，要求当天加固复查。</textarea>
        <button class="primary-button" type="submit">提交巡检</button>
      </form>

      <div class="task-stack">
        ${safety.inspections.map((item) => `
          <article class="message-card">
            <h3>${item.title}</h3>
            <p>${item.location} · ${item.hazardType}</p>
            <p>${item.description}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTasksTab() {
  const safety = mobileState.data.safety;
  return `
    <section class="mobile-panel fade-in">
      <h2>整改反馈</h2>
      <p>现场人员可直接反馈整改进展，闭环后桌面端会自动收到消息提醒。</p>
      <div class="task-stack">
        ${safety.rectifications.map((task) => `
          <article class="task-card">
            <h3>${task.title}</h3>
            <span class="tag ${mobileTagClass(task.status)}">${mobileStatusText(task.status)}</span>
            <p>截止 ${task.deadline} · 最近更新：${task.updates[0]?.note || "暂无"}</p>
            <div class="task-feedback">
              <select data-task-status="${task.id}">
                <option value="pending" ${task.status === "pending" ? "selected" : ""}>待整改</option>
                <option value="closed" ${task.status === "closed" ? "selected" : ""}>已闭环</option>
              </select>
              <textarea data-task-note="${task.id}" placeholder="填写现场整改反馈"></textarea>
              <button class="secondary-button" data-task-submit="${task.id}">提交反馈</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDocsTab() {
  const documents = mobileState.data.documents;
  return `
    <section class="mobile-panel fade-in">
      <h2>资料快查</h2>
      <div class="form-stack">
        <input id="mobile-doc-search" value="${mobileState.docQuery}" placeholder="搜索资料名称" />
      </div>
      <div class="doc-stack">
        ${documents.items.map((document) => `
          <article class="doc-card">
            <h3>${document.name}</h3>
            <span class="tag ${mobileTagClass(document.parseStatus)}">${mobileStatusText(document.parseStatus)}</span>
            <p>${document.type} · ${document.versions[0].fileNames.join(", ")}</p>
            <p>${document.versions[0].excerpt}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAskTab() {
  return `
    <section class="mobile-panel fade-in">
      <h2>项目问答</h2>
      <p>默认用现场安全员身份访问当前项目上下文。</p>
      <div class="chat-stack">
        ${mobileState.chatLog.map((message) => `
          <article class="message-card">
            <h3>${message.role === "assistant" ? "平台助手" : "你"}</h3>
            <p>${message.content.replaceAll("\n", "<br />")}</p>
            ${message.citations?.length ? `<p>引用：${message.citations.map((item) => item.label).join(" / ")}</p>` : ""}
          </article>
        `).join("")}
      </div>
      <form id="mobile-ask-form" class="ask-row">
        <input id="mobile-ask-input" placeholder="例如：今天有哪些待闭环整改？" />
        <button class="primary-button" type="submit">发送</button>
      </form>
    </section>
  `;
}

function renderMobileView() {
  const target = document.querySelector("#mobile-view");
  const views = {
    inspection: renderInspectionTab,
    tasks: renderTasksTab,
    docs: renderDocsTab,
    ask: renderAskTab
  };
  target.innerHTML = views[mobileState.currentTab]();
}

function renderMobile() {
  renderMobileHeader();
  renderMobileHero();
  renderMobileView();
  wireMobileView();
}

function wireMobileTabs() {
  document.querySelectorAll(".mobile-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mobile-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      mobileState.currentTab = button.dataset.tab;
      renderMobileView();
      wireMobileView();
    });
  });

  document.querySelector("#mobile-project-select").addEventListener("change", async (event) => {
    mobileState.projectId = event.target.value;
    await loadMobileData();
    renderMobile();
  });
}

function wireMobileView() {
  const inspectionForm = document.querySelector("#inspection-form");
  if (inspectionForm) {
    inspectionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = [...document.querySelector("#inspection-photos").files].map((file) => file.name);
      await mobileApi(`/api/projects/${mobileState.projectId}/safety/inspections`, {
        method: "POST",
        body: {
          title: document.querySelector("#inspection-title").value,
          location: document.querySelector("#inspection-location").value,
          hazardType: document.querySelector("#inspection-hazard-type").value,
          severity: document.querySelector("#inspection-severity").value,
          deadline: document.querySelector("#inspection-deadline").value,
          description: document.querySelector("#inspection-description").value,
          photos: files
        }
      });
      await loadMobileData();
      renderMobile();
    });
  }

  document.querySelectorAll("[data-task-submit]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskSubmit;
      const status = document.querySelector(`[data-task-status="${taskId}"]`).value;
      const note = document.querySelector(`[data-task-note="${taskId}"]`).value;
      await mobileApi(`/api/projects/${mobileState.projectId}/safety/rectifications/${taskId}/feedback`, {
        method: "POST",
        body: { status, note }
      });
      await loadMobileData();
      renderMobile();
    });
  });

  const mobileDocSearch = document.querySelector("#mobile-doc-search");
  if (mobileDocSearch) {
    mobileDocSearch.addEventListener("change", async (event) => {
      mobileState.docQuery = event.target.value;
      mobileState.data.documents = await mobileApi(`/api/projects/${mobileState.projectId}/documents?q=${encodeURIComponent(mobileState.docQuery)}`);
      renderMobileView();
      wireMobileView();
    });
  }

  const askForm = document.querySelector("#mobile-ask-form");
  if (askForm) {
    askForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.querySelector("#mobile-ask-input");
      const question = input.value.trim();
      if (!question) return;
      mobileState.chatLog.push({ role: "user", content: question });
      const answer = await mobileApi("/api/agent/chat", {
        method: "POST",
        body: { projectId: mobileState.projectId, question }
      });
      mobileState.chatLog.push({ role: "assistant", content: answer.answer, citations: answer.citations });
      renderMobileView();
      wireMobileView();
    });
  }
}

async function bootstrapMobile() {
  await reloadMobile();
  wireMobileTabs();
}

bootstrapMobile();
