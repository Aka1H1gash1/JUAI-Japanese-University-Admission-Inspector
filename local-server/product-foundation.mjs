import { randomUUID } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { universityCatalog } from './university-catalog.mjs';

export function migrateProductFoundation(db) {
  if (
    db.prepare('SELECT version FROM schema_migrations WHERE version=17').get()
  )
    return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE admission_batches (
      id TEXT PRIMARY KEY,major_id TEXT NOT NULL REFERENCES majors(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
      admission_year INTEGER CHECK(admission_year IS NULL OR (typeof(admission_year)='integer' AND admission_year BETWEEN 1900 AND 2200)),
      label TEXT NOT NULL,exam_type TEXT NOT NULL,scope TEXT NOT NULL,exam_date TEXT NOT NULL,interview_date TEXT NOT NULL,
      subjects TEXT NOT NULL,materials TEXT NOT NULL,language TEXT NOT NULL,
      consent TEXT NOT NULL CHECK(consent IN ('required','optional','unknown')),source_url TEXT NOT NULL,notes TEXT NOT NULL);
      CREATE INDEX admission_batches_major ON admission_batches(major_id);
      CREATE TABLE lab_membership (
      lab_id TEXT PRIMARY KEY REFERENCES labs(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK(version>0),
      japanese INTEGER CHECK(japanese IS NULL OR (typeof(japanese)='integer' AND japanese>=0)),
      foreign_students INTEGER CHECK(foreign_students IS NULL OR (typeof(foreign_students)='integer' AND foreign_students>=0)),
      chinese INTEGER CHECK(chinese IS NULL OR (typeof(chinese)='integer' AND chinese>=0)),
      source_url TEXT NOT NULL,notes TEXT NOT NULL,
      CHECK(chinese IS NULL OR foreign_students IS NULL OR chinese<=foreign_students));
      CREATE TABLE document_references (
      document_id TEXT NOT NULL REFERENCES document_records(id) ON DELETE RESTRICT,
      batch_id TEXT NOT NULL REFERENCES admission_batches(id) ON DELETE CASCADE,
      PRIMARY KEY(document_id,batch_id));
      INSERT INTO schema_migrations VALUES(17,datetime('now'));`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export async function workspaceBytes(root) {
  let used = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) used += await workspaceBytes(file);
    else if (entry.isFile()) {
      const info = await lstat(file);
      used += info.size;
    }
  }
  return used;
}
export function createProductFoundation({
  db,
  workspace,
  platform,
  fail,
  json,
  jsonBody,
  transaction,
}) {
  const text = (value, max = 4000) => {
    if (typeof value !== 'string' || value.length > max)
      fail('字段格式不正确或内容过长。');
    return value.trim();
  };
  const sourceUrl = (value = '') => {
    const result = text(value, 2048);
    if (result) {
      try {
        if (!['http:', 'https:'].includes(new URL(result).protocol))
          throw new Error('来源协议无效');
      } catch {
        fail('来源网址必须是 HTTP 或 HTTPS 地址。');
      }
    }
    return result;
  };
  const exists = (table, id) => {
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id))
      fail('所属记录不存在。', 404);
  };
  const batchColumns = {
    admissionYear: 'admission_year',
    label: 'label',
    examType: 'exam_type',
    scope: 'scope',
    examDate: 'exam_date',
    interviewDate: 'interview_date',
    subjects: 'subjects',
    materials: 'materials',
    language: 'language',
    consent: 'consent',
    sourceUrl: 'source_url',
    notes: 'notes',
  };
  const batch = (r) => ({
    ...Object.fromEntries(
      Object.entries(batchColumns).map(([field, column]) => [field, r[column]]),
    ),
    id: r.id,
    majorId: r.major_id,
    version: r.version,
    documentIds: db
      .prepare('SELECT document_id FROM document_references WHERE batch_id=?')
      .all(r.id)
      .map((v) => v.document_id),
  });
  const validateBatch = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      fail('请求格式不正确。');
    const result = {};
    for (const [key, max] of Object.entries({
      label: 120,
      examType: 240,
      scope: 4000,
      examDate: 240,
      interviewDate: 240,
      subjects: 2000,
      materials: 8000,
      language: 4000,
      notes: 4000,
    }))
      result[key] = text(input[key] ?? '', max);
    if (!result.label) fail('请填写招生批次名称。');
    result.admissionYear = input.admissionYear ?? null;
    if (
      result.admissionYear !== null &&
      (!Number.isInteger(result.admissionYear) ||
        result.admissionYear < 1900 ||
        result.admissionYear > 2200)
    )
      fail('入学年度应为有效年份或留空。');
    result.consent = input.consent ?? 'unknown';
    if (!['optional', 'required', 'unknown'].includes(result.consent))
      fail('内诺要求应为必须、非必须或未确认。');
    result.sourceUrl = sourceUrl(input.sourceUrl);
    return result;
  };
  const members = (id) => {
    const row = db
      .prepare('SELECT * FROM lab_membership WHERE lab_id=?')
      .get(id);
    const result = row
      ? {
          version: row.version,
          japanese: row.japanese,
          foreign: row.foreign_students,
          chinese: row.chinese,
          sourceUrl: row.source_url,
          notes: row.notes,
        }
      : {
          version: 0,
          japanese: null,
          foreign: null,
          chinese: null,
          sourceUrl: '',
          notes: '',
        };
    return {
      ...result,
      total:
        result.japanese !== null && result.foreign !== null
          ? result.japanese + result.foreign
          : null,
      otherForeign:
        result.foreign !== null && result.chinese !== null
          ? result.foreign - result.chinese
          : null,
    };
  };
  const readInput = async (req) => {
    const input = await jsonBody(req);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      fail('请求格式不正确。');
    return input;
  };
  const saveReferences = (recordId, id, documents) => {
    if (documents === undefined) return;
    if (
      !Array.isArray(documents) ||
      documents.length > 200 ||
      new Set(documents).size !== documents.length
    )
      fail('批次文件引用格式不正确。');
    for (const doc of documents) {
      if (typeof doc !== 'string') fail('文件标识无效。');
      const r = db
        .prepare('SELECT owner_type,owner_id FROM documents WHERE id=?')
        .get(doc);
      if (!r || r.owner_type !== 'major' || r.owner_id !== id)
        fail('批次只能关联本专攻的文件。', 403);
    }
    db.prepare('DELETE FROM document_references WHERE batch_id=?').run(
      recordId,
    );
    for (const doc of documents)
      db.prepare('INSERT INTO document_references VALUES(?,?)').run(
        doc,
        recordId,
      );
  };
  return {
    async storage() {
      if (platform?.storage) return platform.storage();
      const quota = process.env.JAPANGRAD_STORAGE_QUOTA_BYTES
        ? Number(process.env.JAPANGRAD_STORAGE_QUOTA_BYTES)
        : null;
      if (quota !== null && (!Number.isSafeInteger(quota) || quota < 1))
        fail('服务端存储配额配置无效。', 500);
      const used = await workspaceBytes(workspace);
      return {
        quota,
        used,
        remaining: quota === null ? null : Math.max(0, quota - used),
      };
    },
    references(id) {
      return db
        .prepare(
          'SELECT b.id,b.major_id,b.label FROM document_references r JOIN admission_batches b ON b.id=r.batch_id WHERE r.document_id=?',
        )
        .all(id)
        .map((r) => ({
          type: 'admission_batch',
          id: r.id,
          label: r.label,
        }));
    },
    async handle(req, res, route) {
      if (route === '/api/japangrad/catalog' && req.method === 'GET') {
        json(res, { universities: universityCatalog });
        return true;
      }
      const match = route.match(
        /^\/api\/japangrad\/foundation\/(majors|labs)\/([\w-]+)\/(batches|members)(?:\/([\w-]+))?$/,
      );
      if (!match) return false;
      const [, kind, id, resource, recordId] = match;
      if (
        (kind === 'majors') !== (resource === 'batches') ||
        (resource === 'members' && recordId)
      )
        fail('接口不存在。', 404);
      exists(kind, id);
      if (resource === 'members') {
        if (req.method === 'GET') {
          json(res, members(id));
          return true;
        }
        if (req.method !== 'PUT') fail('不支持此操作。', 405);
        const input = await readInput(req);
        const values = ['japanese', 'foreign', 'chinese'].map((key) => {
          const value = input[key] ?? null;
          if (
            value !== null &&
            (!Number.isInteger(value) || value < 0 || value > 1_000_000)
          )
            fail('人数应为非负整数，未知请留空。');
          return value;
        });
        if (values[1] !== null && values[2] !== null && values[2] > values[1])
          fail('中国学生人数不能超过外国学生人数。');
        const notes = text(input.notes ?? '');
        const source = sourceUrl(input.sourceUrl);
        transaction(() => {
          if (input.version !== members(id).version)
            fail('成员数据已更新，请重新读取。', 409);
          db.prepare(
            'INSERT INTO lab_membership VALUES(?,?,?,?,?,?,?) ON CONFLICT(lab_id) DO UPDATE SET version=excluded.version,japanese=excluded.japanese,foreign_students=excluded.foreign_students,chinese=excluded.chinese,source_url=excluded.source_url,notes=excluded.notes',
          ).run(id, input.version + 1, ...values, source, notes);
        });
        json(res, members(id));
        return true;
      }
      if (req.method === 'GET' && !recordId) {
        json(
          res,
          db
            .prepare(
              'SELECT * FROM admission_batches WHERE major_id=? ORDER BY rowid',
            )
            .all(id)
            .map((row) => batch(row)),
        );
        return true;
      }
      if (req.method === 'POST' && !recordId) {
        const input = await readInput(req);
        const data = validateBatch(input);
        const uuid = randomUUID();
        const columns = Object.values(batchColumns);
        const values = Object.keys(batchColumns).map((key) => data[key]);
        transaction(() => {
          db.prepare(
            `INSERT INTO admission_batches(id,major_id,${columns.join(',')}) VALUES(${['?', '?', ...columns.map(() => '?')].join(',')})`,
          ).run(uuid, id, ...values);
          saveReferences(uuid, id, input.documentIds);
        });
        json(
          res,
          batch(
            db.prepare('SELECT * FROM admission_batches WHERE id=?').get(uuid),
          ),
          201,
        );
        return true;
      }
      const current =
        recordId &&
        db
          .prepare('SELECT * FROM admission_batches WHERE id=? AND major_id=?')
          .get(recordId, id);
      if (!current) fail('招生批次不存在。', 404);
      if (req.method === 'GET') {
        json(res, batch(current));
        return true;
      }
      if (!['DELETE', 'PUT'].includes(req.method)) fail('不支持此操作。', 405);
      const input = await readInput(req);
      if (!Number.isInteger(input.version) || input.version < 0)
        fail('请提供有效的批次版本。');
      if (req.method === 'DELETE') {
        if (
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name='application_targets'",
            )
            .get() &&
          db
            .prepare('SELECT 1 FROM application_targets WHERE batch_id=?')
            .get(recordId)
        )
          fail('此批次已被申请目标引用，不能直接删除。', 409);
        transaction(() => {
          const result = db
            .prepare(
              'DELETE FROM admission_batches WHERE id=? AND major_id=? AND version=?',
            )
            .run(recordId, id, input.version);
          if (!result.changes) fail('批次已更新，请重新读取。', 409);
        });
        json(res, { removed: recordId });
        return true;
      }
      const data = validateBatch(input);
      const documents = input.documentIds;
      if (
        documents !== undefined &&
        (!Array.isArray(documents) ||
          documents.length > 200 ||
          new Set(documents).size !== documents.length)
      )
        fail('批次文件引用格式不正确。');
      transaction(() => {
        const result = db
          .prepare(
            `UPDATE admission_batches SET ${Object.values(batchColumns)
              .map((c) => `${c}=?`)
              .join(
                ',',
              )},version=version+1 WHERE id=? AND major_id=? AND version=?`,
          )
          .run(
            ...Object.keys(batchColumns).map((key) => data[key]),
            recordId,
            id,
            input.version,
          );
        if (!result.changes) fail('批次已更新，请重新读取。', 409);
        saveReferences(recordId, id, documents);
      });
      json(
        res,
        batch(
          db
            .prepare('SELECT * FROM admission_batches WHERE id=?')
            .get(recordId),
        ),
      );
      return true;
    },
  };
}
