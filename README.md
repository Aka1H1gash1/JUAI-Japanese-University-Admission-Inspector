# JUAI-Japanese-University-Admission-Inspector

**日本大学院申请信息整理与修考规划工作台。**

JUAI 面向准备报考日本修士、博士的学生，把大学、研究科、专攻、研究室、老师及报考资料整理在同一个本地工作台中，帮助你比较研究方向、考试安排和留学预算，逐步建立自己的修考目标清单。

当前版本为本地 MVP，支持手动维护、修考日程、文档阅读与笔记，以及募集要项 AI 提取后核对填表。可复用已接入助手、选择本机可用 Luna，或单独配置模型 API；扫描件支持本机 OCR / 图片模型。资料以你确认的内容为准。

## 桌面安装版

在 [GitHub Releases](https://github.com/Aka1H1gash1/JUAI-Japanese-University-Admission-Inspector/releases) 下载 macOS DMG 或 Windows MSI，安装包内置运行时，无需配置开发环境。macOS 分 Apple Silicon 和 Intel 两个版本，Windows 提供 x64 版本。首版为未签名预览版，支持范围、安装方法及 OCR 限制见[桌面版说明](desktop/RELEASE_NOTES.md)。

资料默认继续保存在用户文档目录下的 `JapanGradWorkspace`，与原有便携版兼容。桌面应用的「文件」菜单可以打开资料和日志文件夹。

## 能做什么

| 模块 | 功能 |
| --- | --- |
| 网站首页 | 独立的校园光影进入页，轻缓动态与指针景深，支持暂停、减少动态效果、手机与深色模式；点击进入申请总览。 |
| 网址解析查询 | 各类新增均可选择手动或网址解析，统一填写网址、入学年份、身份、备注及 Agent/API 方式；按链接对象与真实上级建档，优先查找对应募集要项，提供四阶段进度、证据核对与原件来源。 |
| AI 管理 | 本地 Codex 或自带 API 两种主要入口，连接后四项 AI 功能统一使用；支持 DeepSeek，逐功能模型分配及外部 Agent 授权保留在高级设置中。 |
| 申请总览 | 汇总近期日程、今日 / 逾期待办、研究室联络与材料进度及待补信息；可直接完成待办或进入对应资料。 |
| 大学清单 | 紧凑卡片显示校徽、大学类型、QS 世界排名与独立注明来源的日本排名；支持官网校徽提取、手动上传、地域选择与大学对比。 |
| 特殊入学项目 | 独立整理 SGU 等项目，手动或网址解析新增，记录资格、语言、材料、选拔、时间、费用与资助，关联募集要项摘要和原件。 |
| 设置 | 个人资料、默认入学年份 / 申请身份，以及用户 Chrome 连接配置；默认只将年份和身份预填到查询表单。 |
| 留学预算 | 分别填写入学金、年度学费、月房租和生活费，查看年度、首年及两年费用，记录寮申请条件。 |
| 研究室与老师 | 按「大学 → 研究科 → 专攻 → 研究室 → 老师」管理资料，记录研究方向、官网、关注理由、论文和邮件。 |
| 报考安排 | 记录出愿时间段与所需材料，按年份对比考试科目、笔试、面试和结果发布时间，支持批量录入与年度备注。 |
| 文件归档 | 拖拽或选择单个文件上传募集要项、过去问、对应答案和老师论文，保留原文件，支持阅读或下载。 |
| 阅读与笔记 | 工作台内 PDF 阅读，支持目录、缩略图、页码、缩放、旋转、文内搜索与专注模式；选段高亮、原文批注、全文笔记、阅读位置保存及 Markdown 笔记导出。 |
| 文档 AI 问答 | 阅读页复用本机 Codex / 用户 API，按当前文件与版本保存会话；选段提问、按页读取与搜索、原文引用回跳、确认后转为笔记。 |
| 募集要项分析 | 复用助手、本机 Codex / Luna 或独立 API，提取 PDF / DOCX / MD / TXT；扫描 PDF 可先本机 OCR 或直接图片识别，生成带原文出处的草稿，确认后填入专攻要求、考试记录和研究室清单。 |
| Agent 工作区 | 下载分析任务包并导入结果，或创建按专攻授权的本地 MCP 连接，支持分页文字、PDF 图像和草稿回传。 |
| 修考之路 | 直接搜索、按大学筛选并批量选择想考的研究室，横向对比目标，自选研究室、属性和考试年份导出 Excel。 |
| 考学经历 | 按老师追踪联络、回复、预约面试、面试完成、内诺和结果；阶段内容关联邮件、论文与签署文件，保留完整经历和历史。 |
| 日程与材料 | 自动汇总明确日期为时间线 / 甘特图，提示同日安排与倒计时；直接新增 / 编辑首次联系、内诺、出愿、考试和结果日程，按研究室维护材料进度和待办。 |

界面支持桌面与手机布局、随系统切换的配色，以及页面层级导航。原有资料页可直接访问，网站根地址进入 `/welcome`，主工作区仍位于 `/japan-grad/overview`。

## 使用流程

1. **整理大学与专攻**：录入所在地、费用、招生要求和历年考试信息。
2. **建立研究室资料**：补充研究方向与老师，整理论文、联系记录和特殊报考要求。
3. **加入修考之路**：在修考之路直接选择研究室，或在研究室点击「想考」。
4. **对比与导出**：勾选目标，比较方向、预算与考试安排，导出 Excel 继续整理。

点击「导出 Excel」后，先勾选研究室，再自选费用、语言要求、考试科目 / 时间、研究方向、QS、地域、联络状态等属性，可预览结果并选择最新、指定或全部考试年份。大学与研究室名称固定保留，其余未选属性不写入文件；默认仅一张对比表，考试明细、材料与待办明细、导出说明可按需附加。费用输入列同时被选中时合计使用可重算公式，否则仅导出所选合计的数值快照。语言要求可在专攻中维护，研究室可单独填写覆盖。

时间线支持导出 `.ics` 日历，在系统日历中导入后可使用日历提醒。工作台内倒计时按日本时间更新；未填写明确日期的常规时段不会被自动推测成日期。

## 本地资料与费用

浏览器提供操作界面，本地 Node.js 服务和 SQLite 保存资料。默认工作区为：

```text
~/Documents/JapanGradWorkspace
```

上传文件会复制到工作区，论文、过去问和募集要项保留原文件。软件目录与资料目录独立，资料不依赖浏览器缓存，日常整理不需要云端账号。

- **年度开销** = 年度学费 + 12 ×（月房租 + 月生活费）。
- **首年总费用** = 一次性入学金 + 年度开销。
- **两年总费用** = 一次性入学金 + 2 × 年度开销。

费用未填写完整时会标出缺项；Excel 中缺少必要输入的合计留空。完整备份和迁移方法见[使用说明](local-server/USER_GUIDE.md)。

## 源码运行

需要 Node.js 24 和项目指定版本的 pnpm。

```sh
git clone https://github.com/Aka1H1gash1/JUAI-Japanese-University-Admission-Inspector.git
cd JUAI-Japanese-University-Admission-Inspector
pnpm install
```

先安装本地解析器和 MCP 依赖（独立锁文件，软件包已内置）：

```sh
pnpm setup:japangrad-server
```

启动本地数据服务：

```sh
pnpm dev:japangrad
```

另开终端启动前端：

```sh
pnpm --filter @vben/web-antd dev --host 127.0.0.1 --port 5666
```

打开 `http://127.0.0.1:5666/japan-grad/overview`。

### 构建与启动

```sh
pnpm build:japangrad
pnpm start:japangrad
```

构建后打开 `http://127.0.0.1:5667/japan-grad/overview`。也可构建内含运行时的 macOS Apple Silicon 软件包，具体方式见[打包说明](apps/web-antd/src/views/japan-grad/README.md#打包)。

## 项目结构

```text
apps/web-antd/          前端应用与 JUAI 页面
local-server/          本地 API、SQLite 和文件存储
packages/              共享组件与框架能力
internal/              构建、TypeScript 和代码规范工具
scripts/               开发、打包与已有检查脚本
docs/japangrad/         产品需求与开发记录
design/                界面设计记录和预览
LICENSES/              第三方许可声明
```

### 根目录配置说明

当前源码沿用 Vben 的工作区结构，下面这些文件用于安装、构建和开发工具：

| 文件 | 用途 |
| --- | --- |
| `package.json` | 项目依赖、运行命令和环境要求。 |
| `pnpm-lock.yaml`、`pnpm-workspace.yaml` | 锁定依赖版本，组织前端与共享包。 |
| `turbo.json` | 管理工作区构建和类型检查任务。 |
| `eslint.config.mjs`、`oxlint.config.ts` | JavaScript、TypeScript 和 Vue 代码检查。 |
| `oxfmt.config.ts`、`stylelint.config.mjs` | 代码格式与样式规范。 |
| `cspell.json`、`lefthook.yml` | 拼写检查与 Git 提交检查。 |
| `vitest.config.ts` | 共享组件的测试工具配置。 |

## 项目文档

- [使用说明](local-server/USER_GUIDE.md)
- [当前进度](docs/japangrad/PROGRESS.md)
- [开发与数据说明](apps/web-antd/src/views/japan-grad/README.md)
- [完整产品需求](docs/japangrad/PRD.md)
- [MVP 完善优先级](docs/japangrad/MVP-PRIORITIES.md)
- [设计记录与界面预览](design/REDESIGN.md)

## 技术与开源许可

前端采用 Vue 3、TypeScript、Ant Design Vue 和 Vite；本地服务采用 Node.js 与 SQLite；Excel 在本机生成。

项目基于 [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) 开发，共享框架源码和组件沿用其实现。项目采用 [MIT License](LICENSE)，第三方许可声明见 [LICENSES/Vue-Vben-Admin.txt](LICENSES/Vue-Vben-Admin.txt)。

### 日程与 Agent 使用

在「修考之路 → 时间线与日程」点击新增日程，默认提供首次联络、内诺、出愿、笔试、面试、放榜，也支持自定义节点。填写日期 / 时间、出愿时间段、备注和完成状态；图表使用简短名称，悬停查看具体日期时间与备注。图表节点及下方列表均可直接编辑；隐藏的来源日程可恢复。Excel 自选导出支持「时间规划」属性与「修考日程」快捷方案。

在专攻详情或募集要项文件详情进入分析页，选择资料与分析对象，读取后选择助手、本机模型或独立 API 生成 AI 草稿。可按页选择范围，扫描件支持 OCR / 图片识别；日期与引用需核对，确认后才更新专攻要求、考试记录或研究室清单。仍支持外部 Agent 的 ZIP 任务包与本地 STDIO MCP。详见[使用说明](local-server/USER_GUIDE.md#募集要项分析与-agent-接入)和 [Agent 接入说明](local-server/AGENT_INTEGRATION_DESIGN.md)。

Agent 支持按专攻授权的本地 MCP 信息文件读写：创建并下载配置，选择可编辑的资料类型，保存后同步界面并保留可对照、可撤销的修改记录。配置说明见[使用说明](local-server/USER_GUIDE.md#本地-agent-信息文件接入)。

网页右上角提供「AI 助手」，配置自己的 Responses / OpenAI 兼容 API 后即可查询授权资料、生成修改建议并在对话中确认保存，支持历史对话、流式回答与停止。API 密钥仅保留在本地服务内存，重启后重填。

右上角 AI 助手采用可拖动宽度的并排侧栏，展开时主页面自动重排。点击「连接本机 Codex」沿用本机登录开始对话，也可让本机 Agent 执行复制出的辅助连接指令；用户自带 API 方式继续可用。
