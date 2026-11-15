# JUAI 1.0 开发进度

## 当前状态

- 日期：2026-11-16；分支：共享核心及私有平台均为 `refactor/juai-1.0`；阶段1–5已完成，私有平台固定核心21c5d2cfa。
- 当前授权：连续完成阶段6、7。正在阶段6统一剩余页面；阶段7验收、备份后部署服务器，禁止跳过兼容迁移与隔离验证。
- 统一需求：`requirements/PRODUCT_REQUIREMENTS.md` + `requirements/UI_REQUIREMENTS.md`；问题 0–14 逐项依赖见 REFACTOR_PLAN。
- 阶段 1：已完成；独立提交 `5b5ef0f3f`（docs(project): audit and plan the unified JUAI 1.0 refactor）。
- 阶段 2：代表性原型、规范、浏览器验收和检查完成；对应提交标题 `feat(project): establish the JUAI 1.0 design system and representative previews`。全量业务尚未完工。

## 阶段 1 证据

- 核心基线 `04a0fe5ab`；私有平台 HEAD `ad0cc3b`，线上发布 0.7.2。没有将原型改成产品 1.0 发布版本。
- 备份：工作区外层 `git-backups/juai-1.0-phase1-20261115/`，权限 0700；包含代码 tar、Git 全 refs bundle、原有 diff、Git status、一致性工作区副本及 SHA-256 manifest。数据库 quick_check=ok，51 张表，manifest 记录 20 个文件（后补私有平台 Git bundle；两个 bundle 均验证可恢复）。恢复方式见 ARCHITECTURE_AUDIT。
- 本地业务接口只读清点：4 大学、2 研究科、2 专攻、2 研究室、2 教师。没有插入示例用户资料。
- 已有大学目录 819 条、195 个本地校徽/标志，其他 624 条使用默认图标；完整许可留在 credits.json。没有联网抓取、修改来源或重复建表。
- 开始时已有未提交改动：entity-editor.vue、university-logo.vue、university-catalog.ts、目录静态资源，以及此前个人档案原型 settings.vue / personal-profile.vue / profile-types.ts。全部已进入外部代码快照；继承变更单独记录，不冒充本轮阶段 3 完成。
- 原有未跟踪 `local-server/vue-vben-admin/`（8KB）保持原样；原始产品文档保持原样。
- 旧说明已审阅：design/REDESIGN.md、docs/japangrad/PROGRESS.md、local-server/USER_GUIDE 与私有平台 README/鉴权入口。冲突项由本次需求覆盖，历史文件不删除。

## 审查发现

1. 专攻连续渲染 CollectedAdmissions、MajorAdmissionTable、MajorAdmissions、ExamHistory、AnalysisHistory，时间/材料/语言要求重复且纵向拉长。
2. 研究室重复渲染本身和所属专攻的 CollectedAdmissions，招生页签再重复 MajorAdmissions/ExamHistory；普通研究资料与申请操作混杂。
3. 目录已有搜索和校徽展示，但大学存储无稳定目录引用，前端目前按名称查找；中日英搜索/唯一标识/服务端 AI 匹配不能宣称完成。
4. 旧考试记录无可靠的入学年度、考试类别、适用范围；内诺三态、人数、动态语言日期、目标材料关联需要阶段 3，不可从原型推断补全。
5. 配色集中在 palette.ts，布局却叠加 style/visual/shell/paper/directory/affiliation/density；重复局部样式使字号和间距不一致。新设计系统单一令牌层，按原型范围应用，逐页替换。
6. 私有平台注册已要求邮箱，历史用户仍可能缺邮箱；登录 ui.js 将无邮箱账号送往 account?bind=1。换绑目前为新邮箱验证码+密码，尚不满足双邮箱验证。已有配额校验，但普通文件配额面板/引用删除需补齐。
7. 本次原型不执行现有研究室 toggleAutoSync 中的重复 toggleWantApply 保存逻辑；此问题登记后续修复，避免 UI 原型越界更改业务。

## 阶段 2 交付检查表

- [x] DESIGN_SYSTEM、UI_GUIDELINES 与集中 tokens。
- [x] 复用标题、分区、日期、文件列表和空状态组件。
- [x] 个人档案规范化；专攻和研究室显式 design=1 原型，真实数据与旧页返回。
- [x] 不同批次选择、缺失/混合范围提示，不伪造内诺与成员比例。
- [x] 桌面 / 手机 / 深色截图；长文本表单与交互验收（详见 PHASE2_ACCEPTANCE）。
- [x] 类型检查、Lint、构建、原有 hooks。
- [x] 阶段独立 commit 门槛；本地预览持续运行；截图交付。

## 未完成业务边界

问题 0–14 均未作为完整业务验收。现有功能/原型可用不代表需求升级完成。迁移/API 新增为零，生产部署为零；阶段 3–7 详见计划，后续以持久化、迁移、权限和端到端验收结果更新状态。


## 阶段 2 文件与效果

