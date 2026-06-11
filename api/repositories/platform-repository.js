import {
  addDocumentUpload,
  addCostSnapshot,
  addQualityInspection,
  addQualityIssueRecheck,
  addRectificationFeedback,
  addSafetyInspection,
  addScheduledTask,
  appendAgentInsight,
  appendAuditLog,
  appendNotification,
  buildDashboard,
  buildDocumentsView,
  buildPortfolioView,
  buildCostView,
  buildQualityView,
  buildSafetyView,
  buildScheduleView,
  buildTechCostView,
  completeAgentRun,
  createAgentRun,
  ensureProjectAccess,
  failAgentRun,
  buildWorkflowTestPlan,
  getAgentConfiguration,
  getAgentModelBinding,
  getProject,
  getProvidersSelection,
  getState,
  getUsers,
  getWorkflowConfig,
  importSchedule,
  listAccessibleProjects,
  listAuditLogs,
  listAgentInsights,
  listAgentRuns,
  listScheduledTasks,
  listNotifications,
  markDocumentIndexed,
  resolveUser,
  setProviderSelection,
  updateAgentModelBinding,
  updateWorkflowConfig,
  // 工序编码库
  getProcessLibraryTree,
  getProcessLibraryFlat,
  getProcessByCode,
  getParentCode,
  getCodeHierarchy,
  getProcessesBySystem,
  instantiateProcessLibraryToProject
} from "../data/store.js";
import { getPlatformBlueprint } from "../data/platform-blueprint.js";
import {
  generateScheduleWizard,
  getScheduleLibrariesSummary,
  previewScheduleWizard
} from "../services/schedule-engine.js";

export function createInMemoryPlatformRepository() {
  return {
    auth: {
      resolveUser,
      listUsers: getUsers,
      listAccessibleProjects,
      ensureProjectAccess
    },
    model: {
      getProviderSelection: getProvidersSelection,
      setProviderSelection,
      getAgentBinding: getAgentModelBinding
    },
    portfolio: {
      buildView: buildPortfolioView
    },
    platform: {
      getBlueprint: getPlatformBlueprint
    },
    projects: {
      get: getProject,
      buildDashboard,
      buildContext(projectId) {
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
    },
    schedule: {
      buildView: buildScheduleView,
      import: importSchedule,
      getLibrariesSummary: getScheduleLibrariesSummary,
      preview(projectId, wizardData) {
        return previewScheduleWizard(getProject(projectId), wizardData);
      },
      generate(projectId, wizardData) {
        return generateScheduleWizard(getProject(projectId), wizardData);
      }
    },
    documents: {
      buildView: buildDocumentsView,
      addUpload: addDocumentUpload,
      markIndexed: markDocumentIndexed
    },
    safety: {
      buildView: buildSafetyView,
      addInspection: addSafetyInspection,
      addRectificationFeedback
    },
    quality: {
      buildView: buildQualityView,
      addInspection: addQualityInspection,
      addIssueRecheck: addQualityIssueRecheck
    },
    cost: {
      buildView: buildCostView,
      addSnapshot: addCostSnapshot
    },
    techCost: {
      buildView: buildTechCostView
    },
    notifications: {
      list: listNotifications,
      append: appendNotification
    },
    audit: {
      list: listAuditLogs,
      append: appendAuditLog
    },
    processLibrary: {
      getTree: getProcessLibraryTree,
      getFlat: getProcessLibraryFlat,
      getByCode: getProcessByCode,
      getParentCode,
      getCodeHierarchy,
      getProcessesBySystem,
      instantiateToProject: instantiateProcessLibraryToProject
    },
    agents: {
      getConfig: getAgentConfiguration,
      updateModelBinding: updateAgentModelBinding,
      getWorkflow: getWorkflowConfig,
      updateWorkflow: updateWorkflowConfig,
      buildWorkflowTestPlan,
      listInsights: listAgentInsights,
      appendInsight: appendAgentInsight,
      listRuns: listAgentRuns,
      createRun: createAgentRun,
      completeRun: completeAgentRun,
      failRun: failAgentRun,
      listScheduledTasks,
      addScheduledTask
    }
  };
}
