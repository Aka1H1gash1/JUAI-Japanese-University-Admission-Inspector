// Extend the existing canonical file table and its compatibility view. No second file store.
export function migrateGeneralFiles(db) {
  if (
    db.prepare('SELECT version FROM schema_migrations WHERE version=18').get()
  )
    return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const view = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='view' AND name='documents'",
      )
      .get().sql;
    const trigger = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='documents_delete'",
      )
      .get().sql;
    const owner =
      "CASE WHEN d.owner_major_id IS NOT NULL OR d.question_id IS NOT NULL THEN 'major' ELSE 'professor' END";
    const id =
      'COALESCE(d.owner_major_id,d.owner_professor_id,c.professor_id,q.owner_major_id)';
    if (!view.includes(owner) || !view.includes(id))
      throw new Error('文件视图不符合预期，迁移已停止。');
    db.exec(`DROP VIEW documents;
      ALTER TABLE document_records ADD COLUMN workspace_owner INTEGER CHECK(workspace_owner IS NULL OR workspace_owner=1);
      ALTER TABLE document_records DROP COLUMN valid_owner;
      ALTER TABLE document_records ADD COLUMN valid_owner INTEGER GENERATED ALWAYS AS ((owner_major_id IS NOT NULL)+(owner_professor_id IS NOT NULL)+(owner_experience_id IS NOT NULL)+(question_id IS NOT NULL)+(workspace_owner IS NOT NULL)=1) VIRTUAL CHECK(valid_owner=1);`);
    db.exec(
      view
        .replaceAll(
          owner,
          "CASE WHEN d.workspace_owner=1 THEN 'workspace' WHEN d.owner_major_id IS NOT NULL OR d.question_id IS NOT NULL THEN 'major' ELSE 'professor' END",
        )
        .replaceAll(
          id,
          "COALESCE(d.owner_major_id,d.owner_professor_id,c.professor_id,q.owner_major_id,CASE WHEN d.workspace_owner=1 THEN 'workspace' END)",
        ),
    );
    db.exec(trigger);
    db.exec("INSERT INTO schema_migrations VALUES(18,datetime('now'));COMMIT;");
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
