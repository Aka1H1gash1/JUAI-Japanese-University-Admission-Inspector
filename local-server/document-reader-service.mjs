import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const now = () => new Date().toISOString();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const string = (value, max) => typeof value === 'string' && value.length <= max;
const colors = new Set(['blue', 'green', 'rose', 'yellow']);
const parserVersion = 'reader-text-1';
const assetRoot = path.dirname(
  fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')),
);

export function createDocumentReaderService({
  db,
  snapshot,
  document,
  safeFile,
  transaction,
  fail,
  json,
  jsonBody,
}) {
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version=8').get()
  ) {
    transaction(() =>
      db.exec(`
      CREATE TABLE document_reader_states (document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE document_annotations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE INDEX document_annotations_document ON document_annotations(document_id);
      CREATE TABLE document_reader_text (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, sha256 TEXT NOT NULL, parser_version TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(document_id, sha256, parser_version));
      INSERT INTO schema_migrations VALUES (8, datetime('now'));
    `),
    );
  }
  const versions = new Map();
  const parsing = new Map();
  const workers = new Set();
  let closed = false;
  async function source(id) {
    const record = document(id);
    const file = await safeFile(record.path);
    const info = await stat(file);
    const fingerprint = `${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    let cached = versions.get(id);
    if (!cached || cached.fingerprint !== fingerprint) {
      cached = { fingerprint, sha256: hash(await readFile(file)) };
      if (versions.size > 1000) versions.clear();
      versions.set(id, cached);
    }
    return { record, file, sha256: cached.sha256 };
  }
  function context(record) {
    const data = snapshot().data;
    const professor =
      record.ownerType === 'professor'
        ? data.professors.find((p) => p.id === record.ownerId)
        : undefined;
    const major = data.majors.find(
      (m) => m.id === (professor?.majorId || record.ownerId),
    );
    const school = data.schools.find((s) => s.id === major?.schoolId);
    const university = data.universities.find(
      (u) => u.id === school?.universityId,
    );
    if (
      !major ||
      !school ||
      !university ||
      (record.ownerType === 'professor' && !professor)
    )
      fail('资料所属记录已不存在。', 404);
    const majorPath = `/japan-grad/universities/${university.id}/schools/${school.id}/majors/${major.id}`;
    return {
      university: university.name,
      major: major.name,
      owner: professor?.name || major.name,
      parentPath: professor
        ? `${majorPath}${professor.labId ? `/labs/${professor.labId}` : ''}/professors/${professor.id}?tab=${record.kind === 'consent' ? 'contact' : 'papers'}`
        : majorPath,
      parentLabel: professor
        ? `${professor.name} · 论文库`
        : `${major.name} · 资料`,
    };
  }
  const notes = (id) =>
    db
      .prepare(
        'SELECT data FROM document_annotations WHERE document_id=? ORDER BY rowid',
      )
      .all(id)
      .map((row) => JSON.parse(row.data));
  function checkHash(input, current) {
    if (!plain(input) || input.sha256 !== current.sha256)
      fail('原文件版本已变化，请重新打开资料；已有笔记仍然保留。', 409);
  }
  function anchor(input, record) {
    if (input === null || input === undefined) return null;
    if (
      !plain(input) ||
      !['pdf', 'text'].includes(input.type) ||
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      input.page > 100_000 ||
      !string(input.quote, 16_000) ||
      !input.quote.trim() ||
      !string(input.prefix || '', 300) ||
      !string(input.suffix || '', 300)
    )
      fail('原文定位信息不合法。');
    if (
      input.type === 'pdf' &&
      path.extname(record.filename).toLowerCase() !== '.pdf'
    )
      fail('这份资料不是 PDF。');
    const rects = input.rects ?? [];
    if (
      !Array.isArray(rects) ||
      rects.length > 300 ||
      rects.some(
        (rect) =>
          !Array.isArray(rect) ||
          rect.length !== 4 ||
          rect.some((v) => !Number.isFinite(v) || Math.abs(v) > 1_000_000),
      )
    )
      fail('高亮位置不合法。');
    return {
      type: input.type,
      page: input.page,
      quote: input.quote,
      prefix: input.prefix || '',
      suffix: input.suffix || '',
      rects,
      version: 1,
    };
  }
  function fields(input, record) {
    if (
      !string(input.body, 20_000) ||
      !string(input.title || '', 200) ||
      !colors.has(input.color) ||
      !['highlight', 'note'].includes(input.kind)
    )
      fail('笔记格式错误或内容过长。');
    const location = anchor(input.anchor, record);
    if (!input.body.trim() && !location)
      fail('请填写笔记，或选择需要标记的原文。');
    return {
      body: input.body.trim(),
      title: (input.title || '').trim(),
      color: input.color,
      kind: input.kind,
      anchor: location,
    };
  }
  async function parse(current) {
    const cached = db
      .prepare(
        'SELECT data FROM document_reader_text WHERE document_id=? AND sha256=? AND parser_version=?',
      )
      .get(current.record.id, current.sha256, parserVersion);
    if (cached) return JSON.parse(cached.data);
    const key = `${current.record.id}:${current.sha256}`;
    if (parsing.has(key)) return parsing.get(key);
    if (parsing.size >= 2) fail('正在读取其他资料，请稍后重试。', 429);
    const work = (async () => {
      const content = await readFile(current.file);
      if (hash(content) !== current.sha256)
        fail('读取时原文件发生变化，请重新打开。', 409);
      if (closed) fail('服务正在关闭。', 503);
      const result = await new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL('admission-parser-worker.mjs', import.meta.url),
          {
            workerData: {
              content,
              extension: path.extname(current.record.filename).toLowerCase(),
            },
            resourceLimits: { maxOldGenerationSizeMb: 256 },
          },
        );
        workers.add(worker);
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error('资料读取超时，请下载原文件查看。'));
        }, 60_000);
        worker.once('message', (message) =>
          message.error
            ? reject(new Error(message.error))
            : resolve(message.result),
        );
        worker.once('error', reject);
        worker.once('exit', (code) => {
          clearTimeout(timer);
          workers.delete(worker);
          if (code !== 0) reject(new Error('资料读取已中断，请重试。'));
        });
      });
      const latest = await source(current.record.id);
      if (latest.sha256 !== current.sha256)
        fail('原文件已变化，请重新读取。', 409);
      db.prepare(
        'INSERT OR REPLACE INTO document_reader_text VALUES (?, ?, ?, ?)',
      ).run(
        current.record.id,
        current.sha256,
        parserVersion,
        JSON.stringify(result),
      );
      return result;
    })().finally(() => parsing.delete(key));
    parsing.set(key, work);
    return work;
  }
  async function handle(req, res, route) {
    const asset =
      /^\/api\/japangrad\/reader-assets\/(build|cmaps|standard_fonts|wasm|iccs|image_decoders)\/([\w.-]+)$/.exec(
        route,
      );
    if (asset && ['GET', 'HEAD'].includes(req.method)) {
      if (asset[2].startsWith('.')) fail('资源不存在。', 404);
      const target = path.join(assetRoot, asset[1], asset[2]);
      const info = await stat(target);
      if (!info.isFile()) fail('资源不存在。', 404);
      const mime = {
        '.mjs': 'text/javascript',
        '.js': 'text/javascript',
        '.wasm': 'application/wasm',
      };
      res.writeHead(200, {
        'Content-Type':
          mime[path.extname(target)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else
        createReadStream(target)
          .on('error', () => res.destroy())
          .pipe(res);
      return true;
    }
    const match =
      /^\/api\/japangrad\/documents\/([\w-]+)\/reader(?:\/(state|annotations|text|export)(?:\/([\w-]+))?)?$/.exec(
        route,
      );
    if (!match) return false;
    const action = match[2];
    const id = match[1];
    const noteId = match[3];
    const input = ['DELETE', 'PATCH', 'POST', 'PUT'].includes(req.method)
      ? await jsonBody(req)
      : undefined;
    if (input !== undefined && !plain(input)) fail('阅读请求内容必须是对象。');
    const current = await source(id);
    if (!action && req.method === 'GET') {
      const row = db
        .prepare('SELECT data FROM document_reader_states WHERE document_id=?')
        .get(id);
      const related = db
        .prepare('SELECT data FROM documents WHERE owner_type=? AND owner_id=?')
        .all(current.record.ownerType, current.record.ownerId)
        .map((row) => JSON.parse(row.data))
        .filter(
          (item) =>
            item.id !== id &&
            (() => {
              if (current.record.kind === 'question') {
                return item.questionId === id;
              }
              if (current.record.kind === 'answer') {
                return (
                  item.id === current.record.questionId ||
                  item.questionId === current.record.questionId
                );
              }
              return item.kind === current.record.kind;
            })(),
        )
        .toSorted((a, b) => b.year - a.year)
        .slice(0, 30)
        .map(({ id, title, kind, year }) => ({ id, title, kind, year }));
      return (
        json(res, {
          document: current.record,
          sha256: current.sha256,
          context: context(current.record),
          state: row ? JSON.parse(row.data) : null,
          annotations: notes(id),
          related,
        }),
        true
      );
    }
    if (action === 'text' && req.method === 'GET')
      return (
        json(res, { sha256: current.sha256, ...(await parse(current)) }), true
      );
    if (action === 'state' && req.method === 'PUT') {
      checkHash(input, current);
      if (
        !Number.isInteger(input.page) ||
        input.page < 1 ||
        input.page > 100_000 ||
        !Number.isFinite(input.offset) ||
        input.offset < 0 ||
        input.offset > 1 ||
        ![
          '0.5',
          '0.75',
          '1',
          '1.25',
          '1.5',
          '1.75',
          '2',
          'page',
          'width',
        ].includes(input.zoom) ||
        ![0, 90, 180, 270].includes(input.rotation)
      )
        fail('阅读位置格式错误。');
      const value = {
        sha256: current.sha256,
        page: input.page,
        offset: input.offset,
        zoom: input.zoom,
        rotation: input.rotation,
        updatedAt: now(),
      };
      db.prepare(
        'INSERT INTO document_reader_states VALUES (?, ?) ON CONFLICT(document_id) DO UPDATE SET data=excluded.data',
      ).run(id, JSON.stringify(value));
      return (json(res, value), true);
    }
    if (action === 'annotations' && !noteId && req.method === 'POST') {
      checkHash(input, current);
      const value = fields(input, current.record);
      const noteId = input.id || randomUUID();
      if (!/^[\w-]{1,100}$/.test(noteId)) fail('笔记 ID 不合法。');
      const existing = db
        .prepare(
          'SELECT document_id, data FROM document_annotations WHERE id=?',
        )
        .get(noteId);
      if (existing) {
        const old = JSON.parse(existing.data);
        if (
          existing.document_id !== id ||
          old.sha256 !== current.sha256 ||
          JSON.stringify(value) !== JSON.stringify(fields(old, current.record))
        )
          fail('笔记已存在，请重新读取。', 409);
        return (json(res, old), true);
      }
      if (notes(id).length >= 2000)
        fail('每份资料最多保存 2,000 条笔记，请先导出整理。');
      const annotation = {
        id: noteId,
        documentId: id,
        sha256: current.sha256,
        ...value,
        revision: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      db.prepare('INSERT INTO document_annotations VALUES (?, ?, ?)').run(
        noteId,
        id,
        JSON.stringify(annotation),
      );
      return (json(res, annotation, 201), true);
    }
    if (
      action === 'annotations' &&
      noteId &&
      ['DELETE', 'PATCH'].includes(req.method)
    ) {
      const row = db
        .prepare(
          'SELECT data FROM document_annotations WHERE id=? AND document_id=?',
        )
        .get(noteId, id);
      if (!row) fail('这条笔记已不存在。', 404);
      const old = JSON.parse(row.data);
      if (input.expectedRevision !== old.revision)
        fail('笔记已在其他页面更新，请保留草稿并重新读取。', 409);
      // Old-version notes can still be edited or removed, but cannot be silently reanchored.
      if (input.sha256 !== old.sha256) fail('笔记所属文件版本不一致。', 409);
      if (req.method === 'DELETE') {
        db.prepare(
          'DELETE FROM document_annotations WHERE id=? AND document_id=?',
        ).run(noteId, id);
        return (json(res, { removed: noteId }), true);
      }
      const value = fields({ ...input, anchor: old.anchor }, current.record);
      const updated = {
        ...old,
        ...value,
        revision: old.revision + 1,
        updatedAt: now(),
      };
      db.prepare(
        'UPDATE document_annotations SET data=? WHERE id=? AND document_id=?',
      ).run(JSON.stringify(updated), noteId, id);
      return (json(res, updated), true);
    }
    if (action === 'export' && req.method === 'GET') {
      const lines = [
        `# ${current.record.title}`,
        '',
        `原文件：${current.record.filename}`,
        `导出时间：${now()}`,
        '',
      ];
      if (current.record.notes)
        lines.push('## 资料备注', '', current.record.notes, '');
      for (const note of notes(id).toSorted(
        (a, b) => (a.anchor?.page ?? 0) - (b.anchor?.page ?? 0),
      )) {
        lines.push(
          `## ${note.title || (note.kind === 'highlight' ? '高亮' : '笔记')}${note.anchor ? ` · ${note.anchor.type === 'pdf' ? `第 ${note.anchor.page} 页` : `文字块 ${note.anchor.page}`}` : ''}`,
          '',
          `文件版本：${note.sha256}${note.sha256 === current.sha256 ? '' : '（旧版本）'}`,
          '',
        );
        if (note.anchor?.quote)
          lines.push(
            ...note.anchor.quote.split('\n').map((line) => `> ${line}`),
            '',
          );
        if (note.body) lines.push(note.body, '');
      }
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${current.record.title}-阅读笔记.md`)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(lines.join('\n'));
      return true;
    }
    fail('阅读接口不存在。', 404);
  }
  return {
    handle,
    async assistantDocument(id, expectedHash) {
      const current = await source(id);
      if (expectedHash !== current.sha256)
        fail('原文件已变化，请重新打开资料并开始新对话。', 409);
      if (current.record.kind === 'consent')
        fail('内诺文件暂不向阅读助手开放，可以继续使用阅读笔记。');
      const owner = context(current.record);
      const majorId =
        current.record.ownerType === 'major'
          ? current.record.ownerId
          : snapshot().data.professors.find(
              (p) => p.id === current.record.ownerId,
            )?.majorId;
      return {
        id,
        sha256: current.sha256,
        title: current.record.title,
        filename: current.record.filename,
        kind: current.record.kind,
        year: current.record.year,
        majorId,
        owner: owner.owner,
      };
    },
    async assistantPages(id, expectedHash) {
      await this.assistantDocument(id, expectedHash);
      const current = await source(id);
      const parsed = await parse(current);
      return { pages: parsed.pages, warnings: parsed.warnings ?? [] };
    },
    async assistantNotes(id, expectedHash) {
      await this.assistantDocument(id, expectedHash);
      return notes(id).filter((note) => note.sha256 === expectedHash);
    },
    close() {
      closed = true;
      for (const worker of workers) void worker.terminate();
    },
  };
}
