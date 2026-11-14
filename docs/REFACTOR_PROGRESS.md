# JUAI 1.0 开发进度

## 当前状态

- 日期：2026-11-15；分支：`refactor/juai-1.0`。
- 当前授权：仅阶段 1、2。阶段 3–7 未启动，不部署服务器，不修改数据库结构。
- 统一需求：`requirements/PRODUCT_REQUIREMENTS.md` + `requirements/UI_REQUIREMENTS.md`；问题 0–14 逐项依赖见 REFACTOR_PLAN。
- 阶段 1：已完成审查、分支、源代码/本地数据备份和兼容迁移设计；提交待记录。
- 阶段 2：进行中，尚未标为业务完工。

## 阶段 1 证据

- 核心基线 `04a0fe5ab`；私有平台 HEAD `ad0cc3b`，线上发布 0.7.2。没有将原型改成产品 1.0 发布版本。
- 备份：工作区外层 `git-backups/juai-1.0-phase1-20261115/`，权限 0700；包含代码 tar、Git 全 refs bundle、原有 diff、Git status、一致性工作区副本及 SHA-256 manifest。数据库 quick_check=ok，51 张表，manifest 记录 19 个文件。恢复方式见 ARCHITECTURE_AUDIT。
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

- [ ] DESIGN_SYSTEM、UI_GUIDELINES 与集中 tokens。
- [ ] 复用标题、分区、日期、文件列表和空状态组件。
- [ ] 个人档案规范化；专攻和研究室显式 design=1 原型，真实数据与旧页返回。
- [ ] 不同批次选择、缺失/混合范围提示，不伪造内诺与成员比例。
- [ ] 桌面 / 手机 / 深色 / 长文本浏览器截图和交互验收。
- [ ] 类型检查、Lint、构建、原有 hooks。
- [ ] 阶段独立 commit；本地预览持续运行；截图交付。

## 未完成业务边界

问题 0–14 均未作为完整业务验收。现有功能/原型可用不代表需求升级完成。迁移/API 新增为零，生产部署为零；阶段 3–7 详见计划，后续以持久化、迁移、权限和端到端验收结果更新状态。
