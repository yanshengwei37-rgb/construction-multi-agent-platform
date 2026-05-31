async function loadPortal() {
  const providerNode = document.querySelector("#provider-name");
  const personaCountNode = document.querySelector("#persona-count");
  const personaListNode = document.querySelector("#persona-list");

  try {
    const response = await fetch("/api/session");
    const payload = await response.json();
    const provider = payload.providers.find((item) => item.id === payload.currentProvider);
    providerNode.textContent = provider?.label || payload.currentProvider;
    personaCountNode.textContent = `共 ${payload.personas.length} 个演示角色`;
    personaListNode.innerHTML = payload.personas.map((persona) => `
      <div class="persona-item">
        <strong>${persona.title}</strong>
        <p>${persona.name} · 可访问项目 ${persona.projectIds.length} 个 · 能力：${persona.capabilities.join(" / ")}</p>
      </div>
    `).join("");
  } catch (error) {
    providerNode.textContent = "服务未启动";
    personaCountNode.textContent = "API 暂不可用";
    personaListNode.innerHTML = `
      <div class="persona-item">
        <strong>请先启动本地服务</strong>
        <p>运行 <code>npm start</code> 后重新打开本页，即可进入桌面端和现场 H5。</p>
      </div>
    `;
  }
}

loadPortal();
