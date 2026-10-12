# JUAI-Japanese-University-Admission-Inspector

**日本大学院申请信息整理与修考规划工作台。**

JUAI 面向准备报考日本修士、博士的学生，把大学、研究科、专攻、研究室、老师及报考资料整理在同一个本地工作台中，帮助你比较研究方向、考试安排和留学预算，逐步建立自己的修考目标清单。

当前版本为本地 MVP，资料由用户手动维护。大学、研究室和考试信息以你录入的内容为准，自动收集、AI 解析及正式申请流程仍在后续规划中。

## 能做什么

| 模块 | 功能 |
| --- | --- |
| 大学清单 | 记录大学类型、QS 排名与榜单年份，上传校徽，按地域和都道府县选择所在地，对比大学资料。 |
| 留学预算 | 分别填写入学金、年度学费、月房租和生活费，查看年度、首年及两年费用，记录寮申请条件。 |
| 研究室与老师 | 按「大学 → 研究科 → 专攻 → 研究室 → 老师」管理资料，记录研究方向、官网、关注理由、论文和邮件。 |
| 报考安排 | 记录出愿时间段与所需材料，按年份对比考试科目、笔试、面试和结果发布时间，支持批量录入与年度备注。 |
| 文件归档 | 拖拽或选择单个文件上传募集要项、过去问、对应答案和老师论文，保留原文件，支持阅读或下载。 |
| 修考之路 | 直接搜索、按大学筛选并批量选择想考的研究室，横向对比目标，自选研究室、属性和考试年份导出 Excel。 |
| 教授联络 | 在卡片与看板追踪未联系、首封、回复、面试与内诺，保存第一封信草稿、回复要点和跟进日期。 |
| 日程与材料 | 自动汇总明确日期为时间线 / 甘特图，提示同日安排与倒计时；按研究室维护材料进度和待办，右侧汇总准备情况。 |

界面支持桌面与手机布局、浅色 / 深色 / 跟随系统主题，以及页面层级导航。

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

启动本地数据服务：

```sh
pnpm dev:japangrad
```

另开终端启动前端：

```sh
pnpm --filter @vben/web-antd dev --host 127.0.0.1 --port 5666
```

打开 `http://127.0.0.1:5666/japan-grad`。

### 构建与启动

```sh
pnpm build:japangrad
pnpm start:japangrad
```

构建后打开 `http://127.0.0.1:5667/japan-grad`。也可构建内含运行时的 macOS Apple Silicon 软件包，具体方式见[打包说明](apps/web-antd/src/views/japan-grad/README.md#打包)。

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
