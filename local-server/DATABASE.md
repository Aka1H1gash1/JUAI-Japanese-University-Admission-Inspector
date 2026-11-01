# 工作区数据库（schema 14）

使用 SQLite、WAL、外键和事务。前端数据协议仍为 `version: 2`；它与数据库迁移版本 `14` 是两个独立概念。

## 当前业务表

| 表 | 主键／关联 | 内容 |
|---|---|---|
| `regions` / `prefectures` | 地域名称；都道府县关联地域 | 地理字典 |
| `universities` | `id`；都道府县或地域外键 | 大学、排名、费用、寮信息 |
| `schools` | `id`；`university_id` | 研究科 |
| `majors` | `id`；`school_id` | 专攻、出愿要求 |
| `labs` | `id`；`major_id` | 研究室、想考标记、主要联络老师 |
| `professors` | `id`；`lab_id` | 老师基本资料 |
| `exam_records` | `(major_id, id)` | 历年考试记录 |
| `lab_tasks` | `(lab_id, id)` | 材料、待办、进度、导入来源 |
| `lab_timelines` | `lab_id` | 日程开关和兼容版本信息 |
| `timeline_events` | `(lab_id, id)` | 日程节点、日期、来源 |
| `timeline_hidden_sources` | `(lab_id, position)` | 隐藏的自动节点来源 |
| `contact_experiences` | `experience_id`；`professor_id` | 当前与历史联络经历 |
| `contact_interview_questions` | `(experience_id, id)` | 面试问答 |
| `contact_stage_history` | `(experience_id, position)` | 联络阶段历史 |
| `major_analysis_history` | `(major_id, position)` | 已采纳分析的历史来源记录 |
| `document_records` | `id`；专攻、老师、经历或过去问四选一关联 | 附件元数据与过去问／答案关联 |
| `mail_messages` | `id`；`experience_id` | 邮件正文及后续行动 |
| `special_programs` | `id`；最深一层所属档案外键 | 特殊入学项目 |
| `workspace_state` | 固定 `id=1` | 初始化状态、全局 revision |
| `workspace_migration_reports` | 迁移版本 | 迁移计数与原库备份位置 |

大学、研究科、专攻、研究室、老师、材料、日程和联络记录的已知字段使用独立列及子表，核心实体不再保存在一个 JSON blob 中。金额列使用整数日元，前端继续接收字符串；前导零按数值标准化。

## 范式与完整性

- 老师只存所属研究室，不重复保存专攻 ID 和研究室名称。API 中的 `majorId`、`laboratory` 通过关联生成。
- 都道府县已确定地域时，大学不再同时保存一份地域关联。
- 邮件、面试问答与阶段记录只关联经历，老师通过经历取得。
- 文件可归属于专攻、老师、一段经历或一份过去问。关联经历时，老师通过经历取得；答案关联过去问时，所属专攻和年份从过去问取得，避免重复保存。
- 特殊项目只保存最深的一层所属档案；上级档案和名称通过关联取得。删除关联档案时，项目转为独立记录，保留院校文字和原关联快照。
- 主要联络老师与研究室使用组合外键约束，保证老师确实属于该研究室。
- 主外键、级联清理、每位老师唯一当前经历、材料进度范围等约束由数据库执行；字段长度、日期有效性及用户操作规则仍由 API 校验。

这些业务表按第三范式的目标消除重复属性和传递依赖。AI 原始结果、审计前后快照、阅读编辑器状态等仍作为 JSON 文档保存；不将历史快照解释为当前主数据。`major_analysis_history.fields` 是历史证据载荷。

`present_json` 只保存旧协议中出现过的属性名称，区分“省略”和“填写为空”；`extras_json` 保留未建模的旧扩展与来源元数据。已建模字段不会再复制进 `extras_json`。今后新增核心业务字段应扩展列／子表，避免重新把核心数据塞进扩展 JSON。

## 接口兼容与增量保存

- `GET /api/japangrad/workspace` 从关系表组装原有树状协议，同时返回 `entityRevisions`。
- `PUT /api/japangrad/workspace` 保留作为兼容入口。全局 revision 条件写入与子表同步处于同一事务；内部仅修改实际变化的行。
- `PATCH /api/japangrad/workspace/labs/:id` 接收 `{revision, patch}`，允许 `wantApply`、`tasks`、`timeline`，使用该研究室的行 revision 检查冲突。未知字段会被拒绝。
- 前端的想考开关、单条待办／材料新增修改与删除使用 PATCH；遇到 409 拉取最新资料后重放一次。旧服务未返回行 revision 时仍可回退 PUT。
- 复杂编辑、整体导入仍可使用兼容 PUT。`timeline.version`、`tasksVersion`、`examHistoryVersion` 暂作旧界面兼容计数，写入冲突由全局／行 revision 的条件更新处理。
- `documents`、`messages`、`special_admission_programs` 是兼容视图，投影旧元数据协议，真实数据分别位于 `document_records`、`mail_messages`、`special_programs`。所有实际写入经统一存储层执行。

## 自动升级与恢复

首次用新版打开旧工作区时，在任何旧迁移或回填修改前，通过 SQLite backup API 和文件复制创建完整备份，校验备份数据库后再继续。备份位于工作区同级的 `工作区名.backups`，文件夹名含 `schema14`，`JUAI_BACKUP.json` 中记录完成状态。

随后在一个事务中拆表、迁入资料、核对回读数据、切换文档与批注外键，并执行 `PRAGMA foreign_key_check`。成功后才写入 schema 14 标记。校验失败会回滚本次关系化迁移，备份仍然保留；再次启动不会重复迁移已完成的数据库。

`workspace_data_legacy`、`documents_legacy`、`messages_legacy`、`special_admission_programs_legacy` 是只读迁移存档，插入、更新和删除都会被拒绝。业务代码不再读写这些表。它们用于追溯迁移前的值，不是第二份实时数据。

恢复时先彻底停止 JUAI，再用完整备份替换工作区文件夹。不要把单独的旧 JSON 或 `workspace.db-wal` 文件混入新库；旧版本程序需要配套恢复升级前的工作区。

## 检查示例

```sql
PRAGMA quick_check;
PRAGMA foreign_key_check;
SELECT version, applied_at FROM schema_migrations ORDER BY version;

SELECT u.name AS university, s.name AS school, m.name AS major,
       l.name AS lab, p.name AS professor
FROM universities u
JOIN schools s ON s.university_id = u.id
JOIN majors m ON m.school_id = s.id
JOIN labs l ON l.major_id = m.id
LEFT JOIN professors p ON p.lab_id = l.id;

SELECT l.name, t.title, t.kind, t.progress, t.due_date
FROM lab_tasks t JOIN labs l ON l.id = t.lab_id;
```

回归测试见 `workspace-relational.test.mjs`、`workspace-write.test.mjs`、`experience-stage.test.mjs` 等，覆盖自动备份、重复升级、失败回滚、历史资料／批注／文件保留、关系约束、同版本并发、独立研究室保存与旧页面字段保全。
