import { loadScheduleLibraries, summarizeScheduleLibraries } from "../data/schedule-libraries/index.js";

const SPACE_LABELS = {
  basement: "地下室",
  tower: "塔楼标准层",
  public: "公区",
  ceiling: "吊顶区域",
  equipment: "机房",
  roof: "屋面",
  outdoor: "室外接驳"
};

const SYSTEM_LABELS = {
  plumbing: "给排水",
  electrical: "电气",
  fire: "消防",
  hvac: "暖通",
  weak: "弱电/智能化",
  elevator: "电梯"
};

const MEP_CONTROL_PACKAGE_DEFS = {
  basement_main: {
    id: "basement_main",
    label: "地下室机电主干施工",
    sort: 10,
    upstream: "地下室结构完成 + 管综深化/支吊架",
    downstream: "地下室安装面移交"
  },
  tower_embed: {
    id: "tower_embed",
    label: "主体预留预埋同步",
    sort: 20,
    upstream: "主体结构启动",
    downstream: "标准层机电粗装插入"
  },
  tower_roughin: {
    id: "tower_roughin",
    label: "标准层机电粗装施工",
    sort: 30,
    upstream: "主体结构滞后楼层形成",
    downstream: "砌体后二次配管/箱盒收口"
  },
  secondary_fixing: {
    id: "secondary_fixing",
    label: "二次配管及箱盒收口",
    sort: 40,
    upstream: "砌体完成",
    downstream: "吊顶/装饰移交"
  },
  ceiling_concealed: {
    id: "ceiling_concealed",
    label: "公区/吊顶机电隐蔽完成",
    sort: 50,
    upstream: "公区综合排布完成",
    downstream: "吊顶封板/面层收口"
  },
  equipment_finish: {
    id: "equipment_finish",
    label: "机房/屋面设备安装完成",
    sort: 60,
    upstream: "设备基础移交 + 设备到货",
    downstream: "系统联调"
  },
  commission_acceptance: {
    id: "commission_acceptance",
    label: "系统联调与专项验收收口",
    sort: 70,
    upstream: "正式水电接入",
    downstream: "竣工验收"
  }
};

function formatDateInputValue(date = new Date()) {
  return date.toISOString().split("T")[0];
}

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return formatDateInputValue(date);
}

function resolveProjectType(project, wizardData) {
  if (wizardData?.buildingType === "residential") return "residential";
  if (String(project?.type || "").includes("住宅")) return "residential";
  return "residential";
}

function normalizeWizardData(wizardData = {}) {
  return {
    ...wizardData,
    selectedTemplates: Array.isArray(wizardData.selectedTemplates) ? wizardData.selectedTemplates : [],
    selectedBuildings: Array.isArray(wizardData.selectedBuildings) ? wizardData.selectedBuildings : [],
    selectedBasementLevels: Array.isArray(wizardData.selectedBasementLevels) ? wizardData.selectedBasementLevels : [],
    mepSpaces: Array.isArray(wizardData.mepSpaces) ? wizardData.mepSpaces : [],
    mepEditorSystems: wizardData.mepEditorSystems || {},
    mepEditorTasks: wizardData.mepEditorTasks || {},
    mepEditorConstraints: wizardData.mepEditorConstraints || {},
    relationRuleEdits: wizardData.relationRuleEdits || {},
    towerCranes: Array.isArray(wizardData.towerCranes) ? wizardData.towerCranes : [],
    constructionElevators: Array.isArray(wizardData.constructionElevators) ? wizardData.constructionElevators : [],
    templateEdits: wizardData.templateEdits || {},
    templateModes: wizardData.templateModes || {},
    startDate: wizardData.startDate || formatDateInputValue()
  };
}

function getSelectedBuildings(project, wizardData) {
  const all = Array.isArray(project?.buildings) ? project.buildings : [];
  if (!wizardData.selectedBuildings.length) return all;
  return all.filter((building) => wizardData.selectedBuildings.includes(building.name));
}

function getSelectedBasementZones(project, wizardData) {
  const levels = project?.basement?.levels || [];
  const selected = new Set(wizardData.selectedBasementLevels || []);
  const zones = [];
  levels.forEach((level) => {
    const levelName = level.name || "B1";
    const sourceZones = Array.isArray(level.zones) && level.zones.length ? level.zones : [{ name: "1区", area: level.area || 0 }];
    sourceZones.forEach((zone) => {
      const key = `${levelName}-${zone.name}`;
      if (!selected.size || selected.has(key)) {
        zones.push({
          key,
          label: `${levelName} ${zone.name}`,
          levelName,
          zoneName: zone.name,
          area: zone.area || 0
        });
      }
    });
  });
  return zones;
}

