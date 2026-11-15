import { randomUUID } from 'node:crypto';
const defaults = () => ({
  displayName: '',
  email: '',
  school: '',
  major: '',
  education: '',
  language: '',
  languageRecords: [],
  interests: '',
  notes: '',
  admissionYear: new Date().getFullYear() + 1,
  identity: '修士・外国人留学生',
});
const limits = {
  displayName: 160,
  email: 240,
  school: 240,
  major: 240,
  education: 240,
  language: 1000,
  interests: 2000,
  notes: 4000,
  identity: 240,
};
export function createWorkspaceSettingsService({
  db,
  transaction,
  fail,
  json,
  jsonBody,
}) {
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version=13').get()
  )
    transaction(() =>
      db.exec(`
    CREATE TABLE workspace_preferences (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (13,datetime('now'));
  `),
    );
  const read = () => {
    const row = db
      .prepare('SELECT data FROM workspace_preferences WHERE id=1')
      .get();
    const value = row
      ? JSON.parse(row.data)
      : { version: 0, profile: defaults() };
    value.profile.languageRecords ??= [];
    return value;
  };
  return {
    async handle(req, res, route) {
      if (route !== '/api/japangrad/settings') return false;
      if (req.method === 'GET') {
        json(res, read());
        return true;
      }
      if (req.method === 'PUT') {
        const input = await jsonBody(req);
        const previous = read();
        if (input?.version !== previous.version)
          fail('设置已被其他页面更新，请刷新后再保存。', 409);
        const profile = { ...previous.profile };
        for (const [key, max] of Object.entries(limits)) {
          const value = input.profile?.[key];
          if (typeof value !== 'string' || value.length > max)
            fail('个人信息有字段格式不正确或内容过长。');
          profile[key] = value.trim();
        }
        const year = input.profile?.admissionYear;
        if (!Number.isInteger(year) || year < 1900 || year > 2200)
          fail('请填写有效的默认入学年份。');
        profile.admissionYear = year;
        if (input.profile?.languageRecords !== undefined) {
          const rows = input.profile.languageRecords;
          if (!Array.isArray(rows) || rows.length > 100)
            fail('语言成绩记录最多 100 条。');
          const ids = new Set();
          profile.languageRecords = rows.map((row) => {
            if (
              !row ||
              typeof row !== 'object' ||
              typeof row.type !== 'string' ||
              !row.type.trim() ||
              row.type.length > 100 ||
              typeof row.result !== 'string' ||
              !row.result.trim() ||
              row.result.length > 240
            )
              fail('请填写考试名称和成绩。');
            const id = row.id || randomUUID();
            if (
              typeof id !== 'string' ||
              !/^[\w-]{1,100}$/.test(id) ||
              ids.has(id)
            )
              fail('语言成绩标识重复或无效。');
            ids.add(id);
            const date = row.date ?? '';
            if (
              typeof date !== 'string' ||
              (date &&
                (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                  Number.isNaN(Date.parse(date)) ||
                  new Date(date).toISOString().slice(0, 10) !== date))
            )
              fail('考试日期无效。');
            return {
              id,
              type: row.type.trim(),
              result: row.result.trim(),
              date,
            };
          });
        }
        const result = { version: previous.version + 1, profile };
        transaction(() => {
          if (read().version !== input.version)
            fail('设置已更新，请刷新。', 409);
          db.prepare(
            'INSERT INTO workspace_preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          ).run(JSON.stringify(result));
        });
        json(res, result);
        return true;
      }
      fail('不支持此设置操作。', 405);
    },
  };
}
