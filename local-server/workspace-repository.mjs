import { isDeepStrictEqual } from 'node:util';

import geography from './japan-geography.json' with { type: 'json' };
import {
  migrateProjectedRecords,
  saveProjectedRecord,
} from './workspace-records.mjs';
import {
  CHILDREN,
  columnSql,
  CORE,
  decode,
  encode,
  snake,
} from './workspace-schema.mjs';

export const RELATIONAL_SCHEMA_VERSION = 14;
const collections = Object.keys(CORE);
const tableSpecs = { ...CORE, ...CHILDREN };
const keyOf = (spec) => {
  if (spec.key) return spec.key;
  if (spec.singleton) return [spec.owner];
  if (spec.owner) return [spec.owner, 'id'];
  return ['id'];
};
const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && !Array.isArray(item) && typeof item === 'object'
      ? Object.fromEntries(
          Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const canonical = (value) => {
  const data = structuredClone(value);
  for (const university of data.universities)
    for (const field of [
      'admissionFee',
      'annualTuition',
      'monthlyRent',
      'monthlyLivingExpenses',
    ])
      if (university[field] !== undefined && university[field] !== '')
        university[field] = String(Number(university[field]));
  const labs = new Map((data.labs ?? []).map((lab) => [lab.id, lab]));
  for (const person of data.professors) {
    const lab = labs.get(person.labId);
    if (lab) {
      person.majorId = lab.majorId;
      person.laboratory = lab.name;
    }
  }
  return data;
};
export const hasRelationalWorkspace = (db) =>
  !!db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get(RELATIONAL_SCHEMA_VERSION);

function atomic(db, name, work) {
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = work();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
    throw error;
  }
}