- `design-system/`：集中 tokens、5 个基础组件、日期/记录选择 presenter、专攻和研究室原型、预览入口。
- `personal-profile.vue` / `settings.vue`：继承之前阅读页并接入共享分区，保留版本化 API 保存；未提前实现动态语言 CRUD。
- `ResearchLabCollection/Card` 的可选原型参数，`ResearchLabTeachers` 的可选紧凑列表；默认保留原行为。
- 新文档 DESIGN_SYSTEM、UI_GUIDELINES、PHASE2_ACCEPTANCE；原始需求已快照保存，未覆盖旧设计记录。
- 验收：11 个现有前端测试、10 个 presenter 断言，Node 24 类型检查与生产构建、Lint；隔离副本持久化/失败草稿；真实工作区 51 张表未变。
- 原型入口：`http://127.0.0.1:5188/japan-grad/design`；详细操作、截图与限制见 [阶段 2 验收](PHASE2_ACCEPTANCE.md)。

## 下一次恢复上下文

先读 AGENTS、两份 requirements、DESIGN_SYSTEM、UI_GUIDELINES，再读本文件和 REFACTOR_PLAN。用户已经授权并完成阶段3基础能力。后续恢复时先核对 PHASE3_FOUNDATION，再进入下一阶段。既有依赖规划：现有目录稳定标识、招生批次与范围、内诺三态、成员人数和动态语言、统一文件引用/配额、账号双邮箱验证等兼容迁移和 API。不要把原型中的未确认值当成已完成业务字段；不要部署这次开发分支到生产。

## 阶段 3（基础能力完成）

- 新备份 `../git-backups/juai-1.0-phase3-20261115/`：SQLite quick_check=ok，完整工作区副本及两仓库 bundle。
- 先在临时副本验证迁移；不删除旧字段/记录。目录沿用已有 819 条；新增结构化数据与旧资料区分，不自动推定批次和人数。


### 阶段 3 结果与恢复点

- 新增兼容迁移17/18；招生批次/内诺三态、成员构成、动态语言、目录稳定关联、统一普通文件与配额、账号双邮箱安全已接入真实 API。
- 详细新增 API、备份/恢复、验证与剩余范围见 [PHASE3_FOUNDATION.md](PHASE3_FOUNDATION.md)。
- 本地真实工作区已升级；50 张旧业务/历史表逐行保持一致（另 schema_migrations 新增17/18）。测试写入仅在临时副本。
- 核心72测试、私有平台11测试、前端11测试通过；专门补充 HTTP 改密/配额与邮箱换绑原子验证。
- 本阶段提交标题：核心 `feat(project): add compatible product foundation APIs and editors`；平台 `feat: enforce verified email changes and pin product foundation core`。
- 第4–7阶段尚未开始；没有线上部署。下一步是将已具备基础 API 的大学/研究科/专攻/研究室/教师页面按设计系统正式重构，而非继续堆叠旧展示。

## 阶段4（已完成）

- 基线核心6983a8a92、平台8065105；数据与两仓库bundle已备份到 `../git-backups/juai-1.0-phase4-20261115/`，quick_check=ok。
- 本次将实体原型设为正式默认页面，保留旧深链接和业务操作，关联招生批次与文件。不会部署生产或改写旧迁移。


## 阶段4完成与恢复点

大学清单及五类实体详情现为正式默认页面；专攻批次/文件范围、研究室阅读资料与成员、教师分区已接通。详细变更、数据保护、截图和边界见 [PHASE4_ENTITY_PAGES.md](PHASE4_ENTITY_PAGES.md)。

核心76项、前端14项、平台11项回归通过。无新DDL，原有资料不迁移或删除。核心提交标题 `feat(project): ship the JUAI 1.0 entity reading pages`；私有平台固定对应核心提交。本地预览仍使用5188/5667，线上未部署。

下一次继续时进入第五阶段：独立申请工作台、材料与ZIP、教授联络/邮件AI及对应页面；先读需求与计划，使用本阶段备份和固定提交作为基线。

## 阶段5（开发与验收记录）