function normalizeTask(task, fallbackId) {
  return {
    id: task.id || task.task_id || fallbackId,
    name: task.name || task.task_name || "新工序",
    durationDays: Number(task.durationDays ?? task.duration_days ?? task.default_duration_days ?? 3) || 3,
    isKeyTask: task.isKeyTask ?? task.is_key_task ?? true,
    predecessorId: task.predecessorId || task.predecessor_id || (((task.predecessors || [])[0] || {}).task_id) || "",
    relationship: task.relationship || (((task.predecessors || [])[0] || {}).relationship) || "FS",
    lagDays: Number(task.lagDays ?? (((task.predecessors || [])[0] || {}).lag_days) ?? 0) || 0,
    phaseKey: task.phaseKey || task.phase_key || "",
    code: task.code || "",
    predecessorRef: task.predecessorRef || ""
  };
}

function getTemplateDefaults(templateId, libraries) {
  return libraries.wbs.templates[templateId] || null;
}

function getTemplateTasks(templateId, wizardData, libraries) {
  const edit = wizardData.templateEdits?.[templateId];
  if (edit?.tasks?.length) {
    return edit.tasks.map((task, index) => normalizeTask(task, `${templateId}-${index + 1}`));
  }
  const defaults = getTemplateDefaults(templateId, libraries)?.defaultTasks || [];
  return defaults.map((task, index) => normalizeTask(task, `${templateId}-${index + 1}`));
}

function createNode(base, overrides = {}) {
  return {
    id: overrides.id,
    name: overrides.name,
    owner: overrides.owner || base.owner || "专业负责人",
    percent: 0,
    plannedDate: overrides.plannedDate || base.plannedDate,
    varianceDays: 0,
    critical: overrides.critical ?? base.critical ?? false,
    source: overrides.source || base.source || "schedule-engine",
    templateId: overrides.templateId || base.templateId,
    trade: overrides.trade || base.trade || "总包",
    area: overrides.area || "",
    system: overrides.system || "",
    phaseKey: overrides.phaseKey || "",
    predecessor: overrides.predecessor || "",
    agentHint: overrides.agentHint || "",
    durationDays: overrides.durationDays ?? base.durationDays ?? 3,
    groupKey: overrides.groupKey || "",
    entityName: overrides.entityName || "",
    spaceKey: overrides.spaceKey || "",
    systemKey: overrides.systemKey || "",
    code: overrides.code || "",
    predecessorRef: overrides.predecessorRef || ""
  };
}

function expandGenericTemplateNodes(templateId, wizardData, libraries, project) {
  const template = getTemplateDefaults(templateId, libraries);
  if (!template) return [];
  const tasks = getTemplateTasks(templateId, wizardData, libraries);
  const buildings = getSelectedBuildings(project, wizardData);
  const basementZones = getSelectedBasementZones(project, wizardData);
  const result = [];

  if (templateId === "TP-STR-001" && buildings.length) {
    buildings.forEach((building, buildingIndex) => {
      tasks.forEach((task, taskIndex) => {
        result.push(createNode({
          templateId,
          trade: template.trade,
          owner: template.owner
        }, {
          id: `${templateId}-${buildingIndex + 1}-${taskIndex + 1}`,
          name: `${building.name} · ${task.name}`,
          area: building.name,
          entityName: building.name,
          critical: task.isKeyTask,
          durationDays: task.durationDays,
          predecessor: task.predecessorId,
          groupKey: `${templateId}:${building.name}`,
          source: "schedule-engine.structure"
        }));
      });
    });
    return result;
  }

  if (templateId === "TP-BASE-001" && basementZones.length) {
    basementZones.forEach((zone, zoneIndex) => {
      tasks.forEach((task, taskIndex) => {
        result.push(createNode({
          templateId,
          trade: template.trade,
          owner: template.owner
        }, {
          id: `${templateId}-${zoneIndex + 1}-${taskIndex + 1}`,
          name: `${zone.label} · ${task.name}`,
          area: zone.label,
          entityName: zone.label,
          critical: task.isKeyTask,
          durationDays: task.durationDays,
          predecessor: task.predecessorId,
          groupKey: `${templateId}:${zone.key}`,
          source: "schedule-engine.basement"
        }));
      });
    });
    return result;
  }

  tasks.forEach((task, taskIndex) => {
    result.push(createNode({
      templateId,
      trade: template.trade,
      owner: template.owner
    }, {
      id: `${templateId}-${taskIndex + 1}`,
      name: task.name,
      critical: task.isKeyTask,
      durationDays: task.durationDays,
      predecessor: task.predecessorId,
      groupKey: templateId,
      source: "schedule-engine.template"
    }));
  });
  return result;
}

