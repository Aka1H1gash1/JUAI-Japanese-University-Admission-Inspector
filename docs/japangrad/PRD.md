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
