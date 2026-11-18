# JUAI 1.0 开发进度

## 当前状态

- 日期：2026-11-16；分支：共享核心及私有平台均为 `refactor/juai-1.0`；阶段1–7已完成，生产固定核心483509088、平台1b47a23，后续文档补记不改变运行代码。
- 当前状态：七个阶段已完成，正式部署Server1.0.0；最终源码、构建、数据保护与边界见PHASE7_ACCEPTANCE.md。后续按新的用户任务继续，不重复迁移或部署。
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

## 第二阶段当时的未完成业务边界（历史）

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

## 阶段7最终交付

已完成正式部署与生产验收。固定CI43740719215，Server1.0.0，核心483509088、平台1b47a23，schema19/平台3/协议1。本地保留相同CI包；代码与应用构建一致。生产13个工作区迁移验证通过，原列值和文件不变；隔离测试账号已禁用并撤销会话。完整需求0–14、API/迁移、测试、备份、回滚及真实AI/SMTP未调用边界见 [PHASE7_ACCEPTANCE.md](PHASE7_ACCEPTANCE.md)。

## 2026-11-16 README 多语言与人在回路说明

用户要求为GitHub README增加英文、日文版本，并强调人是驱动系统的核心。保留中文默认README，新增README.en.md / README.ja.md，三种语言顶部互相链接；完整翻译现有功能、使用方式、运行命令、许可和边界。新增Human-in-the-loop说明：人设定目标、主动发起任务、核对和修订、确认采纳并决定下一步，AI辅助查找/阅读/提取/整理；邮件仍由人审核及发送。

在独立工作树从最新main执行，只更新三个README，提交90c1fc097发布到GitHub默认main；同一变更同步回refactor/juai-1.0。各版本29个引用和3组运行命令检查通过，GitHub官方Markdown渲染通过，原有提交检查通过。不修改应用代码、数据或服务器部署。

## 2026-11-16 线上MySQL迁移（进行中）

用户明确线上平台与业务库迁移MySQL，本地便携版保留SQLite。新分支refactor/mysql-online，核心基线0ac337b4b、平台d4cad9f；设计、验收门槛及状态见MYSQL_MIGRATION.md。生产尚未变更；原始SQLite须保留为迁移和回滚来源。

### MySQL实现与第一轮验收

核心新增可注入数据库接口、即时外键所需的主教师循环关联暂存、MySQL错误状态及逻辑工作区备份；SQLite默认路径保留。私有平台新增mysql2驱动/工作线程、原生模式与JSON只读投影、导入/校验/备份/恢复、后台读取和缺库保护。真实快照16个库（平台+15工作区）914表1853行校验通过；SQLite80项及原平台11项通过；MySQL业务/安全/断线6项和额外HTTP整站恢复场景通过，17页×三种显示环境MySQL E2E通过。尚未切换生产；完整边界及后续恢复点见MYSQL_MIGRATION.md。

## 线上MySQL迁移最终完成

2026-11-16，用户限定范围“线上MySQL，本地SQLite”已完成。最终运行Server1.1.1、MySQL8.4.13，固定平台2d907bb/corece17eed0a，CI43863695827。正式迁移及密钥/视图/文件验证、真实备份恢复、异机哈希及线上HTTP验收全部完成。恢复CLI的current符号链接入口问题已修复并增加真实子进程回归；该补丁仅更新代码，不重迁数据。原SQLite归档、工作区文件和账号保留。最终证据见MYSQL_ACCEPTANCE.md；早期“尚未切换”是历史记录，不能当作当前待办。后续只执行新任务，不重复迁移。

## DeepSeek 新应用 API 接入（2026-11-17）

用户明确仅升级现有功能，不需要模拟面试。新分支 feat/deepseek-app-apis，从 c9767de04 起开发，修改前 bundle 已保存 ../git-backups/deepseek-app-apis-20261117/core.bundle；没有操作真实工作区或生产数据。