function expandMepNodes(wizardData, libraries, project) {
  const template = getTemplateDefaults("TP-MEP-01", libraries);
  if (!template) return [];
  const buildings = getSelectedBuildings(project, wizardData);
  const basementZones = getSelectedBasementZones(project, wizardData);
  const nodes = [];
  const activeSpaces = wizardData.mepSpaces.filter((space) => space.enabled !== false);

  activeSpaces.forEach((space) => {
    const spaceTemplate = template.spaceTemplates[space.spaceType];
    if (!spaceTemplate) return;
    const systems = wizardData.mepEditorSystems[space.id] || spaceTemplate.defaultSystems || [];
    const constraints = wizardData.mepEditorConstraints[space.id] || [];
    const entities =
      space.spaceType === "tower"
        ? (buildings.length ? buildings.map((building) => ({ key: building.name, label: building.name })) : [{ key: "tower", label: "塔楼" }])
        : space.spaceType === "basement"
          ? (basementZones.length ? basementZones : [{ key: "basement", label: "地下室" }])
          : [{ key: space.spaceType, label: space.name || SPACE_LABELS[space.spaceType] || space.spaceType }];

    entities.forEach((entity, entityIndex) => {
      systems.forEach((systemId) => {
        const taskKey = `${space.id}_${systemId}`;
        const editorTasks = wizardData.mepEditorTasks[taskKey];
        const sourceTasks = Array.isArray(editorTasks) && editorTasks.length
          ? editorTasks.map((task, index) => normalizeTask(task, `${taskKey}-${index + 1}`))
          : (spaceTemplate.defaultTasks[systemId] || []).map((task, index) => normalizeTask(task, `${taskKey}-${index + 1}`));
        sourceTasks.forEach((task, taskIndex) => {
          nodes.push(createNode({
            templateId: "TP-MEP-01",
            trade: template.trade,
            owner: template.owner
          }, {
            id: `${space.id}-${entityIndex + 1}-${systemId}-${taskIndex + 1}`,
            name: `${entity.label} · ${SYSTEM_LABELS[systemId] || systemId} · ${task.name}`,
            trade: "机电",
            owner: "机电工程师",
            area: entity.label,
            entityName: entity.label,
            system: SYSTEM_LABELS[systemId] || systemId,
            systemKey: systemId,
            phaseKey: task.phaseKey || inferPhaseKey(task.name),
            spaceKey: space.spaceType,
            critical: task.isKeyTask,
            durationDays: task.durationDays,
            predecessor: task.predecessorId,
            groupKey: `${space.spaceType}:${entity.key}:${systemId}`,
            source: "schedule-engine.mep",
            agentHint: buildMepNodeHint(space.spaceType, systemId, constraints, task.name),
            code: task.code || "",
            predecessorRef: task.predecessorRef || ""
          }));
        });
      });
    });
  });

  return nodes;
}

function inferPhaseKey(taskName) {
  const name = String(taskName || "");
  if (name.includes("预留") || name.includes("预埋")) return "embed";
  if (name.includes("基础")) return "foundation";
  if (name.includes("立管")) return "riser";
  if (name.includes("隐蔽验收") || name.includes("验收")) return "acceptance";
  if (name.includes("调试") || name.includes("联调")) return "commission";
  if (name.includes("接入") || name.includes("移交")) return "handover";
  if (name.includes("安装")) return "install";
  return "main";
}

function buildMepNodeHint(spaceKey, systemId, constraints, taskName) {
  const hints = [];
  if (spaceKey === "basement" && (!constraints.includes("coordination") || !constraints.includes("hanger"))) {
    hints.push("地下室建议先完成管综深化和支吊架条件。");
  }
  if (spaceKey === "ceiling" && !constraints.includes("concealedAcceptance")) {
    hints.push("吊顶区建议先完成机电隐蔽验收，再移交封板。");
  }
  if ((taskName.includes("调试") || taskName.includes("联调")) && !constraints.includes("formalPower")) {
    hints.push("系统调试建议挂接正式水电接入前置。");
  }
  if (systemId === "elevator" && !constraints.includes("formalPower")) {
    hints.push("电梯验收建议补充正式电接入条件。");
  }
  return hints.join(" ");
}

