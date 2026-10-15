# 日本大学院申请工作台 PRD

**英文名称：** Japan Graduate School Assistant  
**版本：** 1.0  
**状态：** 第一阶段产品需求定义  
**依据：** `文档.md`

## 1. 产品定位

日本大学院申请工作台是一款 Local-first 的桌面应用，用于管理日本大学院申请全过程。

产品围绕两个连续的问题组织信息：

> 我考虑哪些学校和研究方向？哪些目标已经进入正式申请，当前进展到哪里了？

用户可以在一个 Workspace 中管理大学、研究科、专攻、招生信息、教授、实验室、择校意向、正式申请、材料、任务、截止日期、联系记录和笔记。

应用程序与用户数据分离。第一阶段不要求注册、登录、云同步或联网使用。

## 2. 目标用户

- 准备申请日本修士的学生
- 准备申请日本博士的学生
- 同时申请多所日本大学院的用户
- 需要长期整理教授、实验室和招生信息的申请者

典型场景包括：比较多个研究科和教授、跟踪不同申请的出愿日期、管理募集要项和申请材料、记录教授联系过程，以及查看近期任务和 Deadline。

## 3. 产品目标

第一阶段需要让用户能够：

1. 创建、打开、备份和迁移自己的 Workspace。
2. 建立大学院申请所需的基础层级信息和教授、实验室信息。
3. 在正式申请前建立、整理和比较多个择校意向。
4. 将选定的意向转换为具体申请目标。
5. 管理申请材料、任务、Checklist 和 Timeline。
6. 记录教授联系和 Markdown 笔记。
7. 在 Dashboard 查看择校和申请整体状态。
8. 离线查看和编辑大部分本地数据。
9. 在应用升级、卸载或重装后保留 Workspace。

## 4. 产品边界

### 4.1 第一阶段包含

Workspace、University、Graduate School、Program、Admission、Professor、Laboratory、Intent、Shortlist、Application、Document、Task、Checklist、Timeline、Contact、Note、User Profile、Dashboard、Search、Official Links、Backup、Restore、Import / Export 和数据库 Migration。

### 4.2 第一阶段不包含

AI Agent、自动分析募集要项、自动爬取大学官网、自动更新招生信息、Gmail / Outlook API、云同步、用户账号、多用户协作、社交功能、大学推荐、录取概率预测和公共大学院数据库。

## 5. 核心用户流程

```text
创建 Workspace
  ↓
添加大学、研究科、Program，并在研究科下维护 Laboratory 和 Professor
  ↓
择校阶段：自由添加学校、研究室、教授到意向清单
  ↓
横向比较意向，选定目标并补充 Admission
  ↓
从意向创建 Application
  ↓
上传募集要项和申请材料
  ↓
创建任务、Checklist、Deadline 和 Timeline
  ↓
记录教授联系并添加 Notes
  ↓
在 Dashboard 查看进展
  ↓
备份或导出 Workspace
```

## 6. 信息架构

主导航：

```text
Home
Explore
  Universities
  Graduate Schools
  Shortlist
My Applications
Documents
Timeline
Notes
Settings
```

Application 详情页使用以下 Tab：

```text
Overview / Admission / Professor / Documents
Checklist / Timeline / Contacts / Notes
```

## 7. 功能需求

### 7.1 Workspace

支持创建、打开、关闭、最近打开、备份、恢复、导入和导出 Workspace。

默认结构：

```text
JapanGradWorkspace/
├── workspace.db
├── workspace.json
├── applications/
├── attachments/
└── exports/
```

`workspace.json` 仅保存 Workspace 元信息，业务数据保存于 SQLite。

### 7.2 大学院层级与教授、研究室

```text
University
  └── Graduate School
       ├── Program
       │    └── Admission
       ├── Laboratory
       └── Professor
```

Graduate School 是 Program、Laboratory 和 Professor 的管理入口。支持维护名称、日文名称、官网、招生页面、描述和备注，并在 Graduate School 详情页查看和维护其下的研究室、教授。

Laboratory 支持维护名称、主页、描述和备注。Professor 支持维护姓名、职称、研究方向和以下链接：

- 教授主页
- 实验室主页
- Researchmap
- Google Scholar

Professor 可以关联所属 Laboratory；关联关系允许后续调整。Professor 和 Laboratory 的维护不要求先创建 Application。

Admission 至少包括：

- 招生年度和入学月份
- 出愿开始和截止日期
- 笔试、面试、结果公布和正式入学日期
- 官方募集要项 URL

第一阶段由用户手动录入招生信息，官方 URL 是最终依据。

### 7.3 择校与意向清单