function createTables(db) {
  db.exec(`CREATE TABLE workspace_state (
    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0),
    initialized INTEGER NOT NULL CHECK(initialized IN (0,1)), data_extras_json TEXT NOT NULL CHECK(json_valid(data_extras_json))
  );
  CREATE TABLE regions (name TEXT PRIMARY KEY NOT NULL);
  CREATE TABLE prefectures (name TEXT PRIMARY KEY NOT NULL, region_name TEXT NOT NULL REFERENCES regions(name), japanese_name TEXT NOT NULL);
  CREATE TABLE workspace_migration_reports (version INTEGER PRIMARY KEY, report_json TEXT NOT NULL CHECK(json_valid(report_json)));`);
  for (const [name, spec] of Object.entries(tableSpecs)) {
    const key = keyOf(spec);
    const extra = [];
    if (spec.owner)
      extra.push(
        `${spec.owner} TEXT NOT NULL${spec.parent ? ` REFERENCES ${spec.parent} ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED` : ''}`,
      );
    if (
      name !== 'contact_experiences' &&
      !spec.singleton &&
      name !== 'timeline_hidden_sources'
    )
      extra.push(`id TEXT${key.includes('id') ? ' NOT NULL' : ''}`);
    if (name === 'contact_experiences')
      extra.push('is_current INTEGER NOT NULL CHECK(is_current IN (0,1))');
    if (name === 'universities')
      extra.push(
        'region_name TEXT REFERENCES regions(name)',
        'prefecture_name TEXT REFERENCES prefectures(name)',
        'CHECK(region_name IS NULL OR prefecture_name IS NULL)',
      );
    const columns = Object.entries(spec.columns).map(([field, type]) => {
      let sql = columnSql(field, type);
      if (
        (CORE[name] && field === 'name') ||
        (name === 'contact_experiences' && field === 'experienceId')
      )
        sql += ' NOT NULL';
      if (spec.refs?.[field])
        sql += ` NOT NULL REFERENCES ${spec.refs[field]} ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`;
      return sql;
    });
    if (name === 'lab_tasks')
      extra.push(
        "CHECK(kind IN ('material','todo'))",
        'CHECK(title IS NOT NULL AND length(trim(title))>0)',
        "CHECK(progress IS NOT NULL AND typeof(progress)='integer' AND progress BETWEEN 0 AND 100)",
        "CHECK(progress_before_done IS NULL OR (typeof(progress_before_done)='integer' AND progress_before_done BETWEEN 0 AND 99))",
      );
    if (name === 'exam_records')
      extra.push(
        "CHECK(year IS NOT NULL AND year GLOB '[0-9][0-9][0-9][0-9]' AND CAST(year AS INTEGER) BETWEEN 1900 AND 2200)",
      );
    if (name === 'timeline_events')
      extra.push('CHECK(start IS NOT NULL AND end IS NOT NULL AND end>=start)');
    if (name === 'labs')
      extra.push(
        'FOREIGN KEY(id, main_professor_id) REFERENCES professors(lab_id, id) DEFERRABLE INITIALLY DEFERRED',
      );
    if (name === 'professors') extra.push('UNIQUE(lab_id, id)');
    if (name === 'timeline_hidden_sources') spec.key = ['lab_id', 'position'];
    const actualKey = keyOf(spec);
    // Table constraints go after every column definition.
    const constraints = extra.filter((part) =>
      /^(?:CHECK|FOREIGN KEY|UNIQUE)/.test(part),
    );
    const ownColumns = extra.filter((part) => !constraints.includes(part));
    db.exec(
      `CREATE TABLE ${name} (${[
        ...ownColumns,
        ...columns,
        'position INTEGER NOT NULL',
        'revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)',
        'present_json TEXT NOT NULL CHECK(json_valid(present_json))',
        'extras_json TEXT NOT NULL CHECK(json_valid(extras_json))',
        ...constraints,
        `PRIMARY KEY(${actualKey.join(',')})`,
      ].join(',')})`,
    );
    for (const parent of [
      spec.owner,
      ...Object.keys(spec.refs ?? {}).map((name) => snake(name)),
    ].filter(Boolean))
      db.exec(`CREATE INDEX ${name}_${parent}_idx ON ${name}(${parent})`);
  }
  db.exec(`CREATE UNIQUE INDEX contact_one_current ON contact_experiences(professor_id) WHERE is_current=1;
    CREATE INDEX universities_prefecture_idx ON universities(prefecture_name);
    CREATE INDEX lab_tasks_due_idx ON lab_tasks(due_date, kind);
    CREATE INDEX timeline_events_dates_idx ON timeline_events(start, end);`);
  for (const region of geography) {
    db.prepare('INSERT INTO regions VALUES (?)').run(region.name);
    for (const [name, japanese] of region.prefectures)
      db.prepare('INSERT INTO prefectures VALUES (?,?,?)').run(
        name,
        region.name,
        japanese,
      );
  }
}

function flatten(data) {
  const result = Object.fromEntries(
    Object.keys(tableSpecs).map((name) => [name, []]),
  );
  for (const [name, spec] of Object.entries(CORE)) {
    data[name].forEach((object, position) => {
      const row = { id: object.id, position, ...encode(spec, object) };
      if (name === 'universities') {
        row.prefecture_name = object.prefecture || null;
        row.region_name = row.prefecture_name ? null : object.region || null;
      }
      if (name === 'labs') row.main_professor_id ||= null;
      result[name].push(row);
    });
  }
  const add = (table, object, owner, position, extra = {}) => {
    const spec = CHILDREN[table];
    const row = {
      [spec.owner]: owner,
      position,
      ...encode(spec, object),
      ...extra,
    };
    if (
      !spec.singleton &&
      table !== 'contact_experiences' &&
      table !== 'timeline_hidden_sources'
    )
      row.id = object.id ?? null;
    result[table].push(row);
  };
  for (const major of data.majors) {
    (major.examHistory ?? []).forEach((record, index) =>
      add('exam_records', record, major.id, index),
    );
    (major.analysisHistory ?? []).forEach((record, index) =>
      add('major_analysis_history', record, major.id, index),
    );
  }
  for (const lab of data.labs ?? []) {
    (lab.tasks ?? []).forEach((task, index) =>
      add('lab_tasks', task, lab.id, index),
    );
    if (!lab.timeline) continue;
    add('lab_timelines', lab.timeline, lab.id, 0);
    lab.timeline.events.forEach((event, index) =>
      add('timeline_events', event, lab.id, index),
    );
    lab.timeline.hiddenSources.forEach((source, index) =>
      add('timeline_hidden_sources', { source }, lab.id, index),
    );
  }
  for (const person of data.professors) {
    const cases = [person.contact, ...(person.contactHistory ?? [])].filter(
      Boolean,
    );
    for (const [index, contact] of cases.entries()) {
      const current = contact === person.contact;
      add('contact_experiences', contact, person.id, current ? -1 : index, {
        is_current: Number(current),
      });
      (contact.interviewQA ?? []).forEach((record, i) =>
        add('contact_interview_questions', record, contact.experienceId, i),
      );
      (contact.stageHistory ?? []).forEach((record, i) =>
        add('contact_stage_history', record, contact.experienceId, i),
      );
    }
  }
  return result;
}