function getMepControlPackageForNode(node) {
  const name = String(node.name || "");
  if (name.includes("调试") || name.includes("联调") || name.includes("验收") || name.includes("接入")) {
    return MEP_CONTROL_PACKAGE_DEFS.commission_acceptance;
  }
  if (node.spaceKey === "basement") return MEP_CONTROL_PACKAGE_DEFS.basement_main;
  if (node.spaceKey === "tower") {
    if (name.includes("预留") || name.includes("预埋")) return MEP_CONTROL_PACKAGE_DEFS.tower_embed;
    if (name.includes("箱盒") || name.includes("配管") || name.includes("支管") || name.includes("穿线") || name.includes("末端") || name.includes("点位")) {
      return MEP_CONTROL_PACKAGE_DEFS.secondary_fixing;
    }
    return MEP_CONTROL_PACKAGE_DEFS.tower_roughin;
  }
  if (node.spaceKey === "public" || node.spaceKey === "ceiling") return MEP_CONTROL_PACKAGE_DEFS.ceiling_concealed;
  if (node.spaceKey === "equipment" || node.spaceKey === "roof") return MEP_CONTROL_PACKAGE_DEFS.equipment_finish;
  if (node.spaceKey === "outdoor") return MEP_CONTROL_PACKAGE_DEFS.commission_acceptance;
  return null;
}

function getMepControlPackageGroupKey(node, pkg) {
  if (node.spaceKey === "tower" || node.spaceKey === "basement") {
    return `${pkg.id}:${node.entityName || node.area || node.spaceKey}`;
  }
  return `${pkg.id}:${node.spaceKey || "mep"}`;
}

function getMepControlPackageName(group) {
  const pkg = group.package;
  const entity = String(group.entityName || "").trim();
  if (group.spaceKey === "tower" || group.spaceKey === "basement") {
    return entity ? `${entity} · ${pkg.label}` : pkg.label;
  }
  return pkg.label;
}

function buildMepControlPackageNodes(nodes) {
  const groups = new Map();
  nodes
    .filter((node) => node.templateId === "TP-MEP-01")
    .forEach((node) => {
      const pkg = getMepControlPackageForNode(node);
      if (!pkg) return;
      const key = getMepControlPackageGroupKey(node, pkg);
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          package: pkg,
          spaceKey: node.spaceKey,
          entityName: node.entityName || "",
          systemKeys: new Set(),
          sourceNodes: []
        });
      }
      const group = groups.get(key);
      if (node.systemKey) group.systemKeys.add(node.systemKey);
      group.sourceNodes.push(node);
    });

  return Array.from(groups.values())
    .map((group) => {
      const firstDate = group.sourceNodes
        .map((node) => node.plannedDate)
        .filter(Boolean)
        .sort()[0] || "";
      const lastDate = group.sourceNodes
        .map((node) => node.plannedDate)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || firstDate;
      const critical = group.sourceNodes.some((node) => node.critical);
      const systems = Array.from(group.systemKeys).map((key) => SYSTEM_LABELS[key] || key);
      return {
        id: `mep-package-${group.id}`,
        name: getMepControlPackageName(group),
        owner: "机电工程师",
        percent: 0,
        plannedDate: lastDate,
        varianceDays: 0,
        critical,
        source: "schedule-engine.mep-control-package",
        templateId: "TP-MEP-01",
        trade: "机电",
        area: group.entityName || SPACE_LABELS[group.spaceKey] || "机电",
        entityName: group.entityName || "",
        spaceKey: group.spaceKey,
        system: systems.join(" / "),
        systemKey: "",
        predecessor: group.package.upstream,
        startRule: firstDate,
        agentHint: `${group.package.upstream}；完成后移交 ${group.package.downstream}。`,
        durationDays: group.sourceNodes.reduce((sum, node) => sum + (node.durationDays || 0), 0),
        groupKey: group.id,
        packageId: group.package.id,
        packageLabel: group.package.label,
        packageUpstream: group.package.upstream,
        packageDownstream: group.package.downstream,
        detailCount: group.sourceNodes.length
      };
    })
    .sort((left, right) => {
      const sortDiff = (MEP_CONTROL_PACKAGE_DEFS[left.packageId]?.sort || 999) - (MEP_CONTROL_PACKAGE_DEFS[right.packageId]?.sort || 999);
      if (sortDiff !== 0) return sortDiff;
      return String(left.plannedDate || "").localeCompare(String(right.plannedDate || ""));
    });
}

export function expandTemplateNodes(wizardDataInput, libraries, project) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const selected = wizardData.selectedTemplates || [];
  const nodes = [];
  selected.forEach((templateId) => {
    if (templateId === "TP-MEP-01") {
      nodes.push(...expandMepNodes(wizardData, libraries, project));
      return;
    }
    nodes.push(...expandGenericTemplateNodes(templateId, wizardData, libraries, project));
  });
  return nodes;
}

function createSequentialRelations(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    if (!groups.has(node.groupKey)) groups.set(node.groupKey, []);
    groups.get(node.groupKey).push(node);
  });
  const relations = [];
  groups.forEach((groupNodes) => {
    groupNodes.forEach((node, index) => {
      if (index === 0) return;
      relations.push({
        from: groupNodes[index - 1].id,
        to: node.id,
        relationship: "FS",
        lagDays: 0,
        scope: "intra-template",
        note: `${groupNodes[index - 1].name} → ${node.name}`
      });
    });
  });
  return relations;
}