择校是正式申请前的独立阶段。Shortlist 是用户的意向清单视图，Intent 是其中的一条意向记录。用户可以自由添加学校、Graduate School、Program、Laboratory 或 Professor，不要求先补齐完整层级，也不要求先录入 Admission。

Intent 建议字段：

```text
id
target_type
name_snapshot
university_id              # 可选
graduate_school_id         # 可选
program_id                 # 可选
laboratory_id              # 可选
professor_id               # 可选
source_url
research_direction
language_requirement
qualification_notes
estimated_fee
deadline_summary
status
priority
fit_score
comparison_notes
application_id             # 可选，转换后回填
created_at
updated_at
```

每条意向支持：

- 选择目标类型，并填写名称、来源 URL、研究方向、备注等自由信息。
- 可选关联已有的 University、Graduate School、Program、Laboratory 或 Professor；关联前后都保留用户填写的意向信息。
- 设置优先级、关注状态、匹配度、语言或资格要求、费用和截止日期等比较字段。
- 在表格视图中横向比较多个意向，按字段排序、筛选和添加个人备注。
- 将选定意向转换为 Application。转换时必须选择或创建对应的 Admission，意向记录保留并记录关联的 Application。

意向清单属于用户私有数据。尚未录入为正式 University、Laboratory 或 Professor 的快速添加内容，也只保存在意向记录中，不强制写入公共层级。

### 7.4 Application

Application 表示用户在择校后针对某个 Admission 的一次具体出愿目标。Application 必须关联 `admission_id`，可以从意向清单转换而来，也可以直接创建。

核心字段：

```text
id
admission_id
intent_id                # 可选，来源意向
primary_professor_id     # 可选
status
priority
target_admission_date
notes
created_at
updated_at
```

Overview 至少显示大学、研究科、Program、Admission、教授、状态、优先级、下一截止日期、待完成任务、最近联系和材料状态。

Application 的状态只表示正式申请过程，不承载 `Intent` 的择校状态；择校状态、比较字段和候选记录只在意向清单中维护。

默认状态：

```text
PROFESSOR_CONTACTED
PROFESSOR_REPLIED
PREPARING
APPLIED
EXAM_SCHEDULED
PASSED
FAILED
WITHDRAWN
```

### 7.5 Document

数据库保存文件元数据，实际文件保存于 Workspace 文件系统。

字段：

```text
id / application_id / name / path / mime_type
size / category / description / created_at / updated_at
```

默认分类：`CV`、`TRANSCRIPT`、`LANGUAGE_CERTIFICATE`、`RESEARCH_PLAN`、`APPLICATION_FORM`、`ADMISSION_GUIDELINES`、`OTHER`。

上传流程为：验证文件、复制到 Workspace、创建元数据、显示文件。不得直接引用桌面或其他外部目录的原始文件。

### 7.6 Task / Checklist

申请可以维护联系教授、准备研究计划书、准备 CV、确认出愿资格、缴纳报名费和提交申请等事项。

字段：

```text
id / application_id / title / description / status
due_date / priority / category / created_at / updated_at
```

Task 状态：`TODO`、`IN_PROGRESS`、`COMPLETED`、`CANCELLED`。

### 7.7 Timeline

用于记录出愿开始、教授回复、笔试、面试、结果公布等重要事件。

字段：

```text
id / application_id / title / description
event_date / status / created_at / updated_at
```

### 7.8 Contact

用于手动记录邮件、会议和线上会议。

字段包括日期、类型、主题、摘要、收发方向、状态、下一步行动、下一步日期和备注。

第一阶段不集成 Gmail 或 Outlook API。

### 7.9 Notes / User Profile

Notes 支持 Markdown，可关联 University、Graduate School、Program、Professor、Intent 或 Application。

User Profile 保存姓名、教育背景、毕业日期、联系方式、JLPT、TOEIC、TOEFL、IELTS、技术技能和研究兴趣。第一阶段不实现复杂 Resume Builder。

### 7.10 Dashboard / Search

Dashboard 按以下顺序展示：

1. 即将到期事项
2. 意向清单中的重点目标
3. 当前申请
4. 待完成任务
5. 最近联系
6. Timeline
7. 最近修改的数据

Search 支持搜索 University、Graduate School、Program、Professor、Laboratory、Intent / Shortlist、Application、Document、Task 和 Note。

快捷键：Windows / Linux 使用 `Ctrl + K`，macOS 使用 `Cmd + K`。

## 8. 数据模型原则

Application 以 `admission_id` 作为申请层级的主要来源，通过 Admission 关联 Program、研究科和大学，避免保存多份可能冲突的层级 ID。`intent_id` 只用于追溯择校来源，不作为申请层级的来源。如果需要保留历史名称，应使用明确的快照字段。