已接通官方 OCR、Files 原生图文输入与 Fetch；已有 Search、工作区函数工具、邮件草稿继续复用。OCR 作用于用户选择的原页，Files 只上传当前文档，来源核验/逐项采纳/不自动发信不变。新增费用与上传说明，保留其他服务商及本机路径。无需数据库迁移。完整行为、限制和官方依据见 DEEPSEEK_APP_APIS.md。

最终验证：Node24.22.1 下后端91项（含新增8项）、前端11文件42项及脚本业务9项通过；完整类型检查和最终生产构建通过。agent-browser 独立会话验证桌面与390px手机界面，上传/一小时过期/费用提示可见、无横向溢出；截图 /private/tmp/juai-deepseek-desktop.png 和 /private/tmp/juai-deepseek-mobile.png。浏览器临时工作区明确阻止全部真实 DeepSeek 请求。提交时运行原有全套 Git hooks，提交标题 feat(project): integrate DeepSeek OCR files and web fetch。未调用付费模型、未部署。


### 2026-11-17 部署与生产传输修复

用户已授权部署并使用提供的 Key 做最小真实接口验收、仅用于自己的账号。Server1.2.0/平台4422955/核心d95748a47/CI43935623233构建和测试通过，包SHA256 f07effba2d5f3ef420a7d8c496ff96c0ff94110b7572b8405603d771e7ff935a。部署前快照2026-11-16T19-03-28-876Z已异机校验84文件一致；实际切换前快照2026-11-16T19-14-43-262Z保留。

生产原生文件验收发现独立undici不识别Node内置FormData，原样发送会成为text/plain / [object FormData]并被供应商400拒绝。本地真实直连使用Node fetch，未覆盖这个传输差异。已明确重现并在服务器出站层转换为对应undici FormData，增加真实序列化/中文文件名/字段顺序与非表单不变的回归。1.2.0已做兼容程序回滚到1.1.1，MySQL数据没有恢复或切换，准备1.2.1固定CI补丁。

另发现公开DNS指向198.54.117.242、Namecheap verify-contact-details验证NS；Google/Cloudflare DoH一致。指定43.133.255.40并保留TLS域名校验时服务器HTTPS正常。注册商联系邮箱验证需所有者处理，已询问用户，不能宣称普通域名访问已恢复。用户Key与两个现有活跃账号已存配置相同；未识别唯一账号前不覆盖任何用户配置。


### DeepSeek 部署最终状态（2026-11-17）

已发布Server1.2.1，固定平台712c380a100dcc6672e2366b2907ee6552e1eb23 / 核心c79448a8329855c76db5427f0bd7e7dab9359ba3；CI43938825893全部成功。发布包SHA256为9de71a7d8961ddcc19045e262b9caea8b5370a8b5e3d395e7fb2fa71123f2f2f。原生multipart生产传输已修复，新增回归后后端92项；前端42项、平台11项、真实MySQL8项、原设备MySQL契约及两引擎浏览器矩阵通过。1.2.0未通过生产验收，曾兼容程序回滚到1.1.1；随后才发布此补丁。全程保留MySQL数据，不做数据库恢复或迁移。

用户授权的少量真实API验收仅用合成资料及官方公开文档：OCR、Files图文上传/问答、Search、Fetch，以及服务器传输模式下文件与函数工具多轮全部通过。生产HTTPS（指定真实IP并正常校验TLS域名）验证文件SSE、PDF/Range、OCR→结构化草稿；成功识别合成截止日2027-06-15，草稿保持pending，未自动改正式字段。独立验收账号最终disabled、sessions=0、keys=0，旧Cookie API401/页面302登录；未发送邮件、未使用真实用户材料。

切换前最终快照2026-11-16T19-33-14-524Z；验收清理后快照2026-11-16T19-36-50-485Z。异机89文件哈希一致，聚合945e304d6f48115b0f0d9100ffc167521c0ff01caa1d2317965afa6df1d64709。原17工作区1020表1670行逐行一致，65原文件（含MySQL标记）哈希一致；原用户/vault/MFA行保持，主密钥不变。活动目录SQLite数据库文件0。原1.1.1程序、环境备份和各快照保留。

