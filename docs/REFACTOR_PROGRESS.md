# JUAI 1.0 开发进度

## 当前状态

- 日期：2026-11-15；分支：共享核心及私有平台均为 `refactor/juai-1.0`；私有平台无代码修改。
- 当前授权：用户要求继续，进入阶段 3。允许兼容数据库迁移及基础 API；阶段 4–7 未启动，不部署服务器。
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