function buildRuleRelations(nodes, libraries, wizardDataInput) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const relations = [];
  const ruleEdits = wizardData.relationRuleEdits || {};
  libraries.relations.rules.forEach((rule) => {
    if (!conditionsMet(rule, wizardData, nodes)) return;
    const fromNode = pickNodeByTaskKey(rule.from_task_key, nodes, "last");
    const toNode = pickNodeByTaskKey(rule.to_task_key, nodes, "first");
    if (!fromNode || !toNode || fromNode.id === toNode.id) return;
    const relationEdit = ruleEdits[rule.id] || {};
    relations.push({
      id: rule.id,
      from: fromNode.id,
      to: toNode.id,
      fromName: fromNode.name,
      toName: toNode.name,
      relationship: relationEdit.relationship || rule.relationship,
      lagDays: Number(relationEdit.lagDays ?? rule.lag_days ?? 0) || 0,
      scope: rule.scope,
      note: `${fromNode.name} → ${toNode.name}`
    });
  });
  return relations;
}

function conditionsMet(rule, wizardData, nodes) {
  const tags = rule.condition_tags || [];
  const spaceKeys = new Set(nodes.filter((node) => node.spaceKey).map((node) => node.spaceKey));
  const systemKeys = new Set(nodes.filter((node) => node.systemKey).map((node) => node.systemKey));
  const constraints = new Set(Object.values(wizardData.mepEditorConstraints || {}).flat());
  return tags.every((tag) => {
    if (tag === "mep") return nodes.some((node) => node.templateId === "TP-MEP-01");
    if (tag === "tower") return spaceKeys.has("tower");
    if (tag === "basement") return spaceKeys.has("basement");
    if (tag === "ceiling") return spaceKeys.has("ceiling");
    if (tag === "fire") return systemKeys.has("fire");
    if (tag === "elevator") return systemKeys.has("elevator");
    if (tag === "electrical_or_plumbing") return systemKeys.has("electrical") || systemKeys.has("plumbing");
    return constraints.has(tag);
  });
}

function pickNodeByTaskKey(taskKey, nodes, mode = "first") {
  const candidates = nodes.filter((node) => {
    if (taskKey.startsWith("TP-")) return node.templateId === taskKey;
    const [spaceKey, phaseKey] = taskKey.split(".");
    return node.spaceKey === spaceKey && (!phaseKey || node.phaseKey === phaseKey);
  });
  if (!candidates.length) return null;
  return mode === "last" ? candidates[candidates.length - 1] : candidates[0];
}

export function applyRelationRules(nodes, libraries, wizardDataInput) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const relations = createSequentialRelations(nodes);
  const enabledRuleRelations = Array.isArray(wizardData.enabledRuleRelations) && wizardData.enabledRuleRelations.length
    ? new Set(wizardData.enabledRuleRelations)
    : null;
  buildRuleRelations(nodes, libraries, wizardData).forEach((relation) => {
    if (enabledRuleRelations && !enabledRuleRelations.has(relation.id)) return;
    relations.push(relation);
  });
  return relations;
}

export function applyFlowRules(nodes, libraries, wizardDataInput) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const buildings = wizardData.selectedBuildings || [];
  const highRiseFactor = Number(wizardData.floorCount || 0) >= 18 ? 1 : 0;
  const baseOffsets = libraries.flowRules.templateBaseOffsets || {};
  const towerLag = Number(wizardData.lagFloors || 5) * 2;
  const basementRule = libraries.flowRules.rules.find((rule) => rule.id === "basement-mep-after-structure");

  nodes.forEach((node, index) => {
    let offset = baseOffsets[node.templateId] || index * 3;
    if (node.templateId === "TP-STR-001" && node.entityName) {
      offset += buildings.indexOf(node.entityName) * 6;
    }
    if (node.spaceKey === "tower") {
      offset = (baseOffsets["TP-MEP-01"] || 90) + towerLag + (buildings.indexOf(node.entityName) >= 0 ? buildings.indexOf(node.entityName) * 4 : 0);
    }
    if (node.spaceKey === "basement" && basementRule) {
      offset = (baseOffsets["TP-BASE-001"] || 15) + 18;
    }
    if (node.spaceKey === "ceiling") offset = (baseOffsets["TP-FIN-01"] || 150) + 6;
    if (node.spaceKey === "equipment") offset = (baseOffsets["TP-MEP-01"] || 90) + 55 + highRiseFactor * 4;
    if (node.spaceKey === "outdoor") offset = (baseOffsets["TP-EXT-01"] || 185) + 3;
    node.offsetDays = offset;
  });
  return nodes;
}