逻辑上区分公共信息和私有信息：

```text
公共信息：University / Graduate School / Program / Professor / Laboratory / Admission
私有信息：Intent / Shortlist / Application / Document / Contact / Task / Timeline / Note / UserProfile
```

意向阶段允许存在尚未归档到公共层级的自由文本候选项；这类候选项属于 Intent 私有数据。

未来公共数据集不得覆盖用户 Workspace 数据。

## 9. 数据安全和文件安全

- Backend 默认只监听 `127.0.0.1`。
- 前端不得任意执行 Shell 或访问 Workspace 外的文件。
- 所有文件使用 Workspace-relative path。
- 必须拒绝 `../` 等 Path Traversal 输入。
- 删除重要数据前必须明确确认。
- 删除 Application 时需要明确是否同时删除关联文件。
- 日志不得记录密码、API Key、私人邮件正文和申请材料全文。
- Workspace 不得放在应用安装目录内。
- 卸载应用不得自动删除 Workspace。

## 10. 备份、恢复和数据库迁移

备份文件格式：

```text
JapanGradWorkspace-YYYY-MM-DD.zip
```

至少包含 `workspace.db`、`workspace.json`、`applications/` 和 `attachments/`。

数据库使用 SQLite + Flyway。已发布的 Migration 不允许修改；新结构必须新增 Migration。Migration 执行前创建备份，失败时保留原数据库和备份，不得删除数据库后重建空库。

## 11. 导入与导出

第一阶段支持：

- Workspace ZIP：完整备份和恢复
- JSON：结构化数据交换
- CSV：表格型数据导出
- Markdown：Application 可读导出

Markdown 导出建议结构：

```text
applications/<application-slug>/
├── README.md
├── application.md
├── admission.md
├── professor.md
├── timeline.md
├── checklist.md
├── documents.md
├── documents/
└── notes/
```

第一阶段 Markdown 默认只做单向导出。

意向清单支持通过 JSON、CSV 导出；Markdown 导出可包含独立的 `shortlist.md`，用于保留择校阶段的比较记录。

## 12. 技术约束

```text
Desktop: Electron
Frontend: Vue 3 + TypeScript + Vite + Vue Router + Pinia
UI: Tailwind CSS + shadcn-vue
Backend: Java + Spring Boot
Database: SQLite + Flyway
Packaging: Electron Builder
```

后端采用模块化单体，不拆分微服务，不引入 MySQL、Redis、Kafka、Kubernetes 等基础设施。

## 13. MVP 开发顺序

### V0.1：择校和申请核心闭环

Workspace、University、Graduate School、Program、Laboratory、Professor、Intent / Shortlist、Admission、Application、Document、Task、Dashboard、Backup。

### V0.2：过程管理

Timeline、Contact、Notes、Search、User Profile。

### V0.3：迁移和可携带性

Import / Export、Markdown Export、Restore、Migration Recovery 和跨平台打包。

### V0.4：体验增强

批量操作、搜索优化、快捷键、深色模式、空状态和错误状态。

## 14. 第一阶段验收标准

- [ ] 可以启动 Electron、Vue 和 Spring Boot
- [ ] SQLite 和 Flyway 正常运行
- [ ] 可以创建、打开、关闭和重新打开 Workspace
- [ ] 可以创建 University、Graduate School、Program、Admission
- [ ] 可以在 Graduate School 下维护 Professor 和 Laboratory
- [ ] 可以自由添加、比较和管理 Intent / Shortlist
- [ ] 可以将意向转换为 Application，并保留关联关系
- [ ] 可以上传、打开和删除 Document
- [ ] 可以管理 Task、Checklist、Timeline 和 Contact
- [ ] 可以创建 Markdown Note 和编辑 User Profile
- [ ] 可以全局搜索本地数据
- [ ] 可以打开 Official URL
- [ ] 可以备份和恢复 Workspace
- [ ] 可以导出 Markdown、JSON 和 CSV
- [ ] 数据库 Migration 正常且失败可恢复
- [ ] 应用升级、卸载和重装不会删除 Workspace
- [ ] Workspace 可以复制到另一台电脑后重新打开
- [ ] 文件路径使用相对路径并具备 Path Traversal 防护
- [ ] 核心错误拥有用户可读提示

## 15. 设计评估与待决策事项

### 15.1 合理之处

- Local-first 适合申请材料和个人信息管理。
- Workspace 与应用程序分离，有利于升级、迁移和备份。
- 文件系统保存原文件、SQLite 保存元数据，便于维护和导出。
- 官方链接优先比自动爬取更适合招生信息变化频繁的场景。
- SQLite、模块化单体和 Flyway 符合个人桌面应用规模。
- 第一阶段不引入 AI、云同步和自动爬虫，有利于控制范围。

