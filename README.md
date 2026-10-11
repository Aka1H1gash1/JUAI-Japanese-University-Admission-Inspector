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
| 修考之路 | 直接搜索、按大学筛选并批量选择想考的研究室，横向对比目标，将清单或所选目标导出为 Excel。 |

界面支持桌面与手机布局、浅色 / 深色 / 跟随系统主题，以及页面层级导航。

## 使用流程

1. **整理大学与专攻**：录入所在地、费用、招生要求和历年考试信息。
2. **建立研究室资料**：补充研究方向与老师，整理论文、联系记录和特殊报考要求。
3. **加入修考之路**：在修考之路直接选择研究室，或在研究室点击「想考」。
4. **对比与导出**：勾选目标，比较方向、预算与考试安排，导出 Excel 继续整理。

Excel 包含「研究室对比」「历年考试」「字段说明」三张工作表，涵盖研究方向、老师、QS、地域、费用明细、考试科目与时间、出愿材料、特殊要求及个人备注。考试信息引用所属专攻，研究室额外要求单独记录。

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
