const isCompactViewport = window.matchMedia("(max-width: 960px)").matches;

const state = {
  userId: localStorage.getItem("admin-demo-user") || "project-manager",
  currentView: "dashboard",
  agentSubView: "home",
  agentEvidenceTab: "documents",
  projectId: "",
  portfolioFilters: { region: "", type: "" },
  docFilters: { q: "", type: "" },
  assistantOpen: false,
  assistantPos: null,
  assistantSending: false,
  chatSending: false,
  generatedPlan: null,
  wizardPreview: null,
  wizardPreviewLoading: false,
  wizardPreviewError: "",
  wizardPreviewKey: "",
  wizardNavLockedUntil: 0,
  planWizard: createDefaultPlanWizard(),
  assistantLog: [
    {
      role: "assistant",
      content: "请直接输入项目问题，我会跟随当前项目和模块上下文回答。"
    }
  ],
  chatLog: [
    {
      role: "assistant",
      content: "请直接输入项目问题，我会在答案中附上可追溯来源。"
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

function currentWizardProjectId() {
  return state.projectId || getActiveProject()?.id || "";
}

function buildWizardPreviewPayload(data) {
  return {
    startDate: data.startDate,
    buildingType: data.buildingType,
    floorCount: data.floorCount,
    lagFloors: data.lagFloors,
    concurrentWork: data.concurrentWork,
    includeWeather: data.includeWeather,
    includeWinter: data.includeWinter,
    selectedTemplates: data.selectedTemplates || [],
    selectedBuildings: data.selectedBuildings || [],
    selectedBasementLevels: data.selectedBasementLevels || [],
    // mep fields removed - simplified to milestone nodes
    enabledRuleRelations: data.enabledRuleRelations || [],
    relationRuleEdits: data.relationRuleEdits || {},
    towerCranes: data.towerCranes || [],
    constructionElevators: data.constructionElevators || [],
    templateEdits: data.templateEdits || {},
    templateModes: data.templateModes || {}
  };
}

function clearWizardPreview() {
  state.wizardPreview = null;
  state.wizardPreviewLoading = false;
  state.wizardPreviewError = "";
  state.wizardPreviewKey = "";
}

function lockWizardNavigation() {
  const now = Date.now();
  if (now < state.wizardNavLockedUntil) return false;
  state.wizardNavLockedUntil = now + 500;
  return true;
}

function ensureWizardPreview(data) {
  if (!state.planWizard.active || ![2, 3, 5].includes(state.planWizard.step)) return;
  const projectId = currentWizardProjectId();
  if (!projectId) return;
  const payload = buildWizardPreviewPayload(data);
  const key = JSON.stringify(payload);
  if (state.wizardPreviewKey === key && (state.wizardPreviewLoading || state.wizardPreview)) return;
  state.wizardPreviewKey = key;
  state.wizardPreview = null;
  state.wizardPreviewLoading = true;
  state.wizardPreviewError = "";
  api(`/api/projects/${encodeURIComponent(projectId)}/schedule/wizard/preview`, {
    method: "POST",
    body: { wizardData: payload }
  })
    .then((preview) => {
      if (state.wizardPreviewKey !== key) return;
      state.wizardPreview = preview;
      state.wizardPreviewLoading = false;
      if (state.planWizard.active && [2, 3, 5].includes(state.planWizard.step)) {
        renderViewRoot();
        wireViewActions();
      }
    })
    .catch((error) => {
      if (state.wizardPreviewKey !== key) return;
      state.wizardPreview = null;
      state.wizardPreviewLoading = false;
      state.wizardPreviewError = error.message;
      if (state.planWizard.active && [2, 3, 5].includes(state.planWizard.step)) {
        renderViewRoot();
        wireViewActions();
      }
    });
}

function getBackendRelationOptions(data) {
  ensureWizardPreview(data);
  return state.wizardPreview?.preview?.relationOptions || [];
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
    ocr_queued: "待解析",
    succeeded: "待复核",
    reviewed: "已复核",
    failed: "失败"
  };
  return map[value] || value;
}

function createDefaultPlanWizard(active = false, project) {
  const p = project || getActiveProject();
  const isResidential = p?.type?.includes("住宅");
  const isIndustrial = p?.type?.includes("厂房") || p?.type?.includes("工业");
  const totalBuildings = p?.buildings?.length || 1;
  const maxFloors = Math.max(...(p?.buildings || [{ floors: 18 }]).map((b) => b.floors)) || 18;
  const totalArea = (p?.buildings || []).reduce((s, b) => s + (b.area || 0), 0) || 15000;
  const basementFloors = p?.basement?.floors || 0;
  return {
    active,
    step: 1,
    data: {
      name: p?.name || "主体结构工程",
      type: isIndustrial ? "composite" : isResidential ? "structure" : "composite",
      buildingType: isResidential ? "residential" : isIndustrial ? "industrial" : "commercial",
      totalArea,
      floorCount: maxFloors,
      totalBuildings,
      basementFloors,
      buildingSpan: 24,
      durationMonths: 6,
      finishDate: "",
      startDate: formatDateInputValue(),
      workDaysPerWeek: 5,
      workHoursPerDay: 8,
      holidays: [],
      includeWeather: false,
      includeWinter: false,
      milestones: "±0.00 结构完成\n主体结构封顶\n砌体工程完成\n结构验收通过",
      hardConstraints: "",
      externalDeps: "",
      laborCrews: 1,
      crewSize: 30,
      hasTowerCrane: true,
      towerCraneCount: 1,
      hasConstructionElevator: true,
      hasMobileCrane: false,
      concurrentWork: "normal",
      segmentCount: 2,
      lagFloors: 5,
      selectedTemplates: [],
      selectedBasementMode: null,
      templateModes: {},
      excavationLayerCount: 3,
      selectedBuildings: [],
      selectedBasementLevels: [],
      entityDependencies: [],
      manualDependencies: [],
      selectedMasterLanes: ["prep", "basement", "structure", "mep", "finish", "handover"],
      templateCandidateIds: [],
      enabledMasterRelations: [],
      enabledRuleRelations: [],
      expandedMasterLanes: ["prep", "mep"],
      masterLaneEdits: {},
      relationRuleEdits: {},
      towerCranes: [],
      constructionElevators: [],
      templateCatalog: null,
      templateDetails: {},
      templateEdits: {},
      specialNotes: "",
      generated: null
    }
  };
}

function parseStatusClass(value) {
  if (value === "indexed" || value === "reviewed") return "normal";
  if (value === "ocr_queued" || value === "succeeded") return "warning";
  return severityClass(value);
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

function formatDateInputValue(date = new Date()) {
  return date.toISOString().split("T")[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const TOWER_CRANE_MODELS = ["QTZ63", "QTZ80", "QTZ125", "W6013", "W6515"];
const CONSTRUCTION_ELEVATOR_MODELS = ["SC200/200", "SC100/100", "变频施工电梯"];
const TOWER_CRANE_INSTALL_PREREQUISITES = [
  "塔吊基础施工完成",
  "塔吊基础混凝土强度达到要求",
  "安装方案审批完成",
  "安拆单位资质与人员证书确认",
  "安装告知/备案完成",
  "场地道路满足大型设备进场"
];
const TOWER_CRANE_REMOVE_PREREQUISITES = [
  "主体结构封顶",
  "屋面或外立面大件吊装完成",
  "室外回填或道路条件满足拆除",
  "拆除方案审批完成",
  "拆除告知/备案完成"
];
const ELEVATOR_INSTALL_PREREQUISITES = [
  "主体结构达到安装楼层条件",
  "附着点结构强度满足要求",
  "基础或承台施工完成",
  "安装方案审批完成",
  "安装告知/备案完成"
];
const ELEVATOR_REMOVE_PREREQUISITES = [
  "室内垂直运输需求基本结束",
  "砌体、抹灰、机电材料运输完成到设定楼层",
  "正式电梯或替代运输条件可用",
  "外立面/室外施工不受拆除影响",
  "拆除方案审批完成"
];

function getBasementZoneOptions(basementLevels) {
  const options = [];
  (basementLevels || []).forEach((level) => {
    let zones = level.zones || [];
    if (!zones.length) zones = [{ name: "1区", area: level.area || 0 }];
    zones.forEach((zone) => {
      const key = `${level.name}-${zone.name}`;
      options.push({
        key,
        label: `${level.name} ${zone.name}`,
        area: zone.area || 0
      });
    });
  });
  return options;
}

function makeTowerCrane(index, buildingNames, basementZoneKeys) {
  return {
    id: `tower-${Date.now()}-${index}`,
    enabled: true,
    code: `TC-${String(index + 1).padStart(2, "0")}`,
    model: TOWER_CRANE_MODELS[Math.min(index, TOWER_CRANE_MODELS.length - 1)] || "QTZ80",
    coveredBuildings: buildingNames.slice(),
    coveredBasementZones: basementZoneKeys.slice(),
    installPrerequisites: TOWER_CRANE_INSTALL_PREREQUISITES.slice(),
    removePrerequisites: TOWER_CRANE_REMOVE_PREREQUISITES.slice()
  };
}

function makeConstructionElevator(index, buildingNames) {
  return {
    id: `elevator-${Date.now()}-${index}`,
    enabled: true,
    code: `EL-${String(index + 1).padStart(2, "0")}`,
    model: CONSTRUCTION_ELEVATOR_MODELS[Math.min(index, CONSTRUCTION_ELEVATOR_MODELS.length - 1)] || "SC200/200",
    coveredBuildings: buildingNames.slice(),
    installPrerequisites: ELEVATOR_INSTALL_PREREQUISITES.slice(),
    removePrerequisites: ELEVATOR_REMOVE_PREREQUISITES.slice()
  };
}

function isHighRiseBuilding(building) {
  return Number(building?.floors) >= 10;
}

function syncVerticalTransportCoverage(data, buildings, basementLevels) {
  const selectedBuildings = data.selectedBuildings || [];
  const selectedBasementZones = data.selectedBasementLevels || [];
  const availableBuildingNames = new Set((buildings || []).map((b) => b.name).filter((name) => selectedBuildings.includes(name)));
  const availableBasementZones = new Set(getBasementZoneOptions(basementLevels).map((item) => item.key).filter((key) => selectedBasementZones.includes(key)));
  data.towerCranes = (data.towerCranes || []).map((item) => ({
    ...item,
    installPrerequisites: item.installPrerequisites || TOWER_CRANE_INSTALL_PREREQUISITES.slice(),
    removePrerequisites: item.removePrerequisites || TOWER_CRANE_REMOVE_PREREQUISITES.slice(),
    coveredBuildings: (item.coveredBuildings || []).filter((name) => availableBuildingNames.has(name)),
    coveredBasementZones: (item.coveredBasementZones || []).filter((key) => availableBasementZones.has(key))
  }));
  data.constructionElevators = (data.constructionElevators || []).map((item) => ({
    ...item,
    installPrerequisites: item.installPrerequisites || ELEVATOR_INSTALL_PREREQUISITES.slice(),
    removePrerequisites: item.removePrerequisites || ELEVATOR_REMOVE_PREREQUISITES.slice(),
    coveredBuildings: (item.coveredBuildings || []).filter((name) => availableBuildingNames.has(name))
  }));
}

function ensureVerticalTransportDefaults(data, buildings, basementLevels) {
  const selectedBuildingNames = (data.selectedBuildings || []).filter(Boolean);
  const selectedBasementZoneKeys = (data.selectedBasementLevels || []).filter(Boolean);
  const shouldDefaultTowers = !Array.isArray(data.towerCranes);
  const shouldDefaultElevators = !Array.isArray(data.constructionElevators);
  if (shouldDefaultTowers) data.towerCranes = [];
  if (shouldDefaultElevators) data.constructionElevators = [];
  const shouldSeedProjectDefaults = selectedBuildingNames.length && !data.towerCranes.length && !data.constructionElevators.length;
  if ((shouldDefaultTowers || shouldSeedProjectDefaults) && selectedBuildingNames.length) {
    data.towerCranes.push(makeTowerCrane(0, selectedBuildingNames, selectedBasementZoneKeys));
  }
  const selectedBuildingData = (buildings || []).filter((b) => selectedBuildingNames.includes(b.name));
  const highRiseBuildings = selectedBuildingData.filter(isHighRiseBuilding).map((b) => b.name);
  if ((shouldDefaultElevators || shouldSeedProjectDefaults) && highRiseBuildings.length) {
    for (let i = 0; i < highRiseBuildings.length; i += 2) {
      data.constructionElevators.push(makeConstructionElevator(data.constructionElevators.length, highRiseBuildings.slice(i, i + 2)));
    }
  }
  syncVerticalTransportCoverage(data, buildings, basementLevels);
}

function renderPrerequisiteList(title, items) {
  return `
    <div class="transport-prereq-list">
      <strong>${escapeHtml(title)}</strong>
      <ul>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderTransportCoverageOptions(params) {
  const selected = params.selected || [];
  return `
    <div class="transport-coverage-options">
      ${params.options.map((option) => `
        <label class="transport-coverage-chip ${selected.includes(option.value) ? "selected" : ""}">
          <input
            type="checkbox"
            class="transport-coverage-cb"
            data-transport-source="${params.source || "wizard"}"
            data-transport-kind="${params.kind}"
            data-transport-index="${params.index}"
            data-transport-field="${params.field}"
            value="${escapeHtml(option.value)}"
            ${selected.includes(option.value) ? "checked" : ""}
          />
          <span>${escapeHtml(option.label)}</span>
        </label>
      `).join("") || `<span class="empty-note">暂无可选范围。</span>`}
    </div>
  `;
}

function getProjectVerticalTransportScope(project) {
  const buildings = project?.buildings || [];
  const basementLevels = project?.basement?.levels || [];
  return {
    selectedBuildings: buildings.map((building) => building.name).filter(Boolean),
    selectedBasementLevels: getBasementZoneOptions(basementLevels).map((zone) => zone.key)
  };
}

function verticalTransportStorageKey(projectId) {
  return `vertical-transport:${projectId || "default"}`;
}

function readLocalVerticalTransport(projectId) {
  try {
    return JSON.parse(localStorage.getItem(verticalTransportStorageKey(projectId)) || "null");
  } catch {
    return null;
  }
}

function writeLocalVerticalTransport(projectId, data) {
  if (!projectId || !data) return;
  localStorage.setItem(verticalTransportStorageKey(projectId), JSON.stringify({
    towerCranes: data.towerCranes || [],
    constructionElevators: data.constructionElevators || []
  }));
}

function getProjectVerticalTransportData(project) {
  if (!project) {
    return {
      selectedBuildings: [],
      selectedBasementLevels: [],
      towerCranes: [],
      constructionElevators: []
    };
  }
  if (!project.verticalTransport) project.verticalTransport = {};
  const localTransport = readLocalVerticalTransport(project.id);
  if (localTransport) {
    project.verticalTransport = {
      ...project.verticalTransport,
      ...localTransport
    };
  }
  const scope = getProjectVerticalTransportScope(project);
  const data = {
    ...project.verticalTransport,
    selectedBuildings: scope.selectedBuildings,
    selectedBasementLevels: scope.selectedBasementLevels,
    towerCranes: project.verticalTransport.towerCranes || [],
    constructionElevators: project.verticalTransport.constructionElevators || []
  };
  ensureVerticalTransportDefaults(data, project.buildings || [], project.basement?.levels || []);
  project.verticalTransport.towerCranes = data.towerCranes;
  project.verticalTransport.constructionElevators = data.constructionElevators;
  return data;
}

function copyProjectVerticalTransportToWizard(data, project) {
  const projectTransport = getProjectVerticalTransportData(project);
  data.towerCranes = structuredClone(projectTransport.towerCranes || []);
  data.constructionElevators = structuredClone(projectTransport.constructionElevators || []);
}

function getVerticalTransportDataBySource(source) {
  if (source === "project") return getProjectVerticalTransportData(getActiveProject());
  return state.planWizard.data;
}

function commitVerticalTransportDataBySource(source, data) {
  if (source !== "project") return;
  const project = getActiveProject();
  if (!project) return;
  if (!project.verticalTransport) project.verticalTransport = {};
  project.verticalTransport.towerCranes = data.towerCranes || [];
  project.verticalTransport.constructionElevators = data.constructionElevators || [];
  writeLocalVerticalTransport(project.id, project.verticalTransport);
}

function generateAutoPlan(params) {
  const { durationMonths, startDate, milestones, type, totalDays, workDaysPerWeek } = params;
  const start = new Date(startDate);
  const nodes = [];
  const milestoneList = [];

  // 工序库（按分部分项标准）
  const workLibrary = {
    structure: {
      name: "主体结构工程",
      phases: [
        { name: "土方开挖与基坑支护", ratio: 0.06 },
        { name: "桩基施工", ratio: 0.08 },
        { name: "基础底板", ratio: 0.06 },
        { name: "地下墙柱结构", ratio: 0.08 },
        { name: "地上主体施工", ratio: 0.25 },
        { name: "砌体工程", ratio: 0.12 },
        { name: "初装修（抹灰/地面）", ratio: 0.10 },
        { name: "屋面工程", ratio: 0.06 },
        { name: "机电安装管线", ratio: 0.08 },
        { name: "装饰涂饰工程", ratio: 0.06 },
        { name: "细部收尾", ratio: 0.03 },
        { name: "结构验收", ratio: 0.02 }
      ]
    },
    foundation: {
      name: "地基基础工程",
      phases: [
        { name: "场地平整与临设", ratio: 0.05 },
        { name: "测量放线", ratio: 0.03 },
        { name: "土方开挖", ratio: 0.12 },
        { name: "基坑支护", ratio: 0.12 },
        { name: "基坑降水排水", ratio: 0.06 },
        { name: "垫层施工", ratio: 0.05 },
        { name: "防水层施工", ratio: 0.08 },
        { name: "基础钢筋绑扎", ratio: 0.15 },
        { name: "基础模板安装", ratio: 0.12 },
        { name: "基础混凝土浇筑", ratio: 0.12 },
        { name: "回填夯实", ratio: 0.10 }
      ]
    },
    finishing: {
      name: "装饰装修工程",
      phases: [
        { name: "基层清理处理", ratio: 0.06 },
        { name: "内墙抹灰", ratio: 0.15 },
        { name: "地面找平层", ratio: 0.10 },
        { name: "腻子批刮与打磨", ratio: 0.12 },
        { name: "底漆涂刷", ratio: 0.06 },
        { name: "面漆涂饰", ratio: 0.10 },
        { name: "门窗安装收口", ratio: 0.10 },
        { name: "细部收尾（踢脚/收边）", ratio: 0.08 },
        { name: "清洁保洁", ratio: 0.03 },
        { name: "分户验收", ratio: 0.05 }
      ]
    },
    mechanical: {
      name: "机电安装工程",
      phases: [
        { name: "预留预埋（套管/接地）", ratio: 0.10 },
        { name: "电气桥架安装", ratio: 0.12 },
        { name: "给排水管道敷设", ratio: 0.12 },
        { name: "消防管道安装", ratio: 0.10 },
        { name: "通风风管安装", ratio: 0.10 },
        { name: "配电箱柜安装", ratio: 0.08 },
        { name: "水泵/风机设备安装", ratio: 0.08 },
        { name: "电气调试", ratio: 0.08 },
        { name: "管道试压与冲洗", ratio: 0.08 },
        { name: "消防调试", ratio: 0.08 },
        { name: "系统联调", ratio: 0.06 }
      ]
    },
    roof: {
      name: "屋面工程",
      phases: [
        { name: "基层找平", ratio: 0.10 },
        { name: "保温层施工", ratio: 0.15 },
        { name: "防水层施工", ratio: 0.20 },
        { name: "保护层施工", ratio: 0.15 },
        { name: "面层施工", ratio: 0.20 },
        { name: "屋面附属（落水/排气）", ratio: 0.10 },
        { name: "淋水试验与验收", ratio: 0.10 }
      ]
    },
    composite: {
      name: "综合工程",
      phases: [
        { name: "施工准备（临建/临电/道路）", ratio: 0.05 },
        { name: "基础工程施工", ratio: 0.15 },
        { name: "主体结构施工", ratio: 0.25 },
        { name: "砌体工程", ratio: 0.10 },
        { name: "装饰装修工程", ratio: 0.15 },
        { name: "机电安装工程", ratio: 0.10 },
        { name: "室外配套工程", ratio: 0.08 },
        { name: "专项验收", ratio: 0.05 },
        { name: "竣工资料整理", ratio: 0.04 },
        { name: "综合验收", ratio: 0.03 }
      ]
    }
  };

  const library = workLibrary[type] || workLibrary.composite;

  // 按工期占比生成节点，每个阶段至少 1 个节点
  const normalizedDuration = Math.max(1, Number(durationMonths) || 1);
  const totalWeeks = totalDays
    ? Math.max(1, Number(totalDays) / Math.max(1, Number(workDaysPerWeek) || 5))
    : normalizedDuration * 4.33;
  let accumulatedWeeks = 0;

  library.phases.forEach((phase, idx) => {
    const phaseWeeks = Math.max(1, Math.round(totalWeeks * phase.ratio));
    const phaseStart = new Date(start);
    phaseStart.setDate(phaseStart.getDate() + Math.round(accumulatedWeeks * 7));
    const phaseEnd = new Date(phaseStart);
    phaseEnd.setDate(phaseEnd.getDate() + Math.round(phaseWeeks * 7));
    accumulatedWeeks += phaseWeeks;

    const totalDays = (phaseEnd - phaseStart) / (1000 * 60 * 60 * 24);
    const percent = idx < library.phases.length - 1
      ? Math.min(100, Math.round(((idx + 1) / library.phases.length) * 100))
      : 100;

    // 拆分为子节点（工期长的阶段拆为多个子节点）
    const subNodeCount = Math.max(1, Math.ceil(phaseWeeks / 4));
    for (let sub = 0; sub < subNodeCount; sub++) {
      const subStart = new Date(phaseStart);
      subStart.setDate(subStart.getDate() + Math.round((sub / subNodeCount) * totalDays));
      const subEnd = new Date(phaseStart);
      subEnd.setDate(subEnd.getDate() + Math.round(((sub + 1) / subNodeCount) * totalDays));
      const subPct = Math.min(100, Math.round(((idx + (sub + 1) / subNodeCount) / library.phases.length) * 100));

      // 标注关键节点（基础首个、主体首个、最后验收）
      const isCritical = (idx === 0 && sub === 0) ||
                         (phase.name.includes("主体") && sub === 0) ||
                         (idx === library.phases.length - 1);

      nodes.push({
        name: subNodeCount > 1 ? `${phase.name}（${sub + 1}/${subNodeCount}）` : phase.name,
        owner: phase.name.includes("主体") ? "生产经理" :
               phase.name.includes("机电") ? "机电工程师" :
               phase.name.includes("验收") ? "项目经理" :
               phase.name.includes("装修") ? "装饰工长" : "专业工长",
        percent: subPct,
        plannedDate: formatDateInputValue(subEnd),
        varianceDays: 0,
        critical: isCritical
      });
    }
  });

  if (milestones.trim()) {
    milestones
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index, lines) => {
        const estMonth = Math.round(((index + 1) / (lines.length + 1)) * normalizedDuration);
        const milestoneDate = new Date(start);
        milestoneDate.setMonth(milestoneDate.getMonth() + estMonth);
        milestoneList.push({
          name: line,
          plannedDate: formatDateInputValue(milestoneDate),
          varianceDays: 0,
          status: "normal"
        });
      });
  }

  return { nodes, milestones: milestoneList };
}

function getActiveProject() {
  try {
    const accessibleProjects = state.data.session?.accessibleProjects || [];
    return accessibleProjects.find((item) => item.id === state.projectId) || accessibleProjects[0];
  } catch {
    return null;
  }
}

function currentViewName() {
  return {
    portfolio: "项目群总览",
    dashboard: "项目作战台",
    todo: "待办中心",
    schedule: "进度管理",
    quality: "质量管理",
    cost: "成本管理",
    safety: "安全管理",
    documents: "资料管理",
    agents: "智能问答",
    "agent-orchestration": "Agent 编排",
    roadmap: "建设规划"
  }[state.currentView] || "项目工作台";
}

function assistantSuggestions() {
  return [];
}

async function loadSession() {
  state.data.session = await api("/api/session");
  state.data.agentConfig = state.data.session.agentConfig;
  if (!state.projectId || !state.data.session.accessibleProjects.some((item) => item.id === state.projectId)) {
    state.projectId = state.data.session.accessibleProjects[0]?.id || "";
  }
}

async function loadAgentConfig() {
  state.data.agentConfig = await api("/api/agent/config");
}

async function loadPortfolio() {
  const params = new URLSearchParams();
  if (state.portfolioFilters.region) params.set("region", state.portfolioFilters.region);
  if (state.portfolioFilters.type) params.set("type", state.portfolioFilters.type);
  state.data.portfolio = await api(`/api/portfolio?${params.toString()}`);
}

async function loadPlatformBlueprint() {
  state.data.blueprint = await api("/api/platform/blueprint");
}

async function loadProjectData() {
  if (!state.projectId) return;
  const [dashboard, schedule, documents, safety, quality, cost, notifications, insights, runs, auditLogs, scheduledTasks] = await Promise.all([
    api(`/api/projects/${state.projectId}/dashboard`),
    api(`/api/projects/${state.projectId}/schedule`),
    api(`/api/projects/${state.projectId}/documents`),
    api(`/api/projects/${state.projectId}/safety`),
    api(`/api/projects/${state.projectId}/quality`),
    api(`/api/projects/${state.projectId}/cost`),
    api(`/api/projects/${state.projectId}/notifications`),
    api(`/api/projects/${state.projectId}/agent-insights`),
    api(`/api/agent/runs?projectId=${state.projectId}`),
    api(`/api/projects/${state.projectId}/audit-logs`),
    api(`/api/projects/${state.projectId}/scheduled-tasks`)
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
  state.data.scheduledTasks = scheduledTasks;
}

async function reloadAll() {
  try {
    await loadSession();
  } catch (e) {
    console.error("加载会话失败:", e);
  }
  await Promise.all([
    loadPortfolio().catch(() => {}),
    loadProjectData().catch((error) => { console.warn("项目数据加载失败:", error); }),
    loadPlatformBlueprint().catch(() => {})
  ]);
  try {
    render();
  } catch (e) {
    console.error("页面渲染失败:", e);
    var root = document.querySelector("#view-root");
    if (root) root.innerHTML = "<section class=\"panel fade-in\" style=\"margin:20px\"><h3 style=\"color:var(--red)\">\u9875\u9762\u52a0\u8f7d\u5f02\u5e38</h3><p style=\"font-size:13px;background:#fff3e0;padding:8px;border-radius:6px;white-space:pre-wrap\">" + escapeHtml(e.message) + "</p><pre style=\"font-size:11px;color:var(--muted);overflow:auto;max-height:200px;margin:8px 0\">" + escapeHtml((e.stack || "").slice(0, 500)) + "</pre><button class=\"primary-button\" onclick=\"location.reload()\">\u91cd\u65b0\u52a0\u8f7d</button></section>";
  }
}

function renderTopControls() {
  renderProjectSwitcher();
}
function renderProjectSwitcher() {
  const nameEl = document.querySelector("#project-switcher-name");
  const optionsEl = document.querySelector("#project-switcher-options");
  if (!nameEl || !optionsEl) return;
  const activeProject = getActiveProject();
  const projects = state.data.session?.accessibleProjects || [];
  if (activeProject) {
    nameEl.textContent = activeProject.name;
  }
  optionsEl.innerHTML = projects.map((project) => `
    <button class="project-switcher-option ${project.id === state.projectId ? "active" : ""}" data-project-id="${project.id}">
      <span class="project-option-meta">
        <strong>${project.name}</strong>
        <span>${project.code} · ${project.manager} · ${project.stage}</span>
      </span>
      ${project.status === "warning" ? "<span style=\"color:var(--amber);font-size:16px\">⚠</span>" : ""}
    </button>
  `).join("");
}




function headlineCard(label, value, description) {
  return `<article class="hero-card"><span>${label}</span><strong>${value}</strong><p>${description}</p></article>`;
}

function renderHeadline() {
  const target = document.querySelector("#headline-strip");
  const scopeLabel = document.querySelector("#scope-label");
  const pageTitle = document.querySelector("#page-title");
  target.hidden = false;

  if (state.currentView === "portfolio") {
    const { metrics } = state.data.portfolio;
    scopeLabel.textContent = "公司层视图";
    pageTitle.textContent = "项目群总览";
    target.innerHTML = [
      headlineCard("在建项目", metrics.totalProjects, "当前筛选范围内项目数"),
      headlineCard("预警项目", metrics.warningProjects, "需要管理层重点跟进"),
      headlineCard("平均进度", `${metrics.averageProgress}%`, "项目群加权平均进度"),
      headlineCard("待整改", metrics.pendingRectifications, "跨项目安全整改任务"),
      headlineCard("待索引", metrics.docsPendingIndex, "跨项目资料解析任务")
    ].join("");
    return;
  }

  const summary = state.data.dashboard?.summary || {};
  scopeLabel.textContent = "项目层视图";

  pageTitle.textContent = {
    dashboard: "项目作战台",
    schedule: "进度管理",
    quality: "质量管理",
    cost: "成本管理",
    documents: "资料管理",
    safety: "安全管理",
    agents: "智能问答",
    "agent-orchestration": "Agent 编排",
    "notification-center": "消息中心",
    "audit-log": "审计日志",
    roadmap: "建设规划"
  }[state.currentView];

  if (state.currentView === "notification-center" || state.currentView === "audit-log" || state.currentView === "agents" || state.currentView === "agent-orchestration") {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }



  if (state.currentView === "roadmap") {
    const blueprint = state.data.blueprint;
    target.innerHTML = [
      headlineCard("推荐路线", "前后端同步", "前端体验牵引，后端契约同步"),
      headlineCard("当前优先级", "项目层优先", "五条线闭环后接公司层"),
      headlineCard("V1 接口组", blueprint.interfaceGroups.length, "最小公共契约数量"),
      headlineCard("建设阶段", blueprint.phases.length, "从蓝图到公司层接入"),
      headlineCard("验收场景", blueprint.acceptanceScenarios.length, "测试与业务验收基线")
    ].join("");
    return;
  }

  if (state.currentView === "schedule") {
    const schedule = state.data.schedule;
    const delayedNodes = schedule.nodes.filter((node) => node.varianceDays < 0).length;
    const averagePercent = schedule.nodes.length
      ? Math.round(schedule.nodes.reduce((sum, node) => sum + node.percent, 0) / schedule.nodes.length)
      : 0;
    target.innerHTML = [
      headlineCard("计划完成率", `${averagePercent}%`, "WBS 节点平均完成率"),
      headlineCard("关键节点", schedule.summary.criticalWarnings, "存在偏差的关键节点"),
      headlineCard("滞后节点", delayedNodes, "当前滞后 WBS 节点"),
      headlineCard("下个里程碑", schedule.milestones[0]?.plannedDate || "-", schedule.milestones[0]?.name || "暂无里程碑"),
      headlineCard("导入节点", schedule.summary.nodeCount, schedule.summary.importedAt || "尚未导入")
    ].join("");
    return;
  }

  if (state.currentView === "quality") {
    const quality = state.data.quality;
    target.innerHTML = [
      headlineCard("质量评分", summary.qualityScore, "项目质量综合评分"),
      headlineCard("未闭环问题", quality.summary.openIssues, "质量整改问题数量"),
      headlineCard("待复验", quality.summary.recheckPending, "需质量负责人复验"),
      headlineCard("验收合格率", `${quality.summary.passRate}%`, "验收批通过比例"),
      headlineCard("检查记录", quality.summary.inspections, "质量检查留痕")
    ].join("");
    return;
  }

  if (state.currentView === "cost") {
    const cost = state.data.cost;
    target.innerHTML = [
      headlineCard("成本偏差", `${cost.summary.varianceRate}%`, `${cost.summary.latestMonth} 预算/实际偏差`),
      headlineCard("预算金额", `${cost.summary.budget}万`, "当前成本快照预算"),
      headlineCard("实际发生", `${cost.summary.actual}万`, "当前成本快照实际"),
      headlineCard("预警合同", cost.summary.warningContracts, "需商务经理跟进"),
      headlineCard("快照数量", cost.snapshots.length, "已录入成本快照")
    ].join("");
    return;
  }

  if (state.currentView === "safety") {
    const safety = state.data.safety;
    target.innerHTML = [
      headlineCard("安全评分", summary.safetyScore, "项目安全综合评分"),
      headlineCard("重大隐患", safety.summary.high, "当前未关闭高风险项"),
      headlineCard("一般隐患", safety.summary.medium, "当前未关闭中风险项"),
      headlineCard("已闭环", safety.summary.closed, "完成整改任务"),
      headlineCard("巡检记录", safety.summary.inspections, "安全巡检留痕")
    ].join("");
    return;
  }

  if (state.currentView === "documents") {
    const documents = state.data.documents;
    const indexed = documents.items.filter((item) => item.parseStatus === "indexed").length;
    const pending = documents.items.filter((item) => item.parseStatus !== "indexed").length;
    target.innerHTML = [
      headlineCard("资料完整度", `${summary.docCompleteness}%`, "项目资料可用程度"),
      headlineCard("资料总量", documents.items.length, "当前筛选资料数量"),
      headlineCard("已索引", indexed, "可供问答引用"),
      headlineCard("待解析", pending, "等待 OCR/分类/索引"),
      headlineCard("资料类型", documents.filters.types.length, "台账中的资料分类")
    ].join("");
    return;
  }

  if (state.currentView === "agents") {
    return;
  }

  target.innerHTML = [
    headlineCard("总进度", `${summary.progress}%`, numberDelta(summary.scheduleVarianceDays)),
    headlineCard("质量评分", summary.qualityScore, `未闭环 ${summary.openQualityIssues} 项`),
    headlineCard("成本偏差", `${summary.costDeviation}%`, "合同与计量跟踪"),
    headlineCard("安全评分", summary.safetyScore, `待闭环隐患 ${summary.openRisks} 项`),
    headlineCard("资料完整度", `${summary.docCompleteness}%`, "项目资料已可供问答引用")
  ].join("");
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

function normalizeRiskLevel(value) {
  if (value === "high") return "high";
  if (value === "warning" || value === "medium") return "warning";
  return "normal";
}

function riskBadgeText(value) {
  const map = {
    high: "高风险",
    warning: "需关注",
    normal: "正常"
  };
  return map[normalizeRiskLevel(value)] || value;
}

function readTodoStateMap() {
  return JSON.parse(sessionStorage.getItem("todo-states") || "{}");
}

function writeTodoState(id, payload) {
  const states = readTodoStateMap();
  states[id] = { ...(states[id] || {}), ...payload };
  sessionStorage.setItem("todo-states", JSON.stringify(states));
}

function todoActionButtons(todo) {
  const disabled = ["已确认", "已驳回", "已指派", "已转待办", "已关闭"].includes(todo.status);
  return `
    <div class="action-bar">
      <button class="${todo.status === "已确认" ? "secondary-button" : "primary-button"}" type="button" data-todo-action="confirm" data-todo-id="${todo.id}" ${disabled ? "disabled" : ""}>${todo.status === "已确认" ? "已确认 ✅" : "确认"}</button>
      <button class="secondary-button" type="button" data-todo-action="reject" data-todo-id="${todo.id}" ${disabled ? "disabled" : ""}>${todo.status === "已驳回" ? "已驳回 ❌" : "驳回"}</button>
      <button class="secondary-button" type="button" data-todo-action="assign" data-todo-id="${todo.id}" ${disabled ? "disabled" : ""}>${todo.status === "已指派" ? `已指派 ${todo.assignee || ""} 👤` : "指派"}</button>
      <button class="secondary-button" type="button" data-todo-action="transfer" data-todo-id="${todo.id}" ${disabled ? "disabled" : ""}>${todo.status === "已转待办" ? "已转待办 📋" : todo.onConfirm || "转待办"}</button>
    </div>
  `;
}

function collectTodoItems() {
  const data = state.data;
  const activeProject = getActiveProject();
  const manager = activeProject?.manager || "项目经理";
  const items = [];
  const localTodoStates = readTodoStateMap();

  (data.runs?.items || [])
    .filter((run) => run.status === "succeeded")
    .forEach((run) => {
      items.push({
        id: `run-${run.id}`,
        title: `Agent 待复核结论：${run.runType}`,
        module: "Agent 结论",
        status: "待确认",
        riskLevel: "warning",
        owner: manager,
        deadline: run.completedAt || run.createdAt,
        summary: run.result?.summary || run.prompt || "Agent 已完成分析，等待项目经理人工复核。",
        source: run.agentId || "Agent 分析",
        evidence: run.result?.citations?.length ? `引用 ${run.result.citations.length} 条资料` : "Agent 分析摘要",
        onConfirm: "转为待办"
      });
    });

  (data.safety?.rectifications || [])
    .filter((item) => item.status !== "closed" && ["high", "medium"].includes(item.severity))
    .forEach((item) => {
      items.push({
        id: `safety-${item.id}`,
        title: item.title,
        module: "安全整改",
        status: `${statusText(item.severity)} / ${statusText(item.status)}`,
        riskLevel: normalizeRiskLevel(item.severity),
        owner: item.owner || "安全负责人",
        deadline: item.deadline,
        source: "安全整改",
        summary: item.updates?.[0]?.note || "建议优先确认整改措施、现场照片和复查责任人。"
      });
    });

  (data.quality?.issues || [])
    .filter((item) => ["pending", "recheck_pending"].includes(item.status) || item.status !== "closed")
    .forEach((item) => {
      items.push({
        id: `quality-${item.id}`,
        title: item.title,
        module: "质量未闭环",
        status: `${statusText(item.severity)} / ${statusText(item.status)}`,
        riskLevel: normalizeRiskLevel(item.severity || "medium"),
        owner: item.owner || "质量负责人",
        deadline: item.deadline,
        source: "质量问题",
        summary: item.updates?.[0]?.note || `${item.location} 需跟进整改与复验闭环。`
      });
    });

  (data.schedule?.nodes || [])
    .filter((node) => node.critical && node.varianceDays < 0)
    .forEach((node) => {
      items.push({
        id: `schedule-${node.id}`,
        title: `关键线路滞后：${node.name}`,
        module: "进度管理",
        status: numberDelta(node.varianceDays),
        riskLevel: node.varianceDays < -5 ? "high" : "warning",
        owner: node.owner || "生产经理",
        deadline: node.plannedDate,
        source: "关键线路",
        summary: `关键节点当前完成 ${node.percent}%，建议复核资源、工序穿插和下游里程碑影响。`
      });
    });

  (data.documents?.items || [])
    .filter((item) => item.parseStatus === "ocr_queued" || item.parseStatus !== "indexed")
    .forEach((item) => {
      items.push({
        id: `document-${item.id}`,
        title: `待解析资料：${item.name}`,
        module: "资料管理",
        status: statusText(item.parseStatus),
        riskLevel: "normal",
        owner: "资料员",
        deadline: item.versions?.[0]?.uploadedAt || "待解析",
        source: "资料解析",
        summary: item.versions?.[0]?.excerpt || "建议补充分类、OCR 解析和索引，确保问答可引用。"
      });
    });

  const varianceRate = Number(data.cost?.summary?.varianceRate || 0);
  if (Math.abs(varianceRate) > 0) {
    items.push({
      id: "cost-variance",
      title: `${data.cost.summary.latestMonth || "最新"} 成本偏差复核`,
      module: "成本管理",
      status: `${varianceRate}% 偏差`,
      riskLevel: Math.abs(varianceRate) > 8 ? "high" : "warning",
      owner: "商务经理",
      deadline: data.cost.summary.latestMonth || "最新快照",
      source: "成本快照",
      summary: `预算 ${data.cost.summary.budget} 万，实际 ${data.cost.summary.actual} 万，建议核对合同变更、材料调差和计量口径。`
    });
  }

  return items.map((item) => {
    const localState = localTodoStates[item.id] || {};
    return {
      ...item,
      riskLevel: normalizeRiskLevel(item.riskLevel || item.risk),
      due: item.deadline || item.due,
      ...localState
    };
  }).sort((left, right) => {
    const riskOrder = { high: 0, warning: 1, medium: 1, normal: 2 };
    return (riskOrder[left.riskLevel] ?? 3) - (riskOrder[right.riskLevel] ?? 3);
  });
}

function renderRiskSummary() {
  const safetyRisks = (state.data.safety?.rectifications || [])
    .filter((item) => item.severity === "high" && item.status !== "closed")
    .slice(0, 3);
  const criticalWarnings = (state.data.schedule?.nodes || [])
    .filter((item) => item.critical && item.varianceDays < 0)
    .slice(0, 3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueQuality = (state.data.quality?.issues || [])
    .filter((item) => ["pending", "recheck_pending"].includes(item.status))
    .filter((item) => item.deadline && new Date(item.deadline) < today)
    .slice()
    .sort((left, right) => String(left.deadline).localeCompare(String(right.deadline)))
    .slice(0, 3);

  return `
    <section class="risk-summary fade-in">
      <article>
        <div class="section-heading">
          <h3 class="section-title">今日项目风险</h3>
          <span>只展示需要项目经理当天决策的事项</span>
        </div>
        <div class="risk-summary-grid">
          <div>
            <strong>最高风险 3 项</strong>
            <div class="risk-item-list">
              ${safetyRisks.map((item) => `
                <div class="risk-item">
                  <span class="risk-badge high">${statusText(item.severity)}</span>
                  <p>${item.title} · ${item.owner} · 截止 ${item.deadline}</p>
                </div>
              `).join("") || `<p class="empty-note">暂无高风险安全整改。</p>`}
            </div>
          </div>
          <div>
            <strong>关键线路预警</strong>
            <div class="risk-item-list">
              ${criticalWarnings.map((item) => `
                <div class="risk-item">
                  <span class="risk-badge warning">滞后</span>
                  <p>${item.name} · ${item.owner} · ${numberDelta(item.varianceDays)} · ${item.plannedDate}</p>
                </div>
              `).join("") || `<p class="empty-note">暂无关键线路滞后节点。</p>`}
            </div>
          </div>
          <div>
            <strong>逾期质量复验</strong>
            <div class="risk-item-list">
              ${overdueQuality.map((item) => `
                <div class="risk-item">
                  <span class="risk-badge ${normalizeRiskLevel(item.severity)}">${statusText(item.status)}</span>
                  <p>${item.title} · ${item.owner} · 截止 ${item.deadline}</p>
                </div>
              `).join("") || `<p class="empty-note">暂无逾期质量复验。</p>`}
            </div>
          </div>
        </div>
      </article>
    </section>
  `;
}

function renderLineHealth() {
  const summary = state.data.dashboard?.summary || {};
  const safety = state.data.safety?.summary || {};
  const scheduleVariance = Number(summary.scheduleVariance ?? summary.scheduleVarianceDays ?? 0);
  const costVarianceRate = Number(summary.costVarianceRate ?? state.data.cost?.summary?.varianceRate ?? summary.costDeviation ?? 0);
  const lineHealth = [
    { name: "进度", value: scheduleVariance < 0 ? `滞后 ${Math.abs(scheduleVariance)} 天` : numberDelta(scheduleVariance), color: scheduleVariance < 0 ? "var(--red)" : "var(--green)" },
    { name: "安全", value: `高风险 ${safety.highCount ?? safety.high ?? 0} / 中 ${safety.mediumCount ?? safety.medium ?? 0}`, color: (safety.highCount ?? safety.high ?? 0) > 0 ? "var(--red)" : (safety.mediumCount ?? safety.medium ?? 0) > 0 ? "var(--amber)" : "var(--green)" },
    { name: "质量", value: `未闭环 ${summary.openQualityIssues ?? 0}`, color: (summary.openQualityIssues ?? 0) > 2 ? "var(--red)" : (summary.openQualityIssues ?? 0) > 0 ? "var(--amber)" : "var(--green)" },
    { name: "成本", value: `偏差 ${costVarianceRate}%`, color: Math.abs(costVarianceRate) > 5 ? "var(--red)" : Math.abs(costVarianceRate) > 2 ? "var(--amber)" : "var(--green)" },
    { name: "资料", value: `完整度 ${summary.docCompleteness ?? 0}%`, color: (summary.docCompleteness ?? 0) < 70 ? "var(--red)" : (summary.docCompleteness ?? 0) < 90 ? "var(--amber)" : "var(--green)" }
  ];

  return `
    <section class="line-health fade-in">
      ${lineHealth.map((item) => `
        <article class="line-health-item" style="--health-color:${item.color}">
          <span>${item.name}</span>
          <strong>${item.value}</strong>
          <b>${item.color.includes("red") ? "🔴" : item.color.includes("amber") ? "🟡" : "🟢"}</b>
        </article>
      `).join("")}
    </section>
  `;
}

function renderAgentActions() {
  const actions = (state.data.insights?.items || state.data.dashboard?.agentInsights || []).slice(0, 3);
  return `
    <section class="agent-action agent-action-panel fade-in">
      <div class="section-heading">
        <h3 class="section-title">Agent 建议动作</h3>
        <span>待项目经理确认后进入执行</span>
      </div>
      <div class="agent-action-list">
        ${actions.map((item) => `
          <article>
            <p><strong>Agent 建议：</strong>${item.summary || item.title}</p>
            <p><strong>影响范围：</strong>${(item.citations || []).map((citation) => citation.module).filter(Boolean).slice(0, 2).join(" → ") || "项目综合"}</p>
            <p><strong>建议回复人：</strong>${item.agentId === "document-agent" ? "资料员" : "生产经理"}</p>
          </article>
        `).join("") || `<p class="empty-note">暂无 Agent 建议动作。</p>`}
      </div>
    </section>
  `;
}

function renderDashboardTodos() {
  const todos = collectTodoItems().slice(0, 5);
  if (todos.length === 0) return "";
  return `
    <section class="panel fade-in">
      <div class="panel-heading">
        <h3 class="panel-title">关键待办</h3>
        <span>${todos.length} 项待处理</span>
      </div>
      <div class="todo-list">
        ${todos.map((todo) => `
          <article class="todo-card">
            <div class="todo-title-row">
              <span class="risk-badge ${todo.riskLevel || "normal"}">${statusText(todo.riskLevel || "normal")}</span>
              <span class="todo-source-badge">${todo.module}</span>
              <strong>${todo.title}</strong>
            </div>
            <div class="todo-meta">
              <span>${todo.status}</span>
              <span>${todo.owner}</span>
              <span>${todo.deadline || "-"}</span>
            </div>
            <p class="todo-summary">${todo.summary || ""}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderImpactChain() {
  const scheduleNodes = state.data.schedule?.nodes || state.data.dashboard?.schedule?.nodes || [];
  const laggingNodes = scheduleNodes.filter((node) => node.critical && node.varianceDays < 0);
  if (laggingNodes.length === 0) return "";

  return `
    <section class="impact-chain fade-in">
      <div class="section-heading">
        <h3 class="section-title">🔗 跨模块影响链</h3>
      </div>
      <div class="impact-chain-list">
        ${laggingNodes.slice(0, 3).map((node) => {
          const costImpact = state.data.cost?.summary || state.data.dashboard?.cost;
          const safetyImpact = state.data.safety?.rectifications?.filter((item) => item.severity === "high" && item.status !== "closed") || [];
          return `
            <article class="impact-chain-item">
              <div class="impact-chain-diagram">
                <span class="impact-node" style="background:rgba(184,75,67,0.12);color:var(--red)">进度</span>
                <span class="impact-arrow">→</span>
                <span class="impact-node" style="background:#fff3e0;color:var(--amber)">成本</span>
                <span class="impact-arrow">→</span>
                <span class="impact-node" style="background:rgba(184,75,67,0.12);color:var(--red)">安全</span>
              </div>
              <h4>${node.name}</h4>
              <p class="impact-detail">
                <strong>影响：</strong>进度滞后 ${Math.abs(node.varianceDays)} 天
                ${costImpact ? `· 成本偏差 ${costImpact.varianceRate ?? costImpact.costDeviation ?? 0}%` : ""}
                ${safetyImpact.length ? `· ${safetyImpact.length} 项高风险整改待闭环` : ""}
              </p>
              <p class="impact-agent-note"><strong>Agent 建议：</strong>建议由生产经理确认赶工方案，安全负责人增加夜间巡检频次，资料员同步补齐隐蔽验收资料。</p>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderProjectInfoForm() {
  const activeProject = getActiveProject();
  if (!activeProject) return "";
  const buildings = activeProject.buildings || [];
  const basement = activeProject.basement || {};
  const verticalTransport = getProjectVerticalTransportData(activeProject);
  const collapsed = sessionStorage.getItem("project-info-collapsed") === "true";
  const totalArea = buildings.reduce((s, b) => s + (b.area || 0), 0);
  return `
    <section class="panel fade-in project-info-panel">
      <div class="section-heading" style="cursor:pointer" onclick="sessionStorage.setItem('project-info-collapsed', document.querySelector('#project-info-body').toggleAttribute('hidden') ? 'true' : 'false')">
        <div>
          <h3 class="section-title">📋 项目基本信息</h3>
          <span class="section-subtitle">${activeProject.code} · ${activeProject.region} · ${activeProject.stage}</span>
        </div>
        <span style="color:var(--muted);font-size:12px">${collapsed ? "展开" : "收起"}</span>
      </div>
      <div id="project-info-body" ${collapsed ? "hidden" : ""}>
        <div class="form-grid project-info-grid">
          <div class="form-group">
            <label>项目名称</label>
            <input class="project-info-field" data-field="name" value="${escapeHtml(activeProject.name)}" />
          </div>
          <div class="form-group">
            <label>项目编码</label>
            <input class="project-info-field" data-field="code" value="${escapeHtml(activeProject.code)}" />
          </div>
          <div class="form-group">
            <label>项目类型</label>
            <select class="project-info-field" data-field="type">
              ${["住宅小区","商业综合体","工业厂房","公共建筑","市政工程","其他"].map(t => `<option value="${t}" ${activeProject.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>所在区域</label>
            <select class="project-info-field" data-field="region">
              ${["华北","华东","华南","华中","西南","西北","东北"].map(r => `<option value="${r}" ${activeProject.region === r ? "selected" : ""}>${r}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>当前阶段</label>
            <select class="project-info-field" data-field="stage">
              ${["基坑支护","地基基础","主体结构","砌体工程","装饰装修","机电安装","室外配套","竣工收尾"].map(s => `<option value="${s}" ${activeProject.stage === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>项目经理</label>
            <input class="project-info-field" data-field="manager" value="${escapeHtml(activeProject.manager)}" />
          </div>
          <div class="form-group">
            <label>进展状态</label>
            <select class="project-info-field" data-field="status">
              ${["normal","warning","delayed"].map(s => `<option value="${s}" ${activeProject.status === s ? "selected" : ""}>${s === "normal" ? "正常" : s === "warning" ? "预警" : "延误"}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="project-info-section">
          <div class="section-heading" style="margin-top:16px">
            <h3 class="section-title">🏗️ 楼栋信息</h3>
            <span>${buildings.length} 栋 · 总面积 ${totalArea.toLocaleString()} m²</span>
          </div>
          <div id="building-editor-list">
            ${buildings.map((b, i) => renderBuildingRow(i, b)).join("")}
          </div>
          <button class="secondary-button small" type="button" id="btn-add-building" style="margin-top:8px">+ 添加楼栋</button>
        </div>

        <div class="project-info-section">
          <div class="section-heading" style="margin-top:16px">
            <h3 class="section-title">🏠 地下室信息</h3>
            <span id="basement-summary"></span>
          </div>
          <div class="basement-levels" id="basement-levels">
            <div class="basement-level-header">
              <span></span><span>地下层</span><span>面积 (m²)</span><span>层高 (m)</span><span>停车位</span><span>覆盖范围</span><span>关联楼栋</span>
            </div>
            ${renderBasementLevels(basement)}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="secondary-button small" type="button" id="btn-add-basement-level" style="font-size:12px">+ 添加地下层</button>
            <input class="project-info-field" data-field="basement.用途" value="${escapeHtml(basement.用途 || "")}" placeholder="用途说明，如：车库+设备用房" style="flex:1;min-height:32px;padding:4px 8px;border:1px solid var(--line);border-radius:var(--radius);font-size:12px" />
          </div>
        </div>

        <div class="project-info-section">
          ${renderVerticalTransportSection(verticalTransport, buildings, basement.levels || [], {
            source: "project",
            title: "垂直运输设备",
            subtitle: "项目级设备资源配置，供进度、技术、安全、成本共同引用。",
            frameless: true
          })}
        </div>

        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="secondary-button" type="button" id="btn-reset-project-info">取消</button>
          <button class="primary-button" type="button" id="btn-save-project-info">保存修改</button>
        </div>
      </div>
    </section>
  `;
}

function renderBuildingRow(index, building) {
  const floors = building.floors || 1;
  const area = building.area || 0;
  const floorList = building.floorDetails || [];
  // If no floorDetails yet, auto-generate with count=1 each
  if (floorList.length === 0) {
    for (var gi = 0; gi < floors; gi++) {
      floorList.push({
        floor: (floors - gi) + "F",
        area: Math.round(area / floors),
        height: 3.6,
        count: 1
      });
    }
  } else {
    // Ensure each has count
    floorList.forEach(function(f) { if (!f.count) f.count = 1; });
  }

  const sessionKey = "building-expanded-" + index;
  const expanded = sessionStorage.getItem(sessionKey) === "true";

  // Calculate total floors from counts and total height
  var totalFloorCount = 0;
  var totalCalcHeight = 0;
  var totalCalcArea = 0;
  floorList.forEach(function(f) {
    var cnt = f.count || 1;
    totalFloorCount += cnt;
    totalCalcHeight += (f.height || 0) * cnt;
    totalCalcArea += (f.area || 0) * cnt;
  });

  var rowHtml =
      '<div class="floor-detail-table">' +
        '<div class="floor-detail-header">' +
          '<span>楼层</span><span>面积 (m²)</span><span>层高 (m)</span><span>层数</span><span></span>' +
        '</div>';
    floorList.forEach(function(f, fi) {
      var rmId = index + "-" + fi;
      rowHtml += '<div class="floor-detail-row">' +
        '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="floor" value="' + escapeHtml(String(f.floor || "")) + '" placeholder="楼层名" style="width:80px" />' +
        '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="area" type="number" min="0" step="0.1" value="' + (f.area || 0) + '" style="width:90px" />' +
        '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="height" type="number" min="0" step="0.1" value="' + (f.height || 3.6) + '" style="width:80px" />' +
        '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="count" type="number" min="1" max="200" value="' + (f.count || 1) + '" style="width:60px" />' +
        '<button class="secondary-button small" type="button" data-remove-floor="' + rmId + '" style="flex-shrink:0;padding:0 4px;border:none;color:var(--red);background:transparent;font-size:12px">✕</button>' +
        '</div>';
    });
    rowHtml += '</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px;align-items:center">' +
        '<button class="secondary-button small" type="button" data-add-floor="' + index + '" style="font-size:12px">+ 添加楼层组</button>' +
        '<span style="font-size:11px;color:var(--muted)">共 ' + totalFloorCount + ' 层 · 总面积 ' + totalCalcArea.toLocaleString() + ' m² · 总高 ' + totalCalcHeight.toFixed(1) + 'm</span>' +
      '</div>';

  return '<div class="building-card" data-bindex="' + index + '">' +
    '<div class="building-card-header">' +
      '<span class="building-toggle" data-toggle-building="' + index + '" style="cursor:pointer;font-size:12px;user-select:none">' + (expanded ? "\u25bc" : "\u25b6") + '</span>' +
      '<input class="building-field" data-bindex="' + index + '" data-bfield="name" value="' + escapeHtml(building.name) + '" placeholder="楼栋名称" style="flex:1;min-width:100px;font-weight:600" />' +
      '<span class="building-summary">' + totalFloorCount + '层 · ' + totalCalcArea.toLocaleString() + 'm² · 总高' + totalCalcHeight.toFixed(1) + 'm</span>' +
      '<select class="building-field building-type-select" data-bindex="' + index + '" data-bfield="type">' +
        '住宅|商业|办公|工业|公共|其他'.split("|").map(function(t) { return '<option value="' + t + '"' + (building.type === t ? " selected" : "") + '>' + t + "</option>"; }).join("") +
      '</select>' +
      '<select class="building-field building-structure-select" data-bindex="' + index + '" data-bfield="structureType" style="width:110px" title="结构形式">' +
        '剪力墙结构|框架结构|框架-剪力墙结构|钢结构|钢筋混凝土结构|装配式混凝土结构|砌体结构|混合结构'.split("|").map(function(t) { return '<option value="' + t + '"' + ((building.structureType || (building.type === '住宅' ? '剪力墙结构' : '框架结构')) === t ? " selected" : "") + '>' + t + '</option>'; }).join("") +
      '</select>' +
  '<span class="prefab-trigger ' + (['钢结构','砌体结构','混合结构'].indexOf(building.structureType || '') >= 0 ? 'prefab-disabled' : 'prefab-active') + '" data-prefab="' + index + '" style="font-size:12px;display:inline-flex;align-items:center;gap:4px">▶ 装配式构件 ▾</span>' +
      '<button class="secondary-button small" type="button" data-remove-building="' + index + '" style="flex-shrink:0;padding:2px 8px;border:none;color:var(--red);background:transparent;font-size:14px" title="移除楼栋">✕</button>' +
    '</div>' +
    '<div class="building-floor-details"' + (expanded ? "" : " hidden") + '>' +
      rowHtml +
    '</div>' +
    (['钢结构','砌体结构','混合结构'].indexOf(building.structureType || '') >= 0 ? '' : '<div class="prefab-panel" data-prefab-panel="' + index + '" hidden>' +
      '<div class="prefab-grid">' +
        (function() { var _st = building.structureType || ''; var _isFullPrefab = _st.indexOf('装配式') >= 0; var _allItems = '叠合板|ALC条板|预制楼梯|装配式楼梯|预制墙板|预制梁|预制柱|预制阳台板|其他'.split('|'); var _items = _isFullPrefab ? _allItems : ['ALC条板']; return _items.map(function(c) { return '<label><input type="checkbox" class="prefab-cb" data-bindex="' + index + '" value="' + c + '" ' + ((building.prefabComponents || []).indexOf(c) >= 0 ? 'checked' : '') + ' /> ' + c + '</label>'; }).join(''); })() +
      '</div>' +
    '</div>') +
  '</div>';
}

function renderBasementLevels(basement) {
  const levels = basement.levels || [];
  const projectBuildings = getActiveProject()?.buildings || [];
  // Initialize default levels
  if (levels.length === 0 && basement.floors) {
    for (var bi = 0; bi < basement.floors; bi++) {
      levels.push({ name: "B" + (basement.floors - bi), height: 3.6, parking: Math.round((basement.parking || 0) / basement.floors) });
    }
  }
  if (levels.length === 0) {
    levels.push({ name: "B1", height: 3.6, parking: 0 });
  }
  // Ensure each level has zones array
  levels.forEach(function(l) {
    if (!l.zones || l.zones.length === 0) {
      // Create default zone from legacy data
      l.zones = [{ name: '1区', area: l.area || 0, coverage: l.coverage || '全部覆盖', coverageBuildings: l.coverageBuildings || [], sequence: 1 }];
    }
  });
  var totalArea = 0, totalCars = 0;
  levels.forEach(function(l) {
    (l.zones || []).forEach(function(z) { totalArea += (z.area || 0); });
    totalCars += (l.parking || 0);
  });
  var html = '';
  levels.forEach(function(l, li) {
    var zones = l.zones || [];
    html += '<div class="basement-level-card" data-level="' + li + '" style="border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:8px">' +
      // Level header row
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<button class="secondary-button small" type="button" data-remove-basement-level="' + li + '" style="width:20px;height:20px;padding:0;border:none;color:var(--red);background:transparent;font-size:12px;cursor:pointer">✕</button>' +
        '<label style="font-size:12px;font-weight:600">' + escapeHtml(l.name || '') + '</label>' +
        '<input type="hidden" class="basement-field" data-bindex="' + li + '" data-bfield="name" value="' + escapeHtml(l.name || '') + '" />' +
        '<span style="font-size:11px;color:var(--muted)">层高</span>' +
        '<input class="basement-field" data-bindex="' + li + '" data-bfield="height" type="number" min="0" step="0.1" value="' + (l.height || 3.6) + '" style="width:50px" />' +
        '<span style="font-size:11px;color:var(--muted)">m</span>' +
        '<span style="font-size:11px;color:var(--muted)">停车</span>' +
        '<input class="basement-field" data-bindex="' + li + '" data-bfield="parking" type="number" min="0" value="' + (l.parking || 0) + '" style="width:50px" />' +
        '<span style="font-size:11px;color:var(--muted)">位</span>' +
      '</div>' +
      // Zone header
      '<div style="display:grid;grid-template-columns:30px 80px 90px 100px 1fr;gap:4px;font-size:11px;color:var(--muted);font-weight:600;padding:4px 4px 6px;border-bottom:1px solid var(--line-soft)">' +
        '<span></span><span>施工分区</span><span>面积(m²)</span><span>覆盖范围</span><span>关联楼栋</span>' +
      '</div>';
    // Zone rows
    zones.forEach(function(z, zi) {
      var selectedBuildings = z.coverageBuildings || [];
      var partialHidden = (z.coverage === '局部覆盖' || z.coverage === '局部' || z.coverage === '局部（库）') ? '' : ' hidden';
      html += '<div class="basement-zone-row" data-level="' + li + '" data-zone="' + zi + '" style="display:grid;grid-template-columns:30px 80px 90px 100px 1fr;gap:4px;align-items:center;padding:3px 4px">' +
        '<span style="font-size:11px;color:var(--muted);text-align:center">' + (zi + 1) + '</span>' +
        '<input class="basement-zone-field" data-bindex="' + li + '" data-zindex="' + zi + '" data-zfield="name" value="' + escapeHtml(z.name || '') + '" placeholder="如：1区" style="width:70px;font-size:12px" />' +
        '<input class="basement-zone-field" data-bindex="' + li + '" data-zindex="' + zi + '" data-zfield="area" type="number" min="0" step="0.1" value="' + (z.area || 0) + '" style="width:80px;font-size:12px" />' +
        '<select class="basement-zone-field basement-zone-coverage" data-bindex="' + li + '" data-zindex="' + zi + '" data-zfield="coverage" style="width:90px;font-size:12px">' +
          '全部覆盖|局部覆盖|仅车库/配套区'.split('|').map(function(c) { return '<option value="' + c + '"' + (z.coverage === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<div class="basement-building-picker" data-bindex="' + li + '" data-zindex="' + zi + '"' + partialHidden + ' style="flex:1">' +
            '<button class="basement-dropdown-btn" type="button" data-bdropdown="' + li + '-' + zi + '">' + (selectedBuildings.length ? selectedBuildings.join('、') : '请选择关联楼栋') + '</button>' +
            '<div class="basement-dropdown-menu" data-bmenu="' + li + '-' + zi + '" hidden>' +
              projectBuildings.map(function(b) {
                var name = b.name || '';
                return '<label><input type="checkbox" class="basement-building-cb" data-bindex="' + li + '" data-zindex="' + zi + '" value="' + escapeHtml(name) + '" ' + (selectedBuildings.includes(name) ? 'checked' : '') + ' /> ' + escapeHtml(name) + '</label>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<button class="secondary-button small" type="button" data-remove-zone="' + li + '" data-zi="' + zi + '" style="flex-shrink:0;padding:0 4px;border:none;color:var(--red);background:transparent;font-size:12px" title="删除此分区">✕</button>' +
        '</div>' +
      '</div>';
    });
    html += '<button class="secondary-button small" type="button" data-add-zone="' + li + '" style="font-size:11px;margin-top:4px">+ 添加分区</button>' +
    '</div>';
  });
  html += '<div class="basement-summary-row" style="font-size:11px;color:var(--muted);padding:4px 0">共 ' + levels.length + ' 层 · 总面积 ' + totalArea.toLocaleString() + ' m² · 停车 ' + totalCars + ' 位</div>';
  return html;
}
function renderDashboardView() {
  const d = state.data.dashboard || {};
  const s = d.summary || {};
  const sch = d.schedule || {};
  const q = d.quality || {};
  const saf = d.safety || {};
  const cst = d.cost || {};
  const docs = d.documents || {};
  return `
    ${renderRiskSummary()}
    ${renderLineHealth()}
    ${renderAgentActions()}

    ${renderProjectInfoForm()}

    ${renderDashboardTodos()}

    <section class="panel fade-in">
      <div class="panel-heading">
        <h3 class="panel-title">项目全景摘要</h3>
      </div>
      <div class="metric-grid four">
        <article class="metric-card"><span>项目经理</span><strong>${s.manager || "-"}</strong><p>阶段：${s.stage || "-"}</p></article>
        <article class="metric-card"><span>关键线路</span><strong>${sch.criticalCount ?? 0}</strong><p>预警节点 ${sch.warningCount ?? 0} 个</p></article>
        <article class="metric-card"><span>质量问题</span><strong>${q.openIssues ?? 0}</strong><p>待复验 ${q.recheckPending ?? 0} 项</p></article>
        <article class="metric-card"><span>安全整改</span><strong>${saf.openRectifications ?? 0}</strong><p>巡检 ${saf.inspections ?? 0} 次</p></article>
      </div>
    </section>

    <section class="panel-grid two fade-in">
      <article class="panel">
        <div class="panel-heading">
          <h3 class="panel-title">进度节点快照</h3>
        </div>
        <div class="table-list">
          ${(sch.nodes || []).slice(0, 5).map((node) => `
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
          ${(q.latestIssues || []).map((issue) => `
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
          ${(saf.topRisks || []).map((risk) => `
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
            <strong>${cst.latest?.month || "-"} 成本快照</strong>
            <p>预算 ${cst.latest?.budget || 0} 万 · 实际 ${cst.latest?.actual || 0} 万 · 偏差 ${cst.varianceRate ?? 0}%</p>
          </div>
          ${(docs.latest || []).slice(0, 2).map((document) => `
            <div class="table-row">
              <strong>${document.name}</strong>
              <p>${document.type} · ${statusText(document.parseStatus)}</p>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
    ${renderImpactChain()}
  `;
}

function renderTodoView() {
  const todos = collectTodoItems();
  const grouped = [
    { key: "high", label: "高风险", count: todos.filter((item) => item.riskLevel === "high").length },
    { key: "warning", label: "需关注", count: todos.filter((item) => item.riskLevel === "warning").length },
    { key: "normal", label: "处理中", count: todos.filter((item) => item.riskLevel === "normal").length }
  ];
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Todo Center</p>
          <h3 class="section-title">待办中心</h3>
        </div>
        <span>${todos.length} 项待项目经理处理</span>
      </div>
      <div class="metric-grid three">
        ${grouped.map((item) => `
          <article class="metric-card">
            <span>${item.label}</span>
            <strong>${item.count}</strong>
            <p>${item.key === "high" ? "优先确认责任与闭环时间" : "等待人工确认或指派"}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="todo-list fade-in">
      ${todos.map((todo) => `
        <article class="todo-card">
          <header>
            <div>
              <span>${todo.source}</span>
              <span class="todo-source-badge">${todo.module}</span>
              <h3>${todo.title}</h3>
            </div>
            <span class="risk-badge ${todo.riskLevel}">${todo.status || riskBadgeText(todo.riskLevel)}</span>
          </header>
          <dl class="todo-meta">
            <div><dt>责任人</dt><dd>${todo.owner}</dd></div>
            <div><dt>截止 / 来源时间</dt><dd>${todo.due || "-"}</dd></div>
          </dl>
          <p>${todo.summary}</p>
          ${todo.evidence ? `<p class="todo-evidence"><strong>依据：</strong>${todo.evidence}</p>` : ""}
          ${todoActionButtons(todo)}
        </article>
      `).join("") || `
        <article class="todo-card">
          <header>
            <div>
              <span>系统提示</span>
              <h3>暂无待办事项</h3>
            </div>
            <span class="risk-badge normal">正常</span>
          </header>
          <p>当前项目没有需要人工确认的 Agent 结论、整改、偏差或资料解析任务。</p>
        </article>
      `}
    </section>
  `;
}

function renderScheduleView() {
  const data = state.data.schedule || {};
  const milestones = data.milestones || [];
  const milestoneNames = new Set(milestones.map((m) => m.name));
  const nodes = data.nodes || [];
  if (state.planWizard.active) {
    return renderPlanWizard();
  }
  const criticalCount = data.summary?.criticalWarnings || nodes.filter((n) => n.critical && n.varianceDays < 0).length;
  const laggingNodes = nodes.filter((n) => n.varianceDays < 0);
  const sortedNodes = [...nodes].sort((a, b) => {
    const sa = a.critical && a.varianceDays < 0 ? 0 : a.varianceDays < 0 ? 1 : 2;
    const sb = b.critical && b.varianceDays < 0 ? 0 : b.varianceDays < 0 ? 1 : 2;
    return sa - sb || (a.varianceDays || 0) - (b.varianceDays || 0);
  });

  return `
    <div class="schedule-overview-grid">
      <section class="panel fade-in">
        <div class="section-heading">
          <h3 class="section-title">施工进度曲线</h3>
          <span>计划 vs 实际完成率</span>
        </div>
        <div id="schedule-chart" style="width:100%;height:260px"></div>
      </section>

      <section class="panel fade-in">
        <div class="section-heading">
          <div>
            <h3 class="section-title">进度节点</h3>
            <span class="section-subtitle">${nodes.length} 个节点 · ${criticalCount} 个关键滞后</span>
          </div>
          <span class="status-badge ${criticalCount ? "high" : laggingNodes.length ? "warning" : "normal"}">${criticalCount ? "关键滞后" : laggingNodes.length ? "存在滞后" : "整体正常"}</span>
        </div>
        <div class="schedule-node-list">
          ${sortedNodes.map((n) => {
            const cl = n.critical && n.varianceDays < 0;
            const lg = n.varianceDays < 0;
            const nodeClass = cl ? "critical" : lg ? "warning" : "normal";
            var nCode = n.code || '';
            var nCodeHtml = nCode
              ? '<code class="mep-task-code" style="font-size:10px;margin-right:6px">' + escapeHtml(nCode) + '</code>'
              : '';
            return `
              <div class="schedule-node-card ${nodeClass}">
                <div class="node-card-header">
                  <span class="node-indicator ${nodeClass}"></span>
                  ${nCodeHtml}
                  <strong>${n.name}</strong>
                  ${milestoneNames.has(n.name) ? '<span class="node-milestone-badge">里程碑</span>' : ''}
                </div>
                <div class="node-card-meta">
                  <span>${nCode ? '编码 ' + nCode : n.owner || "-"}</span>
                  <span>${n.percent ?? 0}%</span>
                  <span>${n.plannedDate || "-"}</span>
                  <span class="node-card-variance ${cl ? "behind" : lg ? "behind" : ""}">${cl ? `滞后${Math.abs(n.varianceDays)}天` : lg ? `滞后${Math.abs(n.varianceDays)}天` : "正常"}</span>
                </div>
                <div class="node-progress-bar">
                  <div class="node-progress-fill ${nodeClass}" style="width:${Math.min(n.percent ?? 0, 100)}%"></div>
                </div>
              </div>
            `;
          }).join("") || `<p class="empty-note">暂无进度节点，使用自动编制或 WBS 导入添加。</p>`}
        </div>
      </section>
    </div>

    <section class="auto-plan-bar fade-in">
      <div class="auto-plan-bar-content">
        <span class="auto-plan-icon">🧠</span>
        <div>
          <strong>编制项目总控计划</strong>
          <p>通过信息编制向导逐步确认项目范围、专业工序模板、穿插关系、硬约束和资源。${nodes.length > 0 ? "当前已有 " + nodes.length + " 个节点，编制结果应用后将替换现有计划。" : ""}</p>
        </div>
        <button class="primary-button" id="btn-auto-plan" type="button">进入编制向导</button>
      </div>
    </section>


  `;
}

function getMasterScheduleTemplate() {
  return {
    lanes: [
      {
        id: "prep",
        title: "施工准备",
        trade: "土建",
        nodes: [
          { name: "临建完成", trade: "土建", owner: "项目工程部", start: "开工前 20 天", finish: "开工前 10 天", predecessor: "施工许可证/场地移交", critical: true, agentHint: "确认临建、道路、临电是否满足大面施工。" },
          { name: "施工道路完成", trade: "土建", owner: "生产经理", start: "开工前 18 天", finish: "开工前 5 天", predecessor: "场地移交", critical: true, agentHint: "影响土方、材料运输和大型设备进场。" },
          { name: "临水临电接入", trade: "机电", owner: "机电工程师", start: "开工前 15 天", finish: "开工前 3 天", predecessor: "临设布置确认", critical: true, agentHint: "临电容量需覆盖塔吊、钢筋加工和地下室排水。" },
          { name: "塔吊安装验收", trade: "土建", owner: "设备管理员", start: "开工前 10 天", finish: "开工后 7 天", predecessor: "基础验收", critical: true, agentHint: "未验收会影响地下室和主体垂直运输。" }
        ]
      },
      {
        id: "basement",
        title: "地下室与基础",
        trade: "土建",
        nodes: [
          { name: "基坑支护", trade: "土建", owner: "土建工长", start: "第 1 周", finish: "第 4 周", predecessor: "施工准备完成", critical: true, agentHint: "与降排水、监测和土方开挖形成强依赖。" },
          { name: "土方开挖", trade: "土建", owner: "土方分包", start: "第 3 周", finish: "第 7 周", predecessor: "基坑支护分段完成", critical: true, agentHint: "检查是否存在支护未闭合即开挖的风险。" },
          { name: "垫层施工", trade: "土建", owner: "土建工长", start: "第 7 周", finish: "第 8 周", predecessor: "土方验槽", critical: false, agentHint: "垫层后立即衔接防水和基础钢筋。" },
          { name: "筏板基础", trade: "土建", owner: "生产经理", start: "第 8 周", finish: "第 11 周", predecessor: "垫层/防水完成", critical: true, agentHint: "机电底板预留预埋需同步完成。" },
          { name: "地下室结构", trade: "土建", owner: "生产经理", start: "第 11 周", finish: "第 18 周", predecessor: "筏板基础", critical: true, agentHint: "地下室结构完成后释放管综深化和主管线安装条件。" },
          { name: "地下室防水", trade: "土建", owner: "防水分包", start: "第 15 周", finish: "第 20 周", predecessor: "地下室外墙结构", critical: false, agentHint: "影响肥槽回填、室外管网和机电管线穿墙封堵。" }
        ]
      },
      {
        id: "structure",
        title: "主体结构",
        trade: "土建",
        nodes: [
          { name: "标准层结构施工", trade: "土建", owner: "生产经理", start: "第 18 周", finish: "第 34 周", predecessor: "地下室结构", critical: true, agentHint: "作为机电预留预埋和二次结构穿插的主控节奏。" },
          { name: "主体结构 10F", trade: "土建", owner: "土建工长", start: "第 22 周", finish: "第 24 周", predecessor: "标准层结构施工", critical: true, agentHint: "达到 10F 后复核砌体、机电穿插启动条件。" },
          { name: "主体结构 20F", trade: "土建", owner: "土建工长", start: "第 29 周", finish: "第 31 周", predecessor: "主体结构 10F", critical: true, agentHint: "当前项目关键里程碑，影响机电安装和幕墙样板。" },
          { name: "主体封顶", trade: "土建", owner: "项目经理", start: "第 34 周", finish: "第 36 周", predecessor: "标准层结构施工", critical: true, agentHint: "封顶后释放屋面、外立面、室外和验收倒排条件。" }
        ]
      },
      {
        id: "mep",
        title: "机电安装",
        trade: "机电",
        nodes: [
          { name: "机电预留预埋", trade: "机电", owner: "机电工程师", start: "随主体同步", finish: "主体封顶", predecessor: "标准层结构施工 SS", critical: true, agentHint: "随主体结构同步施工，不能作为主体完成后的后置工作。" },
          { name: "主管线安装", trade: "机电", owner: "机电班组", start: "地下室结构完成", finish: "设备安装前", predecessor: "地下室结构完成", critical: true, agentHint: "含管综深化、支吊架、给排水/电气/消防/暖通主管线安装。" },
          { name: "设备安装调试", trade: "机电", owner: "机电经理", start: "主管线安装完成 + 设备到货", finish: "系统联调前", predecessor: "主管线安装完成", critical: true, agentHint: "设备就位至单机调试完成，必须设备基础移交和设备到货两个前置条件。" },
          { name: "系统联动调试", trade: "机电", owner: "机电经理", start: "设备安装调试完成 + 正式水电接入", finish: "消防验收前", predecessor: "设备安装调试完成", critical: true, agentHint: "系统联调至消防联动调试完成，必须挂正式电、给排水接入。" }
        ]
      },
      {
        id: "finish",
        title: "装饰装修",
        trade: "装饰",
        nodes: [
          { name: "砌体插入", trade: "装饰", owner: "砌筑班组", start: "主体滞后 3-5 层", finish: "抹灰前", predecessor: "主体结构 10F", critical: false, agentHint: "为水电二次配管和箱盒安装释放作业面。" },
          { name: "抹灰施工", trade: "装饰", owner: "抹灰班组", start: "砌体完成后", finish: "吊顶龙骨前", predecessor: "砌体插入", critical: false, agentHint: "抹灰完成后可推进机电末端和装饰基层。" },
          { name: "吊顶龙骨", trade: "装饰", owner: "精装经理", start: "主管线完成后", finish: "吊顶封板前", predecessor: "电气桥架安装 + 暖通风管安装", critical: false, agentHint: "龙骨阶段需预留检修口和末端设备位置。" },
          { name: "吊顶封板", trade: "装饰", owner: "精装经理", start: "机电隐蔽验收后", finish: "面层施工前", predecessor: "机电隐蔽验收", critical: true, agentHint: "必须晚于机电隐蔽验收，否则高概率返工。" },
          { name: "精装样板", trade: "装饰", owner: "精装经理", start: "吊顶龙骨后", finish: "大面施工前", predecessor: "吊顶龙骨", critical: true, agentHint: "样板确认影响机电末端定位和材料下单。" },
          { name: "公区装修", trade: "装饰", owner: "精装经理", start: "样板确认后", finish: "竣工验收前", predecessor: "精装样板", critical: false, agentHint: "需避开消防、电梯和弱电调试返工。" }
        ]
      },
      {
        id: "handover",
        title: "室外配套与竣工验收",
        trade: "验收",
        nodes: [
          { name: "室外管网", trade: "室外", owner: "室外分包", start: "主体封顶后", finish: "正式水电接入前", predecessor: "主体封顶", critical: true, agentHint: "室外管网影响正式水电、消防验收和景观移交。" },
          { name: "正式水电接入", trade: "机电", owner: "机电经理", start: "室外管网完成", finish: "系统联调前", predecessor: "室外管网", critical: true, agentHint: "正式水电是系统联调、消防联动和电梯调试前置。" },
          { name: "电梯调试验收", trade: "验收", owner: "电梯分包", start: "正式电接入后", finish: "竣工验收前", predecessor: "正式水电接入 + 电梯安装", critical: true, agentHint: "电梯验收缺失会阻断竣工验收路径。" },
          { name: "消防验收", trade: "验收", owner: "消防分包", start: "消防联动调试后", finish: "竣工验收前", predecessor: "消防联动调试", critical: true, agentHint: "消防验收是项目竣工验收的硬前置。" },
          { name: "竣工资料归档", trade: "资料", owner: "资料员", start: "专项验收前", finish: "竣工验收前", predecessor: "各专业验收资料", critical: true, agentHint: "资料归档必须引用调试、隐蔽、验收和检测记录。" },
          { name: "竣工验收", trade: "验收", owner: "项目经理", start: "专项验收完成", finish: "交付前", predecessor: "消防验收 + 电梯调试验收 + 竣工资料归档", critical: true, agentHint: "竣工验收必须晚于消防、电梯和资料归档。" }
        ]
      }
    ],
    relations: [
      { from: "标准层结构施工", to: "机电预留预埋", note: "机电预留预埋随主体结构同步施工，不可后置" },
      { from: "地下室结构", to: "主管线安装", note: "地下室结构完成后释放机电主管线安装作业面" },
      { from: "主管线安装完成", to: "设备安装调试", note: "主管线完成后进入设备安装调试阶段" },
      { from: "设备安装调试完成 + 正式水电接入", to: "系统联动调试", note: "系统联动调试须在设备安装完成且正式水电接入后进行" },
      { from: "正式水电接入", to: "系统联动调试", note: "正式电接入是系统联调和消防联调硬前置" },
      { from: "系统联动调试", to: "消防验收", note: "系统联动调试完成后进入消防验收专项" },
      { from: "消防验收 / 电梯验收 / 资料归档", to: "竣工验收", note: "专项验收完成后进入竣工验收" }
    ],
    agentReviews: [
      "机电预留预埋已挂接主体结构同步关系，不能后移到主体完成后。",
      "主管线安装包含管综深化、支吊架、给排水/电气/消防/暖通主管线，地下室结构完成后启动。",
      "设备安装调试需满足主管线安装完成和设备到货两个前置条件。",
      "系统联动调试须设备安装调试完成且正式水电接入后方可启动。",
      "机电已简化为4个里程碑节点：预留预埋、主管线安装、设备安装调试、系统联动调试。"
    ]
  };
}

function tradeBadgeClass(trade) {
  return {
    土建: "civil",
    机电: "mep",
    装饰: "finish",
    室外: "outdoor",
    验收: "handover",
    资料: "document"
  }[trade] || "civil";
}

const MASTER_LANE_TEMPLATE_MAP = {
  prep: ["MASTER-PREP"],
  basement: ["TP-BASE-001"],
  structure: ["TP-STR-001"],
  mep: ["TP-MEP-01"],
  finish: ["TP-SEC-01", "TP-FIN-01"],
  handover: ["TP-ROOF-01", "TP-EXT-01"]
};

const MASTER_RELATION_LANE_MAP = [
  ["structure", "mep"],
  ["structure", "finish", "mep"],
  ["basement", "mep"],
  ["finish", "mep"],
  ["mep", "finish"],
  ["mep"],
  ["handover", "mep"],
  ["handover"]
];

function masterLaneTitleMap() {
  return Object.fromEntries(getMasterScheduleTemplate().lanes.map((lane) => [lane.id, lane.title]));
}

function getTemplateLaneIds(templateId) {
  return Object.entries(MASTER_LANE_TEMPLATE_MAP)
    .filter(([, ids]) => ids.includes(templateId))
    .map(([laneId]) => laneId);
}

function getTemplateOriginText(templateId) {
  const titles = masterLaneTitleMap();
  return getTemplateLaneIds(templateId).map((laneId) => titles[laneId]).filter(Boolean).join(" / ");
}

function getAllowedTemplatesForMasterLanes(data) {
  const selected = data.selectedMasterLanes || [];
  return selected.flatMap((laneId) => MASTER_LANE_TEMPLATE_MAP[laneId] || []);
}

function ensureWizardTemplateCandidates(data, { reset = false } = {}) {
  const allowed = Array.from(new Set(getAllowedTemplatesForMasterLanes(data)));
  if (reset || !Array.isArray(data.templateCandidateIds) || !data.templateCandidateIds.length) {
    data.templateCandidateIds = allowed;
    return;
  }
  allowed.forEach((id) => {
    if (!data.templateCandidateIds.includes(id)) data.templateCandidateIds.push(id);
  });
}

function syncTemplatesFromMasterLanes(data, { force = false, addMissing = false } = {}) {
  const allowed = getAllowedTemplatesForMasterLanes(data);
  if (force || !Array.isArray(data.selectedTemplates)) {
    data.selectedTemplates = allowed.slice();
    return;
  }
  data.selectedTemplates = data.selectedTemplates.filter((id) => allowed.includes(id));
  if (addMissing) {
    allowed.forEach((id) => {
      if (!data.selectedTemplates.includes(id)) data.selectedTemplates.push(id);
    });
  }
}

function syncMasterLanesFromSelectedTemplates(data) {
  const selectedTemplates = data.selectedTemplates || [];
  data.selectedMasterLanes = getMasterScheduleTemplate().lanes
    .filter((lane) => {
      const laneTemplates = MASTER_LANE_TEMPLATE_MAP[lane.id] || [];
      return laneTemplates.some((templateId) => selectedTemplates.includes(templateId));
    })
    .map((lane) => lane.id);
}

function makeMasterLaneNode(lane, node, index) {
  return {
    id: node.id || `${lane.id}-${index}`,
    originalName: node.originalName || node.name,
    enabled: node.enabled !== false,
    name: node.name || "",
    trade: node.trade || lane.trade,
    owner: node.owner || "",
    start: node.start || "",
    finish: node.finish || "",
    predecessor: node.predecessor || "",
    critical: Boolean(node.critical),
    agentHint: node.agentHint || "",
    custom: Boolean(node.custom)
  };
}

function buildDefaultMasterLaneEdit(lane) {
  return {
    nodes: lane.nodes.map((node, index) => makeMasterLaneNode(lane, node, index))
  };
}

function resetMasterLaneEdit(data, laneId) {
  const lane = getMasterScheduleTemplate().lanes.find((item) => item.id === laneId);
  if (!lane) return;
  if (!data.masterLaneEdits) data.masterLaneEdits = {};
  data.masterLaneEdits[laneId] = buildDefaultMasterLaneEdit(lane);
}

function ensureMasterLaneEdits(data) {
  const template = getMasterScheduleTemplate();
  if (!data.masterLaneEdits) data.masterLaneEdits = {};
  template.lanes.forEach((lane) => {
    if (!data.masterLaneEdits[lane.id]) {
      data.masterLaneEdits[lane.id] = buildDefaultMasterLaneEdit(lane);
      return;
    }
    const edit = data.masterLaneEdits[lane.id];
    if (!Array.isArray(edit.nodes)) edit.nodes = [];
    lane.nodes.forEach((node, index) => {
      if (!edit.nodes.some((item) => item.originalName === node.name || item.name === node.name)) {
        edit.nodes.push(makeMasterLaneNode(lane, node, index));
      }
    });
    edit.nodes = edit.nodes.map((node, index) => makeMasterLaneNode(lane, node, index));
  });
}

function getMasterLaneNodes(data, laneId) {
  ensureMasterLaneEdits(data);
  return data.masterLaneEdits?.[laneId]?.nodes || [];
}

function isMasterNodeEnabled(data, defaultName) {
  const template = getMasterScheduleTemplate();
  for (const lane of template.lanes) {
    const node = getMasterLaneNodes(data, lane.id).find((item) => item.originalName === defaultName || item.name === defaultName);
    if (node) return node.enabled !== false;
  }
  return true;
}

function masterRelationIsAvailable(index, relation, data) {
  const selected = data.selectedMasterLanes || [];
  const relationLanes = MASTER_RELATION_LANE_MAP[index] || [];
  if (relationLanes.some((laneId) => !selected.includes(laneId))) return false;
  if (!mepConfigAllowsRelation(index, data)) return false;
  const relationText = `${relation.from} ${relation.to}`;
  const defaultNodeNames = getMasterScheduleTemplate().lanes.flatMap((lane) => lane.nodes.map((node) => node.name));
  return defaultNodeNames
    .filter((name) => relationText.includes(name))
    .every((name) => isMasterNodeEnabled(data, name));
}

function syncRelationsFromMasterLanes(data, { force = false, addMissing = false } = {}) {
  const template = getMasterScheduleTemplate();
  const available = template.relations
    .map((relation, index) => masterRelationIsAvailable(index, relation, data) ? String(index) : null)
    .filter(Boolean);
  if (force || !Array.isArray(data.enabledMasterRelations)) {
    data.enabledMasterRelations = available;
    return;
  }
  data.enabledMasterRelations = data.enabledMasterRelations.filter((key) => available.includes(key));
  if (addMissing) {
    available.forEach((key) => {
      if (!data.enabledMasterRelations.includes(key)) data.enabledMasterRelations.push(key);
    });
  }
}

var MEP_SYSTEM_LABELS = {};  /* placeholder for dead code */

// MEP_CONSTRAINT_LABELS removed — simplified to milestone nodes

// 工序键定义，按施工空间类型提供默认工序链
// Per-space-type task chains: keyed by spaceType, then by system
// MEP_SYSTEM_TASK_CHAINS removed — simplified to milestone nodes
// MEP_SPACE_TYPE_POLICIES removed — simplified to milestone nodes
// MEP_SPACE_GUIDES removed — simplified to milestone nodes
function buildMepSpacesFromProject(data) {
  const project = getActiveProject();
  if (!project) return [];
  const spaces = [];
  const buildings = project.buildings || [];
  const basementLevels = project.basement?.levels || [];
  const selectedBuildings = data.selectedBuildings || [];
  const selectedBasement = data.selectedBasementLevels || [];
  const pickedBuildings = selectedBuildings.length
    ? buildings.filter(function(b) { return selectedBuildings.includes(b.name); })
    : buildings;

  // 地下室：按每个地下室分区单独生成机电工作空间
  basementLevels.forEach(function(level) {
    var levelName = level.name || 'B1';
    var zones = level.zones || [];
    if (!zones.length) zones = [{ name: '1区', area: level.area || 0 }];
    zones.forEach(function(zone) {
      var zoneName = zone.name || '1区';
      var key = levelName + '-' + zoneName;
      if (selectedBasement.length && !selectedBasement.includes(key)) return;
      if (Number(zone.area) <= 0) return;
      const policy = MEP_SPACE_TYPE_POLICIES.basement;
      spaces.push({
        id: 'mep_basement_' + key.replace(/[^\w\u4e00-\u9fa5#-]/g, '_'),
        label: '地下室区域（' + key + '）',
        entityType: 'basement-zone',
        entityName: key,
        spaceType: 'basement',
        systems: [...policy.defaultSystems],
        constraints: [...policy.defaultConstraints],
        insertionPolicy: policy.insertionPolicy,
        predecessorPrefix: policy.predecessorPrefix,
        sourceEntities: [key]
      });
    });
  });

  // 主体：按每栋楼单独生成机电工作空间
  pickedBuildings.forEach(function(building) {
    var name = building.name || '楼栋';
    const policy = MEP_SPACE_TYPE_POLICIES.tower;
    spaces.push({
      id: 'mep_tower_' + name.replace(/[^\w\u4e00-\u9fa5#-]/g, '_'),
      label: '主体楼栋（' + name + '）',
      entityType: 'building',
      entityName: name,
      spaceType: 'tower',
      systems: [...policy.defaultSystems],
      constraints: [...policy.defaultConstraints],
      insertionPolicy: policy.insertionPolicy,
      predecessorPrefix: policy.predecessorPrefix,
      sourceEntities: [name],
      prefab: String(building.structureType || '').includes('装配式')
    });
  });

  return spaces;
}

function getMepSpaceTaskDefaults(systemKey, spaceType) {
  // Look up per-space-type chain first, fall back to basement (generic)
  var spaceChains = MEP_SYSTEM_TASK_CHAINS[spaceType] || MEP_SYSTEM_TASK_CHAINS.basement;
  var raw = spaceChains[systemKey];
  if (!raw) return [];
  var defaultPredecessor = MEP_SPACE_TYPE_POLICIES[spaceType]?.predecessorPrefix || "工作面移交/机电开工条件满足";
  // Handle both flat array and phase-object formats
  var tasks = [];
  if (Array.isArray(raw)) {
    // Flat array format (basement/legacy)
    raw.forEach(function(task, idx) {
      tasks.push({
        name: task.name,
        durationDays: task.durationDays || 3,
        critical: task.critical || false,
        predecessor: idx > 0 ? raw[idx - 1].name : defaultPredecessor,
        relationship: "FS",
        lagDays: 0,
        constrainedBy: task.insertCondition || "",
        agentHint: task.agentHint || "",
        id: task.task_id || task.id || (systemKey.substring(0,3).toUpperCase() + "-" + String(idx + 1).padStart(3,"0")),
        phase: "",
        phaseOrder: 0
      });
    });
  } else if (raw.phases && Array.isArray(raw.phases)) {
    // Phase-grouped format (tower/MEP v2)
    var allPhaseTasks = [];
    raw.phases.forEach(function(phase, pi) {
      var phaseName = phase.phaseName || ("阶段" + (pi + 1));
      (phase.tasks || []).forEach(function(task, ti) {
        var predecessor = ti > 0 ? phase.tasks[ti - 1].name : defaultPredecessor;
        // If first task of phase and not first phase, pred = last task of previous phase
        if (ti === 0 && pi > 0) {
          var prevPhase = raw.phases[pi - 1];
          if (prevPhase.tasks && prevPhase.tasks.length > 0) {
            predecessor = prevPhase.tasks[prevPhase.tasks.length - 1].name;
          }
        }
        allPhaseTasks.push({
          name: task.name,
          durationDays: task.durationDays || 3,
          critical: task.critical || false,
          predecessor: predecessor,
          relationship: "FS",
          lagDays: 0,
          constrainedBy: task.insertCondition || "",
          agentHint: task.agentHint || "",
          id: task.task_id || task.id || (systemKey.substring(0,3).toUpperCase() + "-" + phase.phaseKey.substring(0,3).toUpperCase() + "-" + String(ti + 1).padStart(3,"0")),
          phase: phaseName,
          phaseOrder: pi,
          predecessorRef: ti === 0 ? (phase.predecessorRef || null) : null
        });
      });
    });
    tasks = allPhaseTasks;
  }
  return tasks;
}

function ensureMepConfigDefaults(data) {
  // Simplified: No per-space MEP configuration needed — using milestone nodes from template
  if (!data.relationRuleEdits) data.relationRuleEdits = {};
}

function getMepSpaceNodes(data, spaceId) {
  ensureMepConfigDefaults(data);
  var space = (data.mepSpaces || []).find(function(s) { return s.id === spaceId; });
  if (!space) return [];
  var systems = data.mepEditorSystems[spaceId] || [];
  var constraints = data.mepEditorConstraints[spaceId] || [];
  var nodes = [];
  var prefix = space.insertionPolicy || "";
  var predecessorPrefix = space.predecessorPrefix || "";

  systems.forEach(function(sys) {
    var taskKey = spaceId + "_" + sys;
    var tasks = data.mepEditorTasks[taskKey] || [];
    var systemLabel = MEP_SYSTEM_LABELS[sys] || sys;
    var prevTaskName = predecessorPrefix;

    tasks.forEach(function(task, idx) {
      var isCritical = task.critical || false;
      // Use the task's stored predecessor (which already handles phase boundaries)
      // Only fall back to predecessorPrefix when task has no predecessor set
      var predecessor = task.predecessor || (idx === 0 ? predecessorPrefix : tasks[idx - 1].name);
      // Cross-system constraint if task.constrainedBy mentions another system
      var extraHint = task.constrainedBy ? "（" + task.constrainedBy + "）" : "";
      nodes.push({
        name: space.label + " - " + task.name,
        owner: "机电工程师",
        critical: isCritical,
        trade: "机电",
        source: "mep-generated",
        predecessor: predecessor || "",
        startRule: predecessor || "",
        agentHint: task.agentHint ? task.agentHint + extraHint : space.label + " " + systemLabel + " " + task.name,
        system: sys,
        systemLabel: systemLabel,
        spaceId: spaceId,
        spaceLabel: space.label,
        areaLabel: space.label,
        phase: task.phase || ""
      });
    });
  });

  return nodes;
}

function getMepSpaceGuide(spaceType) {
  return MEP_SPACE_GUIDES[spaceType] || {
    description: "该作业空间已纳入机电计划编制。",
    upstream: "请补充前置条件",
    downstream: "请补充移交对象"
  };
}

function getMepSpaceStats(data, space) {
  var systems = data.mepEditorSystems?.[space.id] || [];
  var taskCount = 0;
  var criticalCount = 0;
  var phaseSet = new Set();
  systems.forEach(function(systemKey) {
    var taskKey = space.id + '_' + systemKey;
    var tasks = (data.mepEditorTasks || {})[taskKey] || [];
    tasks.forEach(function(task) {
      taskCount += 1;
      if (task.critical) criticalCount += 1;
      if (task.phase) phaseSet.add(task.phase);
    });
  });
  return {
    systemCount: systems.length,
    taskCount: taskCount,
    criticalCount: criticalCount,
    phaseCount: phaseSet.size
  };
}

function getActiveSpacePreviewGroup(space) {
  var previewGroups = state.wizardPreview?.preview?.mepBySpace || [];
  var spaceLabel = String(space.label || "").replace(/（.*?）/g, "").trim();
  return previewGroups.find(function(group) {
    var groupLabel = String(group.label || "").trim();
    return groupLabel.includes(spaceLabel) || spaceLabel.includes(groupLabel) || groupLabel.includes(SPACE_LABELS[space.spaceType] || "");
  }) || null;
}

function getRelevantAuditChecksForSpace(data, space) {
  var checks = state.wizardPreview?.audit?.checks || [];
  var enabledSystems = data.mepEditorSystems?.[space.id] || [];
  var relevantIds = {
    basement: ["basement-coordination", "formal-power", "fire-linkage"],
    tower: ["highrise-elevator-coverage", "mep-scope-included", "formal-power", "fire-linkage"],
    public: ["ceiling-concealed-acceptance", "fire-linkage"],
    ceiling: ["ceiling-concealed-acceptance", "fire-linkage"],
    equipment: ["equipment-installation", "elevator-acceptance", "formal-power"],
    roof: ["equipment-installation", "formal-power"],
    outdoor: ["formal-power", "fire-linkage"],
    podium: ["mep-scope-included", "fire-linkage"]
  }[space.spaceType] || [];
  return checks.filter(function(check) {
    if (relevantIds.includes(check.id)) return true;
    if (enabledSystems.includes("fire") && check.id === "fire-linkage") return true;
    if (enabledSystems.includes("elevator") && check.id === "elevator-acceptance") return true;
    return false;
  });
}

function renderMepSpaceOverview(data, space) {
  var guide = getMepSpaceGuide(space.spaceType);
  var stats = getMepSpaceStats(data, space);
  var previewGroup = getActiveSpacePreviewGroup(space);
  var checks = getRelevantAuditChecksForSpace(data, space);
  return '<div class="mep-space-overview">' +
    '<div class="mep-space-overview-grid">' +
      '<div class="mini-card">' +
        '<span>作业面定位</span>' +
        '<strong>' + escapeHtml(SPACE_LABELS[space.spaceType] || space.label) + '</strong>' +
        '<p>' + escapeHtml(guide.description) + '</p>' +
      '</div>' +
      '<div class="mini-card">' +
        '<span>典型前置</span>' +
        '<strong>' + escapeHtml(guide.upstream) + '</strong>' +
        '<p>决定这个空间何时能插入施工。</p>' +
      '</div>' +
      '<div class="mini-card">' +
        '<span>后续移交</span>' +
        '<strong>' + escapeHtml(guide.downstream) + '</strong>' +
        '<p>决定这个空间后面要交给谁继续推进。</p>' +
      '</div>' +
      '<div class="mini-card">' +
        '<span>空间统计</span>' +
        '<strong>' + stats.systemCount + ' 系统 · ' + stats.phaseCount + ' 阶段</strong>' +
        '<p>' + stats.taskCount + ' 道工序，其中关键工序 ' + stats.criticalCount + ' 道。</p>' +
      '</div>' +
    '</div>' +
    '<div class="mep-space-split-grid">' +
      '<div class="panel surface-soft">' +
        '<div class="section-heading compact"><div><h3 class="section-title">空间生成预览</h3><span class="section-subtitle">后端编制引擎对当前作业空间生成的节点。</span></div></div>' +
        (previewGroup && previewGroup.items?.length
          ? '<div class="space-preview-list">' + previewGroup.items.slice(0, 10).map(function(item) {
              return '<div class="space-preview-item"><strong>' + escapeHtml(item.name) + '</strong>' +
                '<span>' + escapeHtml(item.plannedDate || item.system || '') + '</span></div>';
            }).join('') + '</div>'
          : '<p class="empty-note">当前空间尚未形成后端预览节点，请先选择系统或补齐工序。</p>') +
      '</div>' +
      '<div class="panel surface-soft">' +
        '<div class="section-heading compact"><div><h3 class="section-title">空间审核要点</h3><span class="section-subtitle">只展示与当前作业空间最相关的审核结果。</span></div></div>' +
        (checks.length
          ? '<div class="space-audit-list">' + checks.map(function(check) {
              return '<div class="space-audit-item ' + (check.passed ? 'passed' : check.severity === 'blocking' ? 'blocked' : 'warning') + '">' +
                '<strong>' + escapeHtml(check.title) + '</strong>' +
                '<p>' + escapeHtml(check.message) + '</p>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="empty-note">当前空间暂无独立审核项，后端会在生成总计划时统一校核。</p>') +
      '</div>' +
    '</div>' +
  '</div>';
}

function buildMepGeneratedNodes(data) {
  ensureMepConfigDefaults(data);
  var allNodes = [];
  (data.mepSpaces || []).forEach(function(space) {
    var spaceNodes = getMepSpaceNodes(data, space.id);
    allNodes = allNodes.concat(spaceNodes);
  });
  return allNodes;
}

// MEP_CONTROL_PACKAGE_DEFS removed — simplified to milestone nodes
function getMepControlPackageForNode(node) {
  var name = String(node.name || "");
  if (name.includes("调试") || name.includes("联调") || name.includes("验收") || name.includes("接入")) return "commission_acceptance";
  if (node.spaceId && node.spaceId.includes("basement")) return "basement_main";
  if (node.spaceId && node.spaceId.includes("tower")) {
    if (name.includes("预留") || name.includes("预埋")) return "tower_embed";
    if (name.includes("箱盒") || name.includes("配管") || name.includes("支管") || name.includes("穿线") || name.includes("末端") || name.includes("点位")) return "secondary_fixing";
    return "tower_roughin";
  }
  if (node.spaceId && (node.spaceId.includes("public") || node.spaceId.includes("ceiling"))) return "ceiling_concealed";
  if (node.spaceId && (node.spaceId.includes("equipment") || node.spaceId.includes("roof"))) return "equipment_finish";
  if (node.spaceId && node.spaceId.includes("outdoor")) return "commission_acceptance";
  return null;
}

function buildMepControlPackageNodes(data) {
  var groups = {};
  buildMepGeneratedNodes(data).forEach(function(node) {
    var packageId = getMepControlPackageForNode(node);
    if (!packageId || !MEP_CONTROL_PACKAGE_DEFS[packageId]) return;
    var entityName = String(node.areaLabel || node.area || "").trim();
    var isEntityScoped = entityName && (String(node.spaceId || "").includes("tower") || String(node.spaceId || "").includes("basement"));
    var key = packageId + ":" + (isEntityScoped ? entityName : String(node.spaceId || "mep"));
    if (!groups[key]) {
      groups[key] = {
        id: key,
        packageId: packageId,
        entityName: isEntityScoped ? entityName : "",
        area: entityName || SPACE_LABELS[node.spaceType] || "机电",
        systemSet: new Set(),
        critical: false,
        names: [],
        sourceNodes: []
      };
    }
    groups[key].systemSet.add(node.systemLabel || node.system || "机电");
    groups[key].critical = groups[key].critical || Boolean(node.critical);
    groups[key].names.push(node.name);
    groups[key].sourceNodes.push(node);
  });
  return Object.values(groups).map(function(group) {
    var def = MEP_CONTROL_PACKAGE_DEFS[group.packageId];
    var name = group.entityName ? group.entityName + " · " + def.label : def.label;
    return {
      id: "mep-control-" + group.id,
      name: name,
      owner: "机电工程师",
      critical: group.critical,
      trade: "机电",
      source: "mep-control-package",
      predecessor: def.upstream,
      startRule: def.upstream,
      agentHint: def.upstream + "；完成后移交 " + def.downstream + "。",
      system: Array.from(group.systemSet).join(" / "),
      area: group.area,
      packageId: group.packageId,
      packageLabel: def.label,
      packageUpstream: def.upstream,
      packageDownstream: def.downstream,
      detailCount: group.sourceNodes.length
    };
  }).sort(function(a, b) {
    return (MEP_CONTROL_PACKAGE_DEFS[a.packageId]?.sort || 999) - (MEP_CONTROL_PACKAGE_DEFS[b.packageId]?.sort || 999);
  });
}

function buildMepGeneratedRelations(data) {
  const nodes = buildMepGeneratedNodes(data);
  const hasNode = (name) => nodes.some((node) => node.name.includes(name));
  const relations = [];
  // Cross-space: unified coordination and commissioning relations
  if (hasNode("设备安装")) relations.push({ from: "设备基础移交 + 设备到货", to: "设备安装" });
  if (hasNode("系统联调")) relations.push({ from: "正式水电接入", to: "系统联调" });
  if (hasNode("消防联动调试")) relations.push({ from: "正式水电接入", to: "消防联动调试" });
  if (hasNode("消防联动调试")) relations.push({ from: "消防联动调试", to: "消防验收" });
  if (hasNode("电梯调试验收")) relations.push({ from: "电梯安装完成 + 正式电接入", to: "电梯调试验收" });
  // Check if any basement space has coordination enabled
  var hasBasementCoordination = (data.mepSpaces || []).some(function(s) {
    return s.spaceType === "basement" && (data.mepEditorConstraints[s.id] || []).includes("coordination");
  });
  if (hasBasementCoordination) relations.push({ from: "地下室结构完成", to: "地下室管综深化 / 支吊架 / 主管线" });
  return relations;
}

function mepConfigAllowsRelation(index, data) {
  // Simplified: All relations available when MEP lane is selected
  return true;
}

function makeMepNode(data, item) {
  // Keep for backward compatibility / external callers
  return {
    name: item.name,
    owner: item.owner || "机电工程师",
    critical: Boolean(item.critical),
    trade: "机电",
    source: "mep-generated",
    predecessor: item.predecessor || "",
    startRule: item.startRule || "",
    agentHint: item.agentHint || "",
    system: item.system || "mep",
    systemLabel: item.systemLabel || "机电" || "综合机电",
    area: item.area || "mep",
    areaLabel: item.areaLabel || "机电"
  };
}

function renderMasterScheduleTemplate() {
  const template = getMasterScheduleTemplate();
  const allNodes = template.lanes.flatMap((lane) => lane.nodes);
  const criticalCount = allNodes.filter((node) => node.critical).length;
  const mepCount = allNodes.filter((node) => node.trade === "机电").length;
  return `
    <section class="panel master-schedule-template fade-in">
      <div class="section-heading master-template-heading">
        <div>
          <h3 class="section-title">项目总控计划模板</h3>
          <span class="section-subtitle">土建是骨架，机电、装饰、室外和验收按穿插关系并入同一张总控计划。</span>
        </div>
        <div class="master-template-actions">
          <span class="status-badge normal">${template.lanes.length} 条主线</span>
          <button class="primary-button small" id="btn-start-master-plan" type="button">使用该模板编制</button>
        </div>
      </div>

      <div class="master-template-summary">
        <article><span>计划节点</span><strong>${allNodes.length}</strong><p>覆盖土建、机电、装饰、室外、验收</p></article>
        <article><span>机电节点</span><strong>${mepCount}</strong><p>作为总控计划专业分支</p></article>
        <article><span>关键节点</span><strong>${criticalCount}</strong><p>用于关键线路和验收链条</p></article>
        <article><span>穿插关系</span><strong>${template.relations.length}</strong><p>跨专业前后置约束</p></article>
      </div>

      <div class="master-template-layout">
        <div class="master-lane-list">
          ${template.lanes.map((lane) => `
            <article class="master-lane ${lane.id}">
              <header>
                <div>
                  <span class="trade-badge ${tradeBadgeClass(lane.trade)}">${lane.trade}</span>
                  <h4>${lane.title}</h4>
                </div>
                <small>${lane.nodes.length} 个节点</small>
              </header>
              <div class="master-node-table">
                <div class="master-node-row head">
                  <span style="width:80px">编码</span>
                  <span>节点名称</span>
                  <span>专业</span>
                  <span>责任角色</span>
                  <span>计划开始</span>
                  <span>计划完成</span>
                  <span>前置节点</span>
                  <span>关键</span>
                </div>
                ${lane.nodes.map((node) => `
                  <div class="master-node-row">
                    <span style="width:80px">${node.code ? '<code class="mep-task-code" style="font-size:10px">' + escapeHtml(node.code) + '</code>' : '<span style="color:var(--line);font-size:10px">—</span>'}</span>
                    <strong title="${escapeHtml(node.agentHint)}">${node.name}</strong>
                    <span><b class="trade-badge ${tradeBadgeClass(node.trade)}">${node.trade}</b></span>
                    <span>${node.owner}</span>
                    <span>${node.start}</span>
                    <span>${node.finish}</span>
                    <span title="${escapeHtml(node.predecessor)}">${node.predecessor}</span>
                    <span>${node.critical ? '<b class="critical-dot">关键</b>' : "一般"}</span>
                  </div>
                  <p class="master-agent-hint">${node.agentHint}</p>
                `).join("")}
              </div>
            </article>
          `).join("")}
        </div>

        <aside class="master-relation-panel">
          <div class="section-heading compact">
            <h3 class="section-title">跨专业穿插关系</h3>
            <span>默认规则</span>
          </div>
          <div class="master-relation-list">
            ${template.relations.map((relation) => `
              <article>
                <strong>${relation.from}</strong>
                <span>→</span>
                <strong>${relation.to}</strong>
                <p>${relation.note}</p>
              </article>
            `).join("")}
          </div>
          <div class="agent-review-panel">
            <strong>进度 Agent 模板审核</strong>
            ${template.agentReviews.map((review) => `<p>${review}</p>`).join("")}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderWizardSteps() {
  const labels = ["项目范围", "专业模板", "工序编辑", "施工顺序", "穿插关系", "日历约束", "里程碑资源", "生成结果"];
  const current = state.planWizard.step;
  return `
    <div class="wizard-steps" aria-label="进度计划编制步骤">
      ${labels.map((label, index) => {
        const step = index + 1;
        const className = step === current ? "active" : step < current ? "done" : "";
        return `<div class="wizard-step-indicator ${className}"><span>${step}</span>${label}</div>`;
      }).join("")}
    </div>
  `;
}

function renderWizardHeader(title, countText) {
  return `
    <div class="section-heading wizard-heading">
      <div>
        <h3 class="section-title">${title}</h3>
        <span class="section-subtitle">Project 模式向导式编制</span>
      </div>
      <span class="wizard-count">${countText}</span>
    </div>
  `;
}

function renderWizardActions({ prev = true, nextText = "下一步 →", nextId = "btn-wizard-next", cancel = false } = {}) {
  return `
    <div class="auto-plan-actions wizard-actions">
      <div>
        ${cancel ? `<button class="secondary-button" id="btn-back-schedule" type="button">取消</button>` : ""}
        ${prev ? `<button class="secondary-button" id="btn-wizard-prev" type="button">← 上一步</button>` : ""}
      </div>
      <button class="primary-button" id="${nextId}" type="button">${nextText}</button>
    </div>
  `;
}

function renderWizardField({ id, field, label, value, type = "text", min, max, suffix = "", placeholder = "" }) {
  return `
    <div class="form-group">
      <label for="${id}">${label}</label>
      <div class="wizard-inline-input">
        <input id="${id}" class="wizard-field" data-wizard-field="${field}" data-wizard-type="${type === "number" ? "number" : "string"}" type="${type}" value="${escapeHtml(value)}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} placeholder="${escapeHtml(placeholder)}" />
        ${suffix ? `<span>${suffix}</span>` : ""}
      </div>
    </div>
  `;
}

function renderWizardSelect({ id, field, label, value, options }) {
  return `
    <div class="form-group">
      <label for="${id}">${label}</label>
      <select id="${id}" class="wizard-field" data-wizard-field="${field}" data-wizard-type="string">
        ${options.map((option) => `<option value="${option.value}" ${option.value === value ? "selected" : ""}>${option.label}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderWizardTextarea({ id, field, label, value, rows = 4, placeholder = "" }) {
  return `
    <div class="form-group">
      <label for="${id}">${label}</label>
      <textarea id="${id}" class="wizard-field" data-wizard-field="${field}" data-wizard-type="string" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function renderWizardCheckbox({ field, label, checked }) {
  return `
    <label class="wizard-checkbox">
      <input class="wizard-field" data-wizard-field="${field}" data-wizard-type="boolean" type="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function ensureMasterWizardDefaults(data) {
  const template = getMasterScheduleTemplate();
  if (!Array.isArray(data.selectedMasterLanes) || !data.selectedMasterLanes.length) {
    data.selectedMasterLanes = template.lanes.map((lane) => lane.id);
  }
  if (!Array.isArray(data.expandedMasterLanes)) {
    data.expandedMasterLanes = ["prep", "mep"];
  }
  ensureMasterLaneEdits(data);
  ensureMepConfigDefaults(data);
  ensureWizardTemplateCandidates(data);
  syncTemplatesFromMasterLanes(data);
  syncRelationsFromMasterLanes(data, { addMissing: !Array.isArray(data.enabledMasterRelations) });
}

function renderMepOptionGroup(title, description, group, options, selectedValues) {
  return `
    <section class="mep-config-group">
      <header>
        <strong>${title}</strong>
        <span>${description}</span>
      </header>
      <div class="mep-option-grid">
        ${options.map((option) => {
          const checked = selectedValues.includes(option.value);
          return `
            <label class="mep-option-card ${checked ? "selected" : ""}">
              <input class="mep-config-checkbox" type="checkbox" data-mep-group="${group}" value="${option.value}" ${checked ? "checked" : ""} />
              <span>${option.label}</span>
              <small>${option.note}</small>
            </label>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function buildMepSpaceAllTaskOptions(data, spaceId, excludeSystemKey) {
  // Build a list of all tasks from all enabled systems in this space for predecessor selection
  var options = [];
  var systems = data.mepEditorSystems[spaceId] || [];
  systems.forEach(function(sys) {
    var tKey = spaceId + '_' + sys;
    var tasks = (data.mepEditorTasks || {})[tKey] || [];
    tasks.forEach(function(t, ti) {
      var label = '[' + (MEP_SYSTEM_LABELS[sys] || sys) + '] ';
      if (t.phase) label += t.phase + ' / ';
      label += (t.name || '工序' + (ti + 1));
      options.push({ value: sys + '/' + ti, label: label });
    });
  });
  return options;
}

function renderPhaseHeader(phaseName, taskCount) {
  return '<div class="mep-phase-header" style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin:8px 0 4px 0;background:rgba(37,99,235,0.06);border-left:3px solid var(--blue);border-radius:4px;font-size:12px;font-weight:600;color:var(--ink)">' +
    '<span>' + escapeHtml(phaseName) + '</span>' +
    '<span style="font-size:10px;color:var(--muted);font-weight:400">' + taskCount + '道</span>' +
  '</div>';
}

function renderMepSystemTaskChain(data, spaceId, systemKey) {
  var taskKey = spaceId + '_' + systemKey;
  var tasks = (data.mepEditorTasks || {})[taskKey] || [];
  var systemLabel = MEP_SYSTEM_LABELS[systemKey] || systemKey;
  var allTaskOptions = buildMepSpaceAllTaskOptions(data, spaceId, systemKey);

  // Group tasks by phase
  var phaseGroups = {};
  var phaseOrder = {};
  tasks.forEach(function(task, idx) {
    var p = task.phase || '';
    if (!phaseGroups[p]) {
      phaseGroups[p] = [];
      phaseOrder[p] = task.phaseOrder || 0;
    }
    phaseGroups[p].push({ task: task, idx: idx });
  });

  // Get sorted phase keys
  var phaseKeys = Object.keys(phaseGroups).sort(function(a, b) {
    return (phaseOrder[a] || 0) - (phaseOrder[b] || 0) || (a || '').localeCompare(b || '');
  });

  var chainHtml = '';
  phaseKeys.forEach(function(pKey) {
    var items = phaseGroups[pKey] || [];
    // Render phase header if key is not empty
    if (pKey) {
      chainHtml += renderPhaseHeader(pKey, items.length);
    }
    // Render tasks in this phase
    items.forEach(function(item) {
      var task = item.task;
      var idx = item.idx;
      chainHtml += '<div class="mep-task-node">' +
        '<div class="mep-task-node-header">' +
          (task.critical ? '<span class="critical-dot" title="关键工序">🔴</span>' : '<span class="normal-dot" title="一般工序">⚪</span>') +
          '<input class="mep-task-name" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="name" value="' + escapeHtml(task.name) + '" style="flex:1;border:none;background:transparent;font-size:13px;padding:2px 4px" placeholder="工序名称" />' +
          '<input class="mep-task-duration" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="durationDays" type="number" value="' + (task.durationDays || 3) + '" min="1" style="width:40px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;font-size:12px;text-align:center" />' +
          '<span style="font-size:11px;color:var(--muted)">天</span>' +
          '<label style="font-size:11px;display:flex;align-items:center;gap:2px" title="标记为关键工序"><input type="checkbox" class="mep-task-critical" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="critical" ' + (task.critical ? 'checked' : '') + ' style="width:12px;height:12px" />关键</label>' +
          '<button class="secondary-button small" type="button" data-remove-mep-task="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px" title="删除此工序">✕</button>' +
        '</div>' +
        '<div class="mep-task-meta" style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:24px">' +
          '<label style="font-size:11px;display:flex;align-items:center;gap:4px;color:var(--muted)">插入条件：' +
            '<input class="mep-task-insert-condition" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="constrainedBy" value="' + escapeHtml(task.constrainedBy || '') + '" style="width:120px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:11px" placeholder="如：砌体/ALC完成" />' +
          '</label>' +
          '<label style="font-size:11px;display:flex;align-items:center;gap:4px;color:var(--muted)">紧前工序：' +
            '<select class="mep-task-predecessor" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="predecessor" style="font-size:11px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;max-width:200px">' +
              '<option value="">—</option>' +
              allTaskOptions.map(function(opt) {
                var selected = task.predecessor === opt.value || task.predecessor === opt.label ? 'selected' : '';
                return '<option value="' + escapeHtml(opt.value) + '" ' + selected + '>' + escapeHtml(opt.label) + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<label style="font-size:11px;display:flex;align-items:center;gap:4px;color:var(--muted)">逻辑关系：' +
            '<select class="mep-task-relationship" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="relationship" style="font-size:11px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;width:64px">' +
              ["FS", "SS", "FF", "SF"].map(function(rel) {
                var selected = (task.relationship || "FS") === rel ? "selected" : "";
                return '<option value="' + rel + '" ' + selected + '>' + rel + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<label style="font-size:11px;display:flex;align-items:center;gap:4px;color:var(--muted)">时差：' +
            '<input class="mep-task-lag" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" data-task-index="' + idx + '" data-field="lagDays" type="number" value="' + (Number(task.lagDays) || 0) + '" style="width:52px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:11px" />' +
            '<span>天</span>' +
          '</label>' +
        '</div>' +
      '</div>';
    });
  });
  if (!tasks.length) chainHtml = '<p class="empty-note" style="font-size:12px;margin:4px 0">未添加工序，点击下方按钮添加。</p>';
  var isExpanded = data.mepSpaceExpanded && data.mepSpaceExpanded[spaceId + '_' + systemKey];
  var isEnabled = (data.mepEditorSystems[spaceId] || []).includes(systemKey);
  return '<div class="mep-system-chain ' + (isEnabled ? 'enabled' : 'disabled') + '" data-mep-system-panel="' + escapeHtml(spaceId) + '_' + systemKey + '">' +
    '<div class="mep-system-chain-header" data-mep-toggle-chain="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 10px;background:var(--surface-soft);border-radius:6px;margin-bottom:4px;user-select:none">' +
      '<span style="font-size:10px;color:var(--muted);transition:transform 0.2s">' + (isExpanded ? '▼' : '▶') + '</span>' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="mep-system-toggle" data-mep-space="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" ' + (isEnabled ? 'checked' : '') + ' style="width:14px;height:14px" />' +
        '<strong style="font-size:13px">' + MEP_SYSTEM_LABELS[systemKey] + '</strong>' +
      '</label>' +
      '<span style="font-size:11px;color:var(--muted);margin-left:auto">' + tasks.length + '道工序</span>' +
    '</div>' +
    (isExpanded ? '<div class="mep-system-chain-body" style="padding:4px 10px 10px 10px">' +
      chainHtml +
      '<button class="secondary-button small" type="button" data-add-mep-task="' + escapeHtml(spaceId) + '" data-mep-system="' + systemKey + '" style="font-size:11px;margin-top:4px">+ 添加工序</button>' +
    '</div>' : '') +
  '</div>';
}

function renderMepConstraintCards(space) {
  var options = (space.constraints || []).map(function(key) {
    return { value: key, ...(MEP_CONSTRAINT_LABELS[key] || { label: key, note: "" }) };
  });
  if (!options.length) return '';
  var selected = state.planWizard.data.mepEditorConstraints?.[space.id] || [];
  return '<div class="wizard-subsection" style="margin-top:12px">' +
    '<div class="section-heading compact"><div><h3 class="section-title">空间约束</h3><span class="section-subtitle">这些约束会进入后端编制引擎与 Agent 预审。</span></div></div>' +
    '<div class="mep-option-grid">' +
      options.map(function(option) {
        var checked = selected.includes(option.value);
        return '<label class="mep-option-card ' + (checked ? 'selected' : '') + '">' +
          '<input class="mep-space-constraint" type="checkbox" data-mep-space="' + escapeHtml(space.id) + '" value="' + escapeHtml(option.value) + '" ' + (checked ? 'checked' : '') + ' />' +
          '<span>' + escapeHtml(option.label) + '</span>' +
          '<small>' + escapeHtml(option.note) + '</small>' +
        '</label>';
      }).join('') +
    '</div>' +
  '</div>';
}

function renderMepDependencySummary(data, space) {
  var selectedSystems = data.mepEditorSystems[space.id] || [];
  var rows = [];
  selectedSystems.forEach(function(systemKey) {
    var taskKey = space.id + '_' + systemKey;
    var tasks = (data.mepEditorTasks || {})[taskKey] || [];
    tasks.forEach(function(task) {
      rows.push({
        systemLabel: MEP_SYSTEM_LABELS[systemKey] || systemKey,
        name: task.name || '',
        predecessor: task.predecessor || '—',
        relationship: task.relationship || 'FS',
        lagDays: Number(task.lagDays) || 0,
        constrainedBy: task.constrainedBy || '—'
      });
    });
  });
  return '<div class="wizard-subsection" style="margin-top:12px">' +
    '<div class="section-heading compact"><div><h3 class="section-title">空间内工序依赖</h3><span class="section-subtitle">按当前空间汇总每道工序的前后逻辑和插入条件。</span></div></div>' +
    (rows.length ? '<div class="template-task-list">' +
      '<div style="display:grid;grid-template-columns:100px minmax(180px,1.2fr) minmax(180px,1fr) 70px 70px minmax(120px,1fr);gap:8px;color:var(--muted);font-size:12px;padding:0 8px 6px 8px"><span>系统</span><span>工序</span><span>紧前工序</span><span>关系</span><span>时差</span><span>插入条件</span></div>' +
      rows.map(function(row) {
        return '<div style="display:grid;grid-template-columns:100px minmax(180px,1.2fr) minmax(180px,1fr) 70px 70px minmax(120px,1fr);gap:8px;padding:8px;border:1px solid var(--line);border-radius:6px">' +
          '<strong>' + escapeHtml(row.systemLabel) + '</strong>' +
          '<span>' + escapeHtml(row.name) + '</span>' +
          '<span>' + escapeHtml(row.predecessor) + '</span>' +
          '<span>' + escapeHtml(row.relationship) + '</span>' +
          '<span>' + row.lagDays + '天</span>' +
          '<span>' + escapeHtml(row.constrainedBy) + '</span>' +
        '</div>';
      }).join('') +
    '</div>' : '<p class="empty-note">当前空间暂无启用工序。</p>') +
  '</div>';
}

function getFinishAreaGroups(tasks) {
  return [
    {
      area: '地下室装修',
      scope: '地下室车库、设备房、通道及功能房间',
      template: '地下室装修模板',
      condition: '地下室结构完成、防水/回填及机电主管线条件满足'
    },
    {
      area: '主体楼栋公区装修',
      scope: '楼梯间、电梯厅、走道、公共前室、管井外公区',
      template: '主体楼栋公区装修模板',
      condition: '二次结构完成、公区机电隐蔽验收及样板确认'
    },
    {
      area: '户内装修',
      scope: '住宅户内墙面、地面、门窗及末端安装',
      template: '户内装修模板',
      condition: '户内砌体/抹灰基层移交、机电二次配管及箱盒条件满足'
    },
    {
      area: '商业装修',
      scope: '商业裙楼、公区商业、商业配套及公共区域',
      template: '商业装修模板',
      condition: '商业结构/砌体移交，招商/精装界面及机电主管线条件明确'
    },
    {
      area: '外墙装修',
      scope: '主体楼栋外立面、商业外立面、外窗洞口及外墙基层',
      template: '外墙装修模板',
      condition: '主体结构/外墙基层移交，吊篮/脚手架及外窗洞口条件满足'
    }
  ];
}

function renderFinishScopeSelectInline(data, tplId, tasks) {
  var project = getActiveProject();
  var buildings = project?.buildings || [];
  var basement = project?.basement?.levels || [];
  var groups = getFinishAreaGroups(tasks);
  if (!data.finishAreaTemplates) data.finishAreaTemplates = {};
  groups.forEach(function(group) {
    if (!data.finishAreaTemplates[group.area]) data.finishAreaTemplates[group.area] = group.template;
  });
  var areaEntities = {
    '地下室装修': basement.length ? basement.map(function(l) { return l.name; }).join('、') : '地下室区域',
    '主体楼栋公区装修': buildings.filter(function(b) { return !String(b.name || '').includes('商业'); }).map(function(b) { return b.name; }).join('、') || '主体楼栋公区',
    '户内装修': buildings.filter(function(b) { return !String(b.name || '').includes('商业'); }).map(function(b) { return b.name; }).join('、') || '住宅户内',
    '商业装修': buildings.filter(function(b) { return String(b.name || '').includes('商业'); }).map(function(b) { return b.name; }).join('、') || '商业区域',
    '外墙装修': buildings.map(function(b) { return b.name; }).join('、') || '全部外立面'
  };
  return '<div style="margin:8px 0 0 28px;padding:10px 12px;background:var(--surface-soft);border-radius:8px">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<span style="font-size:11px;color:var(--muted);background:var(--surface);padding:1px 6px;border-radius:4px">作业区域模板选择</span>' +
      '<strong style="font-size:14px;font-weight:600;color:var(--ink)">第 2 步仅选择区域/楼栋对应的装修模板</strong>' +
      '<span style="font-size:11px;color:var(--muted)">具体装修工序在第 3 步编辑</span>' +
    '</div>' +
    groups.map(function(group) {
      var collapsedKey = 'finish-area:' + group.area;
      var collapsed = isMepCollapsed(data, collapsedKey);
      var current = data.finishAreaTemplates[group.area] || group.template;
      return '<div style="border:1px solid var(--line);border-radius:8px;margin:8px 0;background:var(--surface);overflow:hidden">' +
        '<div class="mep-collapsible-header" data-mep-collapse-key="' + escapeHtml(collapsedKey) + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface);cursor:pointer;user-select:none">' +
          '<span style="font-size:12px;color:var(--muted)">' + mepCollapseArrow(collapsed) + '</span>' +
          '<strong style="font-size:13px;color:var(--ink)">' + escapeHtml(group.area) + '</strong>' +
          '<span style="font-size:11px;color:var(--muted)">选择装修模板</span>' +
        '</div>' +
        (collapsed ? '' : '<div style="padding:8px 10px;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,1.2fr) minmax(220px,1.2fr);gap:10px;align-items:center;font-size:12px">' +
          '<div><span style="color:var(--muted)">适用楼栋/区域</span><br><strong style="font-size:13px">' + escapeHtml(areaEntities[group.area] || group.scope) + '</strong></div>' +
          '<label><span style="color:var(--muted)">装修模板</span><br>' +
            '<select class="finish-area-template-select" data-finish-area="' + escapeHtml(group.area) + '" style="width:100%;min-height:30px;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px">' +
              ['不纳入', group.template].map(function(option) {
                var selected = option === current ? ' selected' : '';
                return '<option value="' + escapeHtml(option) + '"' + selected + '>' + escapeHtml(option) + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<div><span style="color:var(--muted)">插入条件</span><br><span style="color:var(--muted)">' + escapeHtml(group.condition) + '</span></div>' +
        '</div>') +
      '</div>';
    }).join('') +
  '</div>';
}


function renderMepScopeSelectInline(data) {
  ensureMepConfigDefaults(data);
  var spaces = data.mepSpaces || [];
  return '<div class="mep-inline-config" style="margin-top:8px">' +
    '<div class="section-heading compact"><div><h3 class="section-title">机电工作范围选择</h3>' +
    '<span class="section-subtitle">本步只选择机电安装工程纳入哪些工作区域和系统；具体工序名称、工期、前置工作和逻辑关系在第 3 步编制。</span></div></div>' +
    '<div class="template-selection-grid">' +
      spaces.map(function(space) {
        var selectedSystems = data.mepEditorSystems?.[space.id] || [];
        return '<div class="template-row" style="padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:8px">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:11px;color:var(--muted);background:var(--surface-soft);padding:1px 6px;border-radius:4px">工作区域</span>' +
            '<strong style="font-size:14px;font-weight:600;color:var(--ink);line-height:1.4">' + escapeHtml(space.label) + '</strong>' +
            '<span style="font-size:11px;color:var(--green)">已选 ' + selectedSystems.length + ' 个系统</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;margin-left:0">' +
            Object.keys(MEP_SYSTEM_LABELS).map(function(systemKey) {
              var enabled = selectedSystems.includes(systemKey);
              return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 8px;border:1px solid var(--line);border-radius:999px;background:' + (enabled ? 'rgba(37,99,235,0.08)' : 'var(--surface)') + ';cursor:pointer">' +
                '<input type="checkbox" class="mep-system-toggle" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + systemKey + '" ' + (enabled ? 'checked' : '') + ' />' +
                '<span>' + escapeHtml(MEP_SYSTEM_LABELS[systemKey]) + '</span>' +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function renderMepDeepeningInline(data) {
  ensureMepConfigDefaults(data);
  var spaces = data.mepSpaces || [];
  var collapsedKey = 'mep-root';
  var collapsed = isMepCollapsed(data, collapsedKey);
  return `
    <div class="mep-inline-config">
      <div class="section-heading compact mep-collapsible-header" data-mep-collapse-key="${collapsedKey}" style="cursor:pointer;user-select:none">
        <div>
          <h3 class="section-title"><span style="font-size:12px;color:var(--muted);margin-right:6px">${mepCollapseArrow(collapsed)}</span>机电安装工程深化编制</h3>
          <span class="section-subtitle">默认按总控控制包编制，体现各作业空间何时插入、何时具备移交条件、何时完成收口。系统细工序保留在专业深化依据中。</span>
        </div>
      </div>

      ${collapsed ? '' : `<div class="mep-area-list">
        ${spaces.map(function(space) {
          return renderMepSpacePanel(data, space);
        }).join('') || '<p class="empty-note">当前项目范围尚未生成机电工作区域。</p>'}
      </div>`}
    </div>
  `;
}

function buildMepGeneratedPreviewBySpace(data) {
  var bySpace = {};
  buildMepGeneratedNodes(data).forEach(function(node) {
    var label = node.area || node.spaceLabel || node.areaName || '机电空间';
    if (!bySpace[label]) bySpace[label] = [];
    bySpace[label].push({
      id: node.id || label + '-' + bySpace[label].length,
      name: node.name,
      system: node.system,
      plannedDate: node.plannedDate || "",
      critical: node.critical
    });
  });
  return Object.keys(bySpace).map(function(label) {
    return { label: label, items: bySpace[label] };
  });
}

function isMepCollapsed(data, key) {
  return Boolean(data.mepCollapsed && data.mepCollapsed[key]);
}

function mepCollapseArrow(collapsed) {
  return collapsed ? '▶' : '▼';
}

// 系统Key → 编码前缀映射
var MEP_SYSTEM_TO_CODE = {
  plumbing: 'PD', electrical: 'EL', fire: 'FP', hvac: 'HV', weak: 'BA', elevator: 'EL'
};

// 按工序名称匹配编码（模糊匹配）
function matchProcessCode(systemKey, taskName) {
  var sysCode = MEP_SYSTEM_TO_CODE[systemKey] || '';
  if (!sysCode || !taskName) return '';
  var name = String(taskName).trim();
  // 给排水系统
  if (sysCode === 'PD') {
    if (name.includes('防水套管')) return 'PD.01.01';
    if (name.includes('给水主干')) return 'PD.02.01';
    if (name.includes('排水主干')) return 'PD.02.02';
    if (name.includes('给水支管')) return 'PD.02.03';
    if (name.includes('排水支管')) return 'PD.02.04';
    if (name.includes('管道试压')) return 'PD.02.05';
    if (name.includes('水泵') || name.includes('潜污泵')) return 'PD.03.01';
    if (name.includes('试压') || name.includes('冲洗')) return 'PD.04.01';
    // 消防任务已移至 fire 系统，不再归入给排水
  }
  // 电气系统
  if (sysCode === 'EL') {
    if (name.includes('接地网') || name.includes('防雷')) return 'EL.01.01';
    if (name.includes('线管') || (name.includes('预埋') && !name.includes('接地') && !name.includes('防雷'))) return 'EL.01.02';
    if (name.includes('桥架')) return 'EL.02.01';
    if (name.includes('线缆') || name.includes('穿线') || name.includes('电缆')) return 'EL.03.01';
    if (name.includes('配电房') || name.includes('配电箱') || name.includes('配电柜')) return 'EL.04.01';
    if (name.includes('开关') || name.includes('插座')) return 'EL.05.01';
    if (name.includes('灯具') || name.includes('照明')) return 'EL.05.02';
    if (name.includes('调试')) return 'EL.06.01';
  }
  // 暖通系统
  if (sysCode === 'HV') {
    if (name.includes('风管')) return 'HV.01.01';
    if (name.includes('空调水管')) return 'HV.02.01';
    if (name.includes('风机盘管')) return 'HV.03.01';
    if (name.includes('空调设备') || name.includes('通风设备') || name.includes('通风空调') || name.includes('风机') && !name.includes('盘管')) return 'HV.03.02';
    if (name.includes('防排烟') || name.includes('排烟')) return 'HV.04.01';
    if (name.includes('调试')) return 'HV.04.02';
  }
  // 消防系统
  if (sysCode === 'FP') {
    if (name.includes('消火栓')) return 'FP.01.01';
    if (name.includes('喷淋')) return 'FP.02.01';
    if (name.includes('消防联动') || name.includes('联动')) return 'FP.02.01';
    if (name.includes('消防环管')) return 'FP.01.01';
    if (name.includes('消防设备') || name.includes('消防泵')) return 'FP.02.01';
    if (name.includes('消防末端') || name.includes('喷头') || name.includes('探测器')) return 'FP.02.01';
  }
  // 智能化系统
  if (sysCode === 'BA') {
    if (name.includes('预埋') || name.includes('管线')) return 'BA.01.01';
    if (name.includes('设备')) return 'BA.02.01';
  }
  return '';
}

function renderMepAreaTaskMatrix(data, space) {
  var selectedSystems = data.mepEditorSystems?.[space.id] || [];
  var rows = [];
  selectedSystems.forEach(function(systemKey) {
    var taskKey = space.id + '_' + systemKey;
    var tasks = (data.mepEditorTasks || {})[taskKey] || [];
    tasks.forEach(function(task, index) {
      var code = matchProcessCode(systemKey, task.name);
      rows.push({
        systemKey: systemKey,
        systemLabel: MEP_SYSTEM_LABELS[systemKey] || systemKey,
        index: index,
        code: code,
        parentCode: code ? code.split('.').slice(0,2).join('.') : '',
        name: task.name || '',
        durationDays: Number(task.durationDays) || 3,
        predecessor: task.predecessor || '',
        relationship: task.relationship || 'FS',
        lagDays: Number(task.lagDays) || 0,
        constrainedBy: task.constrainedBy || '',
        critical: Boolean(task.critical)
      });
    });
  });
  // 编码列宽自适应：有编码时加宽，无编码时缩减
  var hasCodes = rows.some(function(r) { return r.code; });
  var codeColWidth = hasCodes ? '80px' : '0px';
  var codeColDisplay = hasCodes ? '' : 'display:none';
  var header = '<div style="display:grid;grid-template-columns:' + codeColWidth + ' minmax(160px,1.2fr) 70px minmax(160px,1fr) 66px 58px minmax(130px,1fr) 54px;gap:8px;align-items:center;padding:8px 10px;background:var(--surface-soft);font-size:12px;font-weight:600;color:var(--muted);min-width:880px">' +
    '<span style="' + codeColDisplay + '">编码</span>' +
    '<span>工序名称</span><span>工期</span><span>前置工作</span><span>关系</span><span>时差</span><span>插入/约束条件</span><span>关键</span>' +
  '</div>';
  var systemHtml = selectedSystems.map(function(systemKey) {
    var systemRows = rows.filter(function(row) { return row.systemKey === systemKey; });
    var collapsedKey = 'system:' + space.id + ':' + systemKey;
    var collapsed = isMepCollapsed(data, collapsedKey);
    return '<div class="mep-system-section" style="border:1px solid var(--line);border-radius:8px;margin:8px 0;background:var(--surface);overflow:hidden">' +
      '<div class="mep-collapsible-header" data-mep-collapse-key="' + escapeHtml(collapsedKey) + '" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface-soft);cursor:pointer;user-select:none">' +
        '<span style="font-size:12px;color:var(--muted)">' + mepCollapseArrow(collapsed) + '</span>' +
        '<strong>' + escapeHtml(MEP_SYSTEM_LABELS[systemKey] || systemKey) + '</strong>' +
        '<span style="font-size:12px;color:var(--muted)">' + systemRows.length + ' 道工序</span>' +
      '</div>' +
      (collapsed ? '' : '<div style="overflow:auto">' + header + systemRows.map(function(row) {
        var hasCodesForRow = Boolean(row.code);
        var codeCell = hasCodesForRow
          ? '<code class="mep-task-code" style="font-size:11px;font-weight:600;color:var(--blue);white-space:nowrap;cursor:pointer" title="' + escapeHtml(row.code) + ' · ' + escapeHtml(row.parentCode) + ' 组">' + escapeHtml(row.code) + '</code>'
          : '<span style="color:var(--line);font-size:10px">—</span>';
        return '<div style="display:grid;grid-template-columns:80px minmax(160px,1.2fr) 70px minmax(160px,1fr) 66px 58px minmax(130px,1fr) 54px;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid var(--line);font-size:12px;min-width:880px">' +
          '<div style="display:flex;align-items:center;gap:4px;min-width:0">' + codeCell + '</div>' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<input class="mep-task-name" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="name" value="' + escapeHtml(row.name) + '" style="flex:1;min-width:80px;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px" />' +
          '</div>' +
          '<input class="mep-task-duration" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="durationDays" type="number" min="1" value="' + row.durationDays + '" style="width:54px;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px" />' +
          '<select class="mep-task-predecessor" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="predecessor" style="width:100%;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px">' +
            '<option value="">无前置</option>' +
            rows.filter(function(opt) { return !(opt.systemKey === row.systemKey && opt.index === row.index); }).map(function(opt) {
              var val = opt.systemKey + '/' + opt.index;
              var selected = row.predecessor === val || row.predecessor === opt.name ? 'selected' : '';
              var optCode = opt.code ? ' ' + opt.code : '';
              return '<option value="' + escapeHtml(val) + '" ' + selected + '>[' + escapeHtml(opt.systemLabel) + '] ' + escapeHtml(opt.name) + '<span style="color:var(--blue);font-size:10px;margin-left:4px">' + escapeHtml(optCode) + '</span></option>';
            }).join('') +
          '</select>' +
          '<select class="mep-task-relationship" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="relationship" style="width:60px;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px">' +
            ['FS','SS','FF','SF'].map(function(rel) { return '<option value="' + rel + '" ' + ((row.relationship || 'FS') === rel ? 'selected' : '') + '>' + rel + '</option>'; }).join('') +
          '</select>' +
          '<input class="mep-task-lag" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="lagDays" type="number" value="' + row.lagDays + '" style="width:50px;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px" />' +
          '<input class="mep-task-insert-condition" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="constrainedBy" value="' + escapeHtml(row.constrainedBy) + '" placeholder="如：结构完成/管综深化" style="width:100%;border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px" />' +
          '<label style="display:flex;align-items:center;gap:3px;font-size:11px"><input type="checkbox" class="mep-task-critical" data-mep-space="' + escapeHtml(space.id) + '" data-mep-system="' + row.systemKey + '" data-task-index="' + row.index + '" data-field="critical" ' + (row.critical ? 'checked' : '') + ' />关键</label>' +
        '</div>';
      }).join('') + '</div>') +
    '</div>';
  }).join('');
  return '<div class="wizard-subsection mep-area-task-matrix" style="margin:12px 0">' +
    '<div class="section-heading compact">' +
      '<div>' +
        '<h3 class="section-title">工作区域工序明细</h3>' +
        '<span class="section-subtitle">按系统分组展示，可折叠；体现工序、工期、前置工作、逻辑关系、时差与插入条件。</span>' +
      '</div>' +
      '<span style="font-size:12px;color:var(--muted)">' + selectedSystems.length + ' 系统 · ' + rows.length + ' 道工序</span>' +
    '</div>' +
    (rows.length ? systemHtml : '<p class="empty-note">当前工作区域暂无启用工序。请先勾选系统或添加工序。</p>') +
  '</div>';
}

function renderMepSpacePanel(data, space) {
  var selectedSystems = data.mepEditorSystems[space.id] || [];
  var totalTasks = 0;
  selectedSystems.forEach(function(sys) {
    var taskKey = space.id + '_' + sys;
    var tasks = (data.mepEditorTasks || {})[taskKey] || [];
    totalTasks += tasks.length;
  });
  var collapsedKey = 'space:' + space.id;
  var collapsed = isMepCollapsed(data, collapsedKey);
  var controlPackages = buildMepControlPackageNodes(data).filter(function(node) {
    if (String(space.id || "").includes("tower") || String(space.id || "").includes("basement")) {
      return node.area === space.label || node.name.startsWith(space.label + " ·");
    }
    if (String(space.id || "").includes("public") || String(space.id || "").includes("ceiling")) return node.packageId === "ceiling_concealed";
    if (String(space.id || "").includes("equipment") || String(space.id || "").includes("roof")) return node.packageId === "equipment_finish" || node.packageId === "commission_acceptance";
    if (String(space.id || "").includes("outdoor")) return node.packageId === "commission_acceptance";
    return false;
  });
  return '<div class="mep-space-panel" data-mep-space-panel="' + escapeHtml(space.id) + '">' +
    '<div class="mep-space-panel-header mep-collapsible-header" data-mep-collapse-key="' + escapeHtml(collapsedKey) + '" style="cursor:pointer;user-select:none">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:12px;color:var(--muted)">' + mepCollapseArrow(collapsed) + '</span>' +
        '<strong style="font-size:15px">' + escapeHtml(space.label) + '</strong>' +
        '<span style="font-size:12px;color:var(--muted);margin-left:8px">' + selectedSystems.length + '个系统 · ' + totalTasks + '道工序</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:11px;color:var(--muted)">穿插方式：' + ({
          basementStructureSyncAndAfter: '结构同步预留预埋 + 结构后安装调试',
          lagFloors: '主体滞后插入',
          podiumAfterStructure: '裙房结构后插入',
          publicAreaAfterMasonry: '公区样板后插入',
          ceilingBeforeClose: '吊顶封板前完成',
          equipmentConstructed: '设备基础移交后',
          roofStructure: '屋面结构后',
          outdoorAfterBackfill: '室外回填后接驳'
        }[space.insertionPolicy] || space.insertionPolicy) + '</span>' +
      '</div>' +
    '</div>' +
    (collapsed ? '' :
      renderMepSpaceOverview(data, space) +
      '<div class="wizard-subsection" style="margin-top:12px">' +
        '<div class="section-heading compact"><div><h3 class="section-title">总控控制包</h3><span class="section-subtitle">总控计划默认只输出这些节点，既保留插入点，也保留完成与收口节点。</span></div><span style="font-size:12px;color:var(--muted)">' + controlPackages.length + ' 个控制包</span></div>' +
        (controlPackages.length
          ? '<div class="template-selection-grid">' + controlPackages.map(function(pkg) {
              return '<div class="template-row" style="padding:12px;border-radius:8px;background:var(--surface);border:1px solid var(--line)">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
                  '<strong style="font-size:14px;line-height:1.4">' + escapeHtml(pkg.packageLabel) + '</strong>' +
                  '<span style="font-size:11px;color:var(--muted)">' + escapeHtml(pkg.detailCount + ' 道专业工序汇总') + '</span>' +
                '</div>' +
                '<p style="margin:8px 0 4px;font-size:12px;color:var(--ink-soft)">插入条件：' + escapeHtml(pkg.packageUpstream || '-') + '</p>' +
                '<p style="margin:0 0 4px;font-size:12px;color:var(--ink-soft)">完成移交：' + escapeHtml(pkg.packageDownstream || '-') + '</p>' +
                '<p style="margin:0;font-size:12px;color:var(--muted)">关联系统：' + escapeHtml(pkg.system || '机电综合') + '</p>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="empty-note">当前作业空间尚未形成总控控制包，请先选择系统或保留默认工序。</p>') +
      '</div>' +
      '<details class="wizard-subsection" style="margin-top:12px">' +
        '<summary style="cursor:pointer;font-weight:600;color:var(--ink)">查看专业深化依据</summary>' +
        renderMepAreaTaskMatrix(data, space) +
        renderMepConstraintCards(space) +
      '</details>'
    ) +
  '</div>';
}

function renderWizardStepMasterLines(data) {
  const template = getMasterScheduleTemplate();
  ensureMasterWizardDefaults(data);
  const selected = data.selectedMasterLanes || [];
  const expanded = data.expandedMasterLanes || [];
  return `
    ${renderWizardHeader("第 2 步：专业工序模板确认", "2/8")}
    <p class="wizard-help">本页统一确认总控计划纳入的专业工序模板。具体工序、模式和机电深化统一在下一步编辑。</p>
    <div class="master-line-confirm-grid">
      ${template.lanes.map((lane) => {
        const checked = selected.includes(lane.id);
        const laneNodes = getMasterLaneNodes(data, lane.id);
        const enabledNodes = laneNodes.filter((node) => node.enabled !== false);
        const criticalCount = enabledNodes.filter((node) => node.critical).length;
        const isExpanded = expanded.includes(lane.id);
        return `
          <article class="master-line-card ${checked ? "selected" : ""} ${isExpanded ? "expanded" : ""}">
            <header>
              <label class="master-line-title">
                <input class="master-line-checkbox" type="checkbox" value="${lane.id}" ${checked ? "checked" : ""} />
                <span class="trade-badge ${tradeBadgeClass(lane.trade)}">${lane.trade}</span>
                <strong>${lane.title}</strong>
              </label>
              <button class="secondary-button small master-line-expand" type="button" data-master-line-expand="${lane.id}">${isExpanded ? "收起节点" : "编辑节点"}</button>
            </header>
            <p>${enabledNodes.length} 个纳入节点 · ${criticalCount} 个关键节点</p>
            <small>${enabledNodes.slice(0, 4).map((node) => node.name).join(" / ")}${enabledNodes.length > 4 ? " ..." : ""}</small>
            ${isExpanded ? `
              <div class="master-line-node-editor">
                <div class="master-line-node-row head">
                  <span>纳入</span>
                  <span>节点名称</span>
                  <span>责任角色</span>
                  <span>计划开始</span>
                  <span>计划完成</span>
                  <span>前置节点</span>
                  <span>关键</span>
                </div>
                ${laneNodes.map((node, index) => `
                  <div class="master-line-node-row ${node.enabled === false ? "disabled" : ""}" data-master-node-row="${lane.id}-${index}">
                    <label><input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="enabled" type="checkbox" ${node.enabled !== false ? "checked" : ""} /></label>
                    <input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="name" value="${escapeHtml(node.name)}" placeholder="节点名称" />
                    <input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="owner" value="${escapeHtml(node.owner)}" placeholder="责任角色" />
                    <input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="start" value="${escapeHtml(node.start)}" placeholder="计划开始" />
                    <input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="finish" value="${escapeHtml(node.finish)}" placeholder="计划完成" />
                    <input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="predecessor" value="${escapeHtml(node.predecessor)}" placeholder="前置节点" />
                    <label class="master-node-critical"><input class="master-node-field" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="critical" type="checkbox" ${node.critical ? "checked" : ""} /> 关键</label>
                    <textarea class="master-node-field master-node-hint" data-lane-id="${lane.id}" data-node-index="${index}" data-node-field="agentHint" rows="2" placeholder="Agent 审核提示">${escapeHtml(node.agentHint)}</textarea>
                  </div>
                `).join("")}
                <div class="master-line-editor-actions">
                  <button class="secondary-button small" type="button" data-add-master-node="${lane.id}">+ 新增节点</button>
                  <button class="secondary-button small" type="button" data-reset-master-lane="${lane.id}">恢复默认节点</button>
                </div>
              </div>
            ` : ""}
          </article>
        `;
      }).join("")}
    </div>
    <div class="wizard-subsection">
      <strong>专业模板确认口径</strong>
      <p class="wizard-help">这里仅确认工序模板是否纳入。未勾选的模板不会进入默认生成范围。</p>
    </div>
    ${renderWizardActions()}
  `;
}

function renderWizardStepRelations(data) {
  ensureMasterWizardDefaults(data);
  const backendOptions = getBackendRelationOptions(data);
  const enabledBackend = data.enabledRuleRelations || [];
  const enabledLegacy = data.enabledMasterRelations || [];
  const usingBackend = backendOptions.length > 0;
  const availableRelations = usingBackend
    ? backendOptions.map((relation) => ({
        relation,
        key: relation.id,
        checked: enabledBackend.length ? enabledBackend.includes(relation.id) : true
      }))
    : getMasterScheduleTemplate().relations
        .map((relation, index) => ({ relation, key: String(index), checked: enabledLegacy.includes(String(index)), index }))
        .filter(({ relation, index }) => masterRelationIsAvailable(index, relation, data));
  return `
    ${renderWizardHeader("第 5 步：跨专业穿插关系确认", "5/8")}
    <p class="wizard-help">逐条确认土建、机电、装饰、室外和验收之间的前后置关系。当前优先展示后端编制引擎返回的有效穿插关系。</p>
    ${state.wizardPreviewLoading ? `<p class="empty-note">正在刷新穿插关系...</p>` : ``}
    ${state.wizardPreviewError ? `<p class="empty-note">穿插关系预览失败：${escapeHtml(state.wizardPreviewError)}</p>` : ``}
    <div class="relation-confirm-list">
      ${availableRelations.map(({ relation, key, checked }) => {
        const edit = usingBackend ? ((data.relationRuleEdits || {})[relation.id] || {}) : {};
        const relationship = edit.relationship || relation.relationship || "FS";
        const lagDays = Number(edit.lagDays ?? relation.lagDays ?? 0) || 0;
        return `
          <label class="relation-confirm-card ${checked ? "selected" : ""}">
            <input class="master-relation-checkbox" type="checkbox" value="${key}" data-relation-source="${usingBackend ? "backend" : "legacy"}" ${checked ? "checked" : ""} />
            <div>
              <strong>${relation.from}</strong>
              <span>→</span>
              <strong>${relation.to}</strong>
              <p>${relation.note}</p>
              ${usingBackend ? `
                <small style="color:var(--muted)">${relation.scope}</small>
                <div class="relation-rule-edit-row">
                  <label>
                    <span>关系</span>
                    <select class="rule-relation-relationship" data-relation-id="${relation.id}" ${checked ? "" : "disabled"}>
                      ${["FS", "SS", "FF", "SF"].map((item) => `<option value="${item}" ${relationship === item ? "selected" : ""}>${item}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>滞后</span>
                    <input class="rule-relation-lag" data-relation-id="${relation.id}" type="number" value="${lagDays}" ${checked ? "" : "disabled"} />
                    <em>天</em>
                  </label>
                </div>
              ` : ``}
            </div>
          </label>
        `;
      }).join("") || `<p class="empty-note">当前主线和节点选择下暂无可用穿插关系。可返回第 2 步重新纳入相关主线或节点。</p>`}
    </div>
    ${renderWizardActions()}
  `;
}

function ensureWizardTemplateCatalog(data) {
  if (data.templateCatalog || data.templateLoading) return;
  data.templateLoading = true;
  api("/api/templates")
    .then((payload) => {
      state.planWizard.data.templateCatalog = payload.templates || [];
      state.planWizard.data.templateLoading = false;
      if (state.planWizard.active) {
        renderViewRoot();
        wireViewActions();
      }
    })
    .catch((error) => {
      state.planWizard.data.templateLoading = false;
      state.planWizard.data.templateLoadError = error.message;
      if (state.planWizard.active) {
        renderViewRoot();
        wireViewActions();
      }
    });
}

function renderMasterTemplateNodeSummary(data, laneId) {
  const lane = getMasterScheduleTemplate().lanes.find((item) => item.id === laneId);
  if (!lane) return "";
  const nodes = getMasterLaneNodes(data, laneId).filter((node) => node.enabled !== false);
  return `
    <div class="template-node-summary">
      ${nodes.map((node) => `
        <span title="${escapeHtml(node.agentHint || "")}">
          ${node.critical ? "关键 · " : ""}${escapeHtml(node.name)}
        </span>
      `).join("")}
    </div>
  `;
}

function normalizeWizardTask(task, index) {
  const predecessor = (task.predecessors || [])[0] || {};
  return {
    id: task.task_id || "TASK-" + (index + 1),
    name: task.task_name || task.name || "新工序",
    durationDays: Number(task.default_duration_days ?? task.duration_days ?? task.durationDays ?? 1),
    isKeyTask: task.is_key_task !== false,
    predecessorId: predecessor.task_id || task.predecessorId || task.predecessor || "",
    relationship: predecessor.relationship || task.relationship || "FS",
    lagDays: Number(predecessor.lag_days ?? task.lagDays ?? 0) || 0,
    enabled: task.enabled !== false
  };
}

function assignDefaultTaskPredecessors(tasks, externalStart = "工作面移交/开工条件满足") {
  return (tasks || []).map(function(task, index, arr) {
    if (!task.predecessorId) {
      task.predecessorId = index > 0 ? (arr[index - 1].id || arr[index - 1].name) : externalStart;
    }
    if (!task.relationship) task.relationship = "FS";
    if (task.lagDays === undefined || task.lagDays === null || task.lagDays === "") task.lagDays = 0;
    return task;
  });
}

function buildMasterPrepTemplateDetail(data) {
  const lane = getMasterScheduleTemplate().lanes.find((item) => item.id === "prep");
  const nodes = getMasterLaneNodes(data, "prep");
  const sourceNodes = nodes.length ? nodes : (lane?.nodes || []);
  return {
    id: "MASTER-PREP",
    template_id: "MASTER-PREP",
    name: "施工准备",
    template_name: "施工准备",
    category: "施工准备",
    template_category: "施工准备",
    mode_required: false,
    task_list: sourceNodes.map((node, index) => ({
      task_id: node.id || `PREP-${index + 1}`,
      task_name: node.name || node.originalName || "施工准备工序",
      default_duration_days: node.durationDays || 3,
      is_key_task: node.critical !== false,
      predecessors: node.predecessor ? [{ task_id: node.predecessor, relationship: "FS", lag_days: 0 }] : []
    }))
  };
}

function buildEditableTemplateTasks(templateId, detail, data, buildingName) {
  if (!detail) return [];
  var source = detail.task_list || [];
  // Handle mode-based templates (mode_required)
  if (detail.modes && detail.modes.length > 0) {
    var modeId = null;
    var tm = (data.templateModes || {})[templateId];
    if (typeof tm === 'object' && tm !== null) {
      // Per-building modes
      if (buildingName && tm[buildingName]) {
        modeId = tm[buildingName];
      } else {
        var bldgNames = Object.keys(tm);
        modeId = bldgNames.length > 0 ? tm[bldgNames[0]] : null;
      }
    } else {
      modeId = tm;
    }
    // For TP-BASE-001, also check legacy selectedBasementMode
    if (templateId === "TP-BASE-001" && !modeId) modeId = data.selectedBasementMode;
    var mode = (detail.modes || []).find(function(m) { return m.mode_id === modeId; }) || (detail.modes || [])[0];
    source = mode?.tasks || [];
    // Expand repeat_by_layer tasks (for basement B mode)
    if (mode?.repeat_by_layer && Number(data.excavationLayerCount) > 1) {
      var layerCount = Math.max(1, Math.min(20, Number(data.excavationLayerCount) || 3));
      var expanded = [];
      source.forEach(function(task) {
        if (!task.repeat_by_layer) {
          expanded.push(task);
          return;
        }
        for (var layer = 1; layer <= layerCount; layer += 1) {
          expanded.push({
            ...task,
            task_id: task.task_id + "-L" + layer,
            task_name: String(task.task_name || "").replace("{layer}", layer)
          });
        }
      });
      source = expanded;
    }
  }
  return assignDefaultTaskPredecessors(source.map(normalizeWizardTask));
}

function buildTemplateTasksForMode(templateId, detail, data, modeId) {
  if (!detail) return [];
  // Resolve custom mode: use default mode tasks (D for basement, wood for structure)
  var effectiveModeId = modeId;
  if (modeId === 'custom') {
    effectiveModeId = templateId === 'TP-BASE-001' ? 'D' : 'wood';
  }
  var mode = (detail.modes || []).find(function(m) { return m.mode_id === effectiveModeId; });
  var source = mode?.tasks || [];
  if (mode?.repeat_by_layer && Number(data.excavationLayerCount) > 1) {
    var layerCount = Math.max(1, Math.min(20, Number(data.excavationLayerCount) || 3));
    var expanded = [];
    source.forEach(function(task) {
      if (!task.repeat_by_layer) {
        expanded.push(task);
        return;
      }
      for (var layer = 1; layer <= layerCount; layer += 1) {
        expanded.push({
          ...task,
          task_id: task.task_id + "-L" + layer,
          task_name: String(task.task_name || "").replace("{layer}", layer)
        });
      }
    });
    source = expanded;
  }
  return assignDefaultTaskPredecessors(source.map(normalizeWizardTask));
}

function storeWizardTemplateDetail(data, templateId, detail) {
  if (!data || !templateId || !detail) return;
  if (!data.templateDetails) data.templateDetails = {};
  if (!data.templateEdits) data.templateEdits = {};
  if (!data.templateDetailLoading) data.templateDetailLoading = {};
  if (!window._modeCache) window._modeCache = {};
  data.templateDetails[templateId] = detail;
  window._modeCache[templateId] = detail;
  data.templateDetailLoading[templateId] = false;
  if (detail.modes && detail.modes.length) {
    ensureWizardTemplateModeAssignments(templateId, detail, data);
  }
  data.templateEdits[templateId] = data.templateEdits[templateId] || { tasks: buildEditableTemplateTasks(templateId, detail, data) };
}

function isSingleModeTemplate(templateId) {
  return templateId === "TP-ROOF-01";
}

function ensureWizardTemplateDetails(data) {
  const selected = data.selectedTemplates || [];
  if (!selected.length) return;
  if (!data.templateDetails) data.templateDetails = {};
  if (!data.templateEdits) data.templateEdits = {};
  if (!data.templateDetailLoading) data.templateDetailLoading = {};
  if (!data._templateDetailRequests) data._templateDetailRequests = {};
  // Handle MASTER-PREP inline (no API call needed)
  if (selected.includes("MASTER-PREP") && !data.templateDetails["MASTER-PREP"]) {
    storeWizardTemplateDetail(data, "MASTER-PREP", buildMasterPrepTemplateDetail(data));
  }
  // Load each remaining template via async API (unless already loaded or in-flight)
  const missing = selected.filter((id) => id !== "MASTER-PREP" && !data.templateDetails[id] && !data._templateDetailRequests[id]);
  if (!missing.length) {
    // Mark all loaded as not loading
    selected.forEach((id) => {
      if (id !== "MASTER-PREP" && data.templateDetails[id]) {
        data.templateDetailLoading[id] = false;
      }
    });
    return;
  }
  // Debounce re-renders when multiple templates finish loading in quick succession
  if (!window._templateDetailRenderTimer) window._templateDetailRenderTimer = null;
  const debouncedRender = () => {
    if (window._templateDetailRenderTimer) clearTimeout(window._templateDetailRenderTimer);
    window._templateDetailRenderTimer = setTimeout(() => {
      window._templateDetailRenderTimer = null;
      if (state.planWizard.active && state.planWizard.step >= 2 && state.planWizard.step <= 8) {
        renderViewRoot();
        wireViewActions();
      }
    }, 80);
  };
  missing.forEach((id) => {
    // Check cache first (from earlier navigation)
    if (window._modeCache?.[id] && !data.templateDetails[id]) {
      storeWizardTemplateDetail(data, id, window._modeCache[id]);
      data.templateDetailLoading[id] = false;
      return;
    }
    data.templateDetailLoading[id] = true;
    data._templateDetailRequests[id] = true;
    api("/api/templates/" + encodeURIComponent(id))
      .then((detail) => {
        const wizardData = state.planWizard.data;
        if (!wizardData.templateDetails) wizardData.templateDetails = {};
        if (!wizardData.templateEdits) wizardData.templateEdits = {};
        if (!wizardData.templateDetailLoading) wizardData.templateDetailLoading = {};
        if (!wizardData._templateDetailRequests) wizardData._templateDetailRequests = {};
        storeWizardTemplateDetail(wizardData, id, detail);
        delete wizardData._templateDetailRequests[id];
        debouncedRender();
      })
      .catch((error) => {
        const wizardData = state.planWizard.data;
        if (!wizardData.templateDetailErrors) wizardData.templateDetailErrors = {};
        if (!wizardData.templateDetailLoading) wizardData.templateDetailLoading = {};
        if (!wizardData._templateDetailRequests) wizardData._templateDetailRequests = {};
        wizardData.templateDetailErrors[id] = error.message;
        wizardData.templateDetailLoading[id] = false;
        delete wizardData._templateDetailRequests[id];
        debouncedRender();
      });
  });
}

function selectedTemplateMeta(templateId, data) {
  const catalogItem = (data.templateCatalog || []).find((item) => item.id === templateId);
  const detail = data.templateDetails?.[templateId];
  return {
    ...(detail || {}),
    ...(catalogItem || {}),
    id: catalogItem?.id || detail?.id || detail?.template_id || templateId,
    name: catalogItem?.name || detail?.name || detail?.template_name || templateId,
    category: catalogItem?.category || detail?.category || detail?.template_category || "",
    mode_required: Boolean(catalogItem?.mode_required || detail?.mode_required || detail?.modes?.length)
  };
}

function getWizardSelectedBuildingRecords(data) {
  const buildings = getActiveProject()?.buildings || [];
  const selected = data.selectedBuildings || [];
  if (!selected.length) return buildings;
  return buildings.filter(function(building, index) {
    return selected.includes(building.name) || selected.includes(String(index));
  });
}

function getDefaultModeForBuilding(modes, building) {
  if (building?.structureType && building.structureType.indexOf("装配式") >= 0) {
    return modes.find(function(mode) {
      return mode.mode_id === "precast" || String(mode.mode_name || "").indexOf("装配式") >= 0;
    }) || modes[0];
  }
  return modes.find(function(mode) { return mode.mode_id !== "precast"; }) || modes[0];
}

function getBasementZoneRecords() {
  const project = getActiveProject();
  const levels = project?.basement?.levels || [];
  const records = [];
  levels.forEach(function(level, levelIndex) {
    var levelName = level.name || "B" + (levelIndex + 1);
    var zones = level.zones || [];
    if (!zones.length) zones = [{ name: "1区", area: level.area || 0, coverage: level.coverage || "全部覆盖", coverageBuildings: level.coverageBuildings || [] }];
    zones.forEach(function(zone, zoneIndex) {
      var zoneName = zone.name || (zoneIndex + 1) + "区";
      // Skip zones with zero area (represents no actual construction zone)
      if (Number(zone.area) <= 0) return;
      records.push({
        key: levelName + "-" + zoneName,
        levelName,
        zoneName,
        zone
      });
    });
  });
  return records;
}

function basementZoneHasPrefabBuilding(record) {
  const project = getActiveProject();
  const buildings = project?.buildings || [];
  const zone = record?.zone || {};
  const coverage = String(zone.coverage || "");
  const linkedNames = Array.isArray(zone.coverageBuildings) ? zone.coverageBuildings : [];
  var relevantBuildings = buildings;
  if (coverage.indexOf("局部") >= 0) {
    relevantBuildings = linkedNames.length
      ? buildings.filter(function(building) { return linkedNames.includes(building.name); })
      : [];
  } else if (coverage.indexOf("仅车库") >= 0 || coverage.indexOf("配套区") >= 0) {
    relevantBuildings = [];
  } else if (linkedNames.length) {
    relevantBuildings = buildings.filter(function(building) { return linkedNames.includes(building.name); });
  }
  return relevantBuildings.some(function(building) {
    return String(building.structureType || "").indexOf("装配式") >= 0;
  });
}

function getDefaultModeForBasementZone(modes, record) {
  if (basementZoneHasPrefabBuilding(record)) {
    return modes.find(function(mode) {
      return mode.mode_id === "B" || String(mode.mode_name || "").indexOf("分层") >= 0 || String(mode.mode_name || "").indexOf("装配式") >= 0;
    }) || modes[1] || modes[0];
  }
  return modes.find(function(mode) { return mode.mode_id === "A"; }) || modes[0];
}

function ensureWizardTemplateModeAssignments(templateId, detail, data) {
  const modes = detail?.modes || [];
  if (!data.templateModes) data.templateModes = {};
  if (!modes.length) return;
  if (templateId === "TP-BASE-001") {
    if (!data.templateModes[templateId] || typeof data.templateModes[templateId] === "string") {
      data.templateModes[templateId] = {};
    }
    const tm = data.templateModes[templateId];
    const zoneRecords = getBasementZoneRecords();
    const activeZoneKeys = {};
    zoneRecords.forEach(function(record) {
      activeZoneKeys[record.key] = true;
      if (tm[record.key]) return;
      const mode = getDefaultModeForBasementZone(modes, record);
      tm[record.key] = mode?.mode_id || "A";
    });
    Object.keys(tm).forEach(function(zoneKey) {
      if (!activeZoneKeys[zoneKey]) delete tm[zoneKey];
    });
    return;
  }
  // Single-mode templates (e.g. 屋面工程：正置法/倒置法): store as simple string
  if (isSingleModeTemplate(templateId)) {
    if (typeof data.templateModes[templateId] !== 'string' || !data.templateModes[templateId]) {
      data.templateModes[templateId] = (modes[0]?.mode_id) || '';
    }
    return;
  }
  if (!data.templateModes[templateId] || typeof data.templateModes[templateId] === "string") {
    data.templateModes[templateId] = {};
  }
  const tm = data.templateModes[templateId];
  getWizardSelectedBuildingRecords(data).forEach(function(building) {
    if (!building?.name || tm[building.name]) return;
    const mode = getDefaultModeForBuilding(modes, building);
    if (mode?.mode_id) tm[building.name] = mode.mode_id;
  });
}

function renderWizardStepTemplateSelect(data) {
  ensureMasterWizardDefaults(data);
  ensureWizardTemplateCatalog(data);
  const selected = data.selectedTemplates || [];
  const prepTemplate = {
    id: "MASTER-PREP",
    name: "施工准备",
    category: "施工准备",
    mode_required: false,
    description: "临建布置→道路完成→临水临电接入→塔吊安装验收（4个节点，开工前）"
  };
  const templateCandidates = Array.isArray(data.templateCandidateIds) ? data.templateCandidateIds : [];
  const templates = [prepTemplate].concat((data.templateCatalog || []).filter((tpl) => templateCandidates.includes(tpl.id)));
  return `
    ${renderWizardHeader("第 2 步：选择专业模板", "2/8")}
    <p class="wizard-help">勾选需要纳入本次总控计划的专业模板。具体工序的编辑将在下一步进行。</p>
    ${data.templateLoadError ? `<p class="empty-note">模板加载失败：${escapeHtml(data.templateLoadError)}</p>` : ""}
    ${data.templateLoading && !templates.length ? `<p class="empty-note">正在加载工序模板...</p>` : ""}
    <div class="template-selection-grid">
      ${templates.map((tpl) => {
        const checked = selected.includes(tpl.id);
        var modeHtml = '';
        if (checked && isMultiZoneModeTemplate(tpl.id)) {
          modeHtml = renderStep2ModeSelector(tpl.id, data);
        }
        return `
          <div class="template-row">
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input class="wizard-template-select" type="checkbox" data-template-id="${tpl.id}" ${checked ? "checked" : ""} />
                <strong style="font-size:14px">${escapeHtml(tpl.name || tpl.id)}</strong>
              </label>
              <span style="font-size:11px;color:var(--muted);background:var(--surface-soft);padding:1px 6px;border-radius:4px">${escapeHtml(tpl.category || '')}</span>
              ${getTemplateOriginText(tpl.id) ? `<span style="font-size:11px;color:var(--blue);background:rgba(37,99,235,0.08);padding:1px 6px;border-radius:4px">来自：${escapeHtml(getTemplateOriginText(tpl.id))}</span>` : ""}
              ${checked ? '<span style="font-size:11px;color:var(--green)">✓ 已选</span>' : ''}
            </div>
            ${modeHtml}
          </div>
        `;
      }).join("") || `<p class="empty-note">当前选择的主线没有需要展开的专业模板。可返回第 1 步确认项目范围。</p>`}
    </div>
    ${renderWizardActions()}
  `;
}

function isMultiZoneModeTemplate(templateId) {
  return templateId === "TP-BASE-001" || templateId === "TP-STR-001" || templateId === "TP-SEC-01" || templateId === "TP-FIN-01";
}

function renderStep2ModeSelector(templateId, data) {
  // Load template details for mode info
  ensureWizardTemplateDetails(data);
  var detail = data.templateDetails?.[templateId];
  var modes = detail?.modes || [];
  if (!data.templateDetails?.[templateId] || !modes.length) return '';
  ensureWizardTemplateModeAssignments(templateId, detail, data);
  if (!data.templateModes) data.templateModes = {};
  var tm = (data.templateModes || {})[templateId];
  if (!tm) return '';
  var items = [];
  var isBasement = templateId === 'TP-BASE-001';
  
  // TP-FIN-01: multi-select checkboxes for decoration modes
  if (templateId === 'TP-FIN-01') {
    return renderStep2FinishDecorSelector(data, modes);
  }
  
  if (isBasement) {
    var zoneRecords = getBasementZoneRecords();
    zoneRecords.forEach(function(record) {
      var currentMode = tm[record.key] || 'A';
      items.push({ key: record.key, label: record.label || record.key, current: currentMode });
    });
  } else {
    getWizardSelectedBuildingRecords(data).forEach(function(building) {
      if (!building?.name) return;
      var currentMode = tm[building.name] || (modes[0]?.mode_id || '');
      items.push({ key: building.name, label: building.name, current: currentMode });
    });
  }
  if (!items.length) return '';
  var html = '<div style="margin:6px 0 0 28px;padding:8px 10px;background:var(--surface-soft);border-radius:6px;font-size:12px">';
  html += '<div style="margin-bottom:6px;font-weight:600">选择施工模式：</div>';
  items.forEach(function(item) {
    html += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0"><span style="min-width:60px;color:var(--muted)">' + escapeHtml(item.label) + '</span><select class="step2-mode-select" data-template-id="' + templateId + '" data-zone-key="' + escapeHtml(item.key) + '" style="flex:1;padding:3px 6px;border:1px solid var(--line);border-radius:4px;font-size:12px">';
    modes.forEach(function(mode) {
      var selected = mode.mode_id === item.current ? ' selected' : '';
      html += '<option value="' + escapeHtml(mode.mode_id) + '"' + selected + '>' + escapeHtml(mode.mode_name || mode.mode_id) + '</option>';
    });
    html += '</select></div>';
  });
  html += '</div>';
  return html;
}

function renderStep2FinishDecorSelector(data, modes) {
  // Multi-select checkboxes for decoration types per building + basement
  if (!data.finishDecorModes) {
    data.finishDecorModes = { buildings: {}, basement: [] };
  }
  var fdm = data.finishDecorModes;
  var buildings = getWizardSelectedBuildingRecords(data);
  var basementRecords = getBasementZoneRecords();
  var decorModes = modes.filter(function(m) { return m.mode_id !== 'basement_finish'; });
  var basementMode = modes.find(function(m) { return m.mode_id === 'basement_finish'; });
  
  // Initialize building selections
  buildings.forEach(function(b) {
    if (b.name && !fdm.buildings[b.name]) {
      fdm.buildings[b.name] = [decorModes[0]?.mode_id].filter(Boolean);
    }
  });
  
  var html = '<div style="margin:6px 0 0 28px;padding:8px 10px;background:var(--surface-soft);border-radius:6px;font-size:12px">';
  
  // Building decoration type selection
  html += '<div style="margin-bottom:8px;font-weight:600">选择楼栋装修类型（可多选）：</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:var(--surface);border-bottom:1px solid var(--line)">';
  html += '<th style="padding:4px 8px;text-align:left;font-weight:600">楼栋</th>';
  decorModes.forEach(function(m) {
    html += '<th style="padding:4px 8px;text-align:center;font-weight:600">' + escapeHtml(m.mode_name) + '</th>';
  });
  html += '</tr></thead><tbody>';
  
  buildings.forEach(function(b) {
    if (!b.name) return;
    var selected = fdm.buildings[b.name] || [];
    html += '<tr style="border-bottom:1px solid var(--line)">';
    html += '<td style="padding:4px 8px;color:var(--muted)">' + escapeHtml(b.name) + '</td>';
    decorModes.forEach(function(m) {
      var checked = selected.includes(m.mode_id) ? ' checked' : '';
      html += '<td style="padding:4px 8px;text-align:center">';
      html += '<input type="checkbox" class="finish-decor-cb" data-building="' + escapeHtml(b.name) + '" data-mode-id="' + escapeHtml(m.mode_id) + '" style="width:16px;height:16px;cursor:pointer"' + checked + ' />';
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  
  // Basement decoration section
  if (basementMode && basementRecords.length) {
    html += '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--line)">';
    html += '<div style="margin-bottom:6px;font-weight:600">地下室装修：</div>';
    basementRecords.forEach(function(rec) {
      var checked = fdm.basement.includes(rec.key) ? ' checked' : '';
      html += '<label style="display:flex;align-items:center;gap:6px;margin:4px 0;cursor:pointer">';
      html += '<input type="checkbox" class="finish-decor-basement-cb" data-zone-key="' + escapeHtml(rec.key) + '" data-mode-id="' + escapeHtml(basementMode.mode_id) + '" style="width:16px;height:16px;cursor:pointer"' + checked + ' />';
      html += '<span>' + escapeHtml(rec.label || rec.key) + ' — ' + escapeHtml(basementMode.mode_name) + '</span>';
      html += '</label>';
    });
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

function renderStep3FinishDecorModes(templateId, detail, data, modes) {
  // Render multiple decoration mode accordions per building + basement
  var fdm = data.finishDecorModes || { buildings: {}, basement: [] };
  var buildings = fdm.buildings || {};
  var basementKeys = fdm.basement || [];
  var basementsNotes = getBasementZoneRecords();
  var buildingRecords = getWizardSelectedBuildingRecords(data);
  if (!data._accordionOpen) data._accordionOpen = {};
  var html = '<div style="margin-bottom:10px">';
  
  // For each building, render accordion sections for their selected modes
  buildingRecords.forEach(function(brec) {
    if (!brec?.name) return;
    var selectedModes = buildings[brec.name] || [];
    selectedModes.forEach(function(mid) {
      var mode = modes.find(function(m) { return m.mode_id === mid; });
      if (!mode) return;
      var key = templateId + '_' + brec.name + '_' + mid;
      var isOpen = data._accordionOpen[key];
      if (!data._modeTasks) data._modeTasks = {};
      if (!data._modeTasks[key]) {
        var modeTasks = buildEditableTemplateTasks(templateId, detail, data, brec.name);
        // Filter to just this mode's tasks
        if (mode.tasks) {
          data._modeTasks[key] = mode.tasks.map(function(t) { return { id: t.task_id, name: t.task_name, durationDays: t.default_duration_days || 1, isKeyTask: t.is_key_task || false }; });
        } else {
          data._modeTasks[key] = [];
        }
      }
      var accordTasks = data._modeTasks[key] || [];
      html += '<div style="margin-top:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden">' +
        '<div class="mode-accordion-header" data-accordion-key="' + key + '" style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--surface);font-size:13px;font-weight:600;user-select:none">' +
        '<span style="font-size:10px;color:var(--muted);transition:transform 0.2s">' + (isOpen ? '&#9660;' : '&#9654;') + '</span>' +
        '<span>' + escapeHtml(brec.name) + ' - ' + escapeHtml(mode.mode_name) + '</span>' +
        '<span style="font-size:11px;color:var(--muted);font-weight:400">(' + accordTasks.length + '道工序)</span>' +
      '</div>';
      if (isOpen) {
        html += '<div class="mode-accordion-body" style="padding:8px 10px;border-top:1px solid var(--line);background:var(--surface)">' +
          '<div class="template-task-list">';
        accordTasks.forEach(function(task, ti) {
          html += '<div class="template-task-item" data-mode-task="' + key + '" data-ti="' + ti + '">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:11px;color:var(--muted);min-width:72px;font-family:monospace;display:inline-block">' + escapeHtml(task.id || '') + '</span>' +
              '<input class="mode-task-name" data-mode-key="' + key + '" data-ti="' + ti + '" value="' + escapeHtml(task.name || '') + '" style="flex:1;border:none;background:transparent;font-size:13px;padding:2px 4px" />' +
              '<input class="mode-task-duration" data-mode-key="' + key + '" data-ti="' + ti + '" type="number" value="' + (task.durationDays || 1) + '" min="1" style="width:45px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;font-size:12px;text-align:center" />' +
              '<span style="font-size:11px;color:var(--muted)">天</span>' +
              '<label style="font-size:11px"><input type="checkbox" class="mode-task-key" data-mode-key="' + key + '" data-ti="' + ti + '" ' + (task.isKeyTask ? 'checked' : '') + ' style="width:12px;height:12px" /> 关键</label>' +
              '<button class="secondary-button small" type="button" data-remove-mode-task="' + key + '" data-ti="' + ti + '" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px">&#10005;</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button class="secondary-button small" type="button" data-add-mode-task="' + key + '" style="font-size:11px">+ 添加工序</button>' +
            '<button class="secondary-button small" type="button" data-save-mode-default="' + key + '" data-template-id="' + templateId + '" data-mode-id="' + mid + '" style="font-size:11px;color:var(--green)">&#128190; 保存为默认模板</button>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    });
  });
  
  // Render basement decoration sections
  basementKeys.forEach(function(zoneKey) {
    var rec = basementsNotes.find(function(r) { return r.key === zoneKey; });
    var mode = modes.find(function(m) { return m.mode_id === 'basement_finish'; });
    if (!mode) return;
    var key = templateId + '_basement_' + zoneKey;
    var isOpen = data._accordionOpen[key];
    if (!data._modeTasks) data._modeTasks = {};
    if (!data._modeTasks[key]) {
      if (mode.tasks) {
        data._modeTasks[key] = mode.tasks.map(function(t) { return { id: t.task_id, name: t.task_name, durationDays: t.default_duration_days || 1, isKeyTask: t.is_key_task || false }; });
      } else {
        data._modeTasks[key] = [];
      }
    }
    var accordTasks = data._modeTasks[key] || [];
    html += '<div style="margin-top:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden">' +
      '<div class="mode-accordion-header" data-accordion-key="' + key + '" style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--surface);font-size:13px;font-weight:600;user-select:none">' +
      '<span style="font-size:10px;color:var(--muted);transition:transform 0.2s">' + (isOpen ? '&#9660;' : '&#9654;') + '</span>' +
      '<span>' + escapeHtml(rec ? (rec.label || zoneKey) : zoneKey) + ' - ' + escapeHtml(mode.mode_name) + '</span>' +
      '<span style="font-size:11px;color:var(--muted);font-weight:400">(' + accordTasks.length + '道工序)</span>' +
    '</div>';
    if (isOpen) {
      html += '<div class="mode-accordion-body" style="padding:8px 10px;border-top:1px solid var(--line);background:var(--surface)">' +
        '<div class="template-task-list">';
      accordTasks.forEach(function(task, ti) {
        html += '<div class="template-task-item" data-mode-task="' + key + '" data-ti="' + ti + '">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:11px;color:var(--muted);min-width:72px;font-family:monospace;display:inline-block">' + escapeHtml(task.id || '') + '</span>' +
            '<input class="mode-task-name" data-mode-key="' + key + '" data-ti="' + ti + '" value="' + escapeHtml(task.name || '') + '" style="flex:1;border:none;background:transparent;font-size:13px;padding:2px 4px" />' +
            '<input class="mode-task-duration" data-mode-key="' + key + '" data-ti="' + ti + '" type="number" value="' + (task.durationDays || 1) + '" min="1" style="width:45px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;font-size:12px;text-align:center" />' +
            '<span style="font-size:11px;color:var(--muted)">天</span>' +
            '<label style="font-size:11px"><input type="checkbox" class="mode-task-key" data-mode-key="' + key + '" data-ti="' + ti + '" ' + (task.isKeyTask ? 'checked' : '') + ' style="width:12px;height:12px" /> 关键</label>' +
            '<button class="secondary-button small" type="button" data-remove-mode-task="' + key + '" data-ti="' + ti + '" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px">&#10005;</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
          '<button class="secondary-button small" type="button" data-add-mode-task="' + key + '" style="font-size:11px">+ 添加工序</button>' +
          '<button class="secondary-button small" type="button" data-save-mode-default="' + key + '" data-template-id="' + templateId + '" data-mode-id="basement_finish" style="font-size:11px;color:var(--green)">&#128190; 保存为默认模板</button>' +
        '</div>' +
      '</div>';
    }
    html += '</div>';
  });
  
  html += '</div>';
  if (!buildingRecords.length && !basementKeys.length) {
    html = '<div style="margin-bottom:10px"><p class="empty-note">请先在第二步选择装修类型。</p></div>';
  }
  return html;
}

function renderStep3ModeDropdown(templateId, data) {
  if (window._debugLog) console.log("[renderStep3ModeDropdown]", templateId, "detail:", !!data.templateDetails?.[templateId], "modes:", data.templateDetails?.[templateId]?.modes?.length, "templateModes:", JSON.stringify(data.templateModes?.[templateId]));
  if (!data.templateDetails?.[templateId] && window._modeCache?.[templateId]) {
    storeWizardTemplateDetail(data, templateId, window._modeCache[templateId]);
  }
  var detail = data.templateDetails?.[templateId];
  var modes = detail?.modes || [];
  if (!data.templateDetails?.[templateId]) return '<div style="padding:8px;font-size:12px;color:var(--muted);background:#fff3e0">正在加载模式数据...</div>';
  if (!modes.length) return '<div style="padding:8px;font-size:12px;color:var(--muted);background:#fff3e0">没有模式数据（modes为空）</div>';
  ensureWizardTemplateModeAssignments(templateId, detail, data);
  if (!data.templateModes) data.templateModes = {};
  var tm = (data.templateModes || {})[templateId];
  var isBasement = templateId === 'TP-BASE-001';
  
  // TP-FIN-01: multi-select decoration modes - render each selected mode per entity
  if (templateId === 'TP-FIN-01') {
    return renderStep3FinishDecorModes(templateId, detail, data, modes);
  }
  
  var html = '<div style="margin-bottom:10px">';
  
  if (isBasement) {
    // TP-BASE-001: accordion per mode, grouped by basement zones
    var usedModeIds = {};
    if (typeof tm === 'object' && tm !== null) {
      Object.keys(tm).forEach(function(zoneKey) {
        if (tm[zoneKey]) usedModeIds[tm[zoneKey]] = (usedModeIds[tm[zoneKey]] || 0) + 1;
      });
    }
    var usedModeList = Object.keys(usedModeIds);
    if (!usedModeList.length) {
      usedModeList = modes.map(function(mode) { return mode.mode_id; }).filter(Boolean);
    }
    if (!data._accordionOpen) data._accordionOpen = {};
    usedModeList.forEach(function(mid) {
      var mode = modes.find(function(m) { return m.mode_id === mid; });
      var label = mid === 'custom' ? '自定义' : (mode ? mode.mode_name : mid);
      var zones = typeof tm === 'object' && tm !== null ? Object.keys(tm).filter(function(zoneKey) { return tm[zoneKey] === mid; }).join('、') : '';
      var key = templateId + '_' + mid;
      var isOpen = data._accordionOpen[key];
      html += '<div style="margin-top:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden">' +
        '<div class="mode-accordion-header" data-accordion-key="' + key + '" style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--surface);font-size:13px;font-weight:600;user-select:none">' +
        '<span style="font-size:10px;color:var(--muted);transition:transform 0.2s">' + (isOpen ? '&#9660;' : '&#9654;') + '</span>' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<span style="font-size:11px;color:var(--muted);font-weight:400">(' + escapeHtml(zones || '未分配区') + ')</span>' +
      '</div>';
      if (isOpen) {
        var modeKey = templateId + '_' + mid;
        if (!data._modeTasks) data._modeTasks = {};
        if (!data._modeTasks[modeKey]) {
          var modeTasks = buildTemplateTasksForMode(templateId, detail, data, mid);
          data._modeTasks[modeKey] = modeTasks.length ? modeTasks : (buildEditableTemplateTasks(templateId, detail, data) || []);
        }
        var accordTasks = data._modeTasks[modeKey] || [];
        html += '<div class="mode-accordion-body" style="padding:8px 10px;border-top:1px solid var(--line);background:var(--surface)">' +
          '<div class="template-task-list">';
        accordTasks.forEach(function(task, ti) {
          html += '<div class="template-task-item" data-mode-task="' + key + '" data-ti="' + ti + '">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:11px;color:var(--muted);min-width:72px;font-family:monospace;display:inline-block">' + escapeHtml(task.id || '') + '</span>' +
              '<input class="mode-task-name" data-mode-key="' + key + '" data-ti="' + ti + '" value="' + escapeHtml(task.name || '') + '" style="flex:1;border:none;background:transparent;font-size:13px;padding:2px 4px" />' +
              '<input class="mode-task-duration" data-mode-key="' + key + '" data-ti="' + ti + '" type="number" value="' + (task.durationDays || task.default_duration_days || 1) + '" min="1" style="width:45px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;font-size:12px;text-align:center" />' +
              '<span style="font-size:11px;color:var(--muted)">天</span>' +
              '<label style="font-size:11px"><input type="checkbox" class="mode-task-key" data-mode-key="' + key + '" data-ti="' + ti + '" ' + (task.is_key_task || task.isKeyTask ? 'checked' : '') + ' style="width:12px;height:12px" /> 关键</label>' +
              '<button class="secondary-button small" type="button" data-remove-mode-task="' + key + '" data-ti="' + ti + '" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px">&#10005;</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button class="secondary-button small" type="button" data-add-mode-task="' + key + '" style="font-size:11px">+ 添加工序</button>' +
            '<button class="secondary-button small" type="button" data-save-mode-default="' + key + '" data-template-id="' + templateId + '" data-mode-id="' + mid + '" style="font-size:11px;color:var(--green)">💾 保存为默认模板</button>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    });
  } else {
    // TP-STR-001: accordion per mode
    var usedModeIds = {};
    if (typeof tm === 'object' && tm !== null) {
      Object.keys(tm).forEach(function(k) {
        if (tm[k]) usedModeIds[tm[k]] = (usedModeIds[tm[k]] || 0) + 1;
      });
    }
    var usedModeList = Object.keys(usedModeIds);
    if (!usedModeList.length) {
      usedModeList = modes.map(function(mode) { return mode.mode_id; }).filter(Boolean);
    }
    // Initialize accordion state
    if (!data._accordionOpen) data._accordionOpen = {};
    usedModeList.forEach(function(mid) {
      var mode = modes.find(function(m) { return m.mode_id === mid; });
      var label = mid === 'custom' ? '自定义' : (mode ? mode.mode_name : mid);
      var bldgs = typeof tm === 'object' && tm !== null ? Object.keys(tm).filter(function(k) { return tm[k] === mid; }).join('、') : '';
      var key = templateId + '_' + mid;
      var isOpen = data._accordionOpen[key];
      html += '<div style="margin-top:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden">' +
        '<div class="mode-accordion-header" data-accordion-key="' + key + '" style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--surface);font-size:13px;font-weight:600;user-select:none">' +
        '<span style="font-size:10px;color:var(--muted);transition:transform 0.2s">' + (isOpen ? '&#9660;' : '&#9654;') + '</span>' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<span style="font-size:11px;color:var(--muted);font-weight:400">(' + escapeHtml(bldgs || '未分配楼栋') + ')</span>' +
      '</div>';
      if (isOpen) {
        var modeKey = templateId + '_' + mid;
        if (!data._modeTasks) data._modeTasks = {};
        if (!data._modeTasks[modeKey]) {
          var modeTasks = buildTemplateTasksForMode(templateId, detail, data, mid);
          data._modeTasks[modeKey] = modeTasks.length ? modeTasks : (buildEditableTemplateTasks(templateId, detail, data) || []);
        }
        var accordTasks = data._modeTasks[modeKey] || [];
        html += '<div class="mode-accordion-body" style="padding:8px 10px;border-top:1px solid var(--line);background:var(--surface)">' +
          '<div class="template-task-list">';
        accordTasks.forEach(function(task, ti) {
          html += '<div class="template-task-item" data-mode-task="' + key + '" data-ti="' + ti + '">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:11px;color:var(--muted);min-width:72px;font-family:monospace;display:inline-block">' + escapeHtml(task.id || '') + '</span>' +
              '<input class="mode-task-name" data-mode-key="' + key + '" data-ti="' + ti + '" value="' + escapeHtml(task.name || '') + '" style="flex:1;border:none;background:transparent;font-size:13px;padding:2px 4px" />' +
              '<input class="mode-task-duration" data-mode-key="' + key + '" data-ti="' + ti + '" type="number" value="' + (task.durationDays || task.default_duration_days || 1) + '" min="1" style="width:45px;padding:2px 4px;border:1px solid var(--line);border-radius:4px;font-size:12px;text-align:center" />' +
              '<span style="font-size:11px;color:var(--muted)">天</span>' +
              '<label style="font-size:11px"><input type="checkbox" class="mode-task-key" data-mode-key="' + key + '" data-ti="' + ti + '" ' + (task.is_key_task || task.isKeyTask ? 'checked' : '') + ' style="width:12px;height:12px" /> 关键</label>' +
              '<button class="secondary-button small" type="button" data-remove-mode-task="' + key + '" data-ti="' + ti + '" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px">&#10005;</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button class="secondary-button small" type="button" data-add-mode-task="' + key + '" style="font-size:11px">+ 添加工序</button>' +
            '<button class="secondary-button small" type="button" data-save-mode-default="' + key + '" data-template-id="' + templateId + '" data-mode-id="' + mid + '" style="font-size:11px;color:var(--green)">💾 保存为默认模板</button>' +
          '</div>' +
        '</div>';
      }
      // Close the per-mode container div (was previously only inside if(isOpen))
      html += '</div>';
    });
  }
  html += '</div>';
  return html;
}

function renderSelectedModeName(templateId, data) {
  var detail = data.templateDetails?.[templateId];
  var modes = detail?.modes || [];
  if (!modes.length) return '-';
  var tm = (data.templateModes || {})[templateId];
  if (typeof tm === 'object' && tm !== null) {
    // Per-building: show summary like 木模(1#)、铝模(2#)
    var parts = [];
    Object.keys(tm).forEach(function(k) {
      var mid = tm[k];
      var mode = modes.find(function(m) { return m.mode_id === mid; });
      if (mode) parts.push(mode.mode_name + '(' + k + ')');
    });
    return parts.join('、') || '-';
  } else if (tm) {
    var mode = modes.find(function(m) { return m.mode_id === tm; });
    return mode ? mode.mode_name : '-';
  }
  return '-';
}

function renderStep3ModeSelect(templateId, data) {
  var detail = data.templateDetails?.[templateId];
  var modes = detail?.modes || [];
  if (!modes.length) return '';
  var isBasement = templateId === 'TP-BASE-001';
  var isBuildingModeTemplate = templateId === 'TP-STR-001' || templateId === 'TP-SEC-01' || templateId === 'TP-FIN-01';
  var tm = (data.templateModes || {})[templateId];
  var hasPerEntityModes = typeof tm === 'object' && tm !== null;
  var html = '<div style="margin-bottom:10px;padding:8px 10px;background:var(--surface-soft);border-radius:6px">';
  
  if (isBasement && hasPerEntityModes) {
    // Per-basement-zone mode selection
    var zoneRecords = getBasementZoneRecords();
    zoneRecords.forEach(function(zone) {
      var zoneMode = tm[zone.key] || '';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
        '<label style="font-size:12px;font-weight:600;min-width:60px">' + escapeHtml(zone.key) + '：</label>' +
        '<select class="template-mode-select" data-tpl-id="' + templateId + '" data-zone="' + escapeHtml(zone.key) + '" style="min-width:200px;min-height:28px;font-size:12px;padding:2px 6px;border:1px solid var(--line);border-radius:4px">' +
        '<option value="">-- 请选择 --</option>';
      modes.forEach(function(m) {
        var sel = m.mode_id === zoneMode ? ' selected' : '';
        html += '<option value="' + m.mode_id + '"' + sel + '>' + escapeHtml(m.mode_name) + '</option>';
      });
      html += '</select></div>';
    });
  } else if (isBuildingModeTemplate && hasPerEntityModes) {
    // Per-building mode selection (主体结构、二次结构/砌体均按楼栋选择)
    var bldgRecords = getWizardSelectedBuildingRecords(data);
    bldgRecords.forEach(function(bldg) {
      var bldgMode = tm[bldg.name] || '';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
        '<label style="font-size:12px;font-weight:600;min-width:60px">' + escapeHtml(bldg.name) + '：</label>' +
        '<select class="template-mode-select" data-tpl-id="' + templateId + '" data-bldg="' + escapeHtml(bldg.name) + '" style="min-width:200px;min-height:28px;font-size:12px;padding:2px 6px;border:1px solid var(--line);border-radius:4px">' +
        '<option value="">-- 请选择 --</option>';
      modes.forEach(function(m) {
        var sel = m.mode_id === bldgMode ? ' selected' : '';
        html += '<option value="' + m.mode_id + '"' + sel + '>' + escapeHtml(m.mode_name) + '</option>';
      });
      html += '</select></div>';
    });
  } else {
    // Single mode selection for whole template
    var label = isBasement ? '施工模式' : '模板体系';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<label style="font-size:12px;font-weight:600">' + label + '：</label>' +
      '<select class="template-mode-select" data-tpl-id="' + templateId + '" style="min-width:240px;min-height:30px;font-size:12px;padding:2px 6px;border:1px solid var(--line);border-radius:4px">' +
      '<option value="">-- 请选择 --</option>';
    modes.forEach(function(m) {
      var sel = m.mode_id === tm ? ' selected' : '';
      html += '<option value="' + m.mode_id + '"' + sel + '>' + escapeHtml(m.mode_name) + '</option>';
    });
    html += '</select></div>';
  }
  html += '<span style="font-size:11px;color:var(--muted);margin-top:4px;display:block">切换模式将重置工序编辑</span></div>';
  return html;
}

function renderWizardStepTemplateEdit(data) {
  ensureWizardTemplateDetails(data);
  // Build template list in Step 2 display order
  const templateCandidates = Array.isArray(data.templateCandidateIds) ? data.templateCandidateIds : [];
  const catalogTemplates = (data.templateCatalog || []).filter(function(tpl) { return templateCandidates.includes(tpl.id); });
  var step2Order = ["MASTER-PREP"].concat(catalogTemplates.map(function(tpl) { return tpl.id; }));
  var rawSelected = data.selectedTemplates || [];
  var selected = step2Order.filter(function(id) { return rawSelected.includes(id); });
  if (!selected.length) {
    return `
      ${renderWizardHeader("第 3 步：编辑工序模板", "3/8")}
      <div class="wizard-subsection">
        <p class="empty-note">未选择任何工序模板，请返回第 2 步勾选需要纳入本次总控计划的专业模板。</p>
      </div>
      ${renderWizardActions()}
    `;
  }
  return `
    ${renderWizardHeader("第 3 步：编辑工序模板", "3/8")}
    ${selected.map((templateId) => {
      const meta = selectedTemplateMeta(templateId, data);
      const detail = data.templateDetails?.[templateId];
      const modeRequired = Boolean(meta.mode_required || detail?.mode_required || detail?.modes?.length);
      const loading = data.templateDetailLoading?.[templateId];
      const error = data.templateDetailErrors?.[templateId];
      const edit = data.templateEdits?.[templateId];
      var tasks = (edit?.tasks || []).filter(function(t) { return t.enabled !== false; });
      var totalTasks = (edit?.tasks || []).length;
      return `
        <div class="wizard-subsection" data-template-edit="${templateId}">
          <div class="section-heading" style="margin-bottom:8px">
            <div>
              <h3 class="section-title">${escapeHtml(meta.name || meta.template_name || templateId)}</h3>
              <span class="section-subtitle">${escapeHtml(meta.category || meta.template_category || "")}${!modeRequired ? ' · ' + tasks.length + '/' + (totalTasks || 0) + ' 道工序已选' : ''}</span>
            </div>
            ${modeRequired ? '' : `<button class="secondary-button small" type="button" data-add-template-task="${templateId}">+ 添加工序</button>`}
          </div>
          ${modeRequired ? renderStep3ModeDropdown(templateId, data) : ''}
          ${loading && !modeRequired ? `<p class="empty-note">正在加载模板工序...</p>` : ""}
          ${error ? `<p class="empty-note">模板加载失败：${escapeHtml(error)}</p>` : ""}
          ${modeRequired ? '' : `<div class="template-task-list">
            ${tasks.map((task, index) => `
              <div class="template-task-item" data-template-task="${templateId}" data-task-index="${index}">
                <div class="form-row" style="grid-template-columns:20px 80px minmax(180px,1.2fr) 70px 90px auto">
                  <span class="task-expand-btn" style="cursor:pointer;font-size:12px;color:var(--muted);user-select:none" data-task-expand="${templateId}-${index}">▶</span>
                  <span style="font-size:11px;color:var(--muted);background:var(--surface-soft);padding:0 6px;border-radius:4px;white-space:nowrap;font-family:monospace">${escapeHtml(task.id)}</span>
                  <input class="template-task-field" data-template-id="${templateId}" data-task-index="${index}" data-task-field="name" value="${escapeHtml(task.name)}" placeholder="工序名称" style="flex:1;min-width:120px" />
                  <input class="template-task-field template-task-duration" data-template-id="${templateId}" data-task-index="${index}" data-task-field="durationDays" type="number" min="0" value="${task.durationDays}" style="width:60px" />
                  <label class="wizard-checkbox" style="min-height:28px;font-size:12px"><input class="template-task-field" data-template-id="${templateId}" data-task-index="${index}" data-task-field="isKeyTask" type="checkbox" ${task.isKeyTask ? "checked" : ""} /> <span>关键</span></label>
                  <button class="secondary-button small" type="button" data-remove-template-task="${templateId}" data-task-index="${index}" style="padding:0 4px;border:none;color:var(--red);background:transparent;font-size:14px">✕</button>
                </div>
                <div class="task-detail-row" style="display:none;margin-top:4px">
                  <div class="form-row" style="grid-template-columns:minmax(160px,1fr) 90px 70px;margin-left:24px">
                    <select class="template-task-field" data-template-id="${templateId}" data-task-index="${index}" data-task-field="predecessorId">
                      <option value="">无前置工序</option>
                      ${tasks.filter((item, otherIndex) => otherIndex !== index).map((item) => `<option value="${escapeHtml(item.id)}" ${task.predecessorId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
                    </select>
                    <select class="template-task-field" data-template-id="${templateId}" data-task-index="${index}" data-task-field="relationship">
                      ${["FS", "SS", "FF", "SF"].map((rel) => `<option value="${rel}" ${task.relationship === rel ? "selected" : ""}>${rel}</option>`).join("")}
                    </select>
                    <input class="template-task-field" data-template-id="${templateId}" data-task-index="${index}" data-task-field="lagDays" type="number" value="${task.lagDays}" style="width:60px" />
                  </div>
                </div>
              </div>
            `).join("") || `<p class="empty-note">暂无选中的工序。可返回第 2 步勾选需要纳入总控计划的工序，或点击下方「+ 添加工序」手动添加。</p>`}
          </div>`}


        </div>
      `;
    }).join("")}
    ${renderWizardActions()}
  `;
}

function getWizardSequenceEntities(data) {
  var project = getActiveProject();
  var buildings = project?.buildings || [];
  var selectedBuildings = data.selectedBuildings || [];
  var selectedBasement = data.selectedBasementLevels || [];
  var entities = [];
  buildings.forEach(function(building, index) {
    var name = building.name || (index + 1) + "#楼";
    if (selectedBuildings.length && !selectedBuildings.includes(name) && !selectedBuildings.includes(String(index))) return;
    entities.push({
      entityName: name,
      entityType: "building",
      building: building,
      detailText: (building.floors || 0) + " 层 · " + (building.area || 0).toLocaleString() + "m²"
    });
  });
  var levels = project?.basement?.levels || [];
  levels.forEach(function(level, levelIndex) {
    var levelName = level.name || "B" + (levelIndex + 1);
    var zones = level.zones || [];
    if (!zones.length) zones = [{ name: "1区", area: level.area || 0, coverage: level.coverage || "全部覆盖", coverageBuildings: level.coverageBuildings || [] }];
    zones.forEach(function(zone, zoneIndex) {
      var zoneName = zone.name || (zoneIndex + 1) + "区";
      var key = levelName + "-" + zoneName;
      // Skip zones with zero area
      if (Number(zone.area) <= 0) return;
      if (selectedBasement.length && !selectedBasement.includes(key)) return;
      entities.push({
        entityName: key,
        entityType: "basement",
        levelName: levelName,
        zoneName: zoneName,
        level: level,
        zone: zone,
        detailText: levelName + " · " + zoneName + " · " + (zone.area || level.area || 0).toLocaleString() + "m²"
      });
    });
  });
  return entities;
}

function getWizardEntityByName(data, entityName) {
  var entities = getWizardSequenceEntities(data);
  return entities.find(function(entity) { return entity.entityName === entityName; });
}

function getWizardEntityModeTaskList(data, entityName) {
  var entity = getWizardEntityByName(data, entityName);
  if (!entity) return null;
  var templateId = entity.entityType === "basement" ? "TP-BASE-001" : "TP-STR-001";
  var templateModes = (data.templateModes || {})[templateId];
  var modeId = "";
  if (typeof templateModes === "object" && templateModes !== null) {
    modeId = templateModes[entity.entityName] || "";
  } else {
    modeId = templateModes || "";
  }
  if (modeId === 'custom') {
    modeId = templateId === 'TP-BASE-001' ? 'D' : 'wood';
  }
  if (!modeId || !data._modeTasks) return null;
  return data._modeTasks[templateId + "_" + modeId] || null;
}

function renderWizardEntityTaskOptions(data, dep, disabled) {
  if (disabled) return '<option value="">无前置工序</option>';
  if (!dep.dependOnEntity) return '<option value="">请先选择依赖实体</option>';
  var tasks = getWizardEntityModeTaskList(data, dep.dependOnEntity);
  if (!tasks) return '<option value="">(请先在步骤3编辑工序)</option>';
  if (!tasks.length) return '<option value="">暂无工序</option>';
  var html = '<option value="">请选择前置工序</option>';
  tasks.forEach(function(task) {
    var taskName = task.name || task.task_name || task.id || "";
    var selected = dep.dependOnTask === taskName ? " selected" : "";
    html += '<option value="' + escapeHtml(taskName) + '"' + selected + '>' + escapeHtml(taskName) + '</option>';
  });
  return html;
}

function ensureWizardSequenceDefaults(data) {
  var project = getActiveProject();
  var buildings = project?.buildings || [];
  var levels = project?.basement?.levels || [];
  if (!data.selectedBuildings?.length) {
    data.selectedBuildings = buildings.map(function(building, index) { return building.name || String(index); });
  }
  // Always refresh selectedBasementLevels from current project data
  var freshBasementLevels = [];
  levels.forEach(function(level, levelIndex) {
    var levelName = level.name || "B" + (levelIndex + 1);
    var zones = level.zones || [];
    if (!zones.length) zones = [{ name: "1区" }];
    zones.forEach(function(zone, zoneIndex) {
      // Skip zones with zero area
      if (Number(zone.area) <= 0) return;
      freshBasementLevels.push(levelName + "-" + (zone.name || (zoneIndex + 1) + "区"));
    });
  });
  if (!data.selectedBasementLevels?.length) {
    data.selectedBasementLevels = freshBasementLevels;
  } else {
    // Preserve user's existing selections but add any new zones from updated project data
    freshBasementLevels.forEach(function(key) {
      if (!data.selectedBasementLevels.includes(key)) {
        data.selectedBasementLevels.push(key);
      }
    });
  }
  var entities = getWizardSequenceEntities(data);
  var existing = {};
  (data.entityDependencies || []).forEach(function(dep) {
    existing[dep.entityType + "::" + dep.entityName] = dep;
  });
  var allEntityNames = entities.map(function(item) { return item.entityName; });
  data.entityDependencies = entities.map(function(entity, index) {
    var oldDep = existing[entity.entityType + "::" + entity.entityName] || {};
    var otherEntities = allEntityNames.filter(function(name) { return name !== entity.entityName; });
    var validDependOnEntity = otherEntities.includes(oldDep.dependOnEntity);
    var hasRelationship = Object.prototype.hasOwnProperty.call(oldDep, "relationship");
    return {
      entityName: entity.entityName,
      entityType: entity.entityType,
      relationship: hasRelationship ? oldDep.relationship : "",
      dependOnEntity: validDependOnEntity ? oldDep.dependOnEntity : "",
      dependOnTask: validDependOnEntity ? (oldDep.dependOnTask || "") : "",
      lagDays: Number(oldDep.lagDays) || 0,
      startDate: oldDep.startDate || data.startDate || ''
    };
  });
  delete data.buildingSequence;
  delete data.basementDependencies;
}

function renderWizardStepSequence(data) {
  ensureWizardSequenceDefaults(data);
  var project = getActiveProject();
  var entities = getWizardSequenceEntities(data);
  var totalBuildingArea = entities.filter(function(entity) {
    return entity.entityType === "building";
  }).reduce(function(sum, entity) {
    return sum + (entity.building?.area || 0);
  }, 0);
  return `
    ${renderWizardHeader("第 4 步：施工顺序", "4/8")}
    <div class="panel" style="margin-bottom:16px">
      <div class="project-summary-grid">
        <div class="project-summary-item">
          <span>项目名称</span>
          <strong>${escapeHtml(project?.name || data.name || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>工程类型</span>
          <strong>${escapeHtml(project?.type || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>施工实体</span>
          <strong>${entities.length} 个</strong>
        </div>
        <div class="project-summary-item">
          <span>楼栋面积</span>
          <strong>${totalBuildingArea.toLocaleString()} m²</strong>
        </div>
      </div>
    </div>
    <div class="wizard-subsection">
      <div class="section-heading" style="margin-bottom:10px">
        <div>
          <h3 class="section-title">实体依赖行</h3>
          <span class="section-subtitle">依赖实体仅可选择当前实体之前的楼栋或地下室分区。</span>
        </div>
      </div>
      <div class="template-task-list">
        <div style="display:grid;grid-template-columns:minmax(150px,1.1fr) 72px minmax(150px,1fr) minmax(170px,1.1fr) 76px;gap:8px;align-items:center;color:var(--muted);font-size:12px;padding:0 8px">
          <span>实体</span>
          <span>关系</span>
          <span>依赖实体 / 开工日期</span>
          <span>依赖工序</span>
          <span>滞后天</span>
        </div>
        ${data.entityDependencies.map(function(dep, index) {
          var entity = entities[index] || {};
          var otherEntities = entities.filter(function(item) { return item.entityName !== dep.entityName; });
          return '<div class="entity-dep-row" style="display:grid;grid-template-columns:minmax(150px,1.1fr) 72px minmax(150px,1fr) minmax(170px,1.1fr) 76px;gap:8px;align-items:center;border:1px solid var(--line);border-radius:6px;padding:8px">' +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
                '<strong>' + escapeHtml(dep.entityName) + '</strong>' +
                '<span class="scope-type">' + (dep.entityType === "building" ? "楼栋" : "地下室") + '</span>' +
              '</div>' +
              '<span style="color:var(--muted);font-size:12px">' + escapeHtml(entity.detailText || "-") + '</span>' +
            '</div>' +
            '<select class="entity-dep-field" data-entity-index="' + index + '" data-entity-field="relationship" style="width:72px">' +
              ["", "FS", "SS", "FF", "SF"].map(function(rel) {
                return '<option value="' + rel + '"' + (dep.relationship === rel ? ' selected' : '') + '>' + (rel || '-') + '</option>';
              }).join("") +
            '</select>' +
            (dep.relationship ?
              '<select class="entity-dep-field" data-entity-index="' + index + '" data-entity-field="dependOnEntity">' +
                '<option value="">请选择实体</option>' +
                otherEntities.map(function(item) {
                  return '<option value="' + escapeHtml(item.entityName) + '"' + (dep.dependOnEntity === item.entityName ? ' selected' : '') + '>' + escapeHtml(item.entityName) + '</option>';
                }).join("") +
              '</select>' +
              '<select class="entity-dep-field" data-entity-index="' + index + '" data-entity-field="dependOnTask">' +
                renderWizardEntityTaskOptions(data, dep, false) +
              '</select>' +
              '<input class="entity-dep-field" data-entity-index="' + index + '" data-entity-field="lagDays" type="number" min="0" value="' + (Number(dep.lagDays) || 0) + '" />'
            :
              '<input class="entity-dep-field" data-entity-index="' + index + '" data-entity-field="startDate" type="date" value="' + (dep.startDate || data.startDate || '') + '" style="grid-column:span 3" />' +
              '<span style="font-size:11px;color:var(--muted)"></span>'  // placeholder for lagDays col
            ) +
          '</div>';
        }).join("") || '<p class="empty-note">暂无施工实体，请先在步骤1选择楼栋或地下室范围。</p>'}
      </div>
    </div>
    ${renderWizardActions()}
  `;
}

function renderWbsImportPanel() {
  return `
    <details class="wbs-import-panel">
      <summary>📋 或手动导入 WBS</summary>
      <form id="schedule-import-form" class="form-grid">
        <input id="schedule-import-source" value="演示-WBS-导入模板.csv" />
        <div class="mini-card">
          <span>格式说明</span>
          <strong>名称 | 责任人 | 完成率 | 日期 | 偏差天数 | 是否关键</strong>
          <p>示例在下方文本框中，导入后自动触发进度 Agent 分析。</p>
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
    </details>
  `;
}

function renderPlanWizard() {
  const { step, data } = state.planWizard;
  const steps = [
    renderWizardStep1,
    renderWizardStepTemplateSelect,
    renderWizardStepTemplateEdit,
    renderWizardStepSequence,
    renderWizardStepRelations,
    renderWizardStep2,
    renderWizardStep3,
    renderWizardResult
  ];
  const renderStep = steps[Math.min(step - 1, steps.length - 1)];
  return `
    <section class="panel fade-in">
      ${renderWizardSteps()}
      <div class="auto-plan-form">
        ${renderStep(data)}
      </div>
      ${renderWbsImportPanel()}
    </section>
  `;
}

function renderVerticalTransportDeviceCard(kind, device, index, buildings, basementZoneOptions, source = "wizard") {
  const isTower = kind === "tower";
  const modelOptions = isTower ? TOWER_CRANE_MODELS : CONSTRUCTION_ELEVATOR_MODELS;
  const buildingOptions = buildings.map((b) => ({
    value: b.name,
    label: `${b.name} · ${b.floors || "-"}F`
  }));
  const basementOptions = basementZoneOptions.map((zone) => ({
    value: zone.key,
    label: `${zone.label} · ${(zone.area || 0).toLocaleString()}m²`
  }));
  const coverageEmpty = device.enabled !== false && !(device.coveredBuildings || []).length && (!isTower || !(device.coveredBasementZones || []).length);
  return `
    <div class="transport-device-card ${device.enabled === false ? "disabled" : ""}">
      <div class="transport-card-header">
        <label class="transport-toggle">
          <input
            type="checkbox"
            class="transport-field"
            data-transport-source="${source}"
            data-transport-kind="${kind}"
            data-transport-index="${index}"
            data-transport-field="enabled"
            data-transport-type="boolean"
            ${device.enabled !== false ? "checked" : ""}
          />
          <span>${escapeHtml(device.code || (isTower ? "TC" : "EL"))}</span>
        </label>
        <button class="secondary-button small" type="button" data-remove-transport="${kind}" data-transport-source="${source}" data-transport-index="${index}">删除</button>
      </div>
      <div class="transport-fields">
        <label>
          <span>设备编号</span>
          <input
            class="transport-field"
            data-transport-source="${source}"
            data-transport-kind="${kind}"
            data-transport-index="${index}"
            data-transport-field="code"
            value="${escapeHtml(device.code || "")}"
          />
        </label>
        <label>
          <span>型号</span>
          <select class="transport-field" data-transport-source="${source}" data-transport-kind="${kind}" data-transport-index="${index}" data-transport-field="model">
            ${modelOptions.map((model) => `<option value="${escapeHtml(model)}" ${device.model === model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="transport-coverage-grid">
        <div>
          <strong>${isTower ? "覆盖主体楼栋" : "覆盖楼栋"}</strong>
          ${renderTransportCoverageOptions({
            kind,
            source,
            index,
            field: "coveredBuildings",
            options: buildingOptions,
            selected: device.coveredBuildings || []
          })}
        </div>
        ${isTower ? `
          <div>
            <strong>覆盖地下室分区</strong>
            ${renderTransportCoverageOptions({
              kind,
              source,
              index,
              field: "coveredBasementZones",
              options: basementOptions,
              selected: device.coveredBasementZones || []
            })}
          </div>
        ` : ""}
      </div>
      ${coverageEmpty ? `<div class="transport-warning">覆盖范围为空，请调整或停用设备</div>` : ""}
      <div class="transport-prereq-grid">
        ${renderPrerequisiteList("安装前置条件", device.installPrerequisites)}
        ${renderPrerequisiteList("拆除前置条件", device.removePrerequisites)}
      </div>
    </div>
  `;
}

function renderVerticalTransportSection(data, buildings, basementLevels, options = {}) {
  const source = options.source || "wizard";
  const selectedBuildings = (buildings || []).filter((b) => (data.selectedBuildings || []).includes(b.name));
  const basementZoneOptions = getBasementZoneOptions(basementLevels).filter((zone) => (data.selectedBasementLevels || []).includes(zone.key));
  const towerCranes = data.towerCranes || [];
  const elevators = data.constructionElevators || [];
  const sectionClass = options.frameless
    ? `vertical-transport-section ${options.extraClass || ""}`
    : `panel vertical-transport-section ${options.extraClass || ""}`;
  const collapsible = options.collapsible !== false;
  const collapseKey = options.collapseKey || `vertical-transport-collapsed:${source}`;
  const collapsed = collapsible && sessionStorage.getItem(collapseKey) === "true";
  return `
    <div class="${sectionClass}">
      <div class="section-heading ${collapsible ? "collapsible-heading" : ""}" ${collapsible ? `data-toggle-vertical-transport="${escapeHtml(collapseKey)}"` : ""}>
        <div>
          <h3 class="section-title">🏗️ ${options.title || "垂直运输设备"}</h3>
          <span class="section-subtitle">${options.subtitle || "配置塔吊、施工电梯的型号、覆盖范围和安装拆除前置条件。"}</span>
        </div>
        <span>${towerCranes.filter((item) => item.enabled !== false).length} 台塔吊 · ${elevators.filter((item) => item.enabled !== false).length} 台施工电梯 · ${collapsed ? "展开" : "收起"}</span>
      </div>
      <div class="vertical-transport-body" ${collapsed ? "hidden" : ""}>
      <div class="transport-type-block">
        <div class="transport-type-heading">
          <strong>塔吊</strong>
          <button class="secondary-button small" type="button" data-add-transport="tower" data-transport-source="${source}">+ 添加塔吊</button>
        </div>
        <div class="transport-device-grid">
          ${towerCranes.map((device, index) => renderVerticalTransportDeviceCard("tower", device, index, selectedBuildings, basementZoneOptions, source)).join("") || `<p class="empty-note">暂无塔吊配置，可按施工范围添加。</p>`}
        </div>
      </div>
      <div class="transport-type-block">
        <div class="transport-type-heading">
          <strong>施工电梯</strong>
          <button class="secondary-button small" type="button" data-add-transport="elevator" data-transport-source="${source}">+ 添加施工电梯</button>
        </div>
        <div class="transport-device-grid">
          ${elevators.map((device, index) => renderVerticalTransportDeviceCard("elevator", device, index, selectedBuildings, basementZoneOptions, source)).join("") || `<p class="empty-note">暂无施工电梯配置，高层楼栋建议至少配置一台。</p>`}
        </div>
      </div>
      <p class="wizard-help">这些设备会作为后续总控计划的资源约束，生成塔吊/施工电梯安装与拆除节点，并供进度 Agent 检查覆盖范围和拆除时机。</p>
      </div>
    </div>
  `;
}

function renderWizardStep1(data) {
  const proj = getActiveProject();
  const buildings = proj?.buildings || [];
  const basement = proj?.basement || {};
  const basementLevels = basement.levels || [];
  const totalArea = buildings.reduce((s, b) => s + (b.area || 0), 0);
  // Initialize selections if empty
  if (!data.selectedBuildings || data.selectedBuildings.length === 0) {
    data.selectedBuildings = buildings.map(function(b) { return b.name; });
  }
  if (!data.selectedBasementLevels || data.selectedBasementLevels.length === 0) {
    // Initialize with all zones: B2-1区, B2-2区, B1-1区
    data.selectedBasementLevels = [];
    basementLevels.forEach(function(l) {
      var zones = l.zones || [];
      if (zones.length === 0) zones = [{ name: '1区' }];
      zones.forEach(function(z) {
        data.selectedBasementLevels.push(l.name + '-' + z.name);
      });
    });
  }
  const selBuildings = data.selectedBuildings || [];
  const selBasement = data.selectedBasementLevels || [];
  ensureVerticalTransportDefaults(data, buildings, basementLevels);
  // Compute selected totals
  var selBldgData = buildings.filter(function(b) { return selBuildings.includes(b.name); });
  var selArea = selBldgData.reduce(function(s, b) { return s + (b.area || 0); }, 0);
  return `
    ${renderWizardHeader("第 1 步：项目信息", "1/8")}
    <p class="wizard-help" style="margin-bottom:12px">确认项目基本信息，选择本次编制进度计划的范围。</p>
    <div class="panel" style="margin-bottom:20px">
      <div class="project-summary-grid">
        <div class="project-summary-item">
          <span>项目名称</span>
          <strong>${escapeHtml(proj?.name || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>项目编码</span>
          <strong>${escapeHtml(proj?.code || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>工程类型</span>
          <strong>${escapeHtml(proj?.type || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>当前阶段</span>
          <strong>${escapeHtml(proj?.stage || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>项目经理</span>
          <strong>${escapeHtml(proj?.manager || "-")}</strong>
        </div>
        <div class="project-summary-item">
          <span>总建筑面积</span>
          <strong>${totalArea.toLocaleString()} m²</strong>
        </div>
      </div>
    </div>

    ${buildings.length ? `
    <div class="panel" style="margin-bottom:16px">
      <div class="section-heading" style="margin-bottom:10px">
        <h3 class="section-title">🏗️ 施工范围 — 楼栋选择</h3>
        <span>${selBuildings.length}/${buildings.length} 栋 · ${selArea.toLocaleString()} m²</span>
      </div>
      <div class="building-select-grid">
        ${buildings.map(function(b) {
          var checked = selBuildings.includes(b.name) ? 'selected' : '';
          return '<label class="building-select-item ' + checked + '" data-build="' + escapeHtml(b.name) + '">' +
            '<input type="checkbox" class="building-scope-cb" value="' + escapeHtml(b.name) + '" ' + (checked ? 'checked' : '') + ' />' +
            '<strong>' + escapeHtml(b.name) + '</strong>' +
            '<span>' + (b.floors || '-') + 'F</span>' +
            '<span>' + (b.area || 0).toLocaleString() + 'm²</span>' +
            '<span class="scope-type">' + (b.structureType || b.type || '-') + '</span>' +
          '</label>';
        }).join('')}
      </div>
    </div>` : ''}

    ${basementLevels.length ? `
    <div class="panel" style="margin-bottom:16px">
      <div class="section-heading" style="margin-bottom:10px">
        <h3 class="section-title">🏠 施工范围 — 地下室选择</h3>
        <span>${selBasement.length} 层</span>
      </div>
      <div class="basement-select-grid">
        ${basementLevels.map(function(l) {
          var zones = l.zones || [];
          if (zones.length === 0) {
            zones = [{ name: '1区', area: l.area || 0, coverage: l.coverage || '全部覆盖', coverageBuildings: l.coverageBuildings || [] }];
          }
          return '<div style="border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:6px">' +
            '<div style="font-size:13px;font-weight:600;margin-bottom:6px">' + escapeHtml(l.name || '') + '（层高' + (l.height || '-') + 'm）</div>' +
            '<div style="display:grid;gap:4px">' +
            zones.map(function(z, zi) {
              var checked = selBasement.includes(l.name + '-' + z.name) ? 'selected' : '';
              var covLabel = z.coverage || '全部覆盖';
              var covBldgs = (z.coverageBuildings || []).join('、');
              return '<label class="basement-select-item ' + checked + '" style="margin:0;padding:6px 8px">' +
                '<input type="checkbox" class="basement-scope-cb" value="' + escapeHtml(l.name + '-' + z.name) + '" ' + (checked ? 'checked' : '') + ' />' +
                '<div style="display:flex;align-items:center;gap:4px;width:100%">' +
                  '<span style="font-size:11px;color:var(--muted);min-width:30px">' + (zi + 1) + '</span>' +
                  '<strong style="font-size:12px">' + escapeHtml(z.name || '') + '</strong>' +
                  '<span style="font-size:11px">' + (z.area || 0).toLocaleString() + 'm²</span>' +
                  '<span class="scope-type" style="font-size:10px">' + covLabel + '</span>' +
                  (covBldgs ? '<span style="font-size:10px;color:var(--muted)">关联：' + covBldgs + '</span>' : '') +
                '</div>' +
              '</label>';
            }).join('') + '</div></div>';
        }).join('')}
      </div>
    </div>` : ''}

    <div class="form-row">
      ${renderWizardField({ id: "plan-duration", field: "durationMonths", label: "计划工期", value: data.durationMonths, type: "number", min: 1, max: 60, suffix: "个月" })}
      ${renderWizardField({ id: "plan-finish", field: "finishDate", label: "计划竣工", value: data.finishDate, type: "date" })}
      ${renderWizardField({ id: "plan-start", field: "startDate", label: "计划开工", value: data.startDate, type: "date" })}
    </div>
    ${renderWizardActions({ prev: false, cancel: true })}
  `;
}

function renderWizardStep2(data) {
  const holidays = Array.isArray(data.holidays) ? data.holidays : [];
  return `
    ${renderWizardHeader("第 6 步：工作日历与硬约束", "6/8")}
    <div class="form-row">
      ${renderWizardSelect({
        id: "plan-work-days",
        field: "workDaysPerWeek",
        label: "每周工作天数",
        value: String(data.workDaysPerWeek),
        options: [5, 6, 7].map((item) => ({ value: String(item), label: `${item} 天` }))
      })}
      ${renderWizardField({ id: "plan-work-hours", field: "workHoursPerDay", label: "每天工作", value: data.workHoursPerDay, type: "number", min: 1, max: 24, suffix: "小时" })}
    </div>
    <div class="form-group">
      <label>排除日期（节假日/特殊停工）</label>
      <div class="holiday-list">
        ${holidays.map((holiday, index) => `
          <span class="holiday-chip">
            <input type="date" value="${escapeHtml(holiday)}" data-holiday-index="${index}" />
            <button class="secondary-button small" type="button" data-remove-holiday="${index}">✕</button>
          </span>
        `).join("")}
        <button class="secondary-button small" id="btn-add-holiday" type="button">+ 添加</button>
      </div>
      <p class="wizard-help">示例：端午节、台风季、混凝土养护期等</p>
    </div>
    <div class="wizard-checkbox-list">
      ${renderWizardCheckbox({ field: "includeWeather", label: "考虑雨季影响", checked: data.includeWeather })}
      ${renderWizardCheckbox({ field: "includeWinter", label: "考虑冬季施工降效", checked: data.includeWinter })}
    </div>
    ${renderWizardTextarea({ id: "plan-hard-constraints", field: "hardConstraints", label: "硬性约束（不可变逻辑或日期，每行一个）", value: data.hardConstraints, rows: 4, placeholder: "吊顶封板不得早于机电隐蔽验收\n设备安装不得早于设备基础移交和设备到货" })}
    ${renderWizardActions()}
  `;
}

function renderWizardStep3(data) {
  return `
    ${renderWizardHeader("第 7 步：里程碑、资源与外部依赖", "7/8")}
    ${renderWizardTextarea({ id: "plan-milestones", field: "milestones", label: "关键里程碑（每行一个，可选）", value: data.milestones, rows: 5 })}
    ${renderWizardTextarea({ id: "plan-external-deps", field: "externalDeps", label: "外部依赖（供应商/政府/其他）", value: data.externalDeps, rows: 4, placeholder: "PC 构件供货周期 45 天\n电梯设备到货 2026-08-15" })}
    <div class="wizard-subsection">
      <strong>劳动力配置</strong>
      <div class="form-row">
        ${renderWizardSelect({
          id: "plan-labor-crews",
          field: "laborCrews",
          label: "主要劳务班组",
          value: String(data.laborCrews),
          options: [1, 2, 3, 4].map((item) => ({ value: String(item), label: `${item} 个` }))
        })}
        ${renderWizardField({ id: "plan-crew-size", field: "crewSize", label: "每班人数", value: data.crewSize, type: "number", min: 1, max: 500, suffix: "人" })}
      </div>
    </div>
    <div class="wizard-subsection">
      <strong>机械设备</strong>
      <div class="wizard-equipment-row">
        ${renderWizardCheckbox({ field: "hasTowerCrane", label: "塔吊", checked: data.hasTowerCrane })}
        ${renderWizardField({ id: "plan-tower-crane-count", field: "towerCraneCount", label: "数量", value: data.towerCraneCount, type: "number", min: 0, max: 20 })}
        ${renderWizardCheckbox({ field: "hasConstructionElevator", label: "施工电梯", checked: data.hasConstructionElevator })}
        ${renderWizardCheckbox({ field: "hasMobileCrane", label: "汽车吊", checked: data.hasMobileCrane })}
      </div>
    </div>
    <div class="wizard-subsection">
      <strong>穿插施工策略</strong>
      <div class="form-row">
        ${renderWizardSelect({
          id: "plan-segment-count",
          field: "segmentCount",
          label: "流水段划分",
          value: String(data.segmentCount),
          options: [1, 2, 3, 4, 5].map((item) => ({ value: String(item), label: `${item} 个` }))
        })}
        ${renderWizardField({ id: "plan-lag-floors", field: "lagFloors", label: "插入滞后层数", value: data.lagFloors, type: "number", min: 0, max: 30, suffix: "层" })}
      </div>
      ${renderWizardSelect({
        id: "plan-concurrent-work",
        field: "concurrentWork",
        label: "穿插强度",
        value: data.concurrentWork,
        options: [
          { value: "conservative", label: "保守" },
          { value: "normal", label: "正常" },
          { value: "aggressive", label: "紧凑" }
        ]
      })}
    </div>
    ${renderWizardTextarea({ id: "plan-note", field: "specialNotes", label: "补充说明", value: data.specialNotes, rows: 3, placeholder: "特殊工艺要求、关键资源约束等" })}
    ${renderWizardActions({ nextText: "生成计划 →", nextId: "btn-generate-plan" })}
  `;
}

function renderWizardResult(data) {
  const planData = data.generated || state.generatedPlan;
  ensureMasterWizardDefaults(data);
  const agentReviews = planData?.reviews?.length ? planData.reviews : buildMasterAgentReviews(data);
  const auditStatus = planData?.audit?.status || "passed";
  const applyBlocked = auditStatus === "blocked";
  return `
    ${renderWizardHeader("第 8 步：生成结果", "8/8")}
    <div id="plan-result" class="plan-result">
      <div class="section-heading">
        <div>
          <h3 class="section-title">生成的进度计划</h3>
          <span class="section-subtitle">节点列表、里程碑与进度曲线入口</span>
        </div>
        <div class="wizard-result-actions">
          <button class="secondary-button" id="btn-wizard-prev" type="button">← 返回资源配置</button>
          <button class="secondary-button" id="btn-back-schedule" type="button">查看进度曲线</button>
          <button class="primary-button" id="btn-apply-plan" type="button" ${applyBlocked ? "disabled" : ""}>${applyBlocked ? "审核未通过" : "应用到项目"}</button>
        </div>
      </div>
      <div id="plan-result-content">${planData ? renderAutoPlanResult(planData) : `<p class="empty-note">尚未生成计划。</p>`}</div>
      <div class="agent-review-panel wizard-agent-review">
        <strong>进度 Agent 生成前检查</strong>
        ${agentReviews.map((review) => `<p>${review}</p>`).join("")}
      </div>
      ${applyBlocked ? `<p class="empty-note">当前存在阻断项，请先返回前面的步骤补齐约束、覆盖范围或验收链条，再应用到项目。</p>` : ``}
    </div>
  `;
}

function buildMasterAgentReviews(data) {
  const template = getMasterScheduleTemplate();
  const selected = data.selectedMasterLanes || [];
  const enabledRelations = data.enabledMasterRelations || [];
  const reviews = buildVerticalTransportReviews(data);
  if (selected.includes("mep")) {
    // MEP plan simplified to 4 milestone nodes
    reviews.push("机电计划已简化为4个里程碑节点：机电预留预埋、主管线安装、设备安装调试、系统联动调试。");
  }
  template.relations.forEach((relation, index) => {
    const key = String(index);
    if (!enabledRelations.includes(key)) return;
    if (!masterRelationIsAvailable(index, relation, data)) return;
    reviews.push(`${relation.from} → ${relation.to}：${relation.note}`);
  });
  if (!reviews.length) reviews.push("当前选择下暂无跨专业审核项，建议返回第 2 步确认主线和节点是否完整。");
  return reviews.slice(0, 6);
}

function buildVerticalTransportReviews(data) {
  const project = getActiveProject();
  const selectedBuildings = data.selectedBuildings || [];
  const buildings = (project?.buildings || []).filter((building) => selectedBuildings.includes(building.name));
  const enabledTowers = (data.towerCranes || []).filter((item) => item.enabled !== false);
  const enabledElevators = (data.constructionElevators || []).filter((item) => item.enabled !== false);
  const reviews = [];
  enabledTowers.forEach((tower) => {
    if (!(tower.coveredBuildings || []).length && !(tower.coveredBasementZones || []).length) {
      reviews.push(`${tower.code || "塔吊"} 覆盖范围为空，请调整覆盖楼栋/地下室分区或停用该设备。`);
    }
  });
  enabledElevators.forEach((elevator) => {
    if (!(elevator.coveredBuildings || []).length) {
      reviews.push(`${elevator.code || "施工电梯"} 覆盖楼栋为空，请调整覆盖楼栋或停用该设备。`);
    }
  });
  const uncoveredHighRise = buildings
    .filter(isHighRiseBuilding)
    .filter((building) => !enabledElevators.some((elevator) => (elevator.coveredBuildings || []).includes(building.name)))
    .map((building) => building.name);
  if (uncoveredHighRise.length) {
    reviews.push(`高层楼栋 ${uncoveredHighRise.join("、")} 未配置施工电梯覆盖，装饰和机电材料垂直运输存在计划风险。`);
  }
  if (enabledTowers.length) {
    reviews.push("塔吊拆除节点应晚于主体封顶、屋面或外立面大件吊装完成，并校核室外道路条件。");
  }
  if (enabledElevators.length) {
    reviews.push("施工电梯拆除节点应晚于砌体、抹灰、机电材料运输完成，并确认正式电梯或替代运输条件可用。");
  }
  return reviews;
}

function syncWizardFields() {
  const data = state.planWizard.data;
  document.querySelectorAll(".wizard-field").forEach((el) => {
    const field = el.dataset.wizardField;
    if (!field) return;
    const type = el.dataset.wizardType || "string";
    if (type === "boolean") {
      data[field] = el.checked;
    } else if (type === "number") {
      data[field] = Number(el.value);
    } else {
      data[field] = el.value;
    }
  });
}

function generatePlanFromWizard(wizardData) {
  const durationMonths = Math.max(1, Math.min(60, Number(wizardData.durationMonths) || 6));
  const workDaysPerWeek = Math.max(1, Math.min(7, Number(wizardData.workDaysPerWeek) || 5));
  const calendarDays = durationMonths * 30;
  const weatherFactor = wizardData.includeWeather ? 0.92 : 1;
  const winterFactor = wizardData.includeWinter ? 0.94 : 1;
  const holidayDays = Array.isArray(wizardData.holidays) ? wizardData.holidays.filter(Boolean).length : 0;
  const workDays = Math.max(1, Math.round(calendarDays * (workDaysPerWeek / 7) * weatherFactor * winterFactor) - holidayDays);
  var entityDependencies = (wizardData.entityDependencies || []).map(function(dep) {
    return {
      entityName: dep.entityName,
      entityType: dep.entityType,
      relationship: dep.relationship || "",
      dependOnEntity: dep.dependOnEntity || "",
      dependOnTask: dep.dependOnTask || "",
      lagDays: Number(dep.lagDays) || 0
    };
  });
  const enabledTowerCranes = (wizardData.towerCranes || []).filter((item) => item.enabled !== false);
  const enabledConstructionElevators = (wizardData.constructionElevators || []).filter((item) => item.enabled !== false);

  const autoPlan = generateAutoPlan({
    name: wizardData.name,
    type: wizardData.type,
    durationMonths,
    startDate: wizardData.startDate || formatDateInputValue(),
    milestones: wizardData.milestones,
    workDaysPerWeek,
    workHoursPerDay: Number(wizardData.workHoursPerDay) || 8,
    totalDays: workDays,
    hardConstraints: wizardData.hardConstraints,
    externalDeps: wizardData.externalDeps,
    // Future plan generation can consume entity-level dependencies here.
    entityDependencies: entityDependencies,
    resources: {
      laborCrews: Number(wizardData.laborCrews) || 1,
      crewSize: Number(wizardData.crewSize) || 30,
      towerCraneCount: enabledTowerCranes.length || (wizardData.hasTowerCrane ? Number(wizardData.towerCraneCount) || 1 : 0),
      towerCranes: enabledTowerCranes,
      hasConstructionElevator: enabledConstructionElevators.length > 0 || Boolean(wizardData.hasConstructionElevator),
      constructionElevators: enabledConstructionElevators,
      hasMobileCrane: Boolean(wizardData.hasMobileCrane),
      concurrentWork: wizardData.concurrentWork,
      segmentCount: Number(wizardData.segmentCount) || 1,
      lagFloors: Number(wizardData.lagFloors) || 0
    },
    note: wizardData.specialNotes
  });
  autoPlan.milestones = filterMilestonesForMepConfig(autoPlan.milestones, wizardData);
  const masterNodes = buildMasterPlanNodesFromWizard(wizardData, autoPlan.nodes, wizardData.startDate || formatDateInputValue());
  if (masterNodes.length) {
    return {
      ...autoPlan,
      nodes: masterNodes.concat(buildVerticalTransportPlanNodes(wizardData, wizardData.startDate || formatDateInputValue()))
    };
  }
  return autoPlan;
}

function filterMilestonesForMepConfig(milestones, data) {
  ensureMepConfigDefaults(data);
  var allSystems = [];
  (data.mepSpaces || []).forEach(function(s) {
    var sys = (data.mepEditorSystems || {})[s.id] || [];
    allSystems = allSystems.concat(sys);
  });
  return (milestones || []).filter((milestone) => {
    const name = String(milestone.name || "");
    if (name.includes("消防") && !allSystems.includes("fire")) return false;
    if (name.includes("电梯") && !allSystems.includes("elevator")) return false;
    return true;
  });
}

function buildVerticalTransportPlanNodes(wizardData, startDate) {
  const base = new Date(startDate || formatDateInputValue());
  const nodes = [];
  const addDays = (days) => {
    const date = new Date(base);
    date.setDate(date.getDate() + days);
    return formatDateInputValue(date);
  };
  (wizardData.towerCranes || [])
    .filter((item) => item.enabled !== false)
    .forEach((tower, index) => {
      nodes.push({
        name: `${tower.code || `TC-${index + 1}`} 塔吊安装验收`,
        owner: "机械管理员",
        percent: 0,
        plannedDate: addDays(7 + index * 3),
        varianceDays: 0,
        critical: true,
        source: "vertical-transport",
        trade: "机械设备",
        predecessor: "塔吊基础施工完成",
        agentHint: "校核基础强度、安装方案、安拆资质、备案和进场道路。"
      });
      nodes.push({
        name: `${tower.code || `TC-${index + 1}`} 塔吊拆除`,
        owner: "机械管理员",
        percent: 0,
        plannedDate: addDays(150 + index * 3),
        varianceDays: 0,
        critical: true,
        source: "vertical-transport",
        trade: "机械设备",
        predecessor: "主体结构封顶 / 大件吊装完成",
        agentHint: "不得早于主体封顶、屋面或外立面大件吊装完成。"
      });
    });
  (wizardData.constructionElevators || [])
    .filter((item) => item.enabled !== false)
    .forEach((elevator, index) => {
      nodes.push({
        name: `${elevator.code || `EL-${index + 1}`} 施工电梯安装验收`,
        owner: "机械管理员",
        percent: 0,
        plannedDate: addDays(45 + index * 5),
        varianceDays: 0,
        critical: true,
        source: "vertical-transport",
        trade: "机械设备",
        predecessor: "主体结构达到安装楼层条件",
        agentHint: "校核附着点结构强度、基础、安装方案和备案。"
      });
      nodes.push({
        name: `${elevator.code || `EL-${index + 1}`} 施工电梯拆除`,
        owner: "机械管理员",
        percent: 0,
        plannedDate: addDays(170 + index * 5),
        varianceDays: 0,
        critical: true,
        source: "vertical-transport",
        trade: "机械设备",
        predecessor: "室内垂直运输需求基本结束",
        agentHint: "不得早于砌体、抹灰、机电材料运输完成。"
      });
    });
  return nodes;
}

function parseWizardDateOrFallback(value, fallbackDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return value;
  return formatDateInputValue(fallbackDate);
}

function buildMasterPlanNodesFromWizard(wizardData, fallbackNodes, startDate) {
  ensureMasterWizardDefaults(wizardData);
  const selected = wizardData.selectedMasterLanes || [];
  const nodes = [];
  const base = new Date(startDate || formatDateInputValue());
  selected.forEach((laneId) => {
    if (laneId === "mep") {
      const sourceNodes = getMasterLaneNodes(wizardData, laneId).filter((node) => node.enabled !== false && node.name?.trim());
      sourceNodes.forEach((node) => {
        const planned = new Date(base);
        planned.setDate(planned.getDate() + nodes.length * 7);
        nodes.push({
          name: node.name.trim(),
          owner: node.owner || "机电工程师",
          percent: Math.min(100, Math.max(0, Math.round(((nodes.length + 1) / Math.max(1, fallbackNodes.length || 1)) * 100))),
          plannedDate: parseWizardDateOrFallback(node.finish, planned),
          varianceDays: 0,
          critical: Boolean(node.critical),
          source: node.source || "mep-generated",
          trade: node.trade || "机电",
          predecessor: node.predecessor,
          startRule: node.startRule || node.start,
          agentHint: node.agentHint,
          system: node.system,
          area: node.area
        });
      });
      return;
    }
    getMasterLaneNodes(wizardData, laneId)
      .filter((node) => node.enabled !== false && node.name?.trim())
      .filter((node) => true)
      .forEach((node) => {
        const planned = new Date(base);
        planned.setDate(planned.getDate() + nodes.length * 7);
        nodes.push({
          name: node.name.trim(),
          owner: node.owner || "专业负责人",
          percent: Math.min(100, Math.max(0, Math.round(((nodes.length + 1) / Math.max(1, fallbackNodes.length || 1)) * 100))),
          plannedDate: parseWizardDateOrFallback(node.finish, planned),
          varianceDays: 0,
          critical: Boolean(node.critical),
          source: "master-line",
          trade: node.trade,
          predecessor: node.predecessor,
          startRule: node.start,
          agentHint: node.agentHint
        });
      });
  });
  const denominator = Math.max(1, nodes.length);
  return nodes.map((node, index) => ({
    ...node,
    percent: index === denominator - 1 ? 100 : Math.round(((index + 1) / denominator) * 100)
  }));
}

function renderAutoPlanResult(planData) {
  const audit = planData.audit || { status: "passed", blockers: [], warnings: [], passedChecks: [], checks: [] };
  const auditLabelMap = {
    passed: "审核通过",
    warning: "审核通过（有提醒）",
    blocked: "审核未通过"
  };
  return `
    <div class="mini-card">
      <span>生成结果</span>
      <strong>${planData.nodes.length} 个 WBS 节点 · ${planData.milestones.length} 个里程碑</strong>
      <p>可先调整节点信息，确认后将通过 WBS 导入接口应用到当前项目，并触发进度 Agent 分析。</p>
    </div>
    <div class="mini-card">
      <span>审核结论</span>
      <strong>${auditLabelMap[audit.status] || audit.status}</strong>
      <p>阻断项 ${audit.blockers?.length || 0} 条 · 提醒项 ${audit.warnings?.length || 0} 条 · 通过检查 ${audit.passedChecks?.length || 0} 条</p>
    </div>
    <div class="table-list">
      ${planData.nodes.map((node, index) => `
        <div class="table-row on-track" data-node-index="${index}">
          <div class="editable-node-row">
            <input class="edit-node-name" value="${escapeHtml(node.name)}" placeholder="节点名称" />
            <input class="edit-node-owner" value="${escapeHtml(node.owner)}" placeholder="责任人" />
            <input class="edit-node-pct" type="number" value="${node.percent}" min="0" max="100" />
            <input class="edit-node-date" type="date" value="${node.plannedDate}" />
            <label><input type="checkbox" class="edit-node-critical" ${node.critical ? "checked" : ""} /> 关键</label>
            <button class="secondary-button small" type="button" data-remove-node="${index}">✕</button>
          </div>
        </div>
      `).join("") || `<p class="empty-note">暂无节点，请添加节点后填写。</p>`}
    </div>
    <button class="secondary-button small add-node-btn" type="button" data-add-node>+ 添加节点</button>
    <div class="milestone-timeline-inline auto-plan-milestones">
      ${planData.milestones.map((milestone, index) => `
        <div class="milestone-item-inline ${milestone.status || ""}">
          <div class="milestone-dot ${index === 0 ? "next" : ""}"></div>
          <div class="milestone-info">
            <span class="milestone-name">${escapeHtml(milestone.name)}</span>
            <span class="milestone-date">${milestone.plannedDate}</span>
          </div>
        </div>
      `).join("") || `<p class="empty-note">未填写关键里程碑。</p>`}
    </div>
  `;
}

function readEditedPlanNodes() {
  const rows = [];
  document.querySelectorAll("[data-node-index]").forEach((row) => {
    rows.push({
      name: row.querySelector(".edit-node-name").value,
      owner: row.querySelector(".edit-node-owner").value,
      percent: Number(row.querySelector(".edit-node-pct").value),
      plannedDate: row.querySelector(".edit-node-date").value,
      varianceDays: 0,
      critical: row.querySelector(".edit-node-critical").checked
    });
  });
  return rows;
}

function rerenderGeneratedPlanResult() {
  const content = document.querySelector("#plan-result-content");
  if (!content || !state.generatedPlan) return;
  content.innerHTML = renderAutoPlanResult(state.generatedPlan);
}

function renderScheduleChart() {
  const chartDom = document.getElementById("schedule-chart");
  if (!chartDom || typeof echarts === "undefined") return;
  if (chartDom.__chartInstance) {
    chartDom.__chartInstance.resize();
    return;
  }
  const myChart = echarts.init(chartDom);
  chartDom.__chartInstance = myChart;
  const nodes = state.data.schedule?.nodes || [];
  const overallProgress = nodes.length ? Math.round(nodes.reduce((s, n) => s + (n.percent || 0), 0) / nodes.length) : 0;
  function genCurve(p) {
    const m = Array(12).fill(null);
    if (p > 0) {
      const pm = Math.max(1, Math.min(12, Math.round(p / 8)));
      for (let i = 0; i < pm && i < 12; i++) m[i] = Math.round((i + 1) / pm * p);
    } else { m[5] = 30; m[6] = 45; m[7] = 55; }
    return m;
  }
  const option = {
    tooltip: { trigger: "axis" },
    legend: { data: ["计划", "实际"], bottom: 0, textStyle: { fontSize: 12 } },
    grid: { left: "3%", right: "4%", top: 10, bottom: "22%" },
    xAxis: { type: "category", data: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"], axisLabel: { fontSize: 11 } },
    yAxis: { type: "value", name: "完成率(%)", max: 100, nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 } },
    series: [
      { name: "计划", type: "line", data: [8,16,28,36,48,58,68,78,86,92,97,100], smooth: true, itemStyle: { color: "#93bbfd" }, lineStyle: { width: 2 } },
      { name: "实际", type: "line", data: genCurve(overallProgress), smooth: true, itemStyle: { color: "#3b82f6" }, lineStyle: { width: 3 },
        markLine: {
          silent: true, symbol: "none",
          data: [{ yAxis: overallProgress, label: { formatter: `当前 ${overallProgress}%`, color: "#ef4444", fontSize: 11 }, lineStyle: { color: "#ef4444", type: "dashed", width: 2 } }]
        }
      }
    ]
  };
  myChart.setOption(option);
  const onResize = () => myChart.resize();
  window.addEventListener("resize", onResize);
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
        <div class="form-group">
          <label for="document-name">资料名称</label>
          <input id="document-name" placeholder="如：主体结构日报 05-31" />
        </div>
        <div class="form-group">
          <label for="document-type">资料类型</label>
          <select id="document-type">
            <option value="周报">周报</option>
            <option value="WBS计划">WBS计划</option>
            <option value="巡检">巡检</option>
            <option value="施工方案">施工方案</option>
            <option value="照片">照片</option>
          </select>
        </div>
        <div class="form-group">
          <label for="document-module">关联模块</label>
          <select id="document-module">
            <option value="schedule">关联进度</option>
            <option value="documents">综合资料</option>
            <option value="safety">关联安全</option>
            <option value="quality">关联质量</option>
            <option value="cost">关联成本</option>
            <option value="tech">关联技术</option>
          </select>
        </div>
        <div class="form-group">
          <label for="document-files">上传文件</label>
          <input id="document-files" type="file" multiple />
        </div>
        <div class="form-group full">
          <label for="document-notes">资料摘要</label>
          <textarea id="document-notes" placeholder="填写资料摘要或识别提示"></textarea>
        </div>
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
        ${data.items.map((document) => {
          const latestVersion = document.versions?.[0] || {};
          return `
          <article class="document-card" data-doc-id="${document.id}">
            <header>
              <div>
                <span class="doc-type-badge">${document.type}</span>
                <h3>${document.name}</h3>
              </div>
              <span class="doc-status ${parseStatusClass(document.parseStatus)}">${statusText(document.parseStatus)}</span>
            </header>
            <p class="doc-excerpt">${latestVersion.excerpt || ""}</p>
            <div class="doc-meta">
              <span>模块：${document.module}</span>
              <span>引用：${document.citationCount ?? document.citations?.length ?? 0} 次</span>
              <span>分类置信度：${document.quality?.classificationScore ?? document.classificationConfidence ?? "-"}</span>
              <span>最近引用：${document.lastCitedAt || "尚未被引用"}</span>
            </div>
            <div class="doc-actions">
              <button class="secondary-button small" type="button" data-doc-action="view" data-doc-id="${document.id}">查看</button>
              <button class="secondary-button small" type="button" data-doc-action="cite" data-doc-id="${document.id}">查看引用记录</button>
              <button class="secondary-button small" type="button" data-doc-action="reparse" data-doc-id="${document.id}">重新解析</button>
            </div>
          </article>
          `;
        }).join("")}
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
          ${data.rectifications.map((rect) => `
            <article class="risk-card">
              <strong>${rect.title}</strong>
              <p>${statusText(rect.severity)} · ${statusText(rect.status)}</p>
              <div class="rectification-meta">
                <span>责任人：${rect.owner}</span>
                <span>截止：${rect.deadline}</span>
                <span>最近更新：${rect.updates?.[0]?.note || "尚未反馈"}</span>
              </div>
              <div class="rectification-actions">
                <button class="secondary-button small" type="button" data-safety-action="view" data-safety-id="${rect.id}">查看详情</button>
                <button class="primary-button small" type="button" data-safety-action="close" data-safety-id="${rect.id}">复查通过</button>
                <button class="secondary-button small" type="button" data-safety-action="reject" data-safety-id="${rect.id}">打回整改</button>
              </div>
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
        <div class="form-group">
          <label for="quality-title">检查标题</label>
          <input id="quality-title" placeholder="如：砌筑样板实测实量" />
        </div>
        <div class="form-group">
          <label for="quality-location">检查部位</label>
          <input id="quality-location" placeholder="如：地下室样板段" />
        </div>
        <div class="form-group">
          <label for="quality-trade">专业类别</label>
          <input id="quality-trade" placeholder="如：砌筑工程" />
        </div>
        <div class="form-group">
          <label for="quality-result">检查结果</label>
          <select id="quality-result">
            <option value="issue_found">发现问题</option>
            <option value="passed">验收通过</option>
          </select>
        </div>
        <div class="form-group">
          <label for="quality-severity">风险等级</label>
          <select id="quality-severity">
            <option value="medium">一般问题</option>
            <option value="high">重大问题</option>
            <option value="normal">合格记录</option>
          </select>
        </div>
        <div class="form-group">
          <label for="quality-owner">责任人</label>
          <input id="quality-owner" placeholder="如：砌筑班组" />
        </div>
        <div class="form-group">
          <label for="quality-deadline">整改截止日期</label>
          <input id="quality-deadline" placeholder="YYYY-MM-DD" />
        </div>
        <div class="form-group full">
          <label for="quality-description">问题描述</label>
          <textarea id="quality-description" placeholder="详细描述检查发现的问题"></textarea>
        </div>
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
        <div class="form-group">
          <label for="cost-month">快照月份</label>
          <input id="cost-month" placeholder="如：6月" />
        </div>
        <div class="form-group">
          <label for="cost-budget">预算金额（万元）</label>
          <input id="cost-budget" type="number" placeholder="如：9900" />
        </div>
        <div class="form-group">
          <label for="cost-actual">实际金额（万元）</label>
          <input id="cost-actual" type="number" placeholder="如：10150" />
        </div>
        <div class="form-group full">
          <label for="cost-note">备注说明</label>
          <textarea id="cost-note" placeholder="如：钢材调差和模板周转增加"></textarea>
        </div>
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

function providerById(providerId) {
  return state.data.session?.providers?.find((item) => item.id === providerId) || state.data.session?.providers?.[0];
}

function renderAgentConfigurationPanels() {
  const config = state.data.agentConfig || { modelBindings: {}, organization: { nodes: [] }, workflows: [] };
  const providers = state.data.session?.providers || [];
  const agents = state.data.session?.agents || [];
  const modelRows = agents.map((agent) => {
    const binding = config.modelBindings[agent.id] || {};
    const provider = providerById(binding.providerId);
    const chatModels = provider?.capabilities?.chat || [binding.chatModel].filter(Boolean);
    return `
      <article class="config-card">
        <div>
          <strong>${agent.name}</strong>
          <p>${binding.policy || agent.scope}</p>
        </div>
        <label>
          <span>模型通道</span>
          <select class="agent-provider-select" data-agent-id="${agent.id}">
            ${providers.map((item) => `<option value="${item.id}" ${item.id === binding.providerId ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Chat 模型</span>
          <select class="agent-model-select" data-agent-id="${agent.id}">
            ${chatModels.map((model) => `<option value="${model}" ${model === binding.chatModel ? "selected" : ""}>${model}</option>`).join("")}
          </select>
        </label>
        <footer>
          <span>Embedding: ${binding.embeddingModel || "-"}</span>
          <span>Rerank: ${binding.rerankModel || "-"}</span>
        </footer>
      </article>
    `;
  }).join("");

  const orgCards = config.organization.nodes.map((node) => `
    <article class="config-card compact">
      <strong>${node.name}</strong>
      <p>${node.ownerRole} · ${node.agents.join(" / ")}</p>
      <footer>${node.responsibilities.map((item) => `<span>${item}</span>`).join("")}</footer>
    </article>
  `).join("");

  const workflowCards = config.workflows.map((workflow) => `
    <article class="workflow-card">
      <header>
        <div>
          <strong>${workflow.name}</strong>
          <p>${workflow.trigger}</p>
        </div>
        <span class="status-badge ${workflow.enabled ? "normal" : "warning"}">${workflow.enabled ? "启用" : "停用"}</span>
      </header>
      <div class="workflow-meta">
        <span>Owner: ${workflow.ownerAgentId}</span>
        <span>人审: ${workflow.humanReview ? "需要" : "不需要"}</span>
      </div>
      <ol class="workflow-stages">
        ${workflow.stages.map((stage) => `<li>${stage.order}. ${stage.name} · ${stage.agentId}${stage.humanConfirm ? " · 人工确认" : ""}</li>`).join("")}
      </ol>
      <div class="workflow-actions">
        <button class="secondary-button" data-workflow-test="${workflow.id}">测试流程</button>
        <button class="secondary-button" data-workflow-toggle="${workflow.id}" data-enabled="${workflow.enabled ? "false" : "true"}">${workflow.enabled ? "停用" : "启用"}</button>
      </div>
    </article>
  `).join("");

  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Model Routing</p>
          <h3 class="section-title">智能体模型配置</h3>
        </div>
      </div>
      <div class="config-grid">${modelRows}</div>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Agent Organization</p>
          <h3 class="section-title">智能体组织架构</h3>
        </div>
      </div>
      <div class="config-grid three">${orgCards}</div>
    </section>

    <section class="panel fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Workflow Orchestration</p>
          <h3 class="section-title">工作流程配置</h3>
        </div>
      </div>
      <div class="workflow-grid">${workflowCards}</div>
    </section>
  `;
}

function renderAgentsView() {
  const runs = state.data.runs?.items || [];
  const schedule = state.data.schedule;
  const quality = state.data.quality;
  const cost = state.data.cost;
  const safety = state.data.safety;
  const documents = state.data.documents;
  const scheduledTasks = state.data.scheduledTasks?.items || [];
  const qaAgents = [
    {
      icon: "📅",
      name: "进度 Agent",
      module: "进度管理",
      owner: "生产经理",
      input: "WBS、里程碑、施工日志",
      output: `${schedule.summary.criticalWarnings} 个关键预警`,
      view: "schedule"
    },
    {
      icon: "🔍",
      name: "质量/技术 Agent",
      module: "质量管理 / 技术管理",
      owner: "总工 / 质量负责人",
      input: "验收批、质量检查、技术方案",
      output: `${quality.summary.openIssues} 项未闭环`,
      view: "quality"
    },
    {
      icon: "🛡️",
      name: "安全 Agent",
      module: "安全管理",
      owner: "安全负责人",
      input: "巡检、隐患、整改反馈",
      output: `${safety.summary.high + safety.summary.medium} 项风险待处理`,
      view: "safety"
    },
    {
      icon: "💰",
      name: "成本 Agent",
      module: "成本管理",
      owner: "商务经理",
      input: "预算、实际、合同、计量",
      output: `${cost.summary.varianceRate}% 成本偏差`,
      view: "cost"
    },
    {
      icon: "📄",
      name: "资料 Agent",
      module: "资料管理",
      owner: "资料员",
      input: "PDF、Word、Excel、照片",
      output: `${documents.items.filter((item) => item.parseStatus === "indexed").length} 份可引用资料`,
      view: "documents"
    }
  ];
  const flowSteps = [
    { index: "01", title: "识别问题意图", text: "判断问题属于项目总览、单专业分析，还是跨专业协同。" },
    { index: "02", title: "挂接项目上下文", text: "锁定项目、角色权限、当前模块和可引用资料范围。" },
    { index: "03", title: "调配后台能力", text: "Project Agent 按问题类型调用进度、质量、安全、成本、资料能力。" },
    { index: "04", title: "检索业务证据", text: "从 WBS、隐患、质量问题、成本快照、资料索引中取数。" },
    { index: "05", title: "输出带引用结论", text: "只给辅助决策建议，关键动作进入待办或人工确认。" }
  ];
  const latestInsight = state.data.insights?.items?.[0];
  const indexedDocumentItems = documents.items.filter((item) => item.parseStatus === "indexed");
  const pendingReviewRuns = runs.filter((run) => run.status === "succeeded");
  const indexedDocuments = indexedDocumentItems.length;
  const pendingReviews = pendingReviewRuns.length;
  const enabledTaskCount = scheduledTasks.filter((task) => task.enabled).length;
  const subView = state.agentSubView || "home";
  const evidenceTab = state.agentEvidenceTab || "documents";
  const subViewTitle = {
    evidence: "回答证据、人工复核与计划任务",
    orchestration: "Project Agent 后台编排",
    capabilities: "后台专业能力映射",
    config: "后台编排配置",
    runs: "异步分析任务记录"
  }[subView];
  const chatPanel = `
    <article class="qa-panel">
      <div class="qa-panel-header">
        <div>
          <p class="panel-note">Ask Marvis</p>
          <h3 class="section-title">项目智能问答</h3>
        </div>
        <div class="qa-panel-actions">
          <span>Project Agent 统一入口</span>
        </div>
      </div>
      <div class="chat-stack qa-chat-stack">
        ${state.chatLog.map((message) => `
          <article class="message-bubble ${message.role}">
            <strong>${message.role === "assistant" ? "Marvis" : "你"}</strong>
            <p>${message.content.replaceAll("\n", "<br />")}</p>
            ${message.citations?.length ? `<footer>引用：${message.citations.map((item) => `${item.module}:${item.label}`).join(" / ")}</footer>` : ""}
          </article>
        `).join("")}
      </div>
      <form id="agent-chat-form" class="qa-input-row">
        <input id="agent-chat-input" placeholder="输入工程相关问题..." ${state.chatSending ? "disabled" : ""} />
        <button class="primary-button" type="submit" ${state.chatSending ? "disabled" : ""}>${state.chatSending ? "分析中..." : "发送"}</button>
      </form>
    </article>
  `;
  const evidenceSection = `
    <section class="relationship-board">
      <div class="qa-brief-row status">
        <button class="qa-brief-card ${evidenceTab === "documents" ? "active" : ""}" type="button" data-evidence-tab="documents">
          <span>可引用资料</span>
          <strong>${indexedDocuments} 份已索引资料</strong>
          <p>查看可被 Marvis 引用的文件、来源和摘要。</p>
        </button>
        <button class="qa-brief-card ${evidenceTab === "reviews" ? "active" : ""}" type="button" data-evidence-tab="reviews">
          <span>待复核结论</span>
          <strong>${pendingReviews} 条</strong>
          <p>查看 Agent 已完成但尚未人工确认的结论。</p>
        </button>
        <button class="qa-brief-card ${evidenceTab === "tasks" ? "active" : ""}" type="button" data-evidence-tab="tasks">
          <span>计划任务</span>
          <strong>${enabledTaskCount} 个启用</strong>
          <p>维护日报、周报、月报、风险巡检等规律任务。</p>
        </button>
      </div>
      <div class="evidence-detail-panel">
        ${evidenceTab === "documents" ? `
          <div class="evidence-detail-list">
            ${indexedDocumentItems.map((documentItem) => `
              <article class="evidence-row">
                <div>
                  <strong>${documentItem.name}</strong>
                  <p>${documentItem.type} · ${documentItem.module} · ${documentItem.versions[0]?.source || "-"}</p>
                </div>
                <span>${documentItem.versions[0]?.label || "v1"}</span>
              </article>
            `).join("") || `<p class="empty-note">暂无可引用资料。</p>`}
          </div>
        ` : ""}
        ${evidenceTab === "reviews" ? `
          <div class="evidence-detail-list">
            ${pendingReviewRuns.map((run) => `
              <article class="evidence-row">
                <div>
                  <strong>${run.runType}</strong>
                  <p>${run.prompt} · ${run.createdAt}</p>
                </div>
                <span>${run.status}</span>
              </article>
            `).join("") || `<p class="empty-note">暂无待复核结论。</p>`}
          </div>
        ` : ""}
        ${evidenceTab === "tasks" ? `
          <form id="scheduled-task-form" class="scheduled-task-form">
            <input id="scheduled-task-name" placeholder="任务名称，如 周例会简报" />
            <select id="scheduled-task-type">
              <option value="daily-brief">日报</option>
              <option value="weekly-brief">周报</option>
              <option value="monthly-brief">月报</option>
              <option value="risk-scan">风险巡检</option>
              <option value="document-digest">资料归档摘要</option>
            </select>
            <select id="scheduled-task-frequency">
              <option>每日</option>
              <option>每周</option>
              <option>每月</option>
              <option>自定义</option>
            </select>
            <input id="scheduled-task-run-at" placeholder="执行时间，如 每日 18:00 / 周五 17:30" />
            <textarea id="scheduled-task-prompt" placeholder="任务要求，如 汇总五条线重点、风险、待确认事项"></textarea>
            <button class="primary-button" type="submit">保存计划任务</button>
          </form>
          <div class="evidence-detail-list compact">
            ${scheduledTasks.map((task) => `
              <article class="evidence-row">
                <div>
                  <strong>${task.frequency} · ${task.runAt}</strong>
                  <p>${task.prompt}</p>
                </div>
                <span>${task.taskType}</span>
              </article>
            `).join("") || `<p class="empty-note">暂无计划任务。</p>`}
          </div>
        ` : ""}
      </div>
    </section>
  `;
  const orchestrationSection = `
    <section class="relationship-board">
      <div class="section-heading">
        <div>
          <p class="panel-note">Agent Relationship</p>
          <h3 class="section-title">Project Agent 与后台专业能力</h3>
        </div>
        <span>用户只对接 Project Agent，专业 Agent 由后台统一调配</span>
      </div>

      <div class="agent-network">
        <article class="network-hub">
          <span>P</span>
          <strong>Project Agent</strong>
          <p>作为平台唯一对接入口，负责理解问题、挂接项目上下文、调配后台专业能力并汇总答复。</p>
          ${latestInsight ? `<small>最新结论：${latestInsight.title}</small>` : ""}
        </article>
        <div class="network-lines">
          ${qaAgents.map((agent) => `
            <article class="network-card" data-target-view="${agent.view}">
              <header>
                <span>${agent.icon}</span>
                <div>
                  <strong>${agent.name}</strong>
                  <p>${agent.module}</p>
                </div>
              </header>
              <dl>
                <div><dt>业务负责人</dt><dd>${agent.owner}</dd></div>
                <div><dt>输入数据</dt><dd>${agent.input}</dd></div>
                <div><dt>当前输出</dt><dd>${agent.output}</dd></div>
              </dl>
            </article>
          `).join("")}
        </div>
      </div>

      <div class="flow-lane">
        ${flowSteps.map((step) => `
          <article class="flow-step">
            <span>${step.index}</span>
            <strong>${step.title}</strong>
            <p>${step.text}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
  const capabilitiesSection = `
    <section class="agent-module-map">
      <div class="section-heading">
        <div>
          <p class="panel-note">Business Mapping</p>
          <h3 class="section-title">后台专业能力与管理版块映射</h3>
        </div>
      </div>
      <div class="qa-agent-grid">
        ${qaAgents.map((agent) => `
          <button class="qa-agent-card" type="button" data-open-view="${agent.view}">
            <span>${agent.icon}</span>
            <strong>${agent.module}</strong>
            <p>${agent.name} · ${agent.owner}</p>
            <small>${agent.output}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
  const runsSection = `
    <section class="config-drawer">
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
              <span>${run.completedAt || "待完成"}</span>
            </footer>
          </article>
        `).join("")}
      </div>
    </section>
  `;

  return `
    <section class="qa-home-layout qa-focused fade-in">
      ${chatPanel}
      <aside class="qa-evidence-panel">
        ${evidenceSection}
      </aside>
    </section>
  `;
}

function renderAgentOrchestrationView() {
  const runs = state.data.runs?.items || [];
  const schedule = state.data.schedule;
  const quality = state.data.quality;
  const cost = state.data.cost;
  const safety = state.data.safety;
  const documents = state.data.documents;
  const latestInsight = state.data.insights?.items?.[0];
  const qaAgents = [
    {
      icon: "📅",
      name: "进度 Agent",
      module: "进度管理",
      owner: "生产经理",
      input: "WBS、里程碑、施工日志",
      output: `${schedule.summary.criticalWarnings} 个关键预警`,
      view: "schedule"
    },
    {
      icon: "🔍",
      name: "质量/技术 Agent",
      module: "质量管理 / 技术管理",
      owner: "总工 / 质量负责人",
      input: "验收批、质量检查、技术方案",
      output: `${quality.summary.openIssues} 项未闭环`,
      view: "quality"
    },
    {
      icon: "🛡️",
      name: "安全 Agent",
      module: "安全管理",
      owner: "安全负责人",
      input: "巡检、隐患、整改反馈",
      output: `${safety.summary.high + safety.summary.medium} 项风险待处理`,
      view: "safety"
    },
    {
      icon: "💰",
      name: "成本 Agent",
      module: "成本管理",
      owner: "商务经理",
      input: "预算、实际、合同、计量",
      output: `${cost.summary.varianceRate}% 成本偏差`,
      view: "cost"
    },
    {
      icon: "📄",
      name: "资料 Agent",
      module: "资料管理",
      owner: "资料员",
      input: "PDF、Word、Excel、照片",
      output: `${documents.items.filter((item) => item.parseStatus === "indexed").length} 份可引用资料`,
      view: "documents"
    }
  ];
  const flowSteps = [
    { index: "01", title: "识别问题意图", text: "判断问题属于项目总览、单专业分析，还是跨专业协同。" },
    { index: "02", title: "挂接项目上下文", text: "锁定项目、角色权限、当前模块和可引用资料范围。" },
    { index: "03", title: "调配后台能力", text: "Project Agent 按问题类型调用进度、质量、安全、成本、资料能力。" },
    { index: "04", title: "检索业务证据", text: "从 WBS、隐患、质量问题、成本快照、资料索引中取数。" },
    { index: "05", title: "输出带引用结论", text: "只给辅助决策建议，关键动作进入待办或人工确认。" }
  ];

  return `
    <section class="relationship-board fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Agent Relationship</p>
          <h3 class="section-title">Project Agent 与后台专业能力</h3>
        </div>
        <span>用户只对接 Project Agent，专业 Agent 由后台统一调配</span>
      </div>

      <div class="agent-network">
        <article class="network-hub">
          <span>P</span>
          <strong>Project Agent</strong>
          <p>作为平台唯一对接入口，负责理解问题、挂接项目上下文、调配后台专业能力并汇总答复。</p>
          ${latestInsight ? `<small>最新结论：${latestInsight.title}</small>` : ""}
        </article>
        <div class="network-lines">
          ${qaAgents.map((agent) => `
            <article class="network-card" data-target-view="${agent.view}">
              <header>
                <span>${agent.icon}</span>
                <div>
                  <strong>${agent.name}</strong>
                  <p>${agent.module}</p>
                </div>
              </header>
              <dl>
                <div><dt>业务负责人</dt><dd>${agent.owner}</dd></div>
                <div><dt>输入数据</dt><dd>${agent.input}</dd></div>
                <div><dt>当前输出</dt><dd>${agent.output}</dd></div>
              </dl>
            </article>
          `).join("")}
        </div>
      </div>

      <div class="flow-lane">
        ${flowSteps.map((step) => `
          <article class="flow-step">
            <span>${step.index}</span>
            <strong>${step.title}</strong>
            <p>${step.text}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="agent-module-map fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Business Mapping</p>
          <h3 class="section-title">后台专业能力与管理版块映射</h3>
        </div>
      </div>
      <div class="qa-agent-grid">
        ${qaAgents.map((agent) => `
          <button class="qa-agent-card" type="button" data-open-view="${agent.view}">
            <span>${agent.icon}</span>
            <strong>${agent.module}</strong>
            <p>${agent.name} · ${agent.owner}</p>
            <small>${agent.output}</small>
          </button>
        `).join("")}
      </div>
    </section>

    <section class="config-drawer fade-in">
      ${renderAgentConfigurationPanels()}
    </section>

    <section class="config-drawer fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Agent Runs</p>
          <h3 class="section-title">异步分析任务记录</h3>
        </div>
        <span>${runs.length} 条任务</span>
      </div>
      <div class="run-grid">
        ${runs.map((run) => `
          <article class="run-card">
            <header>
              <div>
                <h3>${run.runType}</h3>
                <p>${run.agentId}</p>
              </div>
              <span class="status-badge ${severityClass(run.status === "succeeded" ? "normal" : "warning")}">${statusText(run.status)}</span>
            </header>
            <p>${run.prompt}</p>
            <footer>
              <span>${run.createdAt}</span>
              <span>${run.completedAt || "待完成"}</span>
            </footer>
          </article>
        `).join("") || `<p class="empty-note">暂无异步分析任务。</p>`}
      </div>
    </section>
  `;
}

function renderRoadmapView() {
  const blueprint = state.data.blueprint;
  return `
    <section class="roadmap-hero fade-in">
      <div>
        <p class="panel-note">Build Strategy</p>
        <h3 class="section-title">${blueprint.title}</h3>
        <p>${blueprint.strategy.rationale}</p>
      </div>
      <article>
        <span>推荐路线</span>
        <strong>${blueprint.strategy.recommendation}</strong>
        <p>${blueprint.strategy.priority}</p>
      </article>
    </section>

    <section class="roadmap-section fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Phases</p>
          <h3 class="section-title">分阶段建设路线</h3>
        </div>
      </div>
      <div class="phase-grid">
        ${blueprint.phases.map((phase) => `
          <article class="phase-card">
            <span>${phase.duration}</span>
            <strong>${phase.name}</strong>
            <p>${phase.goal}</p>
            <ul>
              ${phase.outputs.map((output) => `<li>${output}</li>`).join("")}
            </ul>
            <footer>${phase.acceptance}</footer>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="roadmap-section fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Data Contracts</p>
          <h3 class="section-title">V1 最小接口契约</h3>
        </div>
      </div>
      <div class="contract-map">
        ${blueprint.interfaceGroups.map((group) => `
          <article class="contract-block">
            <header>
              <strong>${group.name}</strong>
              <span>${group.capabilities.length} 能力</span>
            </header>
            <p>${group.capabilities.join(" / ")}</p>
            <div>
              ${group.minimumEndpoints.map((endpoint) => `<code>${endpoint}</code>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="roadmap-section fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Acceptance</p>
          <h3 class="section-title">测试与验收基线</h3>
        </div>
      </div>
      <div class="acceptance-grid">
        ${blueprint.acceptanceScenarios.map((item) => `<article>${item}</article>`).join("")}
      </div>
    </section>

    <section class="roadmap-section fade-in">
      <div class="section-heading">
        <div>
          <p class="panel-note">Defaults</p>
          <h3 class="section-title">默认假设</h3>
        </div>
      </div>
      <div class="assumption-list">
        ${blueprint.defaults.map((item) => `<p>${item}</p>`).join("")}
      </div>
    </section>
  `;
}

function renderNotificationCenterView() {
  const items = state.data.notifications?.items || [];
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <h3 class="section-title">消息中心</h3>
        <span>共 ${items.length} 条</span>
      </div>
      <div class="table-list">
        ${items.map((item) => `
          <div class="table-row">
            <strong>${item.title}</strong>
            <p>${item.module} \u00b7 ${item.createdAt}</p>
          </div>
        `).join("") || `<p class="empty-note">暂无消息。</p>`}
      </div>
    </section>
  `;
}

function renderAuditLogView() {
  const items = state.data.auditLogs?.items || [];
  return `
    <section class="panel fade-in">
      <div class="section-heading">
        <h3 class="section-title">审计日志</h3>
        <span>共 ${items.length} 条</span>
      </div>
      <div class="table-list">
        ${items.slice(0, 50).map((item) => `
          <div class="table-row">
            <strong>${auditActionText(item.action)}</strong>
            <p>${item.actorName} \u00b7 ${item.module} \u00b7 ${item.createdAt}</p>
            <span class="audit-summary">${item.summary}</span>
          </div>
        `).join("") || `<p class="empty-note">暂无审计日志。</p>`}
      </div>
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
    agents: renderAgentsView,
    "agent-orchestration": renderAgentOrchestrationView,
    roadmap: renderRoadmapView,
    "notification-center": renderNotificationCenterView,
    "audit-log": renderAuditLogView
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
  const bindings = state.data.agentConfig?.modelBindings || {};
  target.innerHTML = `<div class="agent-list">${items.map((item) => `
    <div class="agent-row">
      <strong>${item.name}</strong>
      <p>${item.scope}</p>
      <p>${bindings[item.id]?.providerId || "default"} · ${bindings[item.id]?.chatModel || "-"}</p>
    </div>
  `).join("")}</div>`;
}

function renderAssistant() {
  const dock = document.querySelector("#assistant-dock");
  const launcher = document.querySelector("#assistant-launcher");
  const windowEl = document.querySelector("#assistant-window");
  const context = document.querySelector("#assistant-context");
  const suggestions = document.querySelector("#assistant-suggestions");
  const thread = document.querySelector("#assistant-thread");
  const input = document.querySelector("#assistant-input");
  const activeProject = getActiveProject();
  const dashboard = state.data.dashboard;

  dock.classList.toggle("collapsed", !state.assistantOpen);
  launcher.hidden = state.assistantOpen;
  windowEl.classList.toggle("open", state.assistantOpen);
  windowEl.hidden = !state.assistantOpen;

  if (!state.assistantOpen) return;

  context.innerHTML = `
    <div>
      <span>当前项目</span>
      <strong>${activeProject?.name || "暂无项目"}</strong>
    </div>
    <div>
      <span>当前模块</span>
      <strong>${currentViewName()}</strong>
    </div>
    <div>
      <span>项目状态</span>
      <strong>${dashboard?.summary ? `${dashboard.summary.progress}% / 质量 ${dashboard.summary.qualityScore}` : "-"}</strong>
    </div>
  `;

  suggestions.innerHTML = assistantSuggestions().map((item) => `
    <button type="button" class="assistant-suggestion" data-assistant-question="${item}">${item}</button>
  `).join("");

  thread.innerHTML = state.assistantLog.map((message) => `
    <article class="assistant-message ${message.role}">
      <strong>${message.role === "assistant" ? "项目智能体" : "你"}</strong>
      <p>${message.content.replaceAll("\n", "<br />")}</p>
      ${message.citations?.length ? `<footer>引用：${message.citations.map((item) => `${item.module}:${item.label}`).join(" / ")}</footer>` : ""}
    </article>
  `).join("") + (state.assistantSending ? `
    <article class="assistant-message assistant">
      <strong>项目智能体</strong>
      <p>正在结合项目上下文分析...</p>
    </article>
  ` : "");
  thread.scrollTop = thread.scrollHeight;
  input.disabled = state.assistantSending;
  document.querySelector("#assistant-form button").disabled = state.assistantSending;
}

function render() {
  document.body.dataset.currentView = state.currentView;
  document.body.dataset.agentSubView = state.currentView === "agents" ? state.agentSubView || "home" : "";
  renderTopControls();
  renderHeadline();
  renderViewRoot();
  renderAssistant();
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
  renderAssistant();
}

async function sendAssistantQuestion(question) {
  const text = question.trim();
  if (!text || state.assistantSending) return;
  state.assistantLog.push({ role: "user", content: text });
  state.assistantSending = true;
  renderAssistant();
  try {
    const answer = await api("/api/agent/chat", {
      method: "POST",
      body: { projectId: state.projectId, question: text }
    });
    state.assistantLog.push({
      role: "assistant",
      content: answer.answer,
      citations: answer.citations || []
    });
  } catch (error) {
    state.assistantLog.push({
      role: "assistant",
      content: `这次分析失败：${error.message}。你可以换个问法，或者刷新项目数据后再试。`
    });
  } finally {
    state.assistantSending = false;
    renderAssistant();
  }
}

async function sendMainChatQuestion(question) {
  const text = question.trim();
  if (!text || state.chatSending) return;
  state.chatLog.push({ role: "user", content: text });
  state.chatSending = true;
  renderViewRoot();
  wireViewActions();
  try {
    const answer = await api("/api/agent/chat", {
      method: "POST",
      body: { projectId: state.projectId, question: text }
    });
    state.chatLog.push({ role: "assistant", content: answer.answer, citations: answer.citations });
  } catch (error) {
    state.chatLog.push({
      role: "assistant",
      content: `这次问答失败：${error.message}。你可以稍后重试，或先查看右侧消息中心。`
    });
  } finally {
    state.chatSending = false;
    renderViewRoot();
    wireViewActions();
  }
}

function wireGlobalActions() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentView = button.dataset.view;
      state.agentSubView = "home";
      if (state.currentView !== "schedule") {
        state.showAutoPlan = false;
        state.generatedPlan = null;
        clearWizardPreview();
      }
      try {
        if (state.currentView !== "portfolio") {
          await loadProjectData();
        }
        render();
      } catch (error) {
        console.error("导航渲染失败:", error);
        document.querySelector("#view-root").innerHTML = `<section class="panel fade-in"><div class="section-heading"><h3 class="section-title">加载失败</h3></div><p>${error.message}。点击“刷新数据”重试。</p></section>`;
      }
    });
  });

  // Project switcher: toggle dropdown on btn click
  document.querySelector("#project-switcher-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = document.querySelector("#project-switcher-dropdown");
    if (dropdown) dropdown.hidden = !dropdown.hidden;
  });

  // Project switcher: select project from dropdown
  document.querySelector("#project-switcher-options")?.addEventListener("click", async (e) => {
    const option = e.target.closest(".project-switcher-option");
    if (!option) return;
    const projectId = option.dataset.projectId;
    if (!projectId || projectId === state.projectId) {
      document.querySelector("#project-switcher-dropdown").hidden = true;
      return;
    }
    state.projectId = projectId;
    state.showAutoPlan = false;
    state.generatedPlan = null;
    clearWizardPreview();
    await loadProjectData();
    if (state.currentView === "portfolio") {
      state.currentView = "dashboard";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "dashboard"));
    }
    render();
    document.querySelector("#project-switcher-dropdown").hidden = true;
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", () => {
    const dropdown = document.querySelector("#project-switcher-dropdown");
    if (dropdown) dropdown.hidden = true;
  });

  document.querySelector("#project-select")?.addEventListener("change", async (event) => {
    state.projectId = event.target.value;
    state.showAutoPlan = false;
    state.generatedPlan = null;
    clearWizardPreview();
    await loadProjectData();
    if (state.currentView === "portfolio") {
      state.currentView = "dashboard";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "dashboard"));
    }
    render();
  });

  document.querySelector("#refresh-button").addEventListener("click", reloadAll);
  // Drag assistant dock
  const dock = document.querySelector("#assistant-dock");
  const launcherBtn = document.querySelector("#assistant-launcher");
  let dragStartX, dragStartY, dragStartRight, dragStartBottom, isDragging = false;
  
  function startDrag(e, rect) {
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartRight = window.innerWidth - rect.right;
    dragStartBottom = window.innerHeight - rect.bottom;
    
    const onMove = (ev) => {
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
      dock.style.right = Math.max(8, dragStartRight - dx) + "px";
      dock.style.bottom = Math.max(8, dragStartBottom - dy) + "px";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  launcherBtn.addEventListener("mousedown", (e) => {
    const rect = dock.getBoundingClientRect();
    startDrag(e, rect);
  });

  document.querySelector(".assistant-header")?.addEventListener("mousedown", (e) => {
    if (!state.assistantOpen) return;
    const rect = dock.getBoundingClientRect();
    startDrag(e, rect);
  });
  
  launcherBtn.addEventListener("click", () => {
    if (isDragging) return;
    state.assistantOpen = true;
    renderAssistant();
    document.querySelector("#assistant-input")?.focus();
  });
  document.querySelector("#assistant-minimize").addEventListener("click", () => {
    state.assistantOpen = false;
    renderAssistant();
  });
  document.querySelector("#assistant-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#assistant-input");
    const question = input.value;
    input.value = "";
    await sendAssistantQuestion(question);
  });
  document.querySelector("#assistant-suggestions").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assistant-question]");
    if (!button) return;
    await sendAssistantQuestion(button.dataset.assistantQuestion);
  });
  document.querySelector("#quick-brief-button")?.addEventListener("click", async () => {
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
  if (!window.__prefabHandlersBound) {
    window.__prefabHandlersBound = true;
    document.addEventListener("click", function(ev) {
      const trigger = ev.target.closest("[data-prefab]");
      if (!trigger || trigger.classList.contains("prefab-disabled")) return;
      const card = trigger.closest(".building-card");
      const panel = card?.querySelector('[data-prefab-panel="' + trigger.dataset.prefab + '"]');
      if (!panel) return;
      panel.hidden = !panel.hidden;
    });
  }

  if (!window.__dropdownHandlersBound) {
    window.__dropdownHandlersBound = true;
    document.addEventListener("click", function(ev) {
      const btn = ev.target.closest("[data-bdropdown]");
      const picker = ev.target.closest(".basement-building-picker");
      document.querySelectorAll(".basement-dropdown-menu").forEach(function(menu) {
        if (!picker || !picker.contains(menu)) menu.hidden = true;
      });
      if (!btn) return;
      const menu = btn.closest(".basement-building-picker")?.querySelector(".basement-dropdown-menu");
      if (menu) menu.hidden = !menu.hidden;
    });
  }

  // Save project info
  // Save project info (including buildings and basement)
  // Save project info (including buildings with floor details and basement)
  document.querySelector("#btn-save-project-info")?.addEventListener("click", async () => {
    const fields = document.querySelectorAll(".project-info-field");
    const updates = {};
    fields.forEach(f => {
      const fpath = f.dataset.field;
      if (fpath.startsWith("basement.")) {
        const key = fpath.split(".")[1];
        if (!updates.basement) updates.basement = {};
        updates.basement[key] = f.type === "number" ? Number(f.value) : f.value;
      } else {
        updates[fpath] = f.value;
      }
    });
    // Collect buildings with per-floor details (each row has a count for multi-floor groups)
    const buildingCards = document.querySelectorAll(".building-card");
    const buildings = [];
    buildingCards.forEach(card => {
      const name = card.querySelector("[data-bfield='name']")?.value || "";
      const type = card.querySelector("[data-bfield='type']")?.value || "其他";
      if (!name) return;
      // Collect all floor rows with their count field
      const floorRows = card.querySelectorAll(".floor-detail-row");
      const floorDetails = [];
      let totalArea = 0;
      let totalFloors = 0;
      floorRows.forEach(function(row) {
        const floor = row.querySelector("[data-ffield='floor']")?.value || "";
        const area = Number(row.querySelector("[data-ffield='area']")?.value) || 0;
        const height = Number(row.querySelector("[data-ffield='height']")?.value) || 0;
        const count = Number(row.querySelector("[data-ffield='count']")?.value) || 1;
        if (floor) {
          floorDetails.push({ floor: floor, area: area, height: height, count: count });
          totalArea += area * count;
          totalFloors += count;
        }
      });
      const usage = card.querySelector("[data-bfield='usage']")?.value || type || "其他";
      const structureType = card.querySelector("[data-bfield='structureType']")?.value || "";
      var prefabPanel = card.querySelector(".prefab-panel");
      var prefabComponents = prefabPanel ? Array.from(prefabPanel.querySelectorAll(".prefab-cb:checked")).map(function(cb) { return cb.value; }) : [];
      buildings.push({
        name: name,
        floors: totalFloors,
        area: totalArea,
        type: type,
        usage: usage,
        structureType: structureType,
        prefabComponents: ['钢结构','砌体结构','混合结构'].indexOf(structureType) >= 0 ? [] : prefabComponents,
        floorDetails: floorDetails
      });
    });
    // Collect basement levels with zones
    const basementCards = document.querySelectorAll(".basement-level-card");
    const levels = [];
    basementCards.forEach(function(card) {
      var li = card.dataset.level;
      var name = card.querySelector('[data-bfield="name"]')?.value || "";
      var height = Number(card.querySelector('[data-bfield="height"]')?.value) || 3.6;
      var parking = Number(card.querySelector('[data-bfield="parking"]')?.value) || 0;
      // Collect zones from this level
      var zoneRows = card.querySelectorAll(".basement-zone-row");
      var zones = [];
      zoneRows.forEach(function(zRow) {
        var zName = zRow.querySelector('[data-zfield="name"]')?.value || "";
        var zArea = Number(zRow.querySelector('[data-zfield="area"]')?.value) || 0;
        var zCoverage = zRow.querySelector('[data-zfield="coverage"]')?.value || "全部覆盖";
        var zBuildings = Array.from(zRow.querySelectorAll(".basement-building-cb:checked")).map(function(cb) { return cb.value; });
        if (zName) zones.push({ name: zName, area: zArea, coverage: zCoverage, coverageBuildings: zCoverage === "局部覆盖" || zCoverage === "局部" || zCoverage === "局部（库）" ? zBuildings : [] });
      });
      // Also check for a legacy basement-field name (fallback)
      if (!name) name = "B" + (levels.length + 1);
      levels.push({ name: name, height: height, parking: parking, zones: zones });
    });
    if (levels.length > 0) {
      if (!updates.basement) updates.basement = {};
      updates.basement.levels = levels;
    }
    updates.buildings = buildings;
    const activeProject = getActiveProject();
    if (activeProject) {
      const projectForTransport = {
        ...activeProject,
        buildings,
        basement: {
          ...(activeProject.basement || {}),
          ...(updates.basement || {})
        },
        verticalTransport: activeProject.verticalTransport || {}
      };
      const projectTransport = getProjectVerticalTransportData(projectForTransport);
      updates.verticalTransport = {
        towerCranes: structuredClone(projectTransport.towerCranes || []),
        constructionElevators: structuredClone(projectTransport.constructionElevators || [])
      };
      writeLocalVerticalTransport(activeProject.id, updates.verticalTransport);
    }
    try {
      await api("/api/projects/" + state.projectId, { method: "PATCH", body: updates });
      await reloadAll();
    } catch (e) {
      alert("保存失败: " + e.message);
    }
  });

  // Reset project info form
  document.querySelector("#btn-reset-project-info")?.addEventListener("click", () => {
    const body = document.querySelector("#project-info-body");
    if (body) {
      const activeProject = getActiveProject();
      const buildings = activeProject.buildings || [];
      const basement = activeProject.basement || {};
      // Reset fields
      document.querySelectorAll(".project-info-field").forEach(f => {
        const fpath = f.dataset.field;
        if (fpath.startsWith("basement.")) {
          const key = fpath.split(".")[1];
          f.value = basement[key] || "";
        } else {
          f.value = activeProject[fpath] || "";
        }
      });
      // Rebuild building list
      document.querySelector("#building-editor-list").innerHTML = buildings.map((b, i) => renderBuildingRow(i, b)).join("");
    }
  });

  // Add / remove / toggle building rows
  const buildingList = document.querySelector("#building-editor-list");
  if (buildingList) {
    // Add building
    document.querySelector("#btn-add-building")?.addEventListener("click", () => {
      const index = buildingList.children.length;
      buildingList.insertAdjacentHTML("beforeend", renderBuildingRow(index, { name: "", floors: 1, area: 0, type: "其他" }));
    });
    // Delegate events for toggle, remove building, add/remove floor
    buildingList.addEventListener("click", (e) => {
      // Toggle building expand/collapse
      const toggleBtn = e.target.closest("[data-toggle-building]");
      if (toggleBtn) {
        const index = toggleBtn.dataset.toggleBuilding;
        const card = toggleBtn.closest(".building-card");
        const details = card?.querySelector(".building-floor-details");
        if (details) {
          details.hidden = !details.hidden;
          toggleBtn.textContent = details.hidden ? "▶" : "▼";
          sessionStorage.setItem("building-expanded-" + index, !details.hidden);
        }
        return;
      }
      // Remove building
      const rmBtn = e.target.closest("[data-remove-building]");
      if (rmBtn) {
        const card = rmBtn.closest(".building-card");
        if (card) card.remove();
        return;
      }
      // Remove floor
      const rmFloorBtn = e.target.closest("[data-remove-floor]");
      if (rmFloorBtn) {
        const row = rmFloorBtn.closest(".floor-detail-row");
        if (row) row.remove();
        return;
      }
      // Add a floor group row (with count field)
      var addFloorBtn = e.target.closest("[data-add-floor]");
      if (addFloorBtn) {
        var index = addFloorBtn.dataset.addFloor;
        var card = addFloorBtn.closest(".building-card");
        var table = card?.querySelector(".floor-detail-table");
        if (!table) return;
        var fi = "n" + Date.now();
        var rmId = index + "-" + fi;
        var newRow = document.createElement("div");
        newRow.className = "floor-detail-row";
        newRow.innerHTML =
          '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="floor" value="" placeholder="如：机房层" style="width:80px" />' +
          '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="area" type="number" min="0" step="0.1" value="0" style="width:90px" />' +
          '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="height" type="number" min="0" step="0.1" value="3.6" style="width:80px" />' +
          '<input class="floor-field" data-bindex="' + index + '" data-findex="' + fi + '" data-ffield="count" type="number" min="1" max="200" value="1" style="width:60px" />' +
          '<button class="secondary-button small" type="button" data-remove-floor="' + rmId + '" style="flex-shrink:0;padding:0 4px;border:none;color:var(--red);background:transparent;font-size:12px">✕</button>';
        // Insert at top (special floors like 屋面层/机房层 go above everything)
        var firstRow = table.querySelector(".floor-detail-row");
        if (firstRow) {
          table.insertBefore(newRow, firstRow);
        } else {
          table.appendChild(newRow);
        }
        // Auto-focus the floor name input for immediate typing
        newRow.querySelector("[data-ffield='floor']")?.focus();
        return;
      }
    });

    buildingList.addEventListener("change", function(ev) {
      var structureSelect = ev.target.closest("[data-bfield='structureType']");
      if (!structureSelect) return;
      var card = structureSelect.closest(".building-card");
      var trigger = card?.querySelector("[data-prefab]");
      var panel = card?.querySelector(".prefab-panel");
      var _stVal = structureSelect.value;
      var _isNoPrefab = ['钢结构','砌体结构','混合结构'].indexOf(_stVal) >= 0;
      var _isFullPrefab = _stVal.indexOf('装配式') >= 0;
      if (trigger) {
        trigger.classList.toggle('prefab-active', !_isNoPrefab);
        trigger.classList.toggle('prefab-disabled', _isNoPrefab);
      }
      if (panel) {
        // Rebuild prefab panel content based on structure type
        var grid = panel.querySelector('.prefab-grid');
        if (grid) {
          if (_isFullPrefab) {
            grid.innerHTML = '叠合板|ALC条板|预制楼梯|装配式楼梯|预制墙板|预制梁|预制柱|预制阳台板|其他'.split('|').map(function(c) { return '<label><input type="checkbox" class="prefab-cb" data-bindex="' + trigger.dataset.prefab + '" value="' + c + '" /> ' + c + '</label>'; }).join('');
          } else if (!_isNoPrefab) {
            grid.innerHTML = '<label><input type="checkbox" class="prefab-cb" data-bindex="' + trigger.dataset.prefab + '" value="ALC条板" checked /> ALC条板</label>';
          }
        }
        if (_isNoPrefab) panel.hidden = true;
      }
    });

    // Auto-sort floor rows when user types/changes a floor name
    var sortTimer = null;
    buildingList.addEventListener("input", function(ev) {
      var floorInput = ev.target.closest("[data-ffield='floor']");
      if (!floorInput) return;
      clearTimeout(sortTimer);
      sortTimer = setTimeout(function() {
        var card = floorInput.closest(".building-card");
        var table = card?.querySelector(".floor-detail-table");
        if (!table) return;
        var rows = Array.from(table.querySelectorAll(".floor-detail-row"));
        if (rows.length < 2) return;
        // Sort: special floors (屋面/机房/RF/屋顶/塔冠) at top by descending number, then standard floors descending
        function floorSortKey(val) {
          var s = String(val || "").trim();
          if (/屋面|机房|RF|屋顶|塔冠/.test(s)) return 99999;
          var m = s.match(/(\d+)/);
          if (m) return parseInt(m[1], 10);
          if (/B\d|地下|负/.test(s)) return -999;
          return 0;
        }
        var changed = false;
        for (var si = 0; si < rows.length - 1; si++) {
          for (var sj = si + 1; sj < rows.length; sj++) {
            var valA = rows[si].querySelector("[data-ffield='floor']")?.value || "";
            var valB = rows[sj].querySelector("[data-ffield='floor']")?.value || "";
            if (floorSortKey(valB) > floorSortKey(valA)) {
              rows[si].parentNode.insertBefore(rows[sj], rows[si]);
              // Re-fetch rows since DOM changed
              rows = Array.from(table.querySelectorAll(".floor-detail-row"));
              changed = true;
              // Restart from after si (but we just moved sj before si)
              break;
            }
          }
        }
        // Restore focus to the input that triggered the sort
        var newInput = card.querySelector("[data-ffield='floor']");
        // Find the one matching the typed value
        var typedVal = floorInput.value;
        if (typedVal) {
          var matched = card.querySelector("[data-ffield='floor'][value='" + typedVal.replace(/'/g, "\\'") + "']");
          if (matched) matched.focus();
        }
      }, 600);
    });
  }

  // Basement: add / remove levels
  document.querySelector("#btn-add-basement-level")?.addEventListener("click", function() {
    const container = document.querySelector("#basement-levels");
    if (!container) return;
    const rows = container.querySelectorAll(".basement-level-row");
    var bi = rows.length;
    var projectBuildings = getActiveProject()?.buildings || [];
    var newRow = document.createElement("div");
    newRow.className = "basement-level-row";
    var pickerHtml = '<div class="basement-building-picker" data-bindex="' + bi + '" hidden>' +
      '<button class="basement-dropdown-btn" type="button" data-bdropdown="' + bi + '">请选择关联楼栋</button>' +
      '<div class="basement-dropdown-menu" data-bmenu="' + bi + '" hidden>' +
        projectBuildings.map(function(b) { var name = b.name || ''; return '<label><input type="checkbox" class="basement-building-cb" data-bindex="' + bi + '" value="' + escapeHtml(name) + '" /> ' + escapeHtml(name) + '</label>'; }).join('') +
      '</div>' +
    '</div>';
    newRow.innerHTML =
      '<button class="secondary-button small" type="button" data-remove-basement-level="' + bi + '" style="width:24px;height:24px;padding:0;border:none;color:var(--red);background:transparent;font-size:14px;cursor:pointer;line-height:24px;text-align:center" title="删除该层">✕</button>' +
      '<input class="basement-field" data-bindex="' + bi + '" data-bfield="name" value="B' + (bi + 1) + '" placeholder="如：B1" style="width:70px" />' +
      '<input class="basement-field" data-bindex="' + bi + '" data-bfield="area" type="number" min="0" step="0.1" value="0" style="width:90px" />' +
      '<input class="basement-field" data-bindex="' + bi + '" data-bfield="height" type="number" min="0" step="0.1" value="3.6" style="width:70px" />' +
      '<input class="basement-field" data-bindex="' + bi + '" data-bfield="parking" type="number" min="0" value="0" style="width:70px" />' +
      '<select class="basement-field basement-coverage" data-bindex="' + bi + '" data-bfield="coverage" style="width:90px">' +
        '全部覆盖|局部覆盖|仅车库/配套区'.split("|").map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join("") +
      '</select>' +
      pickerHtml;
    container.appendChild(newRow);
  });
  document.querySelector("#basement-levels")?.addEventListener("click", function(ev) {
    var btn = ev.target.closest("[data-remove-basement-level]");
    if (btn) {
      var row = btn.closest(".basement-level-row");
      if (row) row.remove();
    }
  });
  // Coverage toggle: show/hide building picker
  document.querySelector("#basement-levels")?.addEventListener("change", function(ev) {
    var cov = ev.target.closest(".basement-coverage");
    if (cov) {
      var row = cov.closest(".basement-level-row");
      var picker = row?.querySelector(".basement-building-picker");
      if (picker) {
        picker.hidden = !(cov.value === '局部覆盖' || cov.value === '局部' || cov.value === '局部（库）');
      }
    }
  });
  // Basement building checkbox: update dropdown button text
  document.querySelector("#basement-levels")?.addEventListener("change", function(ev) {
    var cb = ev.target.closest(".basement-building-cb");
    if (cb) {
      var picker = cb.closest(".basement-building-picker");
      var checked = Array.from(picker.querySelectorAll(".basement-building-cb:checked")).map(function(c) { return c.value; });
      var btn = picker.querySelector(".basement-dropdown-btn");
      if (btn) btn.textContent = checked.length ? checked.join('、') : '请选择关联楼栋';
    }
  });

  if (state.currentView === "schedule") {
    setTimeout(renderScheduleChart, 100);
  }

  // Wizard: enter wizard mode
  const startPlanWizard = () => {
    state.showAutoPlan = true;
    state.wizardNavLockedUntil = 0;
    state.planWizard = createDefaultPlanWizard(true);
    copyProjectVerticalTransportToWizard(state.planWizard.data, getActiveProject());
    const masterTemplate = getMasterScheduleTemplate();
    state.planWizard.data.selectedMasterLanes = masterTemplate.lanes.map((lane) => lane.id);
    ensureWizardTemplateCandidates(state.planWizard.data, { reset: true });
    state.planWizard.data.expandedMasterLanes = ["prep"];
    ensureMasterWizardDefaults(state.planWizard.data);
    syncTemplatesFromMasterLanes(state.planWizard.data, { force: true });
    syncRelationsFromMasterLanes(state.planWizard.data, { force: true });
    state.planWizard.data.milestones = "主体结构 10F\n主体结构 20F\n主体封顶\n地下室管综深化完成\n机电隐蔽验收\n消防联动调试\n消防验收\n竣工验收";
    state.planWizard.data.hardConstraints = "吊顶封板不得早于机电隐蔽验收\n设备安装不得早于设备基础移交和设备到货\n消防联动调试不得早于正式水电接入";
    state.planWizard.data.externalDeps = "正式水电接入\n电梯设备到货\n消防检测单位进场\n专项验收预约";
    state.generatedPlan = null;
    clearWizardPreview();
    renderViewRoot();
    wireViewActions();
  };
  document.querySelector("#btn-auto-plan")?.addEventListener("click", startPlanWizard);
  document.querySelector("#btn-start-master-plan")?.addEventListener("click", startPlanWizard);

  // Wizard: back to schedule view
  document.querySelector("#btn-back-schedule")?.addEventListener("click", () => {
    state.showAutoPlan = false;
    state.generatedPlan = null;
    clearWizardPreview();
    state.planWizard = createDefaultPlanWizard();
    renderViewRoot();
    wireViewActions();
  });

  // Step 2 template folding
  document.querySelectorAll("[data-step2-template-toggle]").forEach(function(el) {
    if (el.dataset.step2ToggleBound === "1") return;
    el.dataset.step2ToggleBound = "1";
    el.addEventListener("click", function() {
      var data = state.planWizard.data;
      var id = this.dataset.step2TemplateToggle;
      if (!data.step2TemplateExpanded) data.step2TemplateExpanded = {};
      data.step2TemplateExpanded[id] = !data.step2TemplateExpanded[id];
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".wizard-template-select").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.planWizard.data;
      const templateId = input.dataset.templateId;
      if (!data.selectedTemplates) data.selectedTemplates = [];
      if (input.checked) {
        if (!data.selectedTemplates.includes(templateId)) data.selectedTemplates.push(templateId);
        if (templateId === "TP-BASE-001" && !data.templateModes?.["TP-BASE-001"] && !data.selectedBasementMode) {
          if (!data.templateModes) data.templateModes = {};
          data.templateModes["TP-BASE-001"] = {};
        }
      } else {
        data.selectedTemplates = data.selectedTemplates.filter((id) => id !== templateId);
      }
      syncRelationsFromMasterLanes(data, { addMissing: true });
      renderViewRoot();
      wireViewActions();
    });
  });

  // Task-level selection in step 2
  document.querySelectorAll(".wizard-task-select").forEach(function(cb) {
    if (cb.dataset.taskSelectBound === "1") return;
    cb.dataset.taskSelectBound = "1";
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var tplId = this.dataset.templateId;
      var idx = Number(this.dataset.taskIndex);
      var edit = data.templateEdits?.[tplId];
      if (edit && edit.tasks && edit.tasks[idx]) {
        edit.tasks[idx].enabled = this.checked;
      }
    });
  });

  // Step 2 mode selector
  document.querySelectorAll(".step2-mode-select").forEach(function(el) {
    if (el.dataset.modeBound === "1") return;
    el.dataset.modeBound = "1";
    el.addEventListener("change", function() {
      var data = state.planWizard.data;
      var templateId = this.dataset.templateId;
      var zoneKey = this.dataset.zoneKey;
      var val = this.value;
      if (!data.templateModes) data.templateModes = {};
      if (!data.templateModes[templateId]) data.templateModes[templateId] = {};
      // For single-mode templates (TP-ROOF-01), store as string; for multi-zone, store per zone
      if (typeof data.templateModes[templateId] === 'string') {
        data.templateModes[templateId] = val;
      } else {
        data.templateModes[templateId][zoneKey] = val;
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  // Finish decoration multi-select checkboxes (building rows)
  document.querySelectorAll(".finish-decor-cb").forEach(function(cb) {
    if (cb.dataset.finishBound === "1") return;
    cb.dataset.finishBound = "1";
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var building = this.dataset.building;
      var modeId = this.dataset.modeId;
      if (!data.finishDecorModes) data.finishDecorModes = { buildings: {}, basement: [] };
      if (!data.finishDecorModes.buildings) data.finishDecorModes.buildings = {};
      if (!data.finishDecorModes.buildings[building]) data.finishDecorModes.buildings[building] = [];
      var arr = data.finishDecorModes.buildings[building];
      if (this.checked) {
        if (!arr.includes(modeId)) arr.push(modeId);
      } else {
        var idx = arr.indexOf(modeId);
        if (idx >= 0) arr.splice(idx, 1);
      }
      renderViewRoot();
      wireViewActions();
    });
  });
  // Finish decoration basement checkboxes
  document.querySelectorAll(".finish-decor-basement-cb").forEach(function(cb) {
    if (cb.dataset.finishBsmtBound === "1") return;
    cb.dataset.finishBsmtBound = "1";
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var zoneKey = this.dataset.zoneKey;
      if (!data.finishDecorModes) data.finishDecorModes = { buildings: {}, basement: [] };
      if (!data.finishDecorModes.basement) data.finishDecorModes.basement = [];
      var arr = data.finishDecorModes.basement;
      if (this.checked) {
        if (!arr.includes(zoneKey)) arr.push(zoneKey);
      } else {
        var idx = arr.indexOf(zoneKey);
        if (idx >= 0) arr.splice(idx, 1);
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  // Accordion header toggle (step 3 mode groups)
  document.querySelectorAll(".mode-accordion-header").forEach(function(el) {
    if (el.dataset.accordionBound === "1") return;
    el.dataset.accordionBound = "1";
    el.addEventListener("click", function() {
      var wizardData = state.planWizard.data;
      var key = this.dataset.accordionKey;
      if (!key) return;
      if (!wizardData._accordionOpen) wizardData._accordionOpen = {};
      wizardData._accordionOpen[key] = !wizardData._accordionOpen[key];
      renderViewRoot();
      wireViewActions();
    });
  });
  // Add task to mode accordion
  document.querySelectorAll("[data-add-mode-task]").forEach(function(btn) {
    if (btn.dataset.addModeTaskBound === "1") return;
    btn.dataset.addModeTaskBound = "1";
    btn.addEventListener("click", function() {
      var wizardData = state.planWizard.data;
      var key = this.dataset.addModeTask;
      if (!key) return;
      if (!wizardData._modeTasks) wizardData._modeTasks = {};
      if (!wizardData._modeTasks[key]) wizardData._modeTasks[key] = [];
      wizardData._modeTasks[key].push({ id: "new-" + Date.now(), name: "新建工序", durationDays: 3, isKeyTask: false });
      renderViewRoot();
      wireViewActions();
    });
  });
  // Save mode tasks as default template
  document.querySelectorAll("[data-save-mode-default]").forEach(function(btn) {
    if (btn.dataset.saveDefaultBound === "1") return;
    btn.dataset.saveDefaultBound = "1";
    btn.addEventListener("click", function() {
      var wizardData = state.planWizard.data;
      var key = this.dataset.saveModeDefault;
      var templateId = this.dataset.templateId;
      var modeId = this.dataset.modeId;
      if (!key || !templateId || !modeId) return;
      var tasks = wizardData._modeTasks?.[key];
      if (!tasks || !tasks.length) {
        alert("没有可保存的工序数据");
        return;
      }
      var btnEl = this;
      var origText = btnEl.textContent;
      btnEl.textContent = "⏳ 保存中...";
      btnEl.disabled = true;
      api("/api/templates/" + encodeURIComponent(templateId) + "/mode-tasks", {
        method: "PUT",
        body: { modeId: modeId, tasks: tasks }
      }).then(function(res) {
        if (res.ok) {
          btnEl.textContent = "✅ 已保存";
          setTimeout(function() { btnEl.textContent = origText; btnEl.disabled = false; }, 2000);
        } else {
          btnEl.textContent = "❌ 保存失败";
          btnEl.disabled = false;
        }
      }).catch(function() {
        btnEl.textContent = "❌ 保存失败";
        btnEl.disabled = false;
      });
    });
  });
  // Remove task from mode accordion
  document.querySelectorAll("[data-remove-mode-task]").forEach(function(btn) {
    if (btn.dataset.removeModeTaskBound === "1") return;
    btn.dataset.removeModeTaskBound = "1";
    btn.addEventListener("click", function() {
      var wizardData = state.planWizard.data;
      var key = this.dataset.removeModeTask;
      var ti = parseInt(this.dataset.ti, 10);
      if (!key || isNaN(ti)) return;
      if (wizardData._modeTasks?.[key]) {
        wizardData._modeTasks[key].splice(ti, 1);
        renderViewRoot();
        wireViewActions();
      }
    });
  });
  // Mode task name/duration field changes
  document.querySelectorAll(".mode-task-name, .mode-task-duration").forEach(function(input) {
    input.addEventListener("change", function() {
      var data = state.planWizard.data;
      var key = this.dataset.modeKey;
      var ti = parseInt(this.dataset.ti, 10);
      if (!key || isNaN(ti)) return;
      var tasks = data._modeTasks?.[key];
      if (!tasks || !tasks[ti]) return;
      if (this.classList.contains("mode-task-name")) tasks[ti].name = this.value;
      else if (this.classList.contains("mode-task-duration")) tasks[ti].durationDays = parseFloat(this.value) || 1;
    });
  });
  // Mode task key checkbox
  document.querySelectorAll(".mode-task-key").forEach(function(cb) {
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var key = this.dataset.modeKey;
      var ti = parseInt(this.dataset.ti, 10);
      if (!key || isNaN(ti)) return;
      var tasks = data._modeTasks?.[key];
      if (!tasks || !tasks[ti]) return;
      tasks[ti].isKeyTask = this.checked;
    });
  });

  document.querySelectorAll(".template-mode-select").forEach(function(sel) {
    sel.addEventListener("change", function() {
      var data = state.planWizard.data;
      var tplId = this.dataset.tplId;
      var val = this.value;
      var bldg = this.dataset.bldg;
      var zone = this.dataset.zone;
      if (!tplId) return;
      if (!data.templateModes) data.templateModes = {};
      if (zone) {
        // Per-basement-zone mode assignment
        if (typeof data.templateModes[tplId] === 'string') data.templateModes[tplId] = {};
        if (!data.templateModes[tplId]) data.templateModes[tplId] = {};
        data.templateModes[tplId][zone] = val || null;
      } else if (bldg) {
        // Per-building mode assignment
        if (typeof data.templateModes[tplId] === 'string') data.templateModes[tplId] = {};
        if (!data.templateModes[tplId]) data.templateModes[tplId] = {};
        data.templateModes[tplId][bldg] = val || null;
      } else {
        // Legacy project-level mode assignment
        if (data.selectedBasementMode && tplId === "TP-BASE-001") data.selectedBasementMode = val || null;
        data.templateModes[tplId] = val || null;
      }
      // Clear _modeTasks cache for this template so tasks are rebuilt
      if (data._modeTasks) {
        Object.keys(data._modeTasks).forEach(function(k) {
          if (k.startsWith(tplId + '_')) delete data._modeTasks[k];
        });
      }
      renderViewRoot();
      wireViewActions();
    });
  });
  document.querySelector("#plan-excavation-layers")?.addEventListener("input", function() {
    var val = parseInt(this.value, 10);
    if (val >= 1 && val <= 20) state.planWizard.data.excavationLayerCount = val;
  });
  document.querySelector("#plan-excavation-layers-fallback")?.addEventListener("input", function() {
    var val = parseInt(this.value, 10);
    if (val >= 1 && val <= 20) state.planWizard.data.excavationLayerCount = val;
  });

  document.querySelectorAll(".template-task-field").forEach((input) => {
    const updateTask = () => {
      const data = state.planWizard.data;
      const templateId = input.dataset.templateId;
      const index = Number(input.dataset.taskIndex);
      const field = input.dataset.taskField;
      const task = data.templateEdits?.[templateId]?.tasks?.[index];
      if (!task || !field) return;
      if (field === "isKeyTask") {
        task[field] = input.checked;
      } else if (field === "durationDays" || field === "lagDays") {
        task[field] = Number(input.value) || 0;
      } else {
        task[field] = input.value;
      }
    };
    input.addEventListener("change", updateTask);
    if (input.tagName === "INPUT" && input.type !== "checkbox") input.addEventListener("input", updateTask);
  });

  // Task expand/collapse (step 3)
  document.querySelectorAll("[data-task-expand]").forEach(function(el) {
    el.addEventListener("click", function() {
      var key = this.dataset.taskExpand;
      var detail = this.closest(".template-task-item")?.querySelector(".task-detail-row");
      if (detail) {
        var hidden = detail.style.display === "none";
        detail.style.display = hidden ? "" : "none";
        this.textContent = hidden ? "▼" : "▶";
      }
    });
  });

  document.querySelectorAll("[data-remove-template-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = state.planWizard.data;
      const templateId = button.dataset.removeTemplateTask;
      const index = Number(button.dataset.taskIndex);
      const tasks = data.templateEdits?.[templateId]?.tasks;
      if (tasks && Number.isInteger(index)) tasks.splice(index, 1);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-add-template-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = state.planWizard.data;
      const templateId = button.dataset.addTemplateTask;
      if (!data.templateEdits) data.templateEdits = {};
      if (!data.templateEdits[templateId]) data.templateEdits[templateId] = { tasks: [] };
      const tasks = data.templateEdits[templateId].tasks;
      const index = tasks.length + 1;
      tasks.push({
        id: templateId + "-NEW-" + Date.now(),
        name: "新增工序 " + index,
        durationDays: 1,
        isKeyTask: true,
        predecessorId: tasks[index - 2]?.id || "",
        relationship: "FS",
        lagDays: 0
      });
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".entity-dep-field").forEach(function(input) {
    var updateEntityDependency = function() {
      var data = state.planWizard.data;
      var index = Number(input.dataset.entityIndex);
      var field = input.dataset.entityField;
      var dep = data.entityDependencies?.[index];
      if (!dep || !field) return;
      if (field === "lagDays") {
        dep.lagDays = Math.max(0, Number(input.value) || 0);
        return;
      }
      dep[field] = input.value;
      if (field === "relationship") {
        // Clear dependency fields when switching to/from no-dependency mode
        if (!dep.relationship) {
          dep.dependOnEntity = '';
          dep.dependOnTask = '';
          dep.lagDays = 0;
        }
        renderViewRoot();
        wireViewActions();
      } else if (field === "dependOnEntity") {
        dep.dependOnTask = "";
        renderViewRoot();
        wireViewActions();
      }
    };
    input.addEventListener("change", updateEntityDependency);
    if (input.tagName === "INPUT") input.addEventListener("input", updateEntityDependency);
  });

  // Wizard: next step
  const wizardNextButton = document.querySelector("#btn-wizard-next");
  if (wizardNextButton && wizardNextButton.dataset.wizardNextBound !== "1") {
    wizardNextButton.dataset.wizardNextBound = "1";
    wizardNextButton.addEventListener("click", () => {
      if (!lockWizardNavigation()) return;
      if (state.planWizard.step < 7) {
        syncWizardFields();
        state.planWizard.step += 1;
        renderViewRoot();
        wireViewActions();
      }
    });
  }

  // Wizard: previous step
  const wizardPrevButton = document.querySelector("#btn-wizard-prev");
  if (wizardPrevButton && wizardPrevButton.dataset.wizardPrevBound !== "1") {
    wizardPrevButton.dataset.wizardPrevBound = "1";
    wizardPrevButton.addEventListener("click", () => {
      if (!lockWizardNavigation()) return;
      if (state.planWizard.step > 1) {
        syncWizardFields();
        state.planWizard.step -= 1;
        renderViewRoot();
        wireViewActions();
      }
    });
  }

  // Wizard: generate plan (step 7)
  const generatePlanButton = document.querySelector("#btn-generate-plan");
  if (generatePlanButton && generatePlanButton.dataset.generatePlanBound !== "1") {
    generatePlanButton.dataset.generatePlanBound = "1";
    generatePlanButton.addEventListener("click", async () => {
      syncWizardFields();
      try {
        const projectId = state.projectId || getActiveProject()?.id;
        const planData = await api(`/api/projects/${encodeURIComponent(projectId)}/schedule/wizard/generate`, {
          method: "POST",
          body: { wizardData: state.planWizard.data }
        });
        state.generatedPlan = planData;
        state.wizardPreview = planData;
        state.planWizard.data.generated = planData;
        state.planWizard.step = 8;
        renderViewRoot();
        wireViewActions();
      } catch (error) {
        alert("生成计划失败: " + error.message);
      }
    });
  }

  document.querySelectorAll(".master-line-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.planWizard.data;
      ensureMasterWizardDefaults(data);
      const value = input.value;
      const selected = data.selectedMasterLanes || [];
      if (input.checked && !selected.includes(value)) selected.push(value);
      if (!input.checked) data.selectedMasterLanes = selected.filter((item) => item !== value);
      if (input.checked && !data.expandedMasterLanes.includes(value)) data.expandedMasterLanes.push(value);
      syncTemplatesFromMasterLanes(data, { addMissing: true });
      syncRelationsFromMasterLanes(data, { addMissing: true });
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-master-line-expand]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = state.planWizard.data;
      ensureMasterWizardDefaults(data);
      const laneId = button.dataset.masterLineExpand;
      if (!data.expandedMasterLanes) data.expandedMasterLanes = [];
      if (data.expandedMasterLanes.includes(laneId)) {
        data.expandedMasterLanes = data.expandedMasterLanes.filter((id) => id !== laneId);
      } else {
        data.expandedMasterLanes.push(laneId);
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".master-node-field").forEach((input) => {
    const updateNode = () => {
      const data = state.planWizard.data;
      ensureMasterWizardDefaults(data);
      const laneId = input.dataset.laneId;
      const index = Number(input.dataset.nodeIndex);
      const field = input.dataset.nodeField;
      const node = data.masterLaneEdits?.[laneId]?.nodes?.[index];
      if (!node || !field) return;
      if (field === "enabled" || field === "critical") {
        node[field] = input.checked;
      } else {
        node[field] = input.value;
      }
      if (field === "enabled" || field === "name") syncRelationsFromMasterLanes(data);
    };
    input.addEventListener("change", updateNode);
    if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") input.addEventListener("input", updateNode);
  });

  document.querySelectorAll("[data-add-master-node]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = state.planWizard.data;
      ensureMasterWizardDefaults(data);
      const laneId = button.dataset.addMasterNode;
      const lane = getMasterScheduleTemplate().lanes.find((item) => item.id === laneId);
      if (!lane) return;
      const edit = data.masterLaneEdits[laneId];
      edit.nodes.push(makeMasterLaneNode(lane, {
        id: `${laneId}-custom-${Date.now()}`,
        name: "新增节点",
        trade: lane.trade,
        owner: "",
        start: "",
        finish: "",
        predecessor: "",
        critical: false,
        agentHint: "人工新增节点，建议补充前置条件和审核提示。",
        custom: true,
        enabled: true
      }, edit.nodes.length));
      if (!data.expandedMasterLanes.includes(laneId)) data.expandedMasterLanes.push(laneId);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-reset-master-lane]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = state.planWizard.data;
      const laneId = button.dataset.resetMasterLane;
      resetMasterLaneEdit(data, laneId);
      syncRelationsFromMasterLanes(data, { addMissing: true });
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".master-relation-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.planWizard.data;
      const value = input.value;
      const source = input.dataset.relationSource || "legacy";
      if (source === "backend") {
        const backendOptions = getBackendRelationOptions(data);
        const optionIds = backendOptions.map((item) => item.id);
        const enabled = (data.enabledRuleRelations && data.enabledRuleRelations.length ? data.enabledRuleRelations.slice() : optionIds.slice());
        if (input.checked && !enabled.includes(value)) enabled.push(value);
        if (!input.checked) data.enabledRuleRelations = enabled.filter((item) => item !== value);
        else {
          data.enabledRuleRelations = enabled;
          const relation = backendOptions.find((item) => item.id === value);
          if (relation) {
            if (!data.relationRuleEdits) data.relationRuleEdits = {};
            data.relationRuleEdits[value] = {
              relationship: data.relationRuleEdits?.[value]?.relationship || relation.relationship || "FS",
              lagDays: Number(data.relationRuleEdits?.[value]?.lagDays ?? relation.lagDays ?? 0) || 0
            };
          }
        }
      } else {
        const enabled = data.enabledMasterRelations || [];
        if (input.checked && !enabled.includes(value)) enabled.push(value);
        if (!input.checked) data.enabledMasterRelations = enabled.filter((item) => item !== value);
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".rule-relation-relationship").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.planWizard.data;
      const relationId = input.dataset.relationId;
      if (!data.relationRuleEdits) data.relationRuleEdits = {};
      data.relationRuleEdits[relationId] = {
        ...(data.relationRuleEdits[relationId] || {}),
        relationship: input.value
      };
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".rule-relation-lag").forEach((input) => {
    input.addEventListener("change", () => {
      const data = state.planWizard.data;
      const relationId = input.dataset.relationId;
      if (!data.relationRuleEdits) data.relationRuleEdits = {};
      data.relationRuleEdits[relationId] = {
        ...(data.relationRuleEdits[relationId] || {}),
        lagDays: Number(input.value || 0)
      };
      renderViewRoot();
      wireViewActions();
    });
  });

  // Finish area template selection in step 2
  document.querySelectorAll(".finish-area-template-select").forEach(function(sel) {
    if (sel.dataset.finishTemplateBound === "1") return;
    sel.dataset.finishTemplateBound = "1";
    sel.addEventListener("change", function() {
      var data = state.planWizard.data;
      if (!data.finishAreaTemplates) data.finishAreaTemplates = {};
      data.finishAreaTemplates[this.dataset.finishArea] = this.value;
    });
  });

  // [data-mep-collapse-key] handler removed — MEP wizard simplified

  // MEP space selector
  // [data-mep-space-select] handler removed — MEP space selector simplified

  // MEP system toggle handler removed — MEP simplified to milestone nodes
// MEP toggle system chain expansion
  document.querySelectorAll("[data-mep-toggle-chain]").forEach(function(header) {
    header.addEventListener("click", function() {
      var spaceId = this.dataset.mepToggleChain;
      var system = this.dataset.mepSystem;
      var data = state.planWizard.data;
      if (!data.mepSpaceExpanded) data.mepSpaceExpanded = {};
      var key = spaceId + '_' + system;
      data.mepSpaceExpanded[key] = !data.mepSpaceExpanded[key];
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP task insert condition / predecessor edits
  document.querySelectorAll(".mep-task-insert-condition").forEach(function(input) {
    input.addEventListener("change", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.mepSpace;
      var system = this.dataset.mepSystem;
      var idx = parseInt(this.dataset.taskIndex);
      var taskKey = spaceId + '_' + system;
      if (!data.mepEditorTasks) data.mepEditorTasks = {};
      if (!data.mepEditorTasks[taskKey]) data.mepEditorTasks[taskKey] = [];
      if (!data.mepEditorTasks[taskKey][idx]) return;
      data.mepEditorTasks[taskKey][idx].constrainedBy = this.value;
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".mep-task-predecessor, .mep-task-relationship, .mep-task-lag").forEach(function(sel) {
    sel.addEventListener("change", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.mepSpace;
      var system = this.dataset.mepSystem;
      var idx = parseInt(this.dataset.taskIndex);
      var taskKey = spaceId + '_' + system;
      var field = this.dataset.field;
      if (!data.mepEditorTasks) data.mepEditorTasks = {};
      if (!data.mepEditorTasks[taskKey]) data.mepEditorTasks[taskKey] = [];
      if (!data.mepEditorTasks[taskKey][idx]) return;
      data.mepEditorTasks[taskKey][idx][field] = field === "lagDays" ? (parseInt(this.value) || 0) : this.value;
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP task name/duration/critical edits (live input)
  document.querySelectorAll(".mep-task-name, .mep-task-duration").forEach(function(input) {
    input.addEventListener("change", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.mepSpace;
      var system = this.dataset.mepSystem;
      var idx = parseInt(this.dataset.taskIndex);
      var field = this.dataset.field;
      var taskKey = spaceId + '_' + system;
      if (!data.mepEditorTasks) data.mepEditorTasks = {};
      if (!data.mepEditorTasks[taskKey]) data.mepEditorTasks[taskKey] = [];
      if (!data.mepEditorTasks[taskKey][idx]) return;
      var val = this.type === 'number' ? parseInt(this.value) || 1 : this.value;
      data.mepEditorTasks[taskKey][idx][field] = val;
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP task critical checkbox
  document.querySelectorAll(".mep-task-critical").forEach(function(cb) {
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.mepSpace;
      var system = this.dataset.mepSystem;
      var idx = parseInt(this.dataset.taskIndex);
      var taskKey = spaceId + '_' + system;
      if (!data.mepEditorTasks) data.mepEditorTasks = {};
      if (!data.mepEditorTasks[taskKey]) data.mepEditorTasks[taskKey] = [];
      if (!data.mepEditorTasks[taskKey][idx]) return;
      data.mepEditorTasks[taskKey][idx].critical = this.checked;
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP add task button
  document.querySelectorAll("[data-add-mep-task]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.addMepTask;
      var system = this.dataset.mepSystem;
      var taskKey = spaceId + '_' + system;
      if (!data.mepEditorTasks) data.mepEditorTasks = {};
      if (!data.mepEditorTasks[taskKey]) data.mepEditorTasks[taskKey] = [];
      // Find the last task's name for predecessor
      var tasks = data.mepEditorTasks[taskKey];
      // Determine phase from last task or default
      var lastPhase = tasks.length ? (tasks[tasks.length - 1].phase || '') : '';
      var lastPhaseOrder = tasks.length ? (tasks[tasks.length - 1].phaseOrder || 0) : 0;
      data.mepEditorTasks[taskKey].push({
        name: "新工序",
        durationDays: 3,
        critical: false,
        predecessor: tasks.length ? tasks[tasks.length - 1].name : "",
        constrainedBy: "",
        phase: lastPhase,
        phaseOrder: lastPhaseOrder
      });
      data.mepSpaceExpanded = data.mepSpaceExpanded || {};
      data.mepSpaceExpanded[spaceId + '_' + system] = true;
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP remove task button
  document.querySelectorAll("[data-remove-mep-task]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.removeMepTask;
      var system = this.dataset.mepSystem;
      var idx = parseInt(this.dataset.taskIndex);
      var taskKey = spaceId + '_' + system;
      if (data.mepEditorTasks && data.mepEditorTasks[taskKey]) {
        data.mepEditorTasks[taskKey].splice(idx, 1);
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  // MEP space constraint toggles
  document.querySelectorAll(".mep-space-constraint").forEach(function(cb) {
    cb.addEventListener("change", function() {
      var data = state.planWizard.data;
      var spaceId = this.dataset.mepSpace;
      var value = this.value;
      if (!data.mepEditorConstraints) data.mepEditorConstraints = {};
      if (!data.mepEditorConstraints[spaceId]) data.mepEditorConstraints[spaceId] = [];
      var arr = data.mepEditorConstraints[spaceId];
      if (this.checked && !arr.includes(value)) arr.push(value);
      else if (!this.checked) data.mepEditorConstraints[spaceId] = arr.filter(function(v) { return v !== value; });
      syncRelationsFromMasterLanes(data, { addMissing: true });
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-toggle-vertical-transport]").forEach(function(header) {
    header.addEventListener("click", function(event) {
      if (event.target.closest("button, input, select, textarea, label")) return;
      const key = this.dataset.toggleVerticalTransport;
      const next = sessionStorage.getItem(key) !== "true";
      sessionStorage.setItem(key, next ? "true" : "false");
      renderViewRoot();
      wireViewActions();
    });
  });

  // Wizard: sync fields on change/input
  // Scope selection: building checkbox toggles
  document.querySelectorAll(".building-scope-cb").forEach(function(cb) {
    cb.addEventListener("change", function() {
      var arr = state.planWizard.data.selectedBuildings || [];
      if (this.checked && !arr.includes(this.value)) arr.push(this.value);
      else if (!this.checked) state.planWizard.data.selectedBuildings = arr.filter(function(v) { return v !== this.value; }.bind(this));
      var proj = getActiveProject();
      syncVerticalTransportCoverage(state.planWizard.data, proj?.buildings || [], proj?.basement?.levels || []);
      renderViewRoot();
      wireViewActions();
    });
  });
  // Scope selection: basement checkbox toggles
  document.querySelectorAll(".basement-scope-cb").forEach(function(cb) {
    cb.addEventListener("change", function() {
      var arr = state.planWizard.data.selectedBasementLevels || [];
      if (this.checked && !arr.includes(this.value)) arr.push(this.value);
      else if (!this.checked) state.planWizard.data.selectedBasementLevels = arr.filter(function(v) { return v !== this.value; }.bind(this));
      var proj = getActiveProject();
      syncVerticalTransportCoverage(state.planWizard.data, proj?.buildings || [], proj?.basement?.levels || []);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".transport-field").forEach(function(input) {
    input.addEventListener("change", function() {
      var data = getVerticalTransportDataBySource(this.dataset.transportSource);
      var list = this.dataset.transportKind === "tower" ? data.towerCranes : data.constructionElevators;
      var item = list?.[Number(this.dataset.transportIndex)];
      if (!item) return;
      var field = this.dataset.transportField;
      if (this.dataset.transportType === "boolean") item[field] = this.checked;
      else item[field] = this.value;
      commitVerticalTransportDataBySource(this.dataset.transportSource, data);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".transport-coverage-cb").forEach(function(input) {
    input.addEventListener("change", function() {
      var data = getVerticalTransportDataBySource(this.dataset.transportSource);
      var list = this.dataset.transportKind === "tower" ? data.towerCranes : data.constructionElevators;
      var item = list?.[Number(this.dataset.transportIndex)];
      if (!item) return;
      var field = this.dataset.transportField;
      var values = item[field] || [];
      if (this.checked && !values.includes(this.value)) values.push(this.value);
      if (!this.checked) values = values.filter((value) => value !== this.value);
      item[field] = values;
      commitVerticalTransportDataBySource(this.dataset.transportSource, data);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-add-transport]").forEach(function(button) {
    button.addEventListener("click", function() {
      var data = getVerticalTransportDataBySource(this.dataset.transportSource);
      var proj = getActiveProject();
      var buildings = (proj?.buildings || []).filter((b) => (data.selectedBuildings || []).includes(b.name));
      var buildingNames = buildings.map((b) => b.name);
      var basementZoneKeys = getBasementZoneOptions(proj?.basement?.levels || [])
        .map((zone) => zone.key)
        .filter((key) => (data.selectedBasementLevels || []).includes(key));
      if (this.dataset.addTransport === "tower") {
        if (!Array.isArray(data.towerCranes)) data.towerCranes = [];
        data.towerCranes.push(makeTowerCrane(data.towerCranes.length, buildingNames, basementZoneKeys));
      } else {
        if (!Array.isArray(data.constructionElevators)) data.constructionElevators = [];
        data.constructionElevators.push(makeConstructionElevator(data.constructionElevators.length, buildingNames.slice(0, 2)));
      }
      commitVerticalTransportDataBySource(this.dataset.transportSource, data);
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-remove-transport]").forEach(function(button) {
    button.addEventListener("click", function() {
      var data = getVerticalTransportDataBySource(this.dataset.transportSource);
      var index = Number(this.dataset.transportIndex);
      if (this.dataset.removeTransport === "tower") data.towerCranes = (data.towerCranes || []).filter((_, i) => i !== index);
      if (this.dataset.removeTransport === "elevator") data.constructionElevators = (data.constructionElevators || []).filter((_, i) => i !== index);
      commitVerticalTransportDataBySource(this.dataset.transportSource, data);
      renderViewRoot();
      wireViewActions();
    });
  });


  // Zone add/remove/coverage (basement zones)
  document.querySelectorAll("[data-add-zone]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var li = this.dataset.addZone;
      var card = this.closest(".basement-level-card");
      var zRows = card.querySelectorAll(".basement-zone-row");
      var zbi = zRows.length;
      var projectBuildings = getActiveProject()?.buildings || [];
      var bldgOpts = projectBuildings.map(function(b) { var name = b.name || ''; return '<label><input type="checkbox" class="basement-building-cb" data-bindex="' + li + '" data-zindex="' + zbi + '" value="' + escapeHtml(name) + '" /> ' + escapeHtml(name) + '</label>'; }).join('');
      var newZone = document.createElement("div");
      newZone.className = "basement-zone-row";
      newZone.dataset.level = li;
      newZone.dataset.zone = zbi;
      newZone.style.cssText = "display:grid;grid-template-columns:30px 80px 90px 100px 1fr;gap:4px;align-items:center;padding:3px 4px";
      newZone.innerHTML =
        '<span style="font-size:11px;color:var(--muted);text-align:center">' + (zbi + 1) + '</span>' +
        '<input class="basement-zone-field" data-bindex="' + li + '" data-zindex="' + zbi + '" data-zfield="name" value="' + (zbi + 1) + '区" style="width:70px;font-size:12px" />' +
        '<input class="basement-zone-field" data-bindex="' + li + '" data-zindex="' + zbi + '" data-zfield="area" type="number" min="0" step="0.1" value="0" style="width:80px;font-size:12px" />' +
        '<select class="basement-zone-field basement-zone-coverage" data-bindex="' + li + '" data-zindex="' + zbi + '" data-zfield="coverage" style="width:90px;font-size:12px">' +
          '全部覆盖|局部覆盖|仅车库/配套区'.split("|").map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join("") +
        '</select>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<div class="basement-building-picker" data-bindex="' + li + '" data-zindex="' + zbi + '" hidden style="flex:1">' +
            '<button class="basement-dropdown-btn" type="button" data-bdropdown="' + li + '-' + zbi + '">请选择关联楼栋</button>' +
            '<div class="basement-dropdown-menu" data-bmenu="' + li + '-' + zbi + '" hidden>' + bldgOpts + '</div>' +
          '</div>' +
          '<button class="secondary-button small" type="button" data-remove-zone="' + li + '" data-zi="' + zbi + '" style="flex-shrink:0;padding:0 4px;border:none;color:var(--red);background:transparent;font-size:12px">&#10005;</button>' +
        '</div>' +
      '</div>';
      var addBtn = this;
      card.insertBefore(newZone, addBtn); // Insert before the add button
    });
  });
  // Remove zone
  document.querySelector("#basement-levels")?.addEventListener("click", function(ev) {
    var btn = ev.target.closest("[data-remove-zone]");
    if (btn) {
      var zoneRow = btn.closest(".basement-zone-row");
      if (zoneRow && confirm("确定删除此分区？")) {
        zoneRow.remove();
      }
      return;
    }
    var lvlBtn = ev.target.closest("[data-remove-basement-level]");
    if (lvlBtn) {
      var card = lvlBtn.closest(".basement-level-card");
      if (card && confirm("确定删除此地下层？")) card.remove();
    }
  });
  // Zone coverage toggle
  document.querySelector("#basement-levels")?.addEventListener("change", function(ev) {
    var cov = ev.target.closest(".basement-zone-coverage, .basement-coverage");
    if (cov) {
      var row = cov.closest(".basement-zone-row, .basement-level-row");
      var picker = row?.querySelector(".basement-building-picker");
      if (picker) {
        picker.hidden = !(cov.value === '局部覆盖' || cov.value === '局部' || cov.value === '局部（库）');
      }
    }
  });
  // Zone building checkbox: update button text
  document.querySelector("#basement-levels")?.addEventListener("change", function(ev) {
    var cb = ev.target.closest(".basement-building-cb");
    if (cb) {
      var picker = cb.closest(".basement-building-picker");
      if (picker) {
        var checked = Array.from(picker.querySelectorAll(".basement-building-cb:checked")).map(function(c) { return c.value; });
        var btn = picker.querySelector(".basement-dropdown-btn");
        if (btn) btn.textContent = checked.length ? checked.join('、') : '请选择关联楼栋';
      }
    }
  });


  // Sync plan start/duration/finish dates
  function syncPlanDates() {
    var data = state.planWizard.data;
    if (!data.startDate || !data.durationMonths) return;
    var start = new Date(data.startDate);
    if (isNaN(start.getTime())) return;
    // Calculate finish from start + durationMonths
    var finish = new Date(start);
    finish.setMonth(finish.getMonth() + Number(data.durationMonths));
    data.finishDate = formatDateInputValue(finish);
  }
  document.querySelector("#plan-duration")?.addEventListener("change", function() {
    var val = parseInt(this.value, 10);
    if (val >= 1 && val <= 60) {
      state.planWizard.data.durationMonths = val;
      syncPlanDates();
      // Refresh finish date field display
      var finishInput = document.querySelector("#plan-finish");
      if (finishInput) finishInput.value = state.planWizard.data.finishDate;
    }
  });
  document.querySelector("#plan-start")?.addEventListener("change", function() {
    state.planWizard.data.startDate = this.value;
    syncPlanDates();
    var finishInput = document.querySelector("#plan-finish");
    if (finishInput) finishInput.value = state.planWizard.data.finishDate;
  });
  document.querySelector("#plan-finish")?.addEventListener("change", function() {
    var data = state.planWizard.data;
    data.finishDate = this.value;
    if (data.startDate && this.value) {
      var start = new Date(data.startDate);
      var finish = new Date(this.value);
      if (!isNaN(start.getTime()) && !isNaN(finish.getTime())) {
        var diff = (finish.getFullYear() - start.getFullYear()) * 12 + (finish.getMonth() - start.getMonth());
        data.durationMonths = Math.max(1, diff || 1);
        // Refresh duration field
        var durInput = document.querySelector("#plan-duration");
        if (durInput) durInput.value = data.durationMonths;
      }
    }
  });

  document.querySelectorAll(".wizard-field").forEach((el) => {
    const onChange = () => {
      const field = el.dataset.wizardField;
      if (!field) return;
      const type = el.dataset.wizardType || "string";
      if (type === "boolean") {
        state.planWizard.data[field] = el.checked;
      } else if (type === "number") {
        state.planWizard.data[field] = Number(el.value);
      } else {
        state.planWizard.data[field] = el.value;
      }
    };
    el.addEventListener("change", onChange);
    if (el.tagName === "INPUT" && el.type !== "checkbox") {
      el.addEventListener("input", onChange);
    }
  });

  document.querySelector("#plan-result-content")?.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-node]");
    const removeButton = event.target.closest("[data-remove-node]");
    if (!state.generatedPlan || (!addButton && !removeButton)) return;

    state.generatedPlan.nodes = readEditedPlanNodes();

    if (addButton) {
      state.generatedPlan.nodes.push({
        name: "",
        owner: "",
        percent: 0,
        plannedDate: "",
        varianceDays: 0,
        critical: false
      });
    }

    if (removeButton) {
      const index = Number(removeButton.dataset.removeNode);
      if (Number.isInteger(index)) {
        state.generatedPlan.nodes.splice(index, 1);
      }
    }

    rerenderGeneratedPlanResult();
  });

  document.querySelector("#btn-apply-plan")?.addEventListener("click", async (event) => {
    const planData = state.generatedPlan;
    if (!planData) return;
    if (planData.audit?.status === "blocked") {
      alert("当前自动编制计划仍有阻断项，暂不能应用到项目。请先根据审核提示调整。");
      return;
    }
    event.currentTarget.disabled = true;
    const rows = readEditedPlanNodes();
    await api(`/api/projects/${state.projectId}/schedule/wizard/apply`, {
      method: "POST",
      body: {
        wizardData: state.planWizard.data,
        rows,
        source: "AI-进度计划自动编制"
      }
    });
    await loadProjectData();
    window.setTimeout(refreshNotificationsAndInsights, 550);
    state.showAutoPlan = false;
    state.generatedPlan = null;
    render();
  });

  document.querySelector("#view-root").querySelectorAll("[data-todo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.todoAction;
      const id = button.dataset.todoId;
      if (action === "confirm") {
        writeTodoState(id, { status: "已确认" });
        const confirmed = JSON.parse(sessionStorage.getItem("todo-confirmed") || "[]");
        if (!confirmed.includes(id)) confirmed.push(id);
        sessionStorage.setItem("todo-confirmed", JSON.stringify(confirmed));
      } else if (action === "assign") {
        const assignee = prompt("指派人：");
        if (!assignee) return;
        writeTodoState(id, { status: "已指派", assignee });
      } else if (action === "transfer") {
        writeTodoState(id, { status: "已转待办" });
      } else if (action === "reject") {
        const reason = prompt("驳回原因：");
        if (!reason) return;
        writeTodoState(id, { status: "已驳回", rejectReason: reason });
      }
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelector("#view-root").querySelectorAll("[data-safety-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.safetyAction;
      const id = button.dataset.safetyId;
      if (action === "close") {
        button.textContent = "已复查通过 ✅";
        button.disabled = true;
      } else if (action === "reject") {
        const reason = prompt("打回原因：");
        if (reason) {
          button.textContent = "已打回 ↩️";
          button.disabled = true;
        }
      } else if (action === "view") {
        alert(`[占位] 查看整改详情 (${id}) - 待接入后端接口`);
      }
    });
  });

  document.querySelector("#view-root").querySelectorAll("[data-doc-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.docAction;
      const id = button.dataset.docId;
      if (action === "view") {
        alert(`[占位] 查看资料详情 (${id}) - 待接入后端接口`);
      } else if (action === "cite") {
        alert(`[占位] 查看引用记录 (${id}) - 待接入后端接口`);
      } else if (action === "reparse") {
        button.textContent = "已提交解析";
        button.disabled = true;
      }
    });
  });

  document.querySelector("#view-root").querySelectorAll("[data-action='open-project']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.projectId = button.dataset.projectId;
      state.currentView = "dashboard";
      state.showAutoPlan = false;
      state.generatedPlan = null;
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "dashboard"));
      await loadProjectData();
      render();
    });
  });

  document.querySelector("#view-root").querySelectorAll("[data-action='focus-project']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.projectId = button.dataset.projectId;
      state.showAutoPlan = false;
      state.generatedPlan = null;
      await loadProjectData();
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

  document.querySelectorAll(".agent-provider-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const provider = state.data.session.providers.find((item) => item.id === event.target.value);
      await api(`/api/agent/config/models/${event.target.dataset.agentId}`, {
        method: "PATCH",
        body: {
          providerId: provider.id,
          chatModel: provider.capabilities.chat[0],
          embeddingModel: provider.capabilities.embedding[0],
          ocrModel: provider.capabilities.ocr[0],
          rerankModel: provider.capabilities.rerank[0]
        }
      });
      await loadAgentConfig();
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll(".agent-model-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      await api(`/api/agent/config/models/${event.target.dataset.agentId}`, {
        method: "PATCH",
        body: { chatModel: event.target.value }
      });
      await loadAgentConfig();
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-workflow-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/agent/config/workflows/${button.dataset.workflowToggle}`, {
        method: "PATCH",
        body: { enabled: button.dataset.enabled === "true" }
      });
      await loadAgentConfig();
      renderViewRoot();
      wireViewActions();
    });
  });

  document.querySelectorAll("[data-workflow-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/agent/workflows/${button.dataset.workflowTest}/test`, {
        method: "POST",
        body: { projectId: state.projectId }
      });
      window.setTimeout(async () => {
        state.data.runs = await api(`/api/agent/runs?projectId=${state.projectId}`);
        await refreshNotificationsAndInsights();
        renderViewRoot();
        wireViewActions();
      }, 650);
    });
  });

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
      input.value = "";
      await sendMainChatQuestion(question);
    });
  }

  document.querySelectorAll("[data-evidence-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.agentEvidenceTab = button.dataset.evidenceTab;
      renderViewRoot();
      wireViewActions();
    });
  });

  const scheduledTaskForm = document.querySelector("#scheduled-task-form");
  if (scheduledTaskForm) {
    scheduledTaskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nameInput = document.querySelector("#scheduled-task-name");
      const typeInput = document.querySelector("#scheduled-task-type");
      const frequencyInput = document.querySelector("#scheduled-task-frequency");
      const runAtInput = document.querySelector("#scheduled-task-run-at");
      const promptInput = document.querySelector("#scheduled-task-prompt");
      await api(`/api/projects/${state.projectId}/scheduled-tasks`, {
        method: "POST",
        body: {
          name: nameInput.value.trim(),
          taskType: typeInput.value,
          frequency: frequencyInput.value,
          runAt: runAtInput.value.trim(),
          prompt: promptInput.value.trim()
        }
      });
      state.agentEvidenceTab = "tasks";
      state.data.scheduledTasks = await api(`/api/projects/${state.projectId}/scheduled-tasks`);
      state.data.auditLogs = await api(`/api/projects/${state.projectId}/audit-logs`);
      renderViewRoot();
      wireViewActions();
    });
  }

  document.querySelectorAll("[data-chat-question]").forEach((button) => {
    button.addEventListener("click", async () => {
      await sendMainChatQuestion(button.dataset.chatQuestion);
    });
  });

  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.currentView = button.dataset.openView;
      state.agentSubView = "home";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.currentView));
      await loadProjectData();
      render();
    });
  });

  document.querySelectorAll("[data-agent-subview]").forEach((button) => {
    button.addEventListener("click", () => {
      state.agentSubView = button.dataset.agentSubview;
      renderViewRoot();
      wireViewActions();
      document.body.dataset.agentSubView = state.agentSubView;
    });
  });

  document.querySelector("#agent-subview-back")?.addEventListener("click", () => {
    state.agentSubView = "home";
    renderViewRoot();
    wireViewActions();
    document.body.dataset.agentSubView = "home";
  });
}

window.addEventListener("error", function(ev) {
  var root = document.querySelector("#view-root");
  if (root && !root.innerHTML.trim()) {
    root.innerHTML = "<section class=\"panel fade-in\" style=\"margin:20px\"><h3 style=\"color:var(--red)\">\u5168\u5c40\u9519\u8bef</h3><p style=\"font-size:13px;background:#fff3e0;padding:8px;border-radius:6px\">" + escapeHtml(ev.message || "") + "</p><pre style=\"font-size:11px;color:var(--muted);overflow:auto;max-height:200px;margin:8px 0\">" + escapeHtml((ev.error ? (ev.error.stack || ev.error.message || "") : "").slice(0,500)) + "</pre></section>";
  }
});

async function bootstrap() {
  try {
    await reloadAll();
    wireGlobalActions();
  } catch (e) {
    console.error("bootstrap\u5931\u8d25:", e);
    var root = document.querySelector("#view-root");
    if (root) root.innerHTML = "<section class=\"panel fade-in\" style=\"margin:20px\"><h3 style=\"color:var(--red)\">\u542f\u52a8\u5931\u8d25</h3><p>" + escapeHtml(e.message) + "</p><pre>" + escapeHtml((e.stack || "").slice(0,500)) + "</pre></section>";
  }
}

bootstrap();
