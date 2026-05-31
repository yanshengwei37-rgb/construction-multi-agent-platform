# 后端架构说明

## 当前结构

- `api/server.js`: HTTP 入口、静态资源服务、API 路由和任务触发。
- `api/repositories/platform-repository.js`: 后端仓储边界，将内存数据实现包装为业务域 repository。
- `api/data/store.js`: 当前演示数据和内存状态变更函数。
- `api/services/model-gateway.js`: 模型供应商列表和当前模型通道。
- `worker-agent/index.js`: Agent 目录、同步问答、异步分析和资料分类规则。

## 推荐依赖方向

```text
HTTP routes -> repositories/services -> data adapters
HTTP routes -> agent worker -> model gateway
agent worker -> project context/repository data
```

路由层只负责协议、鉴权、参数读取和响应。业务数据读取与写入通过 repository 完成。Agent 可以读取项目上下文，但不能直接越过业务规则修改核心业务数据。

## Repository 分组

- `auth`: 用户、角色、项目访问范围、权限判断。
- `portfolio`: 公司层多项目聚合视图。
- `projects`: 项目详情、项目仪表盘、项目上下文。
- `schedule`: WBS 导入、节点、里程碑、偏差分析输入。
- `documents`: 资料列表、上传、版本、解析状态、引用来源。
- `safety`: 巡检、隐患、整改、复查、风险矩阵。
- `techCost`: 技术方案、规范、合同与成本快照。
- `notifications`: 站内消息、待办、提醒。
- `agents`: AgentRun、AgentInsight、异步任务状态。
- `model`: 当前模型通道与供应商配置。
- `audit`: 项目级审计日志，记录关键写操作、Agent 任务状态、资料解析和整改反馈。

## PostgreSQL 落地建议

第一批表优先落：

- `organizations`
- `projects`
- `project_members`
- `wbs_nodes`
- `milestones`
- `documents`
- `document_versions`
- `safety_inspections`
- `risk_items`
- `rectification_tasks`
- `agent_runs`
- `agent_insights`
- `notifications`

第二批表再落：

- `tech_schemes`
- `cost_snapshots`
- `contracts`
- `audit_logs`
- `document_chunks`
- `model_invocations`
- `audit_logs`

## 关键约束

- Agent 结论必须带引用，至少引用一个 WBS、资料、整改或巡检记录。
- 写操作必须能追踪 actor、projectId、recordId、时间和来源。
- 审计日志只追加不覆盖，后续接数据库时应独立成表，并按 project_id、module、created_at 建索引。
- 公司层接口不能绕过权限读取全部项目。
- 资料原件不进数据库，只保存对象存储 key、版本元数据和解析结果。
