import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone offline export compatibility tests. */
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { importMySQLExport } from './import-mysql-export.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'juai-export-convert-'));
  const source = `${root}/export`;
  const original = `${root}/original`;
  await mkdir(source);
  const app = await createLocalApp({ workspace: original });
  app.listen(0, '127.0.0.1');
  await new Promise((r) => app.once('listening', r));
  const base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  const saved = await fetch(`${base}/workspace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-JapanGrad-Client': '1' },
    body: JSON.stringify({ revision: 0, data: structuredClone(sampleData) }),
  });
  assert.ok(saved.ok);
  app.close();
  await new Promise((r) => app.once('close', r));
  const db = new DatabaseSync(`${original}/workspace.db`, { readOnly: true });
  const tables = {};
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all())
    tables[name] = db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all();
  db.close();
  const snapshot = {
    format: 'juai-mysql-snapshot',
    version: 1,
    kind: 'workspace',
    businessSchema: 19,
    tables,
  };
  await writeFile(`${source}/MYSQL_WORKSPACE.json`, JSON.stringify(snapshot));
  await writeFile(`${source}/申请.txt`, '日本語・中文');
  return { root, source, snapshot };
}
test('online logical export converts offline to a new portable SQLite workspace without MySQL', async () => {
  const f = await fixture();
  const target = `${f.root}/portable`;
  const result = await importMySQLExport(f.source, target);
  assert.equal(result.converted, true);
  const db = new DatabaseSync(`${target}/workspace.db`, { readOnly: true });
  assert.equal(
    db.prepare('SELECT name FROM universities WHERE id=?').get('u1').name,
    '测试大学',
  );
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  db.close();
  assert.equal(await readFile(`${target}/申请.txt`, 'utf8'), '日本語・中文');
  await assert.rejects(() => importMySQLExport(f.source, target), /已存在/);
});
test('offline conversion rejects an invalid table set before publishing the target', async () => {
  const f = await fixture();
  delete f.snapshot.tables.universities;
  await writeFile(
    `${f.source}/MYSQL_WORKSPACE.json`,
    JSON.stringify(f.snapshot),
  );
  await assert.rejects(
    () => importMySQLExport(f.source, `${f.root}/bad`),
    /表结构/,
  );
  assert.equal(await readFile(`${f.source}/申请.txt`, 'utf8'), '日本語・中文');
});

test('offline conversion CLI executes when invoked through a symlink', async () => {
  const f = await fixture();
    const link = `${f.root}/converter.mjs`;
    const target = `${f.root}/from-cli`;
  await symlink(
    fileURLToPath(new URL('import-mysql-export.mjs', import.meta.url)),
    link,
  );
  const { stdout } = await promisify(execFile)(process.execPath, [
    link,
    f.source,
    target,
  ]);
  assert.equal(JSON.parse(stdout).converted, true);
  assert.equal(await readFile(`${target}/申请.txt`, 'utf8'), '日本語・中文');
});
