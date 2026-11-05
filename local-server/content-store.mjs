// Stores file bytes once per workspace. When the workspace already holds a file
// with the same SHA-256, the new path becomes a hard link to it instead of a copy.
// Paths stay independent: deleting or moving one keeps the others, and the space is
// freed when the last link goes. Never shared across workspaces (one per user).
// Callers must only create files ({ flag: 'wx' }) and never rewrite one in place,
// or every linked path would change.
import { createHash } from 'node:crypto';
import { link, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

/** Workspace-relative paths of stored files whose recorded hash is `digest`. */
export function knownPaths(db, digest) {
  const rows = [];
  for (const sql of [
    "SELECT path FROM document_records WHERE sha256=? AND COALESCE(path,'')<>''",
    "SELECT json_extract(data,'$.path') AS path FROM collection_sources WHERE json_extract(data,'$.sha256')=? AND COALESCE(json_extract(data,'$.path'),'')<>''",
  ]) {
    try {
      rows.push(...db.prepare(sql).all(digest));
    } catch {
      // Older workspaces may not have the table yet.
    }
  }
  return [...new Set(rows.map((r) => r.path).filter(Boolean))];
}

/**
 * Creates `target` with `bytes`, reusing an identical stored file when possible.
 * Returns { reused, digest }. Throws EEXIST like writeFile(..., { flag: 'wx' }).
 */
export async function storeContent({
  db,
  workspace,
  target,
  bytes,
  digest = sha256(bytes),
}) {
  const root = path.resolve(workspace);
  for (const relative of knownPaths(db, digest)) {
    const existing = path.resolve(root, relative);
    if (
      existing === path.resolve(target) ||
      !existing.startsWith(root + path.sep)
    )
      continue;
    try {
      const info = await stat(existing);
      if (!info.isFile() || info.size !== bytes.length) continue;
      // The record could be stale; only link to a file whose bytes really match.
      if (sha256(await readFile(existing)) !== digest) continue;
      await link(existing, target);
      return { reused: true, digest };
    } catch (error) {
      if (error.code === 'EEXIST') throw error;
      // Missing file, unsupported file system (EPERM/EXDEV/ENOTSUP): try the next or copy.
    }
  }
  await writeFile(target, bytes, { flag: 'wx' });
  return { reused: false, digest };
}

/**
 * Bytes on disk under `directory`, counting each hard-linked file once.
 * Returns { bytes, files } where files counts paths (what the user sees).
 */
export async function diskUsage(directory) {
  const seen = new Set();
  let bytes = 0;
  let files = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => [],
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const info = await stat(full).catch(() => null);
        if (!info) continue;
        files++;
        const key = `${info.dev}:${info.ino}`;
        if (info.nlink > 1 && seen.has(key)) continue;
        seen.add(key);
        bytes += info.size;
      }
    }
  }
  await walk(directory);
  return { bytes, files };
}
