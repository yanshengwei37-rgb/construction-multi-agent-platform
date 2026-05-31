# 后端演进路线

## 目标

把当前本地演示后端演进为可私有化部署的工程项目多智能体管理后端。当前采用项目层优先路线：先稳定项目经理部的进度、质量、成本、安全、资料五条线，再把公司级多项目视图接成汇总层。

## Phase 1: 稳定后端边界

- 保留当前原生 Node 演示服务，新增 repository 适配层，路由层不再直接依赖内存数据实现。
- 把业务域固定为：组织与项目、进度、质量、成本、资料、安全、通知、Agent 编排。
- 为每个业务域定义 service/repository 边界，先用内存实现，接口保持数据库可替换。
- 关键写操作写入项目级 AuditLog，用于后续私有化部署的追责、合规和问题复盘。
- 继续使用内置数据跑演示，但新增 API 合约测试，避免前端和后端接口漂移。

## Phase 2: 持久化与任务队列

- 引入 PostgreSQL，迁移核心实体：Organization、Project、ProjectMember、WBSNode、Milestone、Document、DocumentVersion、SafetyInspection、RiskItem、RectificationTask、QualityInspection、QualityIssue、QualityRecheck、AcceptanceLot、CostSnapshot、TechScheme、AgentRun、AgentInsight、Notification。
- 引入对象存储目录或 MinIO，用于保存文档原件、图片、解析中间产物和 OCR 输出。
- 引入 Redis/BullMQ 或等价任务队列，替换当前 setTimeout 模拟流程。
- 资料流水线升级为：上传、归档、OCR/抽取、分类、索引、关联项目记录、通知。

## Phase 3: 真实模型与检索

- 模型网关落地 chat、embedding、ocr、rerank 四类能力，底层支持 DeepSeek、OpenAI、私有模型切换。
- 引入 pgvector 或向量库，资料问答必须返回引用来源，禁止无来源编造项目数据。
- Agent 编排拆成同步问答和异步分析两类任务，所有 AgentRun 保留输入、输出、引用、模型、耗时、状态。
- 增加审计日志，覆盖进度导入、资料版本更新、整改闭环、模型结论采纳等关键动作。

## Phase 4: 私有化部署准备

- 增加环境配置、健康检查、日志格式、备份恢复、权限策略和初始化脚本。
- 将公司层聚合查询与项目层事务查询分开优化，必要时增加只读聚合表。
- 接入企业账号体系、OA/BIM/ERP 连接器占位，但不让外部系统耦合核心业务模型。

## 当前已完成

- 本地演示平台已拆为 admin-web、field-h5、api、worker-agent。
- API 支持项目层仪表盘、进度导入、质量检查/复验、成本快照、资料上传、安全巡检、整改反馈、Agent 问答、异步 AgentRun、站内通知；公司层总览保留为后续汇总入口。
- repository 边界已建立，当前实现为内存仓储，后续可替换为 PostgreSQL 仓储。
- 项目级审计日志已建立，覆盖资料上传/索引、进度导入、质量检查/复验、成本快照、安全巡检/整改反馈和 AgentRun 状态流转。
