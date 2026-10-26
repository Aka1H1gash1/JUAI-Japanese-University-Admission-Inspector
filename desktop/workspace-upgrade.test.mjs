import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// oxlint-disable-next-line vitest/no-import-node-test -- SQLite backup checks run with the actual Node runtime.
import { test } from 'node:test';

import {
  markWorkspaceVersion,
  prepareWorkspace,
  SUPPORTED_SCHEMA_VERSION,
} from './workspace-upgrade.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'juai-upgrade-'));
  const workspace = path.join(root, 'JapanGradWorkspace');
  await mkdir(workspace);
  const database = new DatabaseSync(path.join(workspace, 'workspace.db'));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES (13);
    CREATE TABLE notes(id INTEGER PRIMARY KEY, content TEXT);
    INSERT INTO notes VALUES(1, '原有笔记与学校信息');`);
  await writeFile(path.join(workspace, 'paper.pdf'), 'original uploaded paper');
  await markWorkspaceVersion(workspace, '0.1.0');
  return { root, workspace, database };
}
test('a version change backs up committed WAL data and files without changing source data', async () => {
  const { root, workspace, database } = await fixture();
  try {
    database
      .prepare('INSERT INTO notes VALUES (?, ?)')
      .run(2, '仍在 WAL 中的已保存内容');
    const result = await prepareWorkspace(workspace, '0.1.1');
    assert.ok(result.backup);
    assert.equal(
      await readFile(path.join(result.backup, 'paper.pdf'), 'utf8'),
      'original uploaded paper',
    );
    const copy = new DatabaseSync(path.join(result.backup, 'workspace.db'), {
      readOnly: true,
    });
    try {
      assert.equal(
        copy.prepare('SELECT content FROM notes WHERE id=2').get().content,
        '仍在 WAL 中的已保存内容',
      );
    } finally {
      copy.close();
    }
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM notes').get().count,
      2,
    );
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(workspace, '.juai-desktop-version.json'),
          'utf8',
        ),
      ).version,
      '0.1.0',
    );
    assert.equal(
      JSON.parse(
        await readFile(path.join(result.backup, 'JUAI_BACKUP.json'), 'utf8'),
      ).complete,
      true,
    );
    await markWorkspaceVersion(workspace, '0.1.1');
    const unchanged = await prepareWorkspace(workspace, '0.1.1');
    const backups = await readdir(
      path.join(root, 'JapanGradWorkspace.backups'),
    );
    assert.equal(unchanged.backup, '');
    assert.equal(backups.length, 1);
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('a backup failure prevents version marking and leaves existing records intact', async () => {
  const { root, workspace, database } = await fixture();
  try {
    await writeFile(
      path.join(root, 'JapanGradWorkspace.backups'),
      'not a directory',
    );
    await assert.rejects(prepareWorkspace(workspace, '0.1.1'));
    assert.equal(
      database.prepare('SELECT content FROM notes WHERE id=1').get().content,
      '原有笔记与学校信息',
    );
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(workspace, '.juai-desktop-version.json'),
          'utf8',
        ),
      ).version,
      '0.1.0',
    );
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('newer database schemas are refused before migration or backup', async () => {
  const { root, workspace, database } = await fixture();
  try {
    database
      .prepare('INSERT INTO schema_migrations VALUES (?)')
      .run(SUPPORTED_SCHEMA_VERSION + 1);
    await assert.rejects(prepareWorkspace(workspace, '0.1.1'), /更新版本/);
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM notes').get().count,
      1,
    );
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('the desktop schema guard covers all shipped server migrations', async () => {
  const directory = new URL('../local-server/', import.meta.url);
  let maximum = 0;
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.mjs') || name.includes('.test.')) continue;
    const source = await readFile(new URL(name, directory), 'utf8');
    for (const match of source.matchAll(
      /INSERT INTO schema_migrations VALUES\s*\((\d+)/g,
    ))
      maximum = Math.max(maximum, Number(match[1]));
  }
  assert.equal(SUPPORTED_SCHEMA_VERSION, maximum);
});
