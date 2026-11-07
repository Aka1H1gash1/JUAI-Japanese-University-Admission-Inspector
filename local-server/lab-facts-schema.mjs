/** Additive migration: unknown student composition stays unset. */
export function migrateLabFacts(db) {
  if (
    !db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='labs'",
      )
      .get()
  )
    return;
  if (
    db.prepare('SELECT version FROM schema_migrations WHERE version=16').get()
  )
    return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(labs)')
        .all()
        .map((r) => r.name),
    );
    for (const column of [
      'foreign_student_status',
      'foreign_student_source',
      'foreign_student_notes',
    ])
      if (!columns.has(column))
        db.exec(`ALTER TABLE labs ADD COLUMN ${column} TEXT`);
    db.exec("INSERT INTO schema_migrations VALUES(16,datetime('now'));COMMIT;");
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
