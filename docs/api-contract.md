# V1 API 契约基线

前端必须始终按真实 API 契约消费数据，即使后端初期仍是内存实现。

## 最小接口组

- 组织与项目：项目列表、项目详情、成员、权限上下文。
- 进度：WBS 导入、节点列表、节点更新、偏差计算、里程碑预警。
- 质量：检查录入、问题台账、复验记录。
- 成本：成本快照、预算实际偏差、合同关注项。
- 安全：巡检、隐患、整改、复查、风险矩阵。
- 资料：上传、列表、筛选、版本、解析状态、引用来源。
- Agent 与消息：同步问答、异步 AgentRun、AgentInsight、Notification、AuditLog。
- 模型网关：chat、embedding、ocr、rerank。

## 当前契约入口

- `GET /api/platform/blueprint`
- `GET /api/session`
- `GET /api/portfolio`
- `GET /api/projects/:projectId/dashboard`
- `GET /api/projects/:projectId/schedule`
- `POST /api/projects/:projectId/schedule/import`
- `GET /api/projects/:projectId/documents`
- `POST /api/projects/:projectId/documents`
- `GET /api/projects/:projectId/safety`
- `POST /api/projects/:projectId/safety/inspections`
- `POST /api/projects/:projectId/safety/rectifications/:taskId/feedback`
- `GET /api/projects/:projectId/quality`
- `POST /api/projects/:projectId/quality/inspections`
- `POST /api/projects/:projectId/quality/issues/:issueId/recheck`
- `GET /api/projects/:projectId/cost`
- `POST /api/projects/:projectId/cost/snapshots`
- `POST /api/agent/chat`
- `POST /api/agent/runs`
- `GET /api/agent/runs`
- `GET /api/agent/config`

## 契约约束

- 公司层接口不能绕过权限读取全部项目。
- 所有关键写操作必须产生审计日志。
- Agent 结论必须带引用来源。
- AgentRun 必须保留状态、输入、输出、引用、模型通道。
- 资料原件不进数据库，后续只保存对象存储 key、版本元数据和解析结果。