export function createWorkspaceRepository({
  db,
  workspace,
  fail,
  validateExplorer,
}) {
  function read() {
    const state = db.prepare('SELECT * FROM workspace_state WHERE id=1').get();
    const rows = Object.fromEntries(
      Object.keys(tableSpecs).map((name) => [
        name,
        db.prepare(`SELECT * FROM ${name} ORDER BY position`).all(),
      ]),
    );
    const data = { ...JSON.parse(state.data_extras_json), version: 2 };
    const byId = {};
    const entityRevisions = {};
    for (const [name, spec] of Object.entries(CORE)) {
      data[name] = rows[name].map((row) => decode(spec, row));
      byId[name] = new Map(data[name].map((object) => [object.id, object]));
      entityRevisions[name] = Object.fromEntries(
        rows[name].map((row) => [row.id, row.revision]),
      );
    }
    const regions = new Map(
      db
        .prepare('SELECT name, region_name FROM prefectures')
        .all()
        .map((row) => [row.name, row.region_name]),
    );
    for (const row of rows.universities) {
      const object = byId.universities.get(row.id);
      const present = new Set(JSON.parse(row.present_json));
      if (present.has('region'))
        object.region = row.prefecture_name
          ? regions.get(row.prefecture_name)
          : (row.region_name ?? '');
      if (present.has('prefecture'))
        object.prefecture = row.prefecture_name ?? '';
    }
    for (const person of data.professors) {
      const lab = byId.labs.get(person.labId);
      person.majorId = lab.majorId;
      person.laboratory = lab.name;
    }
    const presence = Object.fromEntries(
      collections.map((name) => [
        name,
        new Map(
          rows[name].map((row) => [
            row.id,
            new Set(JSON.parse(row.present_json)),
          ]),
        ),
      ]),
    );
    const present = ([name, id], field) => presence[name].get(id)?.has(field);
    // Group the child rows once; assembling a workspace never issues per-entity queries.
    const grouped = {};
    for (const [table, spec] of Object.entries(CHILDREN)) {
      grouped[table] = new Map();
      for (const row of rows[table]) {
        const key = row[spec.owner];
        if (!grouped[table].has(key)) grouped[table].set(key, []);
        grouped[table].get(key).push({ object: decode(spec, row), row });
      }
    }
    const child = (table, owner) =>
      (grouped[table].get(owner) ?? []).map((entry) => entry.object);
    for (const major of data.majors) {
      if (present(['majors', major.id], 'examHistory'))
        major.examHistory = child('exam_records', major.id);
      if (present(['majors', major.id], 'analysisHistory'))
        major.analysisHistory = child('major_analysis_history', major.id);
    }
    for (const lab of data.labs) {
      if (present(['labs', lab.id], 'tasks'))
        lab.tasks = child('lab_tasks', lab.id);
      const timeline = child('lab_timelines', lab.id)[0];
      if (timeline) {
        timeline.events = child('timeline_events', lab.id);
        timeline.hiddenSources = child('timeline_hidden_sources', lab.id).map(
          (record) => record.source,
        );
        lab.timeline = timeline;
      }
    }
    for (const person of data.professors) {
      const entries = grouped.contact_experiences.get(person.id) ?? [];
      for (const { object: contact, row } of entries) {
        const key = contact.experienceId;
        const keys = new Set(JSON.parse(row.present_json));
        if (keys.has('interviewQA'))
          contact.interviewQA = child('contact_interview_questions', key);
        if (keys.has('stageHistory'))
          contact.stageHistory = child('contact_stage_history', key);
        if (row.is_current) person.contact = contact;
      }
      if (present(['professors', person.id], 'contactHistory'))
        person.contactHistory = entries
          .filter((entry) => !entry.row.is_current)
          .map((entry) => entry.object);
    }
    return {
      initialized: !!state.initialized,
      revision: state.revision,
      workspace,
      data,
      entityRevisions,
    };
  }
  function snapshot() {
    return atomic(db, 'workspace_read', read);
  }
  function replace(input, expectedRevision) {
    const data = canonical(input);
    validateExplorer(data);
    return atomic(db, 'workspace_replace', () => {
      const changed = db
        .prepare(
          'UPDATE workspace_state SET revision=revision+1, initialized=1 WHERE id=1 AND revision=?',
        )
        .run(expectedRevision).changes;
      if (!changed) fail('工作区已在其他页面更新，请重新读取后保存。', 409);
      const previous = read().data;
      const wanted = flatten(data);
      const desiredParents = Object.fromEntries(
        ['universities', 'schools', 'majors'].map((name) => [
          name,
          new Set(data[name].map((item) => item.id)),
        ]),
      );
      const removingParent = Object.entries(desiredParents).some(
        ([name, ids]) => previous[name].some((item) => !ids.has(item.id)),
      );
      if (removingParent) {
        for (const row of db
          .prepare('SELECT data FROM special_admission_programs')
          .all()) {
          const program = JSON.parse(row.data);
          if (
            (program.universityId &&
              !desiredParents.universities.has(program.universityId)) ||
            (program.schoolId &&
              !desiredParents.schools.has(program.schoolId)) ||
            (program.majorId && !desiredParents.majors.has(program.majorId))
          ) {
            program.legacyAffiliation = Object.fromEntries(
              [
                'universityId',
                'schoolId',
                'majorId',
                'universityName',
                'schoolName',
                'majorName',
              ].map((key) => [key, program[key]]),
            );
            program.institutionName ||= program.universityName;
            program.universityId = program.schoolId = program.majorId = '';
            program.version++;
            program.updatedAt = new Date().toISOString();
            saveProjectedRecord(db, 'special_programs', program);
          }
        }
      }
      const old = Object.fromEntries(
        Object.keys(tableSpecs).map((name) => [
          name,
          db.prepare(`SELECT * FROM ${name}`).all(),
        ]),
      );
      // Delete only missing records, in reverse dependency order. Deferred foreign
      // keys cover circular main-professor links and moves within one transaction.
      for (const [table, spec] of Object.entries(tableSpecs).toReversed()) {
        const key = keyOf(spec);
        const keys = new Set(
          wanted[table].map((row) => stable(key.map((field) => row[field]))),
        );
        const remove = db.prepare(
          `DELETE FROM ${table} WHERE ${key.map((field) => `${field}=?`).join(' AND ')}`,
        );
        for (const row of old[table])
          if (!keys.has(stable(key.map((field) => row[field]))))
            remove.run(...key.map((field) => row[field]));
      }
      // A new current experience must not collide with the old current row's
      // partial unique index while that row moves into the archive.
      for (const row of wanted.contact_experiences.filter(
        (entry) => entry.is_current,
      ))
        db.prepare(
          'UPDATE contact_experiences SET is_current=0 WHERE professor_id=? AND experience_id<>? AND is_current=1',
        ).run(row.professor_id, row.experience_id);
      for (const [table, spec] of Object.entries(tableSpecs)) {
        const key = keyOf(spec);
        const previousRows = new Map(
          old[table].map((row) => [
            stable(key.map((field) => row[field])),
            row,
          ]),
        );
        const before = CORE[table]
          ? new Map(
              previous[table].map((object) => [object.id, stable(object)]),
            )
          : null;
        const after = CORE[table]
          ? new Map(data[table].map((object) => [object.id, stable(object)]))
          : null;
        for (const row of wanted[table]) {
          if (table === 'universities' && row.region_name)
            db.prepare('INSERT OR IGNORE INTO regions VALUES (?)').run(
              row.region_name,
            );
          const retained = previousRows.get(
            stable(key.map((field) => row[field])),
          );
          const same =
            retained &&
            Object.entries(row).every(
              ([field, value]) => retained[field] === value,
            );
          if (same && (!before || before.get(row.id) === after.get(row.id)))
            continue;
          const columns = Object.keys(row);
          db.prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(${key.join(',')}) DO UPDATE SET ${columns
              .filter((field) => !key.includes(field))
              .map((field) => `${field}=excluded.${field}`)
              .join(',')},revision=${table}.revision+1`,
          ).run(...columns.map((field) => row[field]));
        }
      }
      // A major moved to another school must not carry an old post's affiliation.
      if (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='experience_posts'",
          )
          .get()
      )
        db.prepare(
          'UPDATE experience_posts SET major_id=NULL,version=version+1,updated_at=? WHERE major_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM majors m WHERE m.id=experience_posts.major_id AND m.school_id=experience_posts.school_id)',
        ).run(new Date().toISOString());
      db.prepare(
        'UPDATE workspace_state SET data_extras_json=? WHERE id=1',
      ).run(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(data).filter(
              ([key]) => key !== 'version' && !collections.includes(key),
            ),
          ),
        ),
      );
      return expectedRevision + 1;
    });
  }
  return {
    snapshot,
    replace,
    revision: () =>
      db.prepare('SELECT revision FROM workspace_state WHERE id=1').get()
        .revision,
    saveDocument: (record) => saveProjectedRecord(db, 'documents', record),
    saveMessage: (record) => saveProjectedRecord(db, 'messages', record),
    saveProgram: (record) =>
      saveProjectedRecord(db, 'special_programs', record),
  };
}

export function migrateWorkspaceRepository({
  db,
  workspace,
  fail,
  validateExplorer,
  normalize,
  backupPath,
}) {
  return atomic(db, 'normalize_workspace', () => {
    if (hasRelationalWorkspace(db))
      return createWorkspaceRepository({
        db,
        workspace,
        fail,
        validateExplorer,
      });
    const legacy = db.prepare('SELECT * FROM workspace_data WHERE id=1').get();
    createTables(db);
    db.prepare('INSERT INTO workspace_state VALUES (1,?,?,?)').run(
      legacy?.revision ?? 0,
      0,
      '{}',
    );
    const repository = createWorkspaceRepository({
      db,
      workspace,
      fail,
      validateExplorer,
    });
    let data;
    if (legacy) {
      data = canonical(normalize(JSON.parse(legacy.data)));
      repository.replace(data, legacy.revision);
      if (!isDeepStrictEqual(repository.snapshot().data, data))
        throw new Error('迁移前后数据不一致，数据库已回滚，请保留原始工作区。');
    }
    migrateProjectedRecords(db);
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0)
      throw new Error('迁移后的外键校验未通过，原数据库已保留。');
    db.exec('ALTER TABLE workspace_data RENAME TO workspace_data_legacy');
    for (const table of [
      'workspace_data_legacy',
      'messages_legacy',
      'documents_legacy',
      'special_admission_programs_legacy',
    ])
      for (const action of ['INSERT', 'UPDATE', 'DELETE'])
        db.exec(
          `CREATE TRIGGER ${table}_readonly_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Legacy archive is read-only'); END`,
        );
    const report = {
      version: RELATIONAL_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
      counts: Object.fromEntries(
        Object.keys(tableSpecs).map((table) => [
          table,
          db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
        ]),
      ),
      legacyRevision: legacy?.revision ?? 0,
      backupPath: backupPath ?? '',
    };
    db.prepare('INSERT INTO workspace_migration_reports VALUES (?,?)').run(
      RELATIONAL_SCHEMA_VERSION,
      JSON.stringify(report),
    );
    db.prepare("INSERT INTO schema_migrations VALUES (?,datetime('now'))").run(
      RELATIONAL_SCHEMA_VERSION,
    );
    return repository;
  });
}