### 15.2 开发前必须确定

1. Application 是否只保存 `admission_id`，还是额外保存历史快照。
2. Checklist 和 Task 是否合并为统一任务模型。
3. Admission 日期与 Timeline 事件的来源和同步规则。
4. Professor 与 Laboratory 的关联是一对多还是多对多。
5. Note 使用多态关联还是单独的关联表。
6. 备份和恢复如何保证数据库与文件的一致性。
7. 删除 Application 时关联文件的默认处理方式。
8. Electron 如何管理 Spring Boot 子进程、端口和关闭流程。
9. 是否使用 SQLite FTS5 实现全文搜索。
10. Markdown 导出是否仅为单向导出。

### 15.3 主要风险

- 第一阶段范围偏大，可能导致核心流程迟迟不能稳定。
- Application 关联字段过多时容易产生层级数据不一致。
- Checklist、Task、Timeline 和 Admission 日期存在职责重叠。
- Electron + Spring Boot 的跨平台打包成本较高。
- 申请材料属于敏感文件，需要进一步明确备份权限和删除策略。

## 16. 最终产品判断标准

如果某个方案让应用更复杂、更难安装、更难维护、更依赖网络，或更容易造成用户数据丢失，除非有明确产品价值，否则不应在第一阶段采用。

第一阶段的目标是：

> 一个稳定、简单、可迁移、属于用户自己的日本大学院申请工作区。

## 17. 2026-10-08 功能与运行方式更新

本节依据新增需求，覆盖上文涉及运行形态、大学字段和资料管理的旧约定。

- 最终交付为本地运行、在浏览器打开的开箱即用软件。当前实现采用随软件附带的 Node.js 24 本地服务、SQLite 数据库与静态前端，不需要用户安装 Java、Node.js 或数据库。此前 Electron + Spring Boot + Flyway 的技术约定不再作为本实现的依赖；数据库结构通过追加版本迁移管理。
- Workspace 与软件独立。募集要项、过去问、答案和论文复制为真实 PDF 文件，按专攻或老师及年份分类保存；数据库保存索引、考试信息、论文笔记与邮件正文。
- 大学预留 QS 排名及榜单年份、所在地域字段，学校类型为国立、公立、国公立、私立。
- 专攻支持按招生年度保存募集要项，自动提取考试科目、范围和时间，保留来源页码并支持修订；过去问与具体答案按考试年份配对。当前自动读取基于文字提取和栏目匹配，扫描件 OCR 与复杂表格的精确结构化识别尚未实现，界面明确提示并提供手动录入。
- 老师详情增加论文库，支持本地保存、网页阅读、下载、作者、发表信息及阅读笔记。
- 邮件往来暂时由用户复制粘贴，支持收发方向、日期、正文、下一步行动和跟进日期；邮箱连接留待后续版本。
- 当前提供 Apple Silicon macOS 本地开发试用包，内含运行时；签名、公证及 Windows 软件包属于后续交付工作。

### 17.1 后续交互调整

募集要项原文件归档与专攻资料分析分开呈现；分析已支持原文读取、初步字段定位和带出处的草稿核对采纳。募集要项、过去问分别使用与大学和老师一致的卡片清单，点击卡片进入资料详情，按年份保存原文件并记录个人备注。过去问详情管理关联答案。PDF 阅读统一交给浏览器自带阅读器，在新标签页打开本地原文件；论文也采用同样的阅读方式，不再依赖 PDF.js 自制阅读界面。旧数据库中的历史提取信息保留，不参与现有界面展示或自动更新。

### 17.2 文件类型扩展与分析方案讨论

资料上传支持 PDF、DOC、DOCX、MD、TXT，募集要项、过去问、答案和论文采用同一套文件管理。保存原文件、格式、字符编码与 SHA256；PDF 浏览器原生阅读，MD/TXT 浏览器查看原始文本，Word 下载后由本机应用打开。

外部用户 Agent 的任务包 / 结果导入、本地 STDIO MCP 和原文读取 / 初步定位 / 核对采纳已实现。用户模型 API、独立本地 OCR 与本地模型仍为后续可选方案。设计见 `vue-vben-admin/local-server/AGENT_INTEGRATION_DESIGN.md`。

### 17.3 2026-10-09 总预算、寮申请与校徽

