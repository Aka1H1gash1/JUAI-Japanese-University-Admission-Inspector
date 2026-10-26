const defaults = () => ({
  displayName: '',
  email: '',
  school: '',
  major: '',
  education: '',
  language: '',
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
    return row ? JSON.parse(row.data) : { version: 0, profile: defaults() };
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
        const profile = {};
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
        const result = { version: previous.version + 1, profile };
        db.prepare(
          'INSERT INTO workspace_preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        ).run(JSON.stringify(result));
        json(res, result);
        return true;
      }
      fail('不支持此设置操作。', 405);
    },
  };
}
