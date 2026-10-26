import { randomUUID } from 'node:crypto';

import { validPlannerDay } from './planning-fields.mjs';

const limits = {
  name: 240,
  category: 120,
  institutionName: 240,
  universityId: 100,
  schoolId: 100,
  majorId: 100,
  degree: 40,
  language: 240,
  intake: 160,
  summary: 2000,
  applicationStart: 10,
  applicationEnd: 10,
  assessmentDate: 10,
  resultDate: 10,
  eligibility: 8000,
  languageRequirements: 4000,
  applicationMaterials: 8000,
  assessment: 4000,
  fees: 4000,
  scholarships: 4000,
  website: 2048,
  notes: 8000,
};
const statuses = new Set([
  'admitted',
  'applied',
  'closed',
  'preparing',
  'researching',
]);
const degrees = new Set([
  '',
  'bachelor',
  'doctor',
  'master',
  'other',
  'research_student',
]);
const dates = [
  'applicationStart',
  'applicationEnd',
  'assessmentDate',
  'resultDate',
];
export const specialProgramFields = Object.entries({
  name: '项目名称',
  category: '项目类型',
  institutionName: '所属院校',
  degree: '学位',
  language: '授课语言',
  intake: '入学时间',
  summary: '项目简介',
  applicationStart: '出愿开始',
  applicationEnd: '出愿截止',
  assessmentDate: '考核日期',
  resultDate: '结果公布',
  eligibility: '申请资格',
  languageRequirements: '语言要求',
  applicationMaterials: '出愿材料',
  assessment: '选拔方式与考核',
  fees: '费用',
  scholarships: '奖学金与资助',
  website: '项目官网',
  notes: '备注',
}).map(([key, label]) => [key, label, limits[key]]);
const validId = (s) => typeof s === 'string' && /^[\w-]{1,100}$/.test(s);
const summaryKeys = [
  'id',
  'name',
  'category',
  'institutionName',
  'universityId',
  'schoolId',
  'majorId',
  'universityName',
  'schoolName',
  'majorName',
  'degree',
  'language',
  'intake',
  'summary',
  'applicationStart',
  'applicationEnd',
  'assessmentDate',
  'resultDate',
  'status',
  'favorite',
  'version',
  'createdAt',
  'updatedAt',
];

export function createSpecialProgramService({
  db,
  snapshot,
  transaction,
  fail,
  json,
  jsonBody,
}) {
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version=12').get()
  )
    transaction(() =>
      db.exec(`
      CREATE TABLE special_admission_programs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (12, datetime('now'));
    `),
    );
  const get = (id) => {
    if (!validId(id)) fail('特殊入学项目 ID 不合法。');
    const row = db
      .prepare('SELECT data FROM special_admission_programs WHERE id=?')
      .get(id);
    if (!row) fail('此特殊入学项目已不存在。', 404);
    return JSON.parse(row.data);
  };
  function normalize(input, previous) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      fail('请填写项目资料。');
    const value = {};
    for (const [key, max] of Object.entries(limits)) {
      const field = input[key] ?? '';
      if (typeof field !== 'string' || field.length > max)
        fail(`项目字段 ${key} 格式不正确或内容过长。`);
      value[key] = field.trim();
    }
    if (!value.name) fail('请填写项目名称。');
    value.category ||= '其他';
    if (
      !statuses.has(input.status) ||
      !degrees.has(value.degree) ||
      typeof input.favorite !== 'boolean'
    )
      fail('项目状态、学位或关注设置不正确。');
    for (const key of dates)
      if (value[key] && !validPlannerDay(value[key])) fail('请选择有效日期。');
    if (
      value.applicationStart &&
      value.applicationEnd &&
      value.applicationStart > value.applicationEnd
    )
      fail('出愿截止日期不能早于开始日期。');
    if (value.website) {
      let url;
      try {
        url = new URL(value.website);
      } catch {
        fail('项目官网请填写完整的 HTTP / HTTPS 网址。');
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        fail('项目官网请填写不含账号密码的 HTTP / HTTPS 网址。');
      value.website = url.href;
    }
    const data = snapshot().data;
    const university = data.universities.find(
      (e) => e.id === value.universityId,
    );
    const school = data.schools.find((e) => e.id === value.schoolId);
    const major = data.majors.find((e) => e.id === value.majorId);
    if (value.universityId && (!validId(value.universityId) || !university))
      fail('关联大学已不存在，请重新选择或取消关联。', 409);
    if (value.schoolId && (!school || school.universityId !== university?.id))
      fail('请选择该大学下的研究科。');
    if (value.majorId && (!major || major.schoolId !== school?.id))
      fail('请选择该研究科下的专攻。');
    return {
      ...value,
      status: input.status,
      favorite: input.favorite,
      universityName: university?.name || '',
      schoolName: school?.name || '',
      majorName: major?.name || '',
      id: previous?.id || randomUUID(),
      version: (previous?.version || 0) + 1,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    exists(id) {
      return !!db
        .prepare('SELECT id FROM special_admission_programs WHERE id=?')
        .get(id);
    },
    createFromCollection(input) {
      if (
        db.prepare('SELECT COUNT(*) AS n FROM special_admission_programs').get()
          .n >= 2000
      )
        fail('特殊入学项目已达到数量上限。');
      const record = normalize({
        ...input,
        status: 'researching',
        favorite: false,
      });
      db.prepare('INSERT INTO special_admission_programs VALUES (?,?)').run(
        record.id,
        JSON.stringify(record),
      );
      return record;
    },
    async handle(req, res, route) {
      const base = '/api/japangrad/special-programs';
      if (route !== base && !route.startsWith(`${base}/`)) return false;
      if (route === base) {
        if (req.method === 'GET') {
          const rows = db
            .prepare(
              'SELECT data FROM special_admission_programs ORDER BY rowid DESC',
            )
            .all()
            .map((r) => JSON.parse(r.data))
            .map((r) => Object.fromEntries(summaryKeys.map((k) => [k, r[k]])));
          json(res, rows);
          return true;
        }
        if (req.method === 'POST') {
          const input = await jsonBody(req);
          if (
            db
              .prepare('SELECT COUNT(*) AS n FROM special_admission_programs')
              .get().n >= 2000
          )
            fail('特殊入学项目已达到 2000 条，请先整理不需要的记录。');
          const record = normalize(input);
          db.prepare('INSERT INTO special_admission_programs VALUES (?,?)').run(
            record.id,
            JSON.stringify(record),
          );
          json(res, record, 201);
          return true;
        }
      } else {
        const id = route.slice(base.length + 1);
        const previous = get(id);
        if (req.method === 'GET') {
          json(res, previous);
          return true;
        }
        if (['DELETE', 'PUT'].includes(req.method)) {
          const input = await jsonBody(req);
          // Re-read after the request body await; another page may have saved meanwhile.
          const latest = get(id);
          if (input?.version !== latest.version)
            fail('项目已被其他页面更新，请重新打开后操作。', 409);
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM special_admission_programs WHERE id=?').run(
              id,
            );
            json(res, { deleted: true });
            return true;
          }
          const record = normalize(input, latest);
          db.prepare(
            'UPDATE special_admission_programs SET data=? WHERE id=?',
          ).run(JSON.stringify(record), id);
          json(res, record);
          return true;
        }
      }
      fail('不支持此特殊入学项目操作。', 405);
    },
  };
}
