import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyTemplateDir = join(__dirname, "..", "工序库", "templates");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function normalizeProjectType(projectType) {
  const value = String(projectType || "").toLowerCase();
  if (value.includes("residential") || value.includes("住宅")) return "residential";
  return "residential";
}

function loadLegacyTemplates() {
  const files = readdirSync(legacyTemplateDir).filter((file) => file.endsWith(".json") && file !== "index.json");
  const templates = {};
  files.forEach((file) => {
    const data = readJson(join(legacyTemplateDir, file));
    const id = data.template_id || file.replace(".json", "");
    templates[id] = data;
  });
  return {
    index: readJson(join(legacyTemplateDir, "index.json")),
    templates
  };
}

export function loadScheduleLibraries(projectType = "residential") {
  const normalized = normalizeProjectType(projectType);
  return {
    projectType: normalized,
    wbs: readJson(join(__dirname, "wbs", `${normalized}.json`)),
    relations: readJson(join(__dirname, "relations", `${normalized}.json`)),
    flowRules: readJson(join(__dirname, "flow-rules", `${normalized}.json`)),
    durationParams: readJson(join(__dirname, "duration-params", `${normalized}.json`)),
    legacy: loadLegacyTemplates()
  };
}

export function summarizeScheduleLibraries(projectType = "residential") {
  const libraries = loadScheduleLibraries(projectType);
  return {
    projectType: libraries.projectType,
    versions: {
      wbs: libraries.wbs.version,
      relations: libraries.relations.version,
      flowRules: libraries.flowRules.version,
      durationParams: libraries.durationParams.version
    },
    templates: libraries.wbs.templateOrder.map((templateId) => {
      const template = libraries.wbs.templates[templateId];
      return {
        id: templateId,
        name: template.name,
        category: template.category,
        sourceTemplateId: template.sourceTemplateId,
        spaceFirst: Boolean(template.spaceFirst)
      };
    }),
    relationCount: libraries.relations.rules.length,
    flowRuleCount: libraries.flowRules.rules.length,
    parameterGroups: Object.keys(libraries.durationParams)
      .filter((key) => key !== "projectType" && key !== "label" && key !== "version")
  };
}