本地两仓库源码与固定CI代码一致；520个前端静态文件与线上逐文件哈希一致，聚合e636214ecae77a46cd614c828c2073de84a94d766c8033ef7c35f895337b6633。核心历史包1.4.2不改，本地便携版仍SQLite。后续文档提交不改变CI运行源码，不因文档SHA不同重复发布。

用户提供的Key与两条现有启用的官方DeepSeek连接均一致，不需重复写入，原用户密钥配置没有覆盖。所有验收凭据仅在私有忽略目录/加密vault，截图与证据在私有artifacts/deepseek-deploy-20261117。

外部阻塞仍存在：公开Google/Cloudflare DNS把gotojuai.online解析到198.54.117.242，NS为Namecheap verify-contact-details验证服务。服务器应用/MySQL/Nginx和正确IP上的有效HTTPS正常；普通域名访问尚未恢复，不能宣称公网域名完整验收通过。Namecheap官方说明这种验证NS用于联系信息待验证的域名，需所有者完成联系邮箱确认，已询问用户；没有更改系统/公共DNS或注册商账户。官方处理说明：https://www.namecheap.com/support/knowledgebase/article.aspx/10698/46/what-to-do-if-my-domain-was-suspended-due-to-whois-verification-process/

## 申请流程与邮件工作台原型（2026-11-17，进行中）

用户最新要求先看原型，当前不做正式业务迁移/部署/付费AI。分支design/application-workflow-prototype，基线960b1ac13；代码bundle在../git-backups/application-workflow-prototype-20261117/core.bundle。原有未跟踪文件保留。

已审查出总览五节点与教授联络七状态不同、总览未渲染考试日程、工作台仅批次日期及材料读取不一致。新原型使用同一页内状态同时呈现总览与工作台，顶部双列、阶段/材料集中、邮件三栏，保留日历。当前方案、数据边界和后续正式模型要求见APPLICATION_FLOW_PROTOTYPE.md。

为真实预览，仅只读导出截图匹配的工作区并离线转到临时SQLite副本；原型后端5679拒绝全部写入和AI请求，前端5198用独立API目标，保留原服务。源工作区当时教授记录为consent，未建立材料、无邮件、无结构化招生批次，原型如实显示；阶段默认只作参考映射，未迁移或覆盖。现正完成类型/布局与浏览器交互验收。


### 申请工作流原型交付

独立预览入口http://127.0.0.1:5198/japan-grad/design/application-flow；总览加?screen=overview，邮件加?view=mail。顶部目标/时间压为约91px高的两列，阶段摘要压缩，材料区集中到主工作区。原型同一内存状态驱动总览和工作台；默认阶段仅参考原联络记录，手动设定和查看阶段分开；每阶段输入分别保留。邮件三栏、正文/附件、关键词检索、原型草稿与AI流程预览完成，原日历/时间线保留。同日多来源仅摘要归组，原6条时间线记录仍保留。

新增5项来源语义测试，前端12文件47项通过；类型与独立临时构建通过，原有全部Git hooks在提交时运行。桌面/390px/深色浏览器检查无横向溢出及脚本错误、h1唯一。截图/日志见私有artifacts/application-flow-prototype-20261117和APPLICATION_FLOW_PROTOTYPE.md。手工演示条目始终标注原型，刷新不保存，不伪造AI结果；后端仍材料0/邮件0/联络consent，写请求403，付费AI0，正式数据无写入。现有本地服务和线上1.2.1保留，生产布局/计算器/数据库没有替换或迁移。

提交标题feat(project): prototype unified application stages and mail workspace。下一步等待用户审阅本原型的结构与阶段方案，随后按其反馈实施兼容数据模型、真实API和正式页面；不能把原型内存交互当作已完成的业务持久化。


### 原型日历样式缺失修复（2026-11-17）

用户截图指出日历星期/日期纵向堆叠。之前的“无溢出、无脚本错误”不能证明布局正常；该视觉验收有遗漏。原因是OverviewCalendar的样式在overview.css页面文件中，原型独立路由没有加载它。