export function applyDurationParams(nodes, libraries, wizardDataInput) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const params = libraries.durationParams;
  const hasWeather = Boolean(wizardData.includeWeather);
  const hasWinter = Boolean(wizardData.includeWinter);
  const hasConcurrentLoose = wizardData.concurrentWork === "loose";
  const enabledElevators = (wizardData.constructionElevators || []).filter((item) => item.enabled !== false);
  const highRise = Number(wizardData.floorCount || 0) >= 18;

  nodes.forEach((node) => {
    let factor = 1;
    if (hasWeather) factor *= params.conditionFactors.weather;
    if (hasWinter) factor *= params.conditionFactors.winter;
    if (highRise && node.spaceKey === "tower") factor *= params.conditionFactors.highRise;
    if (hasConcurrentLoose) factor *= params.conditionFactors.concurrentLoose;
    if (node.spaceKey === "tower" && !enabledElevators.length) factor *= params.conditionFactors.elevatorMissing;
    node.durationDays = Math.max(1, Math.ceil((node.durationDays || 3) * factor));
    node.plannedDate = addDays(wizardData.startDate, (node.offsetDays || 0) + node.durationDays);
  });
  return nodes;
}

function buildMilestones(nodes) {
  return nodes
    .filter((node) => node.critical)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))
    .slice(0, 8)
    .map((node, index) => ({
      id: `milestone-${index + 1}`,
      name: node.name,
      plannedDate: node.plannedDate,
      varianceDays: 0,
      status: "normal"
    }));
}