- 大学费用扩展为总费用预算：入学金一次、学费每年、房租 / 寮费每月、生活费每月（不含房租）。首年、两年预算按固定金额估算，月度支出按每年 12 个月计算；缺失项目显示待补充，合计明确为已知费用小计。国立 / 公立 / 国公立的入学金与年度学费保留可编辑的默认值，房租和生活费不预填。
- 大学记录寮申请状态（待确认 / 可申请 / 不可申请）、申请官网和条件备注。寮申请状态不自动改变住宿费用。
- 新增 / 编辑大学支持校徽上传、预览、更换、移除；支持 PNG、JPG、WebP，最大 3 MB。校徽保存在本地工作区，保存大学后关联生效，取消编辑保留原校徽。清单、详情和横向对比统一显示。
- 完善 MVP 的下一步建议见 `MVP-完善优先级.md`；该文件是待讨论的产品建议，不代表本次实现范围。

### 17.4 2026-10-11 卡片导航、历年考试与老师独立页

- 大学卡片改为紧凑布局，集中显示校徽、名称、类型、地域、QS 和整理数量。整张卡片可进入大学详情，移除独立「查看研究科」按钮；对比勾选单独操作。
- 专攻增加「历年考试信息」栏目，按年度倒序展示批次、考试时间、科目、备注及来源链接，支持手动新增、编辑、删除。同一年度可记录多个入试批次，记录保存在 SQLite 中，编辑专攻基本信息不覆盖考试记录。文档自动提取仍保持关闭。
- 老师卡片整卡进入独立详情页；心仪、编辑按钮独立操作。老师详情保留资料、论文库、邮件往来，支持直接访问、刷新和返回所属专攻，并校验完整归属关系。

### 17.5 单文件拖拽上传

- 募集要项、过去问和老师论文统一使用「新增 → 上传弹窗 → 拖拽或点击选择 → 保存」的流程。
- 一次只接受一个文件，不提供批量上传；同时拖入多个文件时提示重新选择单个文件。
- 选中文件后展示文件名与大小，支持更换、移除和取消；标题可自动根据文件名填写，手动修改的标题不被换文件覆盖。点击保存后才上传到本地工作区。
- 支持 PDF、DOC、DOCX、MD、TXT，单个文件最多 50 MB。答案上传复用该文件选择界面并保持对应试题与年份关联。

### 17.6 历年考试对比表与批量录入

- 历年考试信息改为表格，固定表头为考试年份、考试科目、笔试时间、面试时间、结果发布时间，末列提供编辑与删除。按年份倒序，批次显示在年份下，备注与来源可展开，手机在表格内横向查看。
- 新增独立的笔试、面试、结果发布时间字段，兼容已有记录。原考试时间保留，不猜测拆分；可在单条编辑中整理到新栏。旧页面遗漏新字段时服务端保留已有值，主动清空仍可保存。
- 批量录入支持多行填写、按起止年份生成、粘贴表格数据。每批最多 50 行，忽略空白行，校验年份和内容，提示相同年份 / 批次的重复记录。生成年份时跳过已有的未分批次年份，不覆盖原记录。
- 批量记录经过完整校验后一次保存。格式错误或工作区版本冲突时整批不写入，取消不新增记录。

### 17.7 通用出愿信息与年度备注

- 专攻在考试表格外独立维护出愿开始 / 截止时间段和所需材料，作为通用要求展示。支持具体日期或常规时段，材料按行录入、以清单展示；标准日期的截止不能早于开始。
- 考试表格增加独立「备注」列，记录各年份出愿时间、材料或其他特殊变更。单条编辑、批量录入及表格粘贴均支持备注。
- 通用出愿信息保存在本地工作区，编辑专攻基本资料或考试记录时保留；旧页面缺失这些新字段时不清空已有内容，主动清空则按用户修改保存。

### 17.8 前端视觉系统重设计

- 依据 design-taste-frontend 的审查、视觉一致性与可访问性原则重设计本地资料工作台。采用原有 Vue / Ant Design Vue，保留 JapanGrad 品牌、路由、业务字段与数据模型。
- 统一中性色和品牌橙色、无衬线排版、控件与容器圆角、间距、聚焦和悬停状态；移除重复的英文栏目标签。
- 桌面新增大学及当前路径快捷导航，手机采用可关闭的折叠菜单。界面支持浅色、深色、跟随系统，弹窗和抽屉同步主题。
- 图标改为项目已安装的 Lucide 本地组件，老师以姓名缩写作为身份标记。工作区位置通过信息窗口查看和复制。
- 增加加载、连接错误 / 重试、选择框读屏语义和减少动态效果支持。完整设计记录、预览及本地测试报告位于 `design/REDESIGN.md`。

### 17.9 地域与都道府县联动选择

