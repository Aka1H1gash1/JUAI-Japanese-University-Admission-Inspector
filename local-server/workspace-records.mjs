import {
  columnSql,
  DOCUMENT,
  encode,
  jsonProjection,
  MESSAGE,
  PROGRAM,
} from './workspace-schema.mjs';

const specs = {
  document_records: DOCUMENT,
  mail_messages: MESSAGE,
  special_programs: PROGRAM,
};

export function saveProjectedRecord(
  db,
  table,
  record,
  { insertOnly = false } = {},
) {
  if (table === 'documents') table = 'document_records';
  if (table === 'messages') table = 'mail_messages';
  const spec = specs[table];
  const row = { id: record.id, ...encode(spec, record) };
  if (table === 'document_records') {
    row.owner_major_id = record.ownerType === 'major' ? record.ownerId : null;
    row.owner_professor_id =
      record.ownerType === 'professor' && !record.experienceId
        ? record.ownerId
        : null;
    row.owner_experience_id =
      record.ownerType === 'professor' ? record.experienceId || null : null;
    if (row.owner_experience_id) {
      const owner = db
        .prepare(
          'SELECT professor_id FROM contact_experiences WHERE experience_id=?',
        )
        .get(row.owner_experience_id);
      if (!owner || owner.professor_id !== record.ownerId)
        throw new Error('文件的老师与考学经历不匹配。');
    }
    row.question_id ||= null;
    if (row.question_id) {
      row.owner_major_id = null;
      row.owner_professor_id = null;
      row.owner_experience_id = null;
      row.year = null;
    }
  }
  if (table === 'mail_messages') {
    const owner = db
      .prepare(
        'SELECT professor_id FROM contact_experiences WHERE experience_id=?',
      )
      .get(record.experienceId);
    if (!owner || owner.professor_id !== record.professorId)
      throw new Error('邮件的老师与考学经历不匹配。');
  }
  if (table === 'special_programs') {
    row.major_id = record.majorId || null;
    row.school_id = row.major_id ? null : record.schoolId || null;
    row.university_id =
      row.major_id || row.school_id ? null : record.universityId || null;
  }
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})${
      insertOnly
        ? ''
        : ` ON CONFLICT(id) DO UPDATE SET ${columns
            .filter((field) => field !== 'id')
            .map((field) => `${field}=excluded.${field}`)
            .join(',')}`
    }`,
  ).run(...columns.map((field) => row[field]));
}

function typedTable(db, table, spec, foreign = {}) {
  db.exec(
    `CREATE TABLE ${table} (id TEXT PRIMARY KEY NOT NULL,${Object.entries(
      spec.columns,
    )
      .map(
        ([name, type]) =>
          columnSql(name, type) + (foreign[name] ? ` ${foreign[name]}` : ''),
      )
      .join(
        ',',
      )},present_json TEXT NOT NULL CHECK(json_valid(present_json)),extras_json TEXT NOT NULL CHECK(json_valid(extras_json)))`,
  );
}

function migrateDocuments(db) {
  const documents = db
    .prepare('SELECT * FROM documents')
    .all()
    .map((row) => ({
      ...JSON.parse(row.data),
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
    }));
  typedTable(db, 'document_records', DOCUMENT, {
    questionId:
      'REFERENCES document_records(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED',
  });
  db.exec(`ALTER TABLE document_records ADD COLUMN owner_major_id TEXT REFERENCES majors(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE document_records ADD COLUMN owner_professor_id TEXT REFERENCES professors(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE document_records ADD COLUMN owner_experience_id TEXT REFERENCES contact_experiences(experience_id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE document_records ADD COLUMN valid_owner INTEGER GENERATED ALWAYS AS ((owner_major_id IS NOT NULL)+(owner_professor_id IS NOT NULL)+(owner_experience_id IS NOT NULL)+(question_id IS NOT NULL)=1) VIRTUAL CHECK(valid_owner=1);`);
  for (const record of documents)
    saveProjectedRecord(db, 'document_records', record);
  db.exec('ALTER TABLE documents RENAME TO documents_legacy');
  // Reader rows retain their bytes and IDs, but reference the canonical table
  // instead of the legacy JSON archive or the compatibility view.
  for (const [table, columns, definition] of [
    [
      'document_reader_states',
      'document_id,data',
      'document_id TEXT PRIMARY KEY REFERENCES document_records(id) ON DELETE CASCADE,data TEXT NOT NULL',
    ],
    [
      'document_annotations',
      'id,document_id,data',
      'id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES document_records(id) ON DELETE CASCADE,data TEXT NOT NULL',
    ],
    [
      'document_reader_text',
      'document_id,sha256,parser_version,data',
      'document_id TEXT NOT NULL REFERENCES document_records(id) ON DELETE CASCADE,sha256 TEXT NOT NULL,parser_version TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(document_id,sha256,parser_version)',
    ],
  ]) {
    db.exec(
      `CREATE TABLE ${table}_normalized (${definition}); INSERT INTO ${table}_normalized (${columns}) SELECT ${columns} FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_normalized RENAME TO ${table}`,
    );
  }
  db.exec(`CREATE INDEX document_annotations_document ON document_annotations(document_id);
    CREATE INDEX document_records_major_idx ON document_records(owner_major_id);
    CREATE INDEX document_records_professor_idx ON document_records(owner_professor_id);
    CREATE INDEX document_records_experience_idx ON document_records(owner_experience_id);
    CREATE VIEW documents AS SELECT d.id,
      CASE WHEN d.owner_major_id IS NOT NULL OR d.question_id IS NOT NULL THEN 'major' ELSE 'professor' END AS owner_type,
      COALESCE(d.owner_major_id,d.owner_professor_id,c.professor_id,q.owner_major_id) AS owner_id,
      ${jsonProjection(
        DOCUMENT,
        {
          ownerType:
            "CASE WHEN d.owner_major_id IS NOT NULL OR d.question_id IS NOT NULL THEN 'major' ELSE 'professor' END",
          ownerId:
            'COALESCE(d.owner_major_id,d.owner_professor_id,c.professor_id,q.owner_major_id)',
          year: 'COALESCE(d.year,q.year)',
          questionId: `CASE WHEN instr(d.present_json,'"questionId"')>0 THEN COALESCE(d.question_id,'') END`,
          experienceId: `CASE WHEN instr(d.present_json,'"experienceId"')>0 THEN COALESCE(d.owner_experience_id,'') END`,
        },
        'd.',
      )} AS data FROM document_records d LEFT JOIN contact_experiences c ON c.experience_id=d.owner_experience_id LEFT JOIN document_records q ON q.id=d.question_id;
    CREATE TRIGGER documents_delete INSTEAD OF DELETE ON documents BEGIN DELETE FROM document_records WHERE id=OLD.id; END;`);
}

export function migrateProjectedRecords(db) {
  migrateDocuments(db);
  const messages = db
    .prepare('SELECT * FROM messages')
    .all()
    .map((row) => ({
      ...JSON.parse(row.data),
      id: row.id,
      professorId: row.professor_id,
    }));
  db.exec('ALTER TABLE messages RENAME TO messages_legacy');
  typedTable(db, 'mail_messages', MESSAGE, {
    experienceId:
      'NOT NULL REFERENCES contact_experiences(experience_id) DEFERRABLE INITIALLY DEFERRED',
  });
  for (const record of messages) {
    record.experienceId ||= db
      .prepare(
        'SELECT experience_id FROM contact_experiences WHERE professor_id=? AND is_current=1',
      )
      .get(record.professorId)?.experience_id;
    saveProjectedRecord(db, 'mail_messages', record);
  }
  db.exec(`CREATE INDEX mail_messages_experience_idx ON mail_messages(experience_id);
    CREATE VIEW messages AS SELECT m.id,c.professor_id,${jsonProjection(MESSAGE, { professorId: 'c.professor_id' }, 'm.')} AS data FROM mail_messages m JOIN contact_experiences c ON c.experience_id=m.experience_id;
    CREATE TRIGGER messages_delete INSTEAD OF DELETE ON messages BEGIN DELETE FROM mail_messages WHERE id=OLD.id; END;`);

  const programs = db
    .prepare('SELECT data FROM special_admission_programs')
    .all()
    .map((row) => JSON.parse(row.data));
  db.exec(
    'ALTER TABLE special_admission_programs RENAME TO special_admission_programs_legacy',
  );
  typedTable(db, 'special_programs', PROGRAM);
  for (const [name, parent] of [
    ['university_id', 'universities'],
    ['school_id', 'schools'],
    ['major_id', 'majors'],
  ]) {
    db.exec(
      `ALTER TABLE special_programs ADD COLUMN ${name} TEXT REFERENCES ${parent}(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED`,
    );
    db.exec(
      `CREATE INDEX special_programs_${name}_idx ON special_programs(${name})`,
    );
  }
  db.exec(
    'ALTER TABLE special_programs ADD COLUMN valid_affiliation INTEGER GENERATED ALWAYS AS ((university_id IS NOT NULL)+(school_id IS NOT NULL)+(major_id IS NOT NULL)<=1) VIRTUAL CHECK(valid_affiliation=1)',
  );
  for (const record of programs) {
    const retained = { ...record };
    for (const [key, table] of [
      ['majorId', 'majors'],
      ['schoolId', 'schools'],
      ['universityId', 'universities'],
    ])
      if (
        record[key] &&
        !db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(record[key])
      ) {
        retained.legacyAffiliation = {
          universityId: record.universityId,
          schoolId: record.schoolId,
          majorId: record.majorId,
          universityName: record.universityName,
          schoolName: record.schoolName,
          majorName: record.majorName,
        };
        retained[key] = '';
        retained.institutionName ||= record.universityName || '';
      }
    saveProjectedRecord(db, 'special_programs', retained);
  }
  db.exec(`CREATE VIEW special_admission_programs AS SELECT p.rowid AS rowid,p.id,${jsonProjection(
    PROGRAM,
    {
      universityId: "COALESCE(u.id,'')",
      schoolId: "COALESCE(s.id,'')",
      majorId: "COALESCE(m.id,'')",
      universityName: "COALESCE(u.name,'')",
      schoolName: "COALESCE(s.name,'')",
      majorName: "COALESCE(m.name,'')",
    },
    'p.',
  )} AS data FROM special_programs p LEFT JOIN majors m ON m.id=p.major_id LEFT JOIN schools s ON s.id=COALESCE(p.school_id,m.school_id) LEFT JOIN universities u ON u.id=COALESCE(p.university_id,s.university_id);
    CREATE TRIGGER special_programs_delete INSTEAD OF DELETE ON special_admission_programs BEGIN DELETE FROM special_programs WHERE id=OLD.id; END;`);
}