function buildSpacePreview(nodes) {
  const groups = new Map();
  nodes
    .filter((node) => node.templateId === "TP-MEP-01")
    .forEach((node) => {
      const label = SPACE_LABELS[node.spaceKey] || node.spaceKey;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({
        id: node.id,
        name: node.name,
        system: node.system,
        plannedDate: node.plannedDate,
        critical: node.critical
      });
    });
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function buildControlPackagePreview(controlNodes) {
  const groups = new Map();
  controlNodes
    .filter((node) => node.templateId === "TP-MEP-01")
    .forEach((node) => {
      const label = node.spaceKey === "tower" || node.spaceKey === "basement"
        ? (node.entityName || node.area || SPACE_LABELS[node.spaceKey] || node.spaceKey)
        : (SPACE_LABELS[node.spaceKey] || node.area || node.spaceKey);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({
        id: node.id,
        name: node.name,
        system: node.system,
        plannedDate: node.plannedDate,
        critical: node.critical,
        packageId: node.packageId,
        detailCount: node.detailCount || 0
      });
    });
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function buildVerticalTransportReviews(project, wizardData) {
  const reviews = [];
  const selectedBuildings = getSelectedBuildings(project, wizardData);
  const enabledTowers = wizardData.towerCranes.filter((item) => item.enabled !== false);
  const enabledElevators = wizardData.constructionElevators.filter((item) => item.enabled !== false);

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

  const uncoveredHighRise = selectedBuildings
    .filter((building) => Number(building.floors || 0) >= 18)
    .filter((building) => !enabledElevators.some((elevator) => (elevator.coveredBuildings || []).includes(building.name)))
    .map((building) => building.name);

  if (uncoveredHighRise.length) {
    reviews.push(`高层楼栋 ${uncoveredHighRise.join("、")} 未配置施工电梯覆盖，机电材料运输和末端安装存在计划风险。`);
  }
  return reviews;
}

function buildAgentAudit(project, wizardData, nodes) {
  const checks = [];
  const allConstraints = new Set(Object.values(wizardData.mepEditorConstraints || {}).flat());
  const systemKeys = new Set(nodes.filter((node) => node.systemKey).map((node) => node.systemKey));
  const spaceKeys = new Set(nodes.filter((node) => node.spaceKey).map((node) => node.spaceKey));
  const selectedBuildings = getSelectedBuildings(project, wizardData);
  const enabledTowers = wizardData.towerCranes.filter((item) => item.enabled !== false);
  const enabledElevators = wizardData.constructionElevators.filter((item) => item.enabled !== false);

  enabledTowers.forEach((tower) => {
    const passed = Boolean((tower.coveredBuildings || []).length || (tower.coveredBasementZones || []).length);
    checks.push({
      id: `tower-coverage-${tower.id || tower.code || "default"}`,
      title: `${tower.code || "塔吊"} 覆盖范围检查`,
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? `${tower.code || "塔吊"} 已配置覆盖范围。`
        : `${tower.code || "塔吊"} 覆盖范围为空，请调整覆盖楼栋/地下室分区或停用该设备。`
    });
  });

  enabledElevators.forEach((elevator) => {
    const passed = Boolean((elevator.coveredBuildings || []).length);
    checks.push({
      id: `elevator-coverage-${elevator.id || elevator.code || "default"}`,
      title: `${elevator.code || "施工电梯"} 覆盖范围检查`,
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? `${elevator.code || "施工电梯"} 已配置覆盖楼栋。`
        : `${elevator.code || "施工电梯"} 覆盖楼栋为空，请调整覆盖楼栋或停用该设备。`
    });
  });

  const uncoveredHighRise = selectedBuildings
    .filter((building) => Number(building.floors || 0) >= 18)
    .filter((building) => !enabledElevators.some((elevator) => (elevator.coveredBuildings || []).includes(building.name)))
    .map((building) => building.name);
  checks.push({
    id: "highrise-elevator-coverage",
    title: "高层施工电梯覆盖",
    severity: uncoveredHighRise.length ? "blocking" : "normal",
    passed: uncoveredHighRise.length === 0,
    message: uncoveredHighRise.length
      ? `高层楼栋 ${uncoveredHighRise.join("、")} 未配置施工电梯覆盖，机电材料运输和末端安装存在计划风险。`
      : "高层楼栋已配置施工电梯覆盖。"
  });

  checks.push({
    id: "mep-scope-included",
    title: "机电专业纳入检查",
    severity: nodes.some((node) => node.templateId === "TP-MEP-01") ? "normal" : "warning",
    passed: nodes.some((node) => node.templateId === "TP-MEP-01"),
    message: nodes.some((node) => node.templateId === "TP-MEP-01")
      ? "总控计划已纳入机电专业分支。"
      : "当前未纳入机电安装工程，若为住宅总控计划，建议确认是否需要同步编制机电专业分支。"
  });

  if (systemKeys.has("fire")) {
    const passed = allConstraints.has("fireLinkage");
    checks.push({
      id: "fire-linkage",
      title: "消防联动调试前置",
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? "已配置消防联动调试约束。"
        : "已选择消防系统，但缺少消防联动调试约束，消防验收链条不完整。"
    });
  }

  if (systemKeys.has("elevator")) {
    const passed = nodes.some((node) => node.name.includes("电梯调试验收") || node.name.includes("电梯验收"));
    checks.push({
      id: "elevator-acceptance",
      title: "电梯调试验收链条",
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? "已生成电梯调试验收节点。"
        : "已选择电梯系统，但未生成电梯调试验收节点，请补充机房或电梯安装工序。"
    });
  }

  if (spaceKeys.has("ceiling")) {
    const passed = allConstraints.has("concealedAcceptance");
    checks.push({
      id: "ceiling-concealed-acceptance",
      title: "吊顶区隐蔽验收前置",
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? "吊顶区域已具备机电隐蔽验收前置。"
        : "已纳入吊顶区域，但缺少机电隐蔽验收约束，吊顶封板前置不足。"
    });
  }

  if (spaceKeys.has("basement")) {
    const passed = allConstraints.has("coordination") && allConstraints.has("hanger");
    checks.push({
      id: "basement-coordination",
      title: "地下室管综与支吊架条件",
      severity: passed ? "normal" : "warning",
      passed,
      message: passed
        ? "地下室已补充管综深化和支吊架条件。"
        : "地下室机电已纳入，但缺少管综深化或支吊架完成约束，主管线安装可执行性不足。"
    });
  }

  if (nodes.some((node) => node.name.includes("系统调试") || node.name.includes("联动调试"))) {
    const passed = allConstraints.has("formalPower");
    checks.push({
      id: "formal-power",
      title: "系统联调正式水电前置",
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? "系统联调已补充正式水电接入前置。"
        : "系统联调缺少正式水电接入前置，建议补充后再生成执行版计划。"
    });
  }

  if (nodes.some((node) => node.name.includes("设备安装"))) {
    const passed = allConstraints.has("equipmentFoundation") && allConstraints.has("equipmentArrival");
    checks.push({
      id: "equipment-installation",
      title: "设备安装前置条件",
      severity: passed ? "normal" : "blocking",
      passed,
      message: passed
        ? "设备安装已补充基础移交和设备到货条件。"
        : "设备安装缺少设备基础移交或设备到货条件，机房与屋面计划存在断链风险。"
    });
  }

  const blockers = checks.filter((check) => !check.passed && check.severity === "blocking");
  const warnings = checks.filter((check) => !check.passed && check.severity === "warning");
  const status = blockers.length ? "blocked" : warnings.length ? "warning" : "passed";
  return {
    status,
    blockers,
    warnings,
    passedChecks: checks.filter((check) => check.passed),
    checks
  };
}

function buildAgentReviews(project, wizardData, nodes) {
  return buildAgentAudit(project, wizardData, nodes)
    .checks
    .filter((check) => !check.passed)
    .map((check) => check.message)
    .slice(0, 8);
}

export function buildPlanResult(nodes, relations, milestones, reviews, libraries, audit = null, detailNodes = nodes) {
  const relationOptions = relations
    .filter((relation) => relation.id && relation.scope !== "intra-template")
    .map((relation) => ({
      id: relation.id,
      from: relation.fromName || relation.from,
      to: relation.toName || relation.to,
      relationship: relation.relationship,
      lagDays: relation.lagDays || 0,
      scope: relation.scope,
      note: relation.note
    }));
  return {
    projectType: libraries.projectType,
    libraryVersions: {
      wbs: libraries.wbs.version,
      relations: libraries.relations.version,
      flowRules: libraries.flowRules.version,
      durationParams: libraries.durationParams.version
    },
    nodes: nodes
      .slice()
      .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))
      .map((node, index, array) => ({
        ...node,
        percent: index === array.length - 1 ? 100 : Math.round(((index + 1) / Math.max(array.length, 1)) * 100)
      })),
    detailNodes: detailNodes
      .slice()
      .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))
      .map((node) => ({ ...node })),
    relations,
    milestones,
    reviews,
    audit: audit || { status: "passed", blockers: [], warnings: [], passedChecks: [], checks: [] },
    preview: {
      mepBySpace: buildControlPackagePreview(nodes),
      mepDetailBySpace: buildSpacePreview(detailNodes),
      relationOptions
    }
  };
}

