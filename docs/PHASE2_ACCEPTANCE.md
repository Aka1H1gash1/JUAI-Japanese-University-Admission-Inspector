# 阶段 2：设计原型验收

2026-11-15。仅阶段 1–2，不代表问题 0–14 的全量业务验收。

## 本地查看

- 开发入口：http://127.0.0.1:5188/japan-grad/design
- 个人档案：`/japan-grad/settings`
- 专攻/研究室：原有实体路径后加 `?design=1`。预览入口自动列出当前工作区真实实体，未写死大学名或 ID。
- 原型直接使用原 store 与 localApi。默认专攻/研究室页面保持可用；原型提供返回入口，原有材料、日程、历史与原件不删除。
- 开发服务在 apps/web-antd 下启动：`../../node_modules/.bin/vite --mode workspace --host 127.0.0.1 --port 5188`。沿用 Vite proxy 的本地服务 5667；首次启动可用项目原 `dev:japangrad`，现有服务不重复启动。

## 实际改动

| 区域 | 原型行为 |
| --- | --- |
| 规范 | palette.ts 保持唯一色板；tokens.css 集中间距、字号、宽度、圆角和语义色；原型作用域覆盖旧衬线标题 |
| 公共组件 | PageHeading、ContentSection、DateMarker、FileList、EmptyState；文件/日期/空状态在真实页面使用 |
| 个人档案 | 身份/申请目标主区，教育/语言并列，研究兴趣下方；阅读默认，独立草稿编辑，取消不写入；共用分区组件；学历不在多个区域重复展示 |
| 专攻 | 当前考试记录选择器、日期、四类要求；日期/科目仅取选中记录，材料/语言明确标为专攻通用，未确认内诺不默认「非必须」；文件与过去问并列；历史折叠；研究室底部 |
| 文件交互 | FileList 读取真实文件、格式/大小/年份，复用阅读/下载路由；上传/编辑/删除通过原 DocumentArchive 抽屉；加载失败明确报错并可重试 |
| 研究室 | 方向/介绍与成员区非对称并列；无人数时不画假比例；教师紧凑列表显示姓名/职称/方向/已有主页并复用编辑；无招生摘要重复展示 |
| 原型导航 | ResearchLabCollection/Card 的可选 designPreview、ResearchLabTeachers 的可选 compact 默认关闭；仅原型采用新视图，不破坏老页面 |
| 继承工作 | 目录资源、university-catalog.ts、entity-editor 和 university-logo 是开始时已有的目录接入，纳入版本保存；没有把它们宣称为问题 0 完整实现 |

## 浏览器验收记录

独立 Chrome 会话 `juai-v1-design`，真实本地工作区；桌面 1440×900（早期截图 1440×1000）与手机 390×844。

- 个人/专攻/研究室均检查手机 document.scrollWidth=390，与 innerWidth 一致。
- 专攻→研究室的原型链接保持 `design=1`；所属专攻链接正确返回原型；原版入口保留。
- 专攻编辑抽屉打开既有出愿信息与考试记录编辑器，取消未提交草稿；文件管理入口显示真实文件及原有新增/编辑/阅读入口。
- 文件请求拦截失败：2 个错误面板、0 个文件列表；解除拦截并重试后恢复 2 条真实文件，错误面板为 0。失败不伪装成空数据。
- 深色主题实际渲染；原型无招生数据的成员区显示暂无可靠人数，未生成 0 或比例图。
- 无 console page errors；网络失败为专门注入的验收，不是未解决异常。
- 保存测试仅在 `git-backups` 的工作区副本复制到临时目录后执行，服务端口 5674。真实 PUT 返回 200，刷新保留保存结果；注入失败时读值仍为已存值、弹窗保留草稿并显示 Failed to fetch；随后取消关闭。
- 390px 长文本表单：pageWidth=390，modalWidth=366，bodyWidth=328，取消/保存按钮存在。草稿未提交。
- 原工作区 51 张业务/历史表逐行与阶段 1 的一致性备份对比完全一致；未插入示例大学、成绩、人数或招生资料。

## 检查

- `pnpm -F @vben/web-antd typecheck` 通过。
- `pnpm build:japangrad` 通过；最终用已有便携包 Node 24.21.0 运行，符合项目 Node 24 范围。
- 新增/修改原型、路由、公共组件的 ESLint / Stylelint 通过。
- 现有 workspace-routing、explorer、collection-jobs：3 个测试文件，11 个测试通过。
- presenter 定向断言 10 项通过：闰年日期、无效日期、文字/区间保持非精确日期、空记录、选择记录后不借用其他记录科目。
- 两个 Git bundle 均 verify 通过；大学目录 819 条、ID 全部唯一。没有重新抓取。
- 第二阶段提交沿用全套 oxlint/oxfmt/eslint/stylelint/check:type/commitlint hooks；以提交成功为最终门槛，不绕过检查。

## 截图

保存在仓库外侧的私有忽略目录 `../../juai-server/artifacts/juai-1.0-phase2/`：

- index-desktop.png：预览入口。
- profile-desktop.png / profile-mobile.png：个人档案。
- major-desktop.png / major-mobile.png / major-dark.png：专攻阅读布局与双栏文件。
- lab-desktop.png / lab-mobile.png / lab-dark.png：研究室与紧凑教师列表。

本地现有资料包含「123」「1」等原有测试命名，截图如实保留，没有用虚构的完整院校/研究数据替换。隔离副本的保存测试文本不用于产品效果截图。

## 本次未交付业务

- 招生批次/类别/范围、内诺三态持久化、成员人数与约束、动态语言日期、目录稳定标识/AI 匹配，仍待阶段 3。
- 原文件管理抽屉的分组/编辑布局、大学/研究科/教师全页、修考工作台/材料 ZIP/邮件 AI、导航隐藏/账号安全/文件配额，按阶段 3–6 实施。
- 没有新增数据库迁移或 API，没有调用真实付费 AI，没有服务器发布；阶段 7 再实现同源构建和本地/服务器一致。
