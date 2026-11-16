import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
// Offline compatibility conversion for an online personal export. No MySQL server required.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { createLocalApp } from './server.mjs';
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
export async function importMySQLExport(source, target) {
  source = path.resolve(source);
  target = path.resolve(target);
  if (existsSync(target))
    throw new Error('目标目录已存在，请选择新的工作区目录。');
  if (
    target === source ||
    target.startsWith(source + path.sep) ||
    source.startsWith(target + path.sep)
  )
    throw new Error('导出目录与目标目录必须独立。');
  const snapshot = JSON.parse(
    await readFile(path.join(source, 'MYSQL_WORKSPACE.json'), 'utf8'),
  );
  if (
    snapshot.format !== 'juai-mysql-snapshot' ||
    snapshot.version !== 1 ||
    snapshot.kind !== 'workspace' ||
    snapshot.businessSchema !== 19
  )
    throw new Error('不支持的MySQL个人导出格式。');
  const temporary = `${target}.partial-${randomUUID()}`;
  await mkdir(temporary, { recursive: true, mode: 0o700 });
  try {
    const app = await createLocalApp({ workspace: temporary });
    app.dispose();
    const db = new DatabaseSync(path.join(temporary, 'workspace.db'));
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      if (
        tables.toSorted((a, b) => a.localeCompare(b)).join(',') !==
        Object.keys(snapshot.tables || {})
          .toSorted((a, b) => a.localeCompare(b))
          .join(',')
      )
        throw new Error('导出表结构与本地版本不一致。');
      const triggers = db
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%Legacy archive is read-only%'",
        )
        .all();
      db.exec('PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE');
      try {
        for (const trigger of triggers)
          db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
        for (const table of tables) db.exec(`DELETE FROM ${quote(table)}`);
        for (const table of tables) {
          const info = db.prepare(`PRAGMA table_xinfo(${quote(table)})`).all();
          const columns = info.filter((c) => !c.hidden).map((c) => c.name);
          const allowed = new Set(info.map((c) => c.name));
          const statement = db.prepare(
            `INSERT INTO ${quote(table)} (${columns.map((column) => quote(column)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          );
          for (const row of snapshot.tables[table]) {
            if (!row || Object.keys(row).some((key) => !allowed.has(key)))
              throw new Error('导出包含无效字段。');
            if (
              table === 'document_records' &&
              row.path &&
              (path.isAbsolute(row.path) ||
                path
                  .relative(temporary, path.resolve(temporary, row.path))
                  .startsWith('..'))
            )
              throw new Error('文件路径超出工作区。');
            statement.run(...columns.map((column) => row[column]));
          }
        }
        for (const trigger of triggers) db.exec(trigger.sql);
        if (db.prepare('PRAGMA foreign_key_check').all().length > 0)
          throw new Error('导出中的关联记录不完整。');
        db.exec('COMMIT;PRAGMA foreign_keys=ON');
        if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
          throw new Error('转换后数据库完整性校验失败。');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      db.close();
    }
    await cp(source, temporary, {
      recursive: true,
      filter: (file) =>
        ![
          'EXPORT.json',
          'MYSQL_WORKSPACE.json',
          'MYSQL_WORKSPACE_LINK.json',
          'workspace.db',
          'workspace.db-shm',
          'workspace.db-wal',
        ].includes(path.relative(source, file)),
    });
    await writeFile(
      path.join(temporary, 'MYSQL_IMPORT.json'),
      JSON.stringify({
        format: 1,
        importedAt: new Date().toISOString(),
        sourceFormat: snapshot.format,
      }),
      { mode: 0o600 },
    );
    await rename(temporary, target);
    return { workspace: target, schema: 19, converted: true };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target)
    throw new Error(
      'Usage: node local-server/import-mysql-export.mjs EXPORT_FOLDER NEW_WORKSPACE_FOLDER',
    );
  process.stdout.write(
    `${JSON.stringify(await importMySQLExport(source, target))}\n`,
  );
}