function resolvePredecessorRefs(nodes, libraries, project) {
  const allTemplates = Object.values(libraries.wbs.templates || {});
  const milestones = [];
  nodes.forEach(function(n) {
    if (n.predecessorRef && !n._refResolved) {
      var ref = n.predecessorRef;
      if (typeof ref === 'string') try { ref = JSON.parse(ref); } catch(e) { ref = null; }
      if (!ref || !ref.type) return;
      var targetNode = null;
      if (ref.type === 'template' && ref.id) {
        // Find last node of target template
        var templateNodes = nodes.filter(function(tn) { return tn.templateId === ref.id || (tn.sourceTemplateId === ref.id) || (tn.id && tn.id.startsWith(ref.id)); });
        if (templateNodes.length) {
          targetNode = templateNodes.reduce(function(a, b) { return a.id > b.id ? a : b; });
        }
      } else if (ref.type === 'phase:prev') {
        // Already has predecessor from previous phase's last task, skip
        return;
      }
      if (targetNode) {
        var rel = ref.relationship || 'FS';
        var lag = Number(ref.lag) || 0;
        if (!n.predecessors) n.predecessors = [];
        // Check not duplicate
        var exists = n.predecessors.some(function(p) { return p.task_id === targetNode.id || p.task_id === targetNode.name; });
        if (!exists) {
          n.predecessors.push({
            task_id: targetNode.id || targetNode.task_id || targetNode.name,
            relationship: rel,
            lag_days: lag,
            autoGenerated: true
          });
        }
      } else {
        // Could not resolve, mark for agent
        if (!n._unresolvedRefs) n._unresolvedRefs = [];
        n._unresolvedRefs.push(ref);
      }
      n._refResolved = true;
    }
    // Collect milestones
    if (n.critical && n.name) milestones.push({ name: n.name, node: n });
  });
  return { milestons: milestones };
}

function runPlanBuild(project, wizardDataInput) {
  const wizardData = normalizeWizardData(wizardDataInput);
  const libraries = loadLibraries(resolveProjectType(project, wizardData));
  const detailNodes = expandTemplateNodes(wizardData, libraries, project);
  resolvePredecessorRefs(detailNodes, libraries, project);
  const relations = applyRelationRules(detailNodes, libraries, wizardData);
  applyFlowRules(detailNodes, libraries, wizardData);
  applyDurationParams(detailNodes, libraries, wizardData);
  const mepControlNodes = buildMepControlPackageNodes(detailNodes);
  const displayNodes = detailNodes
    .filter((node) => node.templateId !== "TP-MEP-01")
    .concat(mepControlNodes);
  const milestones = buildMilestones(displayNodes);
  const audit = buildAgentAudit(project, wizardData, detailNodes);
  const reviews = buildAgentReviews(project, wizardData, detailNodes);
  return buildPlanResult(displayNodes, relations, milestones, reviews, libraries, audit, detailNodes);
}

export function loadLibraries(projectType = "residential") {
  return loadScheduleLibraries(projectType);
}

export function getScheduleLibrariesSummary(projectType = "residential") {
  return summarizeScheduleLibraries(projectType);
}

export function previewScheduleWizard(project, wizardData) {
  return runPlanBuild(project, wizardData);
}

export function generateScheduleWizard(project, wizardData) {
  return runPlanBuild(project, wizardData);
}