日历布局、日期/事件/弹窗和窄屏规则移入组件自己的overview-calendar.css，由组件显式导入；补齐独立容器/标题样式及容器宽度响应，不再依赖先访问旧总览。原页面仍复用同一份日历样式，不保留第二份副本。数据及时间线记录不变。

浏览器直接进入原型验证display:grid、7列、星期同一行、固定459px高度；月视图实际切到2027-02，笔试/面试/放榜节点及详情正常。390px月视图七列可见，周视图局部滑动，不造成全页横向溢出。新增全新文档直接进入的几何断言，不能再仅凭页面不溢出判定成功。最终回归/提交见本次修复记录，仍只本地原型、不部署、不调用AI。

日历修复最终验证：全新文档从原型直达，桌面/390px的周/月四种情况均断言display:grid、7列、星期同一行及高度范围；18路由×桌面/手机/深色回归全部通过，含原日历与新原型。构建临时产物成功，真实副本2月考试节点/日期详情已手工检查；截图calendar-fixed-week/month/mobile.png保留。提交标题fix(project): make embedded calendar styles self-contained，运行原有全套hooks。本轮不部署、不改日程数据、不调用AI。

## 正式申请工作流实现（2026-11-18，进行中）

用户已确认原型并要求更新。当前授权本地正式实现，不自动部署。分支feat/application-workflow，基线b51dfab9b，bundle备份../git-backups/application-workflow-implementation-20261118/core.bundle。采用目标级阶段为唯一来源，不覆盖原教授联络经历。

已开始实现独立的规范化阶段、阶段字段、未发送邮件草稿与附件关系，以及乐观版本校验。新开发迁移20保持旧迁移19和旧资料不变；尚未接入正式启动链，必须先完成原生MySQL兼容迁移、备份与隔离验证再激活。后续继续HTTP接入、正式页面和总览/修考之路同源投影、材料/邮件与AI交互、完整验收。不能把此中间状态称为正式功能更新完成。

正式数据层首轮隔离验证通过：新工作区执行迁移20两次幂等，旧目标与旧联络经历逐行不变；不同阶段字段分别保存、makeCurrent=false不推进阶段；旧版本写入/删除拒绝409，跨目标草稿拒绝404，无效日期拒绝，非法附件拒绝403；重开SQLite后阶段与草稿内容保留；草稿不产生任何已发邮件记录，外键检查0异常。此模块尚未接入HTTP或启动链，原MySQL/SQLite运行工作区未升级，正式页面尚未启用。继续原生MySQL迁移及API/UI接入，不能宣称整轮更新已完成。


## 2026-11-18 正式工作流全量交付与部署（进行中）

用户明确要求MySQL兼容迁移、正式API、总览/工作台完成并上线，覆盖先前“本地不自动部署”范围。本轮持续推进至完整发布验收，不再将数据层中间提交当作整轮完成。当前线上基线1.2.1/712c380/corec79448a83，MySQL8.4.13/schema19/layout1；公共DNS已恢复43.133.255.40。新版本Server1.3.0/schema20/layout2。部署前快照2026-11-18T03-27-19-969Z已建立，正在下载分离密钥与异机校验。

并行责任：MySQL原生增量迁移/快照恢复，core正式API/SQLite20/草稿附件/AI和旧数据兼容，正式UI/总览/修考之路同源。主agent统一集成、冻结代码、完整tests/type/build/浏览器、CI固定包和实际生产切换验收。规范化新状态不覆盖旧联络事实；新草稿绝不作为sent，AI从当前目标取上下文并仅生成可编辑草稿；不自动发邮件，不在UI验收调用付费模型。

重要回滚约束：layout2不能直接交给仅接受layout1的旧worker。保留完整快照和旧版本环境，停写升级成功校验后再开放HTTP写入；失败按兼容布局前向修复或独立namespace恢复后显式切换，禁止覆盖升级后新写入或切回SQLite。
