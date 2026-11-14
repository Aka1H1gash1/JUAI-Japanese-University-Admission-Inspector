# JUAI 1.0 架构与基线审查

## 代码和运行关系

- 共享核心：Vue 3 / Vben / Ant Design Vue，页面在 apps/web-antd/src/views/japan-grad；`router/routes/core.ts` 管理原有实体路由；layout.vue 提供外壳、主题、面包屑、工作区加载和错误。
- 数据流：页面 → explorer store / localApi → `/api/japangrad/*` → local-server/server.mjs 与各 service → SQLite 关系模型/文件目录。store 保留 revision 和实体版本校验。
- 核心模型：university → school → major → lab → professor；exam_records、lab_tasks、时间线、联络、documents、collection_jobs 等通过关系/关联数据读取。workspace_preferences 的个人语言仍为字符串。
- 私有平台：同级 juai-server/server.mjs / platform.mjs 提供注册/登录/邮件验证、会话、用户工作区与配额、密钥保险库、设备连接、导出；shared 子模块固定共享核心版本，不能直接修改子模块副本造成漂移。
- 用户级隔离：平台先验证会话与用户，再派发独立用户工作区核心服务；后续新增 API 必须进入相同隔离边界。公共目录不写入用户偏好。
- 目录：public/university-catalog/catalog.json + credits.json + logos；university-catalog.ts 加载缓存及唯一名称匹配。已有 819 条，不再抓取。

## 页面/公共能力审查

| 区域 | 现有入口 | 主要问题 / 复用方向 |
| --- | --- | --- |
| 大学/研究科 | university.vue / school.vue | 大学招生总览与新职责冲突；保留实体编辑与关联导航，招生归专攻批次 |
| 专攻 | major.vue | 五份招生展示连续堆叠；原型改为批次选择→日期/要求→文件双栏→研究室 |
| 研究室 | research-lab.vue | 重复专攻招生；原型突出介绍/研究方向/成员/教师，申请工具留原版路径可达 |
| 个人 | settings.vue + personal-profile.vue | 已有阅读/编辑分离，但样式独立；接入共享组件和 tokens；动态语言待迁移 |
| 文件 | DocumentArchive / file-manager.vue / documents service | 已有上传、编辑、下载、删除、阅读器，优先复用；普通文件与引用/配额升级待阶段 3/5 |
| 申请/联络 | journey.vue / professor.vue / lab tasks/contact | 现有目标是 lab.wantApply，独立申请目标/材料/邮件工作区待阶段 3/5 |
| AI | collection / major-analysis / ai-management | create_only 核对协议和来源必须保留，不为 UI 原型改变覆盖语义 |
| 视觉 | palette.ts + 多层全局 CSS | 令牌统一接在现有 palette；设计组件限定作用域，防止污染老页面/弹窗 |

## 数据备份与恢复

备份路径位于仓库外：`../git-backups/juai-1.0-phase1-20261115/`。实际备份由现有 `POST /api/japangrad/workspace/backup` 触发，内部 SQLite backup API 生成一致性数据库并 quick_check；副本保存在上述目录，manifest.json 逐文件 SHA-256，同时记录表行数。个人数据库和文件不进入 Git。

代码恢复：先保留当前目录，用 core-before-phase1.bundle clone 到新的恢复目录，再核对 source-before-phase1.tar.gz 清单并解压至恢复目录；working-tree.patch/Git status 是审计辅件，tar 已包含当时未提交源文件，不要重复套用 patch。原本嵌套的 8KB 未跟踪目录保留原地，不参与新代码。

数据恢复：退出本机服务，先备份现态；核验 manifest，检查恢复副本 PRAGMA quick_check 和文件 hash；将完整 workspace 副本放到独立路径，使用匹配版本服务指定 JAPANGRAD_WORKSPACE 启动验证。确认后才切换实际数据路径，不清空原目录。本阶段不需要恢复/切换，且不触碰服务器。

这次数据备份是本地工作区备份；生产最近的备份和固定发布信息仍见私有平台 OPERATIONS.md。阶段 7 部署前需重新做服务器一致性备份，本地备份不能替代它。

## 未提交基线处理

原有目录选择器/校徽资源和此前档案原型是继承工作，已快照保存。阶段 1 提交文档和需求快照；阶段 2 提交原型及其依赖时将继承代码一并收录并明确其状态。不提交 `local-server/vue-vben-admin/` 或原始松散需求文件，不删除它们。私有平台本阶段不变。