- 大学新增 / 编辑采用「所在地域 → 都道府县」两级下拉，按用户提供的分组覆盖 9 个地域、47 个都道府县，九州与冲绳分开。先选地域，后选对应都道府县；切换或清空地域时清空不匹配的下级选择。
- 都道府县支持中文与日文搜索，另保留城市 / 详细所在地文本栏。清单、详情、横向对比与大学搜索同步包含都道府县信息。
- 旧所在地原文完整保留，能明确识别的中日文都道府县名称在编辑时预选；不推测含糊的旧地域或地址。主动清空的新选择不自动回填。旧页面遗漏都道府县字段时保留已有值，地域发生冲突时提示刷新后重新选择。

### 17.10 研究室层级与修考之路

- 层级调整为大学 → 研究科 → 专攻 → 研究室 → 老师。专攻原老师模块改为研究室清单，研究室内管理老师，老师的论文、邮件和个人关注标记保留；旧老师直达链接兼容。
- 研究室包含名称、日文名、研究方向、官网、备注、考试 / 出愿特殊说明。老师可在同一专攻下调整研究室，保留原身份和资料关联。
- 同专攻中同名的旧研究室自动归组；未填写研究室的老师暂归入「老师姓名研究室」。升级使用数据库事务并保存原始工作区备份，不自动把心仪老师转为想考研究室。
- 研究室可标记 / 取消「想考」，侧边栏新增「修考之路」汇总目标。支持搜索、勾选 2–6 个目标横向对比，按年份或各专攻最新记录展示考试信息。
- 年度开销包含年度学费、12 个月房租与生活费，入学金只计入首年；展示首年、两年预算与费用缺项。考试和出愿信息引用所属专攻，研究室额外要求单独维护。
- Excel 导出先打开选择窗口，自选想考研究室和属性（费用、语言要求、研究方向、老师、QS、地域、考试时间 / 科目、出愿材料、特殊说明与备注等），提供搜索、大学筛选、分组选择、快捷方案与预览。固定大学和研究室识别列，其余未选属性不写入文件。考试可选最新、指定或全部已记录年份，默认仅一张对比表，考试、材料与待办明细及说明可按需附加，明细也仅含所选属性及记录识别信息。费用输入列齐全时合计为可重算公式；仅选合计时输出当前数值快照；必要费用缺失时留空。
- 语言要求支持专攻通用要求与研究室单独要求；研究室留空参考专攻，可独立对比与导出，旧页面省略该字段时保留原值。

### 17.11 修考之路直接选研究室与上级导航

- 修考之路新增「新增研究室」入口，在当前页打开选择窗口，跨大学搜索已整理研究室、按大学筛选、批量勾选或全选当前结果。已加入的目标标记且不可重复添加；跨搜索保留勾选，取消不写入，确认一次保存整批想考状态。空状态和继续添加入口均直接打开选择窗口。
- 所有工作台页面顶部增加「返回上一级」，按页面实际层级跳转，不依赖浏览记录。老师返回研究室，研究室返回专攻，专攻返回研究科，研究科返回大学，大学及修考之路返回大学清单；根页面禁用返回。兼容旧老师详情链接，手机保留可见按钮。

### 17.12 教授联络、修考日程与材料待办

- 教授独立保存联络状态、首封草稿、回复要点、计划联系 / 发送 / 跟进日期、面试约定与内诺日期。研究室指定主要联系老师，卡片可见联络阶段，修考之路支持拖动与下拉状态看板。
- 研究室维护材料与其他待办，记录准备百分比、截止日期和备注，支持常用模板、专攻材料导入和完成勾选。右侧按全部想考目标汇总材料进度、覆盖率、分类进度和未完成待办。
- 根据明确的出愿 / 考试 / 联络 / 待办日期生成修考时间线与甘特图，支持 3 / 6 / 12 个月视图、关键节点倒计时、同期出愿与考试同日提示，共享考试去重。日期按日本时间维护，常规月份和模糊日期不推测。
- 当前范围可导出 .ics 日历，未来未完成事件带提前一天提醒；工作台内提醒随页面运行，后台提醒由导入后的系统日历提供。
- Excel 导出扩充联络字段和材料 / 待办明细，邮件草稿正文不进入清单导出。旧数据字段可缺省，编辑基本资料或旧页面保存不清空新记录；沿用工作区版本与乐观修订校验。

## 手动修考日程与专攻资料分析（当前实现）

- 已移除申请轮次页面与操作接口；研究室个人日程直接记录首次联系、内诺、出愿时间段、考试与结果时间，可编辑具体起止时间、备注和完成状态。图表、列表、倒计时、近期节点、日历与 Excel 时间规划属性同步使用这些日期。
- 募集要项分析直接关联专攻和所选资料，核对后选择更新专攻出愿 / 语言要求、指定或新增考试记录、研究室材料清单；保留原文证据和采纳记录。
- 任务包、结果 JSON 导入及按专攻授权的本地 MCP 接入保留，Agent 查询报考资料、读取分页文字 / PDF 图像并提交草稿。