- 用户已授权第五阶段；基线核心0edff233a、平台2d98a75。新备份位于 ../git-backups/juai-1.0-phase5-20261115/，包含完整工作区和两个代码bundle。
- 新申请工作台路由 applications/labs/:labId，修考之路和联络看板已接入；材料、邮件、联络经历与目标明确关联。
- 迁移19新增 application_targets / application_materials / application_files / application_mail / application_contacts；旧想考研究室及材料清单快照保留，不删除原数据。该迁移尚处开发验收，正式本地数据库还未升级。
- 目标选择独立于普通研究室；完成状态与上传状态独立；文件复用原存储；ZIP严格按目标筛选、可读中文分类、重名编号，限500文件/100MB。
- 目标固定教师联络经历，邮件仅可关联该经历；明确选择已有经历或新建，避免跨招生批次共用进度。复用原编辑、导入/导出邮件JSON及阶段管理，压缩重复总表。
- 邮件单封/进展/回复AI调用用户现有API，只返回可编辑草稿；上下文按目标及经历隔离，密钥变更/退出/停止会取消，绝不发送。注入模型测试不调用真实API。
- 总览待办与日程集中到 /calendar；网址解析内嵌API-only居中配置，底层Agent功能保留。
- 已通过独立材料/ZIP/租户隔离、AI作用域、独立联络经历三项集成场景；核心全套测试最近79项通过，最终更改后待复核。前端类型检查通过，浏览器隔离副本已验证材料保存刷新、上传不自动完成、独立勾选完成及390px无溢出。
- 最终迁移在真实备份副本重建：54张原业务/历史表逐行一致，quick_check=ok，foreign_key_check=0。临时副本 /private/tmp/juai-phase5-qa-CXAkzX、端口5678；旧验收副本保留但已停止。
- 待完成：最终浏览器检查、全量回归/提交hooks、正式本地备份升级19、截图、独立提交并固定私有平台子模块。生产部署仍在第七阶段，本阶段不调用付费AI或发送真实邮件。

### 第五阶段交付与恢复点

第五阶段业务与对应页面完成，详见 [PHASE5_APPLICATIONS.md](PHASE5_APPLICATIONS.md)。迁移19追加五张关联表，旧数据保留；独立目标材料、文件ZIP、固定联络经历、邮件双栏与三类API草稿、日历集中、API-only网址配置已接通。

核心80项、前端14项、平台11项测试及类型/构建通过；本地服务5667和前端5188已接入第五阶段，生产未部署。核心提交标题 `feat(project): add application workspaces and scoped mail assistance`；私有平台固定对应核心。

下一次继续进入第六阶段全局统一；先核对本文件最后交付状态、第五阶段文档与最新commit。禁止再次修改已提交迁移19，不抓取大学目录，不自动发送邮件，不调用付费模型做UI验收。

## 阶段6（进行中）

用户授权连续完成至第7阶段。阶段6基线核心21c5d2cfa、平台6c33278；一致性备份 ../git-backups/juai-1.0-phase6-20261116/，60表quick_check=ok，两个Git bundle保留。重点为文件管理、总览布局、设置/语言能力、导航及平台账号页。当前不修改数据库结构、不部署。

### 第六阶段交付与恢复点

全局页面统一完成，详见 [PHASE6_GLOBAL_UI.md](PHASE6_GLOBAL_UI.md)。核心80、前端42、平台11项回归、类型/构建及原有hooks通过。正式本地60张表逐行未变。私有平台设备/导出入口隐藏，底层保留。阶段6提交标题 `feat(project): unify workspace navigation and remaining task pages`；平台固定对应核心。

用户已授权连续完成第七阶段，不在此等待再次确认。下一步从生产完整备份的副本验证schema16→19迁移、文件完整性与用户隔离，再提交发布元数据、推送CI构建、备份及服务器部署。不得真实付费调用AI或向教授发送邮件。

## 阶段7（验收和发布进行中）

阶段6核心4c7b30ce8、平台85bd44b。生产快照2026-11-15T17-03-09-535Z已下载到私有忽略目录；56文件聚合SHA256本机/服务器一致：5cde3061ccbad6db21e46aab18c74fdf63de91ed12c4123d71fa89d4cec44944。恢复密钥分离存放，禁止提交。

13个真实工作区备份副本schema16→19成功；659张原表的原有列值不变（新增列单独存在），41个非数据库文件哈希不变；3个密钥解密成功，完整性与外键通过，重复启动幂等。真实生产尚未升级。

端到端脚本japangrad-product-smoke使用全新临时数据，实际验证语言日期/成绩及旧原文保存、编辑取消、无专攻个人文件上传、搜索空状态、申请材料上传与完成独立、刷新和ZIP；17路由×桌面/手机/深色全部无溢出、主标题唯一、无页面错误。修复分页选择器ARIA，实际文件页axe扫描0违规（两个短数字需人工复核）。旧0.xx UI脚本保留为test:japangrad-ui:legacy，不作为新页面验收入口；新版test:japangrad-ui覆盖正式1.0默认布局。

平台完整资料导出元数据改为实际数据库schema查询，新增真实tar解包断言，不含平台库/密钥；平台11项测试通过。正式产品使用Server1.0.0发布标识，共享核心包历史1.4.2保持不变。下一步固定CI产物、部署前新快照、原子切换、生产迁移和业务验收。未调用付费AI/SMTP或自动发邮件。

第七阶段补充：CI首轮在新E2E脚本发现macOS专用/private/tmp路径，已改为node:os.tmpdir；未部署失败产物。补齐已解析考试的显式招生批次采纳：从专攻原考试记录载入日期/科目/来源，入学年度保持未知，必须核对类别/范围，创建独立新批次，不覆盖旧记录或现有批次。其材料和文件仍需用户明确选择适用来源，防止跨招生范围拼接。
