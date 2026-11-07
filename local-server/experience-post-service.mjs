import { randomUUID } from 'node:crypto';

import {
  officialSearchProvider,
  searchOfficialWeb,
} from './collection-search.mjs';
import { collectionUrl } from './collection-web.mjs';

export function experienceQuery(names) {
  return [
    ...`${[...names.filter(Boolean).join(' ')].slice(0, 70).join('')} (受験体験記 OR 合格体験記 OR 经验 OR experience)`,
  ]
    .slice(0, 128)
    .join('');
}

export async function findExperiencePosts({ ai, selection, names, signal }) {
  selection ||= ai.resolve('web_collection');
  if (!officialSearchProvider(selection.provider))
    throw new Error(
      '请在 AI 管理中选择支持联网搜索的 DeepSeek 或 OpenAI 官方连接。',
    );
  return searchOfficialWeb({
    config: selection.provider,
    apiKey: ai.credentials(selection.provider),
    query: experienceQuery(names),
    signal,
    sourcePreference: 'experience',
  });
}

export function createExperiencePostService({
  db,
  snapshot,
  transaction,
  fail,
  json,
  jsonBody,
  ai,
}) {
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version=15').get()
  )
    transaction(() =>
      db.exec(`
      CREATE TABLE experience_posts (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        major_id TEXT REFERENCES majors(id) ON DELETE SET NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        language TEXT NOT NULL,
        year TEXT NOT NULL,
        notes TEXT NOT NULL,
        origin TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(school_id,url)
      );
      CREATE INDEX experience_posts_school ON experience_posts(school_id,updated_at);
      INSERT INTO schema_migrations VALUES(15,datetime('now'));
    `),
    );
  const decode = (r) => ({
    id: r.id,
    schoolId: r.school_id,
    majorId: r.major_id || '',
    url: r.url,
    title: r.title,
    author: r.author,
    language: r.language,
    year: r.year,
    notes: r.notes,
    origin: r.origin,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  function scope(schoolId, majorId = '') {
    const data = snapshot().data;
    const school = data.schools.find((s) => s.id === schoolId);
    if (!school) fail('研究科已不存在。', 404);
    const major = majorId
      ? data.majors.find((m) => m.id === majorId && m.schoolId === schoolId)
      : null;
    if (majorId && !major) fail('请选择该研究科下的专攻。', 400);
    const university = data.universities.find(
      (u) => u.id === school.universityId,
    );
    return { school, major, university };
  }
  function normalize(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b))
      fail('经验帖格式不正确。');
    const value = {};
    for (const [key, max] of Object.entries({
      schoolId: 100,
      majorId: 100,
      title: 500,
      url: 4096,
      author: 240,
      language: 120,
      year: 4,
      notes: 8000,
    })) {
      const text = b[key] ?? '';
      if (typeof text !== 'string' || text.length > max)
        fail(`经验帖字段 ${key} 格式不正确或过长。`);
      value[key] = text.trim();
    }
    scope(value.schoolId, value.majorId);
    if (!value.title) fail('请填写帖子标题。');
    if (value.year && !/^\d{4}$/.test(value.year))
      fail('年份请填写四位数字，未知可留空。');
    try {
      value.url = collectionUrl(value.url);
    } catch (error) {
      fail(error.message, 400);
    }
    return value;
  }
  let searching = false;
  return {
    async handle(req, res, route) {
      if (!route.startsWith('/api/japangrad/experience-posts')) return false;
      const url = new URL(req.url, 'http://localhost');
      if (
        route === '/api/japangrad/experience-posts/search' &&
        req.method === 'POST'
      ) {
        const b = await jsonBody(req);
        const { school, major, university } = scope(b.schoolId, b.majorId);
        if (searching) fail('已有经验帖搜索进行中，请稍后再试。', 409);
        searching = true;
        const controller = new AbortController();
        const abort = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on('close', abort);
        try {
          json(
            res,
            await findExperiencePosts({
              ai,
              names: [university?.name, school.name, major?.name],
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(45_000),
              ]),
            }),
          );
        } finally {
          searching = false;
          res.off('close', abort);
        }
        return true;
      }
      if (
        route === '/api/japangrad/experience-posts/summary' &&
        req.method === 'GET'
      ) {
        const data = snapshot().data;
        const items =
          data.universities.length > 0
            ? db
                .prepare(
                  'SELECT s.university_id AS universityId, count(*) AS total, count(DISTINCT p.school_id) AS schoolCount FROM experience_posts p JOIN schools s ON s.id=p.school_id GROUP BY s.university_id',
                )
                .all()
            : [];
        json(res, { items });
        return true;
      }
      if (route === '/api/japangrad/experience-posts' && req.method === 'GET') {
        const schoolId = url.searchParams.get('schoolId') || '';
        const universityId = url.searchParams.get('universityId') || '';
        const majorId = url.searchParams.get('majorId') || '';
        const data = snapshot().data;
        if (schoolId) {
          const selected = scope(schoolId, majorId);
          if (universityId && selected.school.universityId !== universityId)
            fail('研究科不属于所选大学。');
        } else {
          if (!data.universities.some((u) => u.id === universityId))
            fail('大学已不存在。', 404);
          if (
            majorId &&
            !data.majors.some(
              (m) =>
                m.id === majorId &&
                data.schools.some(
                  (s) => s.id === m.schoolId && s.universityId === universityId,
                ),
            )
          )
            fail('专攻不属于所选大学。');
        }
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const pageSize = Number(url.searchParams.get('pageSize') || 12);
        if (
          !Number.isSafeInteger(page) ||
          page > 100_000 ||
          ![12, 24, 48].includes(pageSize)
        )
          fail('分页参数不正确。');
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (q.length > 240) fail('搜索词过长。');
        // instr treats %, _ and quotes literally; all terms are bound values.
        const where = `${schoolId ? 'school_id=?' : 'school_id IN (SELECT id FROM schools WHERE university_id=?)'}${majorId ? ' AND major_id=?' : ''}${q ? " AND instr(lower(title||' '||author||' '||notes||' '||url||' '||language),?)>0" : ''}`;
        const args = [
          schoolId || universityId,
          ...(majorId ? [majorId] : []),
          ...(q ? [q] : []),
        ];
        const total = db
          .prepare(`SELECT count(*) AS n FROM experience_posts WHERE ${where}`)
          .get(...args).n;
        const effectivePage = Math.min(
          page,
          Math.max(1, Math.ceil(total / pageSize)),
        );
        const rows = db
          .prepare(
            `SELECT * FROM experience_posts WHERE ${where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`,
          )
          .all(...args, pageSize, (effectivePage - 1) * pageSize);
        json(res, {
          items: rows.map((row) => decode(row)),
          total,
          page: effectivePage,
          pageSize,
        });
        return true;
      }
      if (
        route === '/api/japangrad/experience-posts' &&
        req.method === 'POST'
      ) {
        const b = await jsonBody(req);
        const v = normalize(b);
        transaction(() => {
          const existing = db
            .prepare(
              'SELECT * FROM experience_posts WHERE school_id=? AND url=?',
            )
            .get(v.schoolId, v.url);
          if (existing) {
            json(res, { ...decode(existing), duplicate: true });
            return;
          }
          if (
            db
              .prepare(
                'SELECT count(*) AS n FROM experience_posts WHERE school_id=?',
              )
              .get(v.schoolId).n >= 2000
          )
            fail('本研究科最多保存2000篇经验帖。');
          const id = randomUUID();
          const at = new Date().toISOString();
          db.prepare(
            'INSERT INTO experience_posts VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)',
          ).run(
            id,
            v.schoolId,
            v.majorId || null,
            v.url,
            v.title,
            v.author,
            v.language,
            v.year,
            v.notes,
            b.origin === 'search' ? 'search' : 'manual',
            at,
            at,
          );
          json(
            res,
            decode(
              db.prepare('SELECT * FROM experience_posts WHERE id=?').get(id),
            ),
            201,
          );
        });
        return true;
      }
      const match = route.match(
        /^\/api\/japangrad\/experience-posts\/([\w-]+)$/,
      );
      if (match && ['DELETE', 'PUT'].includes(req.method)) {
        const b = await jsonBody(req);
        transaction(() => {
          const old = db
            .prepare('SELECT * FROM experience_posts WHERE id=?')
            .get(match[1]);
          if (!old) fail('经验帖已不存在。', 404);
          if (b.version !== old.version)
            fail('经验帖已被更新，请刷新后重试。', 409);
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM experience_posts WHERE id=?').run(old.id);
            json(res, { id: old.id });
            return;
          }
          const v = normalize(b);
          if (v.schoolId !== old.school_id) fail('不能把帖子移到其他研究科。');
          if (
            db
              .prepare(
                'SELECT id FROM experience_posts WHERE school_id=? AND url=? AND id<>?',
              )
              .get(v.schoolId, v.url, old.id)
          )
            fail('本研究科已有相同链接。', 409);
          db.prepare(
            'UPDATE experience_posts SET major_id=?,url=?,title=?,author=?,language=?,year=?,notes=?,version=version+1,updated_at=? WHERE id=?',
          ).run(
            v.majorId || null,
            v.url,
            v.title,
            v.author,
            v.language,
            v.year,
            v.notes,
            new Date().toISOString(),
            old.id,
          );
          json(
            res,
            decode(
              db
                .prepare('SELECT * FROM experience_posts WHERE id=?')
                .get(old.id),
            ),
          );
        });
        return true;
      }
      fail('经验帖接口不存在。', 404);
    },
  };
}

// Runs after official fields have been verified. Candidates never enter the
// admissions model context or become business requirements automatically.
export async function collectExperienceCandidates({
  job,
  ai,
  selection,
  signal,
  onChange = () => {},
  search = findExperiencePosts,
}) {
  if (
    job.searchMode !== 'auto' ||
    job.searchExperiences === false ||
    job.experienceSearch
  )
    return;
  const names = ['university', 'school', 'major']
    .map(
      (kind) =>
        job.draft?.[kind]?.find((f) => f.field === 'name')?.value ||
        (!job.requestedProgram || kind === 'university'
          ? job.target?.[kind]
          : ''),
    )
    .filter((v) => typeof v === 'string' && v.trim());
  if (names.length === 0) return;
  job.experienceSearch = {
    status: 'searching',
    query: experienceQuery(names),
    results: [],
    error: '',
  };
  onChange();
  try {
    const result = await search({ ai, selection, names, signal });
    signal.throwIfAborted();
    job.experienceSearch = { ...result, status: 'complete', error: '' };
  } catch (error) {
    job.experienceSearch.status = 'failed';
    job.experienceSearch.error = error.message;
    if (signal.aborted) throw error;
  } finally {
    onChange();
  }
}
