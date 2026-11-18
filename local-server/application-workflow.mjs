import { randomUUID } from 'node:crypto';

import { validPlannerDay } from './planning-fields.mjs';

export const workflowFields = {
  prepare: ['goal', 'requirements'],
  contact: ['firstSentDate', 'followUpDate', 'replySummary'],
  interview: [
    'interviewDate',
    'actualInterviewDate',
    'interviewPreparation',
    'interviewNotes',
  ],
  consent: ['consentDate', 'followUpDate', 'consentOriginal', 'notes'],
  apply: ['submissionDate', 'applicationNumber', 'submissionNotes'],
  exam: ['candidateNumber', 'examLocation', 'examPreparation'],
  result: ['resultDate', 'finalResult', 'enrollmentNotes'],
};
// Explicit development migration. Runtime activation must follow the compatible
// native MySQL migration and verified backup; historical migration19 is unchanged.
export function migrateApplicationWorkflow(db) {
  if (
    db.prepare('SELECT version FROM schema_migrations WHERE version=20').get()
  )
    return;
  if (db.dialect === 'mysql')
    throw new Error(
      'Application workflow requires the explicit native MySQL layout migration.',
    );
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE application_workflows(target_id TEXT PRIMARY KEY REFERENCES application_targets(id) ON DELETE CASCADE,current_stage TEXT,version INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE application_stage_fields(target_id TEXT NOT NULL REFERENCES application_workflows(target_id) ON DELETE CASCADE,stage TEXT NOT NULL,field TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(target_id,stage,field));
 CREATE TABLE application_drafts(id TEXT PRIMARY KEY,target_id TEXT NOT NULL REFERENCES application_targets(id) ON DELETE CASCADE,subject TEXT NOT NULL,body TEXT NOT NULL,recipient TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX application_drafts_target ON application_drafts(target_id);
 CREATE TABLE application_draft_files(draft_id TEXT NOT NULL REFERENCES application_drafts(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES document_records(id) ON DELETE RESTRICT,PRIMARY KEY(draft_id,document_id));
 CREATE TABLE application_mail_files(target_id TEXT NOT NULL REFERENCES application_targets(id) ON DELETE CASCADE,message_id TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES document_records(id) ON DELETE RESTRICT,PRIMARY KEY(target_id,message_id,document_id));
 INSERT INTO schema_migrations VALUES(20,datetime('now'));COMMIT;`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function createApplicationWorkflow({ db, transaction, fail }) {
  const checkTarget = (id) => {
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))
      fail('申请目标无效。', 400);
    const target = db
      .prepare(
        'SELECT t.*,l.major_id FROM application_targets t JOIN labs l ON l.id=t.lab_id WHERE t.id=?',
      )
      .get(id);
    if (!target) fail('申请目标不存在。', 404);
    return target;
  };
  const string = (value, max) => {
    if (typeof value !== 'string' || value.length > max)
      fail('内容格式错误或过长。', 400);
    return value;
  };
  const draft = (targetId, id) => {
    const row = db
      .prepare('SELECT * FROM application_drafts WHERE id=? AND target_id=?')
      .get(id, targetId);
    if (!row) fail('草稿不属于当前目标或已不存在。', 404);
    return row;
  };
  const read = (targetId) => {
    checkTarget(targetId);
    const state = db
      .prepare('SELECT * FROM application_workflows WHERE target_id=?')
      .get(targetId);
    const stages = Object.create(null);
    for (const row of db
      .prepare(
        'SELECT stage,field,value FROM application_stage_fields WHERE target_id=?',
      )
      .all(targetId)) {
      stages[row.stage] ||= {};
      stages[row.stage][row.field] = row.value;
    }
    const drafts = db
      .prepare(
        'SELECT * FROM application_drafts WHERE target_id=? ORDER BY created_at,id',
      )
      .all(targetId)
      .map((row) => ({
        ...row,
        status: 'draft',
        documents: db
          .prepare(
            'SELECT d.data FROM application_draft_files f JOIN documents d ON d.id=f.document_id WHERE f.draft_id=?',
          )
          .all(row.id)
          .map((r) => JSON.parse(r.data)),
        documentIds: db
          .prepare(
            'SELECT document_id FROM application_draft_files WHERE draft_id=? ORDER BY document_id',
          )
          .all(row.id)
          .map((r) => r.document_id),
      }));
    return {
      targetId,
      currentStage: state?.current_stage || null,
      version: state?.version || 0,
      stages,
      drafts,
    };
  };
  return {
    read,
    update(targetId, input) {
      checkTarget(targetId);
      if (
        !input ||
        !Object.hasOwn(workflowFields, input.stage) ||
        !Number.isInteger(input.version) ||
        input.version < 0 ||
        typeof input.makeCurrent !== 'boolean'
      )
        fail('请选择有效阶段与版本。', 400);
      const fields = input.fields ?? {};
      if (!fields || typeof fields !== 'object' || Array.isArray(fields))
        fail('阶段字段格式错误。', 400);
      for (const [key, value] of Object.entries(fields)) {
        if (!workflowFields[input.stage].includes(key))
          fail('字段不属于当前阶段。', 400);
        string(value, 16_000);
        if (key.endsWith('Date') && value && !validPlannerDay(value))
          fail('日期必须是有效的 YYYY-MM-DD。', 400);
      }
      transaction(() => {
        let state = db
          .prepare(
            'SELECT version FROM application_workflows WHERE target_id=?',
          )
          .get(targetId);
        if (!state) {
          if (input.version !== 0) fail('阶段已变化，请重新读取。', 409);
          db.prepare(
            'INSERT INTO application_workflows(target_id,updated_at) VALUES(?,?)',
          ).run(targetId, new Date().toISOString());
          state = { version: 0 };
        }
        if (state.version !== input.version)
          fail('阶段已被其他页面修改，请重新读取。', 409);
        const updated = input.makeCurrent
          ? db
              .prepare(
                'UPDATE application_workflows SET current_stage=?,version=version+1,updated_at=? WHERE target_id=? AND version=?',
              )
              .run(
                input.stage,
                new Date().toISOString(),
                targetId,
                input.version,
              )
          : db
              .prepare(
                'UPDATE application_workflows SET version=version+1,updated_at=? WHERE target_id=? AND version=?',
              )
              .run(new Date().toISOString(), targetId, input.version);
        if (updated.changes !== 1) fail('阶段版本冲突。', 409);
        for (const [key, value] of Object.entries(fields))
          db.prepare(
            'INSERT INTO application_stage_fields VALUES(?,?,?,?) ON CONFLICT(target_id,stage,field) DO UPDATE SET value=excluded.value',
          ).run(targetId, input.stage, key, value);
      });
      return read(targetId);
    },
    saveDraft(targetId, input) {
      const target = checkTarget(targetId);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        fail('草稿格式错误。', 400);
      if (
        input.id !== undefined &&
        (typeof input.id !== 'string' ||
          !/^[\w-]{1,100}$/.test(input.id) ||
          !Number.isInteger(input.version))
      )
        fail('草稿版本格式错误。', 400);
      const body = string(input.body, 100_000);
      const recipient = string(input.recipient, 1000);
      const subject = string(input.subject, 1000);
      const ids = input.documentIds;
      if (
        ids !== undefined &&
        (!Array.isArray(ids) ||
          ids.length > 100 ||
          new Set(ids).size !== ids.length ||
          ids.some(
            (id) => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id),
          ))
      )
        fail('附件列表格式错误。', 400);
      const id = input.id || randomUUID();
      transaction(() => {
        for (const documentId of ids ?? []) {
          const doc = db
            .prepare('SELECT owner_type,owner_id FROM documents WHERE id=?')
            .get(documentId);
          if (
            !doc ||
            !(
              doc.owner_type === 'workspace' ||
              (doc.owner_type === 'major' && doc.owner_id === target.major_id)
            )
          )
            fail('附件不属于个人文件或当前专攻。', 403);
        }
        const now = new Date().toISOString();
        if (input.id) {
          draft(targetId, id);
          const updated = db
            .prepare(
              'UPDATE application_drafts SET subject=?,body=?,recipient=?,version=version+1,updated_at=? WHERE id=? AND target_id=? AND version=?',
            )
            .run(subject, body, recipient, now, id, targetId, input.version);
          if (updated.changes !== 1)
            fail('草稿已变化，请保留内容并重新读取。', 409);
        } else
          db.prepare(
            'INSERT INTO application_drafts(id,target_id,subject,body,recipient,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
          ).run(id, targetId, subject, body, recipient, now, now);
        if (ids === undefined) return;
        db.prepare('DELETE FROM application_draft_files WHERE draft_id=?').run(
          id,
        );
        for (const documentId of ids ?? [])
          db.prepare('INSERT INTO application_draft_files VALUES(?,?)').run(
            id,
            documentId,
          );
      });
      return { ...read(targetId), savedDraftId: id };
    },
    deleteDraft(targetId, id, version) {
      checkTarget(targetId);
      draft(targetId, id);
      if (
        db
          .prepare(
            'DELETE FROM application_drafts WHERE id=? AND target_id=? AND version=?',
          )
          .run(id, targetId, version).changes !== 1
      )
        fail('草稿已变化，请重新读取。', 409);
      return read(targetId);
    },
  };
}