### 教授考学经历与阶段内容（2026-10-13）

- 每位老师自动拥有当前经历；按阶段展示研究 / 论文 / 要求、首封、往来信件、预约面试 / 准备、实际面试 / 问答、内诺原文 / 签署文件、结果。完整总表保留全部阶段。
- 邮件按经历归属，预约面试前自动联动早期状态；已进入面试或后续阶段不自动倒退。内诺 / 结果引用实际来信，删除来源保留正文快照。
- 可新建仅带名称的经历并保留历史，不引入申请轮次或批次配置。历史邮件与文件隔离，日期可手改、来源节点可联动，冲突保存提示核对。
- 当前升级追加数据库版本 5；升级前备份工作区。Agent / MCP 授权范围维持原有专攻资料权限，不自动开放邮件正文与草稿。

## 本地 Agent 信息文件接入

在「修考之路 → Agent 工作区接入」选择授权专攻与信息文件权限。可以选择只读、读取并编辑，或保留原来的仅募集要项分析权限。编辑时逐项授权专攻、研究室、老师基本资料、大学和研究科；大学 / 研究科为共享资料，默认不授权编辑。

创建后可复制 / 下载通用 MCP JSON 或 Codex TOML，也可下载完整配置 ZIP，包含两种配置、AGENTS.md、使用说明、授权范围和忽略令牌配置的 .gitignore。在独立文件夹中打开本地 Agent，将所需配置合并到客户端 MCP 设置后重新加载；保持 JUAI 服务运行。无需把源码目录交给 Agent。此轮不自动修改用户的客户端全局配置。令牌只在创建窗口返回，服务端只保存 hash；遗失时撤销并重新创建。旧连接不会自动获得信息文件权限。

建议对 Agent 说：“先查看 JUAI 连接状态和授权范围，列出可编辑的信息文件，再按我的要求更新资料。保存前说明字段变化，缺失信息不要猜测。”

| MCP 工具 | 用途 |
| --- | --- |
| get_connection_status | 确认服务连接与权限，不返回令牌 |
| get_information_workspace | 读取授权、字段 JSON Schema、地域选项和操作规则 |
| list_information_files | 搜索 / 分页列出逻辑 JSON 文件与可写状态 |
| read_information_file | 读取开放字段、父级路径及当前 SHA256 |
| write_information_file | 按原 hash 保存信息并同步工作区；提供唯一 requestKey 和摘要 |
| list_information_changes | 读取本连接最近 50 项修改摘要 |

信息文件路径如 `majors/<id>.json`、`labs/<id>.json`，由服务映射到 SQLite 中的现有记录，不是磁盘文件路径。内容使用 `{schemaVersion:1, kind, id, data:{...}}`，ID 和所属关系不可变；`data` 中未提供的字段保留，字符串可用空字符串清空。费用按整数日元字符串记录，材料和考试数组按工具返回的 Schema 填写。新建 / 删除实体、关系调整、邮件与考学经历、上传原文件、代码及数据库不通过这些信息工具开放。工具授权只限制 JUAI MCP 能力，不限制 Agent 客户端自身已有的 Shell / 系统文件权限。

写入重新检查令牌、专攻范围和资料类型；路径仅接受预定义逻辑路径，不访问任意磁盘路径。全工作区校验、资料变更与历史写入在本机服务事务中完成；hash 冲突要求重读合并，同一个 requestKey 重试不会再次应用。升级新增数据库 migration 6，保存 Agent 信息修改历史。

在接入窗口底部查看修改前后对照、刷新连接最近使用时间，或撤销单项修改。撤销仅恢复该项改变的字段，保留其他资料；字段之后有新变化时拒绝撤销，原记录仍可查看。普通页面约每 15 秒及重新聚焦时检查新修订；打开编辑弹窗时暂停自动更新，保存冲突不会静默覆盖 Agent 改动。

募集要项分析仍使用原有提取、证据与待核对草稿流程。信息编辑用于用户明确要求的资料维护，不替代来源核对。

## 网页 AI 资料助手（自带 API）

右上角「AI 助手」直接打开网页对话框。首次点击「模型与权限」，填写自己的 API Base URL、模型 ID、密钥，选择接口与授权专攻；保存后即可对话。每个对话固定自己的模型地址与资料范围，改设置会开始新对话。可以恢复历史对话、停止当前回答、删除对话，或打开「修改记录」对照与撤销已经保存的资料。

