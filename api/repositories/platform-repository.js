import {
  addDocumentUpload,
  addRectificationFeedback,
  addSafetyInspection,
  appendAgentInsight,
  appendAuditLog,
  appendNotification,
  buildDashboard,
  buildDocumentsView,
  buildPortfolioView,
  buildSafetyView,
  buildScheduleView,
  buildTechCostView,
  completeAgentRun,
  createAgentRun,
  ensureProjectAccess,
  failAgentRun,
  getProject,
  getProvidersSelection,
  getState,
  getUsers,
  importSchedule,
  listAccessibleProjects,
  listAuditLogs,
  listAgentInsights,
  listAgentRuns,
  listNotifications,
  markDocumentIndexed,
  resolveUser,
  setProviderSelection
} from "../data/store.js";

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
      setProviderSelection
    },
    portfolio: {
      buildView: buildPortfolioView
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
          techCost: state.techCost[projectId]
        };
      }
    },
    schedule: {
      buildView: buildScheduleView,
      import: importSchedule
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
    agents: {
      listInsights: listAgentInsights,
      appendInsight: appendAgentInsight,
      listRuns: listAgentRuns,
      createRun: createAgentRun,
      completeRun: completeAgentRun,
      failRun: failAgentRun
    }
  };
}