支持 OpenAI Responses 与 OpenAI 兼容 Chat Completions；本机模型服务可使用 localhost / 127.0.0.1 HTTP，远程 API 使用 HTTPS。模型必须支持函数工具调用，兼容性取决于服务商与模型；较新的 OpenAI 模型使用 Responses。默认流式显示，可在设置关闭流式以适配其他服务。Base URL 自动补充对应接口路径，不接受 URL 中的密钥参数。

助手可以搜索 / 读取授权专攻及所属大学、研究室、老师基本资料，查看已核对的补充报考要求，并提出资料修改建议。所有写入先显示修改前与建议值；点击「确认修改」后才保存。确认前再次校验 hash 和范围，复用信息文件服务的字段校验、幂等保存与撤销历史。只读模式不提供修改建议工具。原始 PDF / Word、邮件、考学经历与系统文件不通过网页助手开放；募集要项原文提取继续使用专攻分析页面。

API 密钥只放在本地服务进程内存，不写入 SQLite、浏览器持久存储、对话日志或配置包；重启服务后重新填写。模型地址和非敏感设置、对话与建议保存在本机 SQLite。用户点发送后，对话及本轮工具读取的授权信息会发送到其配置的模型服务；没有内置平台模型密钥。

这版使用本地 Node.js 的函数工具调用编排，共用已有资料权限层，没有引入 LangChain 依赖。外部 Agent MCP 配置继续可用；网页端目前使用用户 API，尚未桥接本机 Codex 的登录与 App Server。后续可以增加该模型来源并复用对话与修改确认界面。

技术边界：数据库追加 migration 7（设置、对话、建议表）；最近 16 条对话进入模型上下文，旧对话仍保留在本机。每轮最多 8 次模型请求、20 次工具调用、5 项修改建议，每个模型请求最多输出 4096 token，总处理时间 3 分钟，同时最多 2 轮运行。工具结果限制大小；请求取消、中断、服务重启或 hash 冲突均有明确状态。没有通用 Shell、任意文件读写、自动发送邮件或模型直接保存资料的工具。

接口依据：[OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)。本机 Codex 另一条路线依据：[Codex App Server](https://developers.openai.com/codex/app-server)。

## 本机 Codex 与并排助手侧栏（2026-10-15）

右上角「AI 助手」现在展开固定在右侧的工作面板，主页面同时缩窄并重新排版。拖动两栏分隔线调整宽度，双击恢复默认；键盘左右键也可调整，宽度记在本机浏览器。收起后主页面恢复；较窄窗口使用全宽助手视图。资料与对话可以并排查看。

点击「连接本机 Codex」，自动检测 Codex CLI、沿用已有登录 / 模型配置，并创建 JUAI 专用网页会话。无需填写 API 密钥或手动安装 MCP 配置。模型列表由本机 Codex 返回，不硬编码；在设置中可选择模型、专攻和资料范围，自动检测失败时可填写程序绝对路径。未登录时提供官方登录入口。

也可点击「复制指令给本机 Agent」，让本机 Agent 只调用 JUAI 的连接接口完成这项连接。网页检测到新会话后载入。此指令帮助连接 Codex，不会让任意外部 Agent 自动变成网页聊天引擎，也不导入 IDE 现有聊天记录。其他 Agent 要直接在网页回复仍需实现其对话适配器。

实现使用 Codex App Server 的 JSONL / STDIO、初始化、账户状态、模型列表、临时线程、流式消息和动态资料工具。每轮创建独立临时线程，JUAI 自己保存聊天历史并提供最近上下文。程序在独立临时目录运行，采用随机名称的只读文件权限配置，命令、代码执行、外部应用、hooks、其他 MCP 与插件在该接入会话中关闭；权限未正确采用时拒绝启动推理。不修改用户的 Codex 全局配置，不读取或复制账户令牌。登录、模型服务与额度由本机 Codex 的配置负责。

本机 Codex 复用网页助手的资料范围、读取后才能提议、字段校验、人工确认、冲突保护和撤销记录。取消或退出会中断 Codex turn；停止本地服务同时关闭它所启动的 Codex 子进程。用户自己的 API 模式继续可选。

无需新增数据库迁移，模型来源保存在原设置 / 会话 JSON 扩展字段中。接入依赖 Codex 的实验性动态工具与权限接口，旧版本或管理策略不兼容时会显示错误并停止，不放宽权限。

依据：[Codex App Server](https://developers.openai.com/codex/app-server)、[Codex Permissions](https://learn.chatgpt.com/docs/permissions)。本机实际连接初始化已读取到已有登录与可用模型，并核对选中的只读权限；未启动模型推理。代码检查包括 Vue 类型、Vite 构建、Node 语法及 diff；未运行自动化测试。
