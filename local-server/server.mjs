import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { createAdmissionAiService } from './admission-ai-service.mjs';
import { createAiManagementService } from './ai-management-service.mjs';
import { createAnalysisService } from './analysis-service.mjs';
import { createAssistantService } from './assistant-service.mjs';
import { createCollectionService } from './collection-service.mjs';
import { storeContent } from './content-store.mjs';
import {
  applyEntityDefaults,
  syncAllLabsForMajor,
} from './data-migrations.mjs';
import { createDocumentReaderService } from './document-reader-service.mjs';
import { createExperiencePostService } from './experience-post-service.mjs';
import { createExperienceService } from './experience-service.mjs';
import {
  deliveryProperties,
  fileProperties,
  validateFile,
} from './file-types.mjs';
import { createInformationService } from './information-service.mjs';
import geography from './japan-geography.json' with { type: 'json' };
import { migrateLabFacts } from './lab-facts-schema.mjs';
import {
  planningError,
  tagImportedTasks,
  validPlannerDay,
  validPlannerMinute,
} from './planning-fields.mjs';
import { upgradeResearchLabs } from './research-labs.mjs';
import { createSpecialProgramService } from './special-program-service.mjs';
import { timelineError } from './timeline-fields.mjs';
import { backupRoot, createManualBackup } from './workspace-backup.mjs';
import {
  createWorkspaceRepository,
  hasRelationalWorkspace,
  migrateWorkspaceRepository,
} from './workspace-repository.mjs';
import { createWorkspaceSettingsService } from './workspace-settings-service.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EMPTY_DATA = {
  version: 2,
  universities: [],
  schools: [],
  majors: [],
  professors: [],
  labs: [],
};
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
const text = (value, max = 4000) =>
  typeof value === 'string' && value.length <= max;
const validId = (value) =>
  typeof value === 'string' && /^[\w-]{1,100}$/.test(value);

export function validateExplorer(data) {
  if (data?.version !== 2) fail('工作区数据版本不受支持。');
  const fields = {
    universities: [
      'name',
      'japaneseName',
      'location',
      'category',
      'website',
      'notes',
    ],
    schools: ['name', 'japaneseName', 'research', 'website', 'notes'],
    majors: ['name', 'japaneseName', 'research', 'website', 'notes'],
    labs: [
      'name',
      'japaneseName',
      'research',
      'website',
      'notes',
      'examNotes',
      'applicationNotes',
    ],
    professors: [
      'name',
      'japaneseName',
      'title',
      'research',
      'laboratory',
      'email',
      'personalWebsite',
      'laboratoryWebsite',
      'notes',
    ],
  };
  const ids = new Set();
  for (const [collection, required] of Object.entries(fields)) {
    if (collection === 'labs' && data.labs === undefined) continue;
    if (!Array.isArray(data[collection]) || data[collection].length > 20_000)
      fail('工作区数据格式错误。');
    for (const item of data[collection]) {
      if (
        !item ||
        !validId(item.id) ||
        ids.has(item.id) ||
        !required.every((key) => text(item[key])) ||
        !item.name.trim()
      )
        fail('记录字段或 ID 不合法。');
      ids.add(item.id);
    }
  }
  for (const item of data.universities) {
    if (
      [
        'region',
        'prefecture',
        'qsRank',
        'qsYear',
        'japanRank',
        'japanRankYear',
        'japanRankSource',
      ].some((key) => item[key] !== undefined && !text(item[key], 120))
    )
      fail('大学扩展字段格式错误。');
    if (
      item.prefecture &&
      !geography.some(
        (region) =>
          region.name === item.region &&
          region.prefectures.some(([name]) => name === item.prefecture),
      )
    )
      fail('都道府县与所在地域不匹配，请刷新页面后重新选择。');
    for (const key of [
      'admissionFee',
      'annualTuition',
      'monthlyRent',
      'monthlyLivingExpenses',
    ]) {
      if (
        item[key] !== undefined &&
        (!text(item[key], 9) || !/^(?:\d{1,9})?$/.test(item[key]))
      )
        fail('大学费用请填写 0–999,999,999 之间的整数日元，或留空。');
    }
    if (item.feeNotes !== undefined && !text(item.feeNotes))
      fail('大学费用备注格式错误。');
    if (
      item.dormitoryStatus !== undefined &&
      !['', 'available', 'unavailable', 'unknown'].includes(
        item.dormitoryStatus,
      )
    )
      fail('寮申请状态不合法。');
    for (const key of ['dormitoryNotes', 'dormitoryWebsite']) {
      if (item[key] !== undefined && !text(item[key]))
        fail('寮申请信息格式错误。');
    }
    if (
      item.logoId !== undefined &&
      item.logoId !== '' &&
      !validLogoId(item.logoId)
    )
      fail('校徽标识不合法。');
  }
  for (const [children, parents, key] of [
    ['schools', 'universities', 'universityId'],
    ['majors', 'schools', 'schoolId'],
    ['professors', 'majors', 'majorId'],
    ['labs', 'majors', 'majorId'],
  ]) {
    if (children === 'labs' && data.labs === undefined) continue;
    const parentIds = new Set(data[parents].map((item) => item.id));
    if (data[children].some((item) => !parentIds.has(item[key])))
      fail('所属记录不存在。');
  }
  for (const major of data.majors) {
    for (const [key, max] of Object.entries({
      applicationStart: 120,
      applicationEnd: 120,
      applicationMaterials: 8000,
      languageRequirements: 4000,
    })) {
      if (major[key] !== undefined && !text(major[key], max))
        fail('出愿时间、所需材料或语言要求格式错误。');
    }
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(major.applicationStart ?? '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(major.applicationEnd ?? '') &&
      major.applicationStart > major.applicationEnd
    )
      fail('出愿截止日期不能早于开始日期。');
    if (major.examHistory === undefined) continue;
    if (!Array.isArray(major.examHistory) || major.examHistory.length > 500)
      fail('历年考试信息格式错误。');
    const recordIds = new Set();
    for (const record of major.examHistory) {
      if (
        !record ||
        !validId(record.id) ||
        recordIds.has(record.id) ||
        !/^\d{4}$/.test(record.year) ||
        typeof record.year !== 'string' ||
        Number(record.year) < 1900 ||
        Number(record.year) > 2200 ||
        ['writtenDate', 'interviewDate', 'resultDate'].some(
          (key) => record[key] !== undefined && !text(record[key], 240),
        ) ||
        !Object.entries({
          session: 120,
          examDate: 240,
          subjects: 2000,
          sourceUrl: 2048,
          notes: 4000,
        }).every(([key, max]) => text(record[key], max))
      )
        fail('考试记录的年度或字段不合法。');
      recordIds.add(record.id);
    }
  }
  if (data.professors.some((item) => typeof item.favorite !== 'boolean'))
    fail('心仪标记格式错误。');
  if (data.labs?.some((item) => typeof item.wantApply !== 'boolean'))
    fail('研究室的想考标记格式错误。');
  if (
    data.labs !== undefined &&
    data.professors.some(
      (item) =>
        !data.labs.some(
          (lab) => lab.id === item.labId && lab.majorId === item.majorId,
        ),
    )
  )
    fail('老师所属研究室不存在或与专攻不匹配。');
  for (const lab of data.labs ?? []) {
    const error = timelineError(lab.timeline);
    if (error) fail(error);
  }
  const plannerError = planningError(data);
  if (plannerError) fail(plannerError);
  return data;
}

const validLogoId = (value) =>
  typeof value === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:png|jpg|webp)$/.test(
    value,
  );
function logoProperties(content) {
  if (
    content.length >= 33 &&
    content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    content.toString('ascii', 12, 16) === 'IHDR'
  )
    return { extension: 'png', type: 'image/png' };
  if (
    content.length >= 4 &&
    content[0] === 255 &&
    content[1] === 216 &&
    content[2] === 255 &&
    content.at(-2) === 255 &&
    content.at(-1) === 217
  )
    return { extension: 'jpg', type: 'image/jpeg' };
  if (
    content.length >= 20 &&
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP' &&
    content.readUInt32LE(4) + 8 === content.length
  )
    return { extension: 'webp', type: 'image/webp' };
  fail('校徽请使用 PNG、JPG 或 WebP 图片。');
}

async function body(
  req,
  limit,
  message = '文件或内容过大。单个文件最多 50 MB。',
) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(message, 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  try {
    const content = await body(
      req,
      8 * 1024 * 1024,
      '请求内容过大，最多 8 MB。',
    );
    return JSON.parse(content.toString());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail('请求内容不是有效 JSON。');
  }
}
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

export async function createLocalApp({
  workspace,
  staticDir,
  allowedOrigins = [],
  platform,
}) {
  await mkdir(workspace, { recursive: true });
  workspace = await realpath(workspace);
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // Back up an existing pre-v14 database before any legacy migration/backfill
  // can modify it. A fresh installation has no legacy table and needs no copy.
  let migrationBackup;
  const legacyTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_data'",
    )
    .get();
  if (legacyTable) {
    try {
      migrationBackup = await createManualBackup(db, workspace, {
        kind: 'schema14',
      });
    } catch (error) {
      db.close();
      throw error;
    }
  }
  // Append-only schema migrations. Existing migrations must never be edited after release.
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get()
  ) {
    db.exec(`BEGIN;
      CREATE TABLE workspace_data (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE documents (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX documents_owner ON documents(owner_type, owner_id);
      CREATE TABLE messages (id TEXT PRIMARY KEY, professor_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX messages_professor ON messages(professor_id);
      INSERT INTO schema_migrations VALUES (1, datetime('now')); COMMIT;`);
  }
  try {
    await writeFile(
      path.join(workspace, 'workspace.json'),
      JSON.stringify({ name: 'JapanGrad', schemaVersion: 1 }, null, 2),
      { flag: 'wx' },
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  migrateLabFacts(db);
  let workspaceRepository = hasRelationalWorkspace(db)
    ? createWorkspaceRepository({ db, workspace, fail, validateExplorer })
    : undefined;
  const snapshot = () => {
    if (workspaceRepository) {
      const value = workspaceRepository.snapshot();
      return platform ? { ...value, workspace: '个人资料空间' } : value;
    }
    const row = db.prepare('SELECT * FROM workspace_data WHERE id = 1').get();
    return {
      initialized: !!row,
      revision: row?.revision ?? 0,
      data: row ? JSON.parse(row.data) : structuredClone(EMPTY_DATA),
      workspace: platform ? '个人资料空间' : workspace,
    };
  };
  const writeWorkspace = (data, expectedRevision, previousData) => {
    try {
      if (workspaceRepository) {
        const previous = previousData ?? snapshot().data;
        data = applyEntityDefaults(structuredClone(data));
        for (const major of data.majors) {
          const retained = previous.majors.find((item) => item.id === major.id);
          const changed = !isDeepStrictEqual(
            major.examHistory ?? [],
            retained?.examHistory ?? [],
          );
          major.examHistoryVersion =
            (retained?.examHistoryVersion ?? 0) + Number(changed);
          if (changed) syncAllLabsForMajor(data, major.id);
        }
        for (const lab of data.labs ?? []) {
          const retained = previous.labs?.find((item) => item.id === lab.id);
          // Legacy API counters remain a projection for older open pages;
          // concurrency is enforced by the workspace/row CAS, not these fields.
          if (lab.timeline)
            lab.timeline.version =
              (retained?.timeline?.version ?? 0) +
              Number(
                !isDeepStrictEqual(
                  { ...lab.timeline, version: 0 },
                  { ...retained?.timeline, version: 0 },
                ),
              );
          if (lab.tasks)
            lab.tasksVersion =
              (retained?.tasksVersion ?? 0) +
              Number(!isDeepStrictEqual(lab.tasks, retained?.tasks));
        }
        return workspaceRepository.replace(data, expectedRevision);
      }
      const { changes } = db
        .prepare(`INSERT INTO workspace_data (id,data,revision) VALUES (1,?,1)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=workspace_data.revision+1 WHERE workspace_data.revision=?`)
        .run(JSON.stringify(data), expectedRevision);
      if (!changes) fail('工作区已更新，请重新读取后保存。', 409);
      return expectedRevision + 1;
    } catch (error) {
      if (/FOREIGN KEY constraint|database is locked/.test(error.message))
        fail('资料关联或版本已变化，请重新读取后保存。', 409);
      throw error;
    }
  };
  const saveDocument = (record) => {
    if (workspaceRepository) return workspaceRepository.saveDocument(record);
    db.prepare(
      'INSERT INTO documents VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,owner_type=excluded.owner_type,owner_id=excluded.owner_id',
    ).run(record.id, record.ownerType, record.ownerId, JSON.stringify(record));
  };
  const saveMessage = (record) => {
    if (workspaceRepository) return workspaceRepository.saveMessage(record);
    db.prepare(
      'INSERT INTO messages VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
    ).run(record.id, record.professorId, JSON.stringify(record));
  };
  const saveProgram = (record) => {
    if (workspaceRepository) return workspaceRepository.saveProgram(record);
    db.prepare(
      'INSERT INTO special_admission_programs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
    ).run(record.id, JSON.stringify(record));
  };
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()
  ) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(
        'CREATE TABLE workspace_data_backups (version INTEGER PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL)',
      );
      const row = db.prepare('SELECT * FROM workspace_data WHERE id = 1').get();
      if (row) {
        const data = validateExplorer(
          upgradeResearchLabs(JSON.parse(row.data)),
        );
        db.prepare(
          "INSERT INTO workspace_data_backups VALUES (2, ?, ?, datetime('now'))",
        ).run(row.data, row.revision);
        db.prepare(
          'UPDATE workspace_data SET data = ?, revision = revision + 1 WHERE id = 1',
        ).run(JSON.stringify(data));
      }
      db.prepare(
        "INSERT INTO schema_migrations VALUES (2, datetime('now'))",
      ).run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }
  // Run legacy backfill only before the relational store becomes authoritative.
  if (!workspaceRepository) {
    const row = db
      .prepare('SELECT data FROM workspace_data WHERE id = 1')
      .get();
    if (row) {
      const data = JSON.parse(row.data);
      if (tagImportedTasks(data))
        db.prepare(
          'UPDATE workspace_data SET data = ?, revision = revision + 1 WHERE id = 1',
        ).run(JSON.stringify(data));
    }
  }
  const ownerExists = (type, id, current = snapshot()) =>
    current.data[type === 'major' ? 'majors' : 'professors'].some(
      (item) => item.id === id,
    );
  const document = (id) => {
    const row = db.prepare('SELECT data FROM documents WHERE id = ?').get(id);
    if (!row) fail('文件记录不存在。', 404);
    return JSON.parse(row.data);
  };
  const safeFile = async (relative) => {
    const candidate = path.resolve(workspace, relative);
    if (!candidate.startsWith(`${workspace}${path.sep}`))
      fail('文件路径不合法。', 403);
    const actual = await realpath(candidate);
    if (!actual.startsWith(`${workspace}${path.sep}`))
      fail('文件路径超出工作区。', 403);
    return actual;
  };
  const ensureDirectory = async (relative) => {
    let current = workspace;
    for (const segment of relative.split('/')) {
      if (!segment || segment === '.' || segment === '..')
        fail('保存目录不合法。', 403);
      const candidate = path.join(current, segment);
      try {
        await mkdir(candidate);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const actual = await realpath(candidate);
      if (!actual.startsWith(`${workspace}${path.sep}`))
        fail('保存目录超出工作区。', 403);
      current = actual;
    }
    return current;
  };
  let writeQueue = Promise.resolve();
  const serializeWrite = (work) => {
    const task = writeQueue.then(work, work);
    writeQueue = task.then(
      () => {},
      () => {},
    );
    return task;
  };
  const transaction = (work) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      work();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      if (/FOREIGN KEY constraint/.test(error.message))
        fail('关联资料仍在使用，无法删除这段记录。', 409);
      throw error;
    }
  };
  const analysis = createAnalysisService({
    writeWorkspace,
    db,
    snapshot,
    document,
    safeFile,
    transaction,
    fail,
    json,
    jsonBody,
    validateExplorer,
  });
  const experiences = createExperienceService({
    saveMessage,
    writeWorkspace,
    db,
    snapshot,
    transaction,
    fail,
    json,
    jsonBody,
    validateExplorer,
  });
  const information = createInformationService({
    writeWorkspace,
    db,
    snapshot,
    transaction,
    fail,
    json,
    jsonBody,
    validateExplorer,
    authenticate: analysis.authenticate,
  });
  const reader = createDocumentReaderService({
    db,
    snapshot,
    document,
    safeFile,
    transaction,
    fail,
    json,
    jsonBody,
  });
  const ai = createAiManagementService({
    platform,
    db,
    transaction,
    snapshot,
    json,
    jsonBody,
    fail,
  });
  const assistant = createAssistantService({
    db,
    snapshot,
    information,
    json,
    jsonBody,
    fail,
    transaction,
    reader,
    ai,
  });
  const admissionAi = createAdmissionAiService({
    db,
    transaction,
    analysis,
    assistant,
    fail,
    json,
    jsonBody,
    ai,
  });
  ai.importLegacy();
  ai.initializeFeature('web_collection', 'workspace_chat');
  const experiencePosts = createExperiencePostService({
    db,
    snapshot,
    transaction,
    fail,
    json,
    jsonBody,
    ai,
  });
  const specialPrograms = createSpecialProgramService({
    saveProgram,
    db,
    snapshot,
    transaction,
    fail,
    json,
    jsonBody,
  });
  const settings = createWorkspaceSettingsService({
    db,
    transaction,
    fail,
    json,
    jsonBody,
  });
  const collection = createCollectionService({
    browserAdapter: platform?.browser,
    appendCollectionImport: (...args) =>
      workspaceRepository.appendCollectionImport(...args),
    saveDocument,
    writeWorkspace,
    db,
    snapshot,
    transaction,
    fail,
    json,
    jsonBody,
    validateExplorer,
    ai,
    workspace,
    ensureDirectory,
    safeFile,
    logoProperties,
    createSpecialProgram: specialPrograms.createFromCollection,
    specialProgramExists: specialPrograms.exists,
  });
  if (!workspaceRepository) {
    try {
      workspaceRepository = migrateWorkspaceRepository({
        db,
        workspace,
        fail,
        validateExplorer,
        backupPath: migrationBackup?.path,
        normalize: (value) => {
          const data = applyEntityDefaults(upgradeResearchLabs(value));
          experiences.prepare(data, data, { checkVersions: false });
          return validateExplorer(data);
        },
      });
    } catch (error) {
      for (const service of [
        collection,
        admissionAi,
        ai,
        reader,
        assistant,
        analysis,
      ])
        service.close?.();
      db.close();
      throw error;
    }
  }
  migrateLabFacts(db);
  const handler = async (req, res) => {
    try {
      const host = req.headers.host;
      const trusted = platform?.authorize?.(req) === true;
      if (platform && !trusted) fail('需要可信身份上下文。', 403);
      const port = server.address()?.port || 5667;
      const ownOrigin = `http://127.0.0.1:${port}`;
      if (
        !trusted &&
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)
      )
        fail('仅允许本机访问。', 403);
      const origin = req.headers.origin;
      if (
        !trusted &&
        origin &&
        ![`http://localhost:${port}`, ownOrigin, ...allowedOrigins].includes(
          origin,
        )
      )
        fail('请求来源不受信任。', 403);
      const url = new URL(req.url, ownOrigin);
      const route = url.pathname;
      if (
        trusted &&
        platform.allowRequest &&
        !platform.allowRequest(req, route)
      )
        fail('服务器模式不提供此本机能力。', 403);
      if (route.startsWith('/api/japangrad')) {
        if (
          !['GET', 'HEAD'].includes(req.method) &&
          req.headers['x-japangrad-client'] !== '1'
        )
          fail('缺少本地工作台请求标识。', 403);
        if (await ai.handle(req, res, route)) return;
        if (await settings.handle(req, res, route)) return;
        if (await specialPrograms.handle(req, res, route)) return;
        if (await experiencePosts.handle(req, res, route)) return;
        if (await collection.handle(req, res, route)) return;
        if (await assistant.handle(req, res, route)) return;
        if (await information.handle(req, res, route)) return;
        if (await experiences.handle(req, res, route)) return;
        if (await admissionAi.handle(req, res, route)) return;
        if (await analysis.handle(req, res, route)) return;
        if (await reader.handle(req, res, route)) return;
        const labPatch = route.match(
          /^\/api\/japangrad\/workspace\/labs\/([\w-]+)$/,
        );
        if (labPatch && req.method === 'PATCH') {
          return await serializeWrite(async () => {
            const input = await jsonBody(req);
            if (
              !input ||
              !Number.isSafeInteger(input.revision) ||
              !input.patch ||
              typeof input.patch !== 'object' ||
              Array.isArray(input.patch) ||
              Object.keys(input.patch).length === 0 ||
              Object.keys(input.patch).some(
                (key) => !['tasks', 'timeline', 'wantApply'].includes(key),
              )
            )
              fail('研究室增量保存参数不合法。');
            const current = snapshot();
            const data = structuredClone(current.data);
            const lab = data.labs.find((item) => item.id === labPatch[1]);
            if (!lab) fail('研究室不存在。', 404);
            if (current.entityRevisions.labs[lab.id] !== input.revision)
              fail('研究室已在其他页面更新，请重新读取后保存。', 409);
            Object.assign(lab, input.patch);
            applyEntityDefaults(data);
            experiences.prepare(data, current.data);
            validateExplorer(data);
            transaction(() =>
              writeWorkspace(data, current.revision, current.data),
            );
            return json(res, snapshot());
          });
        }
        if (route === '/api/japangrad/workspace' && req.method === 'GET') {
          const since = url.searchParams.get('since');
          if (
            since !== null &&
            since === String(workspaceRepository.revision())
          )
            return json(res, { unchanged: true, revision: Number(since) });
          const current = snapshot();
          if (url.searchParams.get('since') === String(current.revision))
            return json(res, { unchanged: true, revision: current.revision });
          return json(res, current);
        }
        if (route === '/api/japangrad/workspace/backup' && req.method === 'GET')
          return json(res, { root: backupRoot(workspace) });
        if (
          route === '/api/japangrad/workspace/backup' &&
          req.method === 'POST'
        )
          return await serializeWrite(async () =>
            json(res, await createManualBackup(db, workspace), 201),
          );
        if (route === '/api/japangrad/workspace' && req.method === 'PUT') {
          return await serializeWrite(async () => {
            const input = await jsonBody(req);
            const current = snapshot();
            if (input.revision !== current.revision)
              fail('工作区已在其他页面更新，请刷新后重试。', 409);
            if (
              !input.data ||
              input.data.version !== 2 ||
              ['universities', 'schools', 'majors', 'professors'].some(
                (key) => !Array.isArray(input.data[key]),
              ) ||
              (input.data.labs !== undefined && !Array.isArray(input.data.labs))
            )
              fail('工作区数据格式错误。');
            const legacyLabs = input.data.labs === undefined;
            let data = upgradeResearchLabs(input.data, current.data);

            for (const major of data.majors) {
              const previous = current.data.majors.find(
                (item) => item.id === major.id,
              );
              if (
                major.analysisHistory === undefined &&
                previous?.analysisHistory !== undefined
              )
                major.analysisHistory = previous.analysisHistory;
            }
            data = applyEntityDefaults(data);

            // An older page cannot manage labs; remove only labs whose parent was deleted.
            const majorIds = new Set(
              (data.majors ?? []).map((item) => item.id),
            );
            if (legacyLabs)
              data.labs = data.labs.filter((item) =>
                majorIds.has(item.majorId),
              );
            const previousPeople = new Map(
              current.data.professors.map((item) => [item.id, item]),
            );
            for (const person of data.professors) {
              const previous = previousPeople.get(person?.id);
              if (
                person &&
                person.contact === undefined &&
                previous?.contact !== undefined
              )
                person.contact = previous.contact;
            }
            for (const person of data.professors) {
              const previous = previousPeople.get(person?.id);
              if (
                previous?.contact &&
                person.contact &&
                (!person.contact.experienceId ||
                  person.contact.experienceId === previous.contact.experienceId)
              )
                person.contact = { ...previous.contact, ...person.contact };
              if (
                person.contactHistory === undefined &&
                previous?.contactHistory
              )
                person.contactHistory = previous.contactHistory;
            }
            const previousLabs = new Map(
              (current.data.labs ?? []).map((item) => [item.id, item]),
            );
            for (const lab of data.labs) {
              if (!lab) continue;
              const previous = previousLabs.get(lab.id);
              for (const key of [
                'timeline',
                'tasks',
                'foreignStudentStatus',
                'foreignStudentSource',
                'foreignStudentNotes',
                'mainProfessorId',
                'languageRequirements',
              ])
                if (lab[key] === undefined && previous?.[key] !== undefined)
                  lab[key] = previous[key];
              if (
                lab.mainProfessorId &&
                previous?.mainProfessorId === lab.mainProfessorId &&
                !data.professors.some(
                  (person) =>
                    person?.id === lab.mainProfessorId &&
                    person.labId === lab.id,
                )
              )
                lab.mainProfessorId = '';
            }
            validateExplorer(data);
            const previousUniversities = new Map(
              current.data.universities.map((item) => [item.id, item]),
            );
            for (const university of data.universities) {
              const previous = previousUniversities.get(university.id);
              for (const key of [
                'japanRank',
                'japanRankYear',
                'japanRankSource',
              ])
                if (
                  university[key] === undefined &&
                  previous?.[key] !== undefined
                )
                  university[key] = previous[key];
              if (
                university.prefecture === undefined &&
                previous?.prefecture !== undefined
              )
                university.prefecture = previous.prefecture;
            }
            const previousMajors = new Map(
              current.data.majors.map((major) => [major.id, major]),
            );
            for (const major of data.majors) {
              const previousMajor = previousMajors.get(major.id);
              for (const key of [
                'applicationStart',
                'applicationEnd',
                'applicationMaterials',
                'languageRequirements',
              ]) {
                if (
                  major[key] === undefined &&
                  previousMajor?.[key] !== undefined
                )
                  major[key] = previousMajor[key];
              }
              // Older open pages do not know this field; omission must not erase history.
              const previous = previousMajors.get(major.id)?.examHistory;
              if (major.examHistory === undefined && previous !== undefined)
                major.examHistory = previous;
              if (major.examHistory && previous) {
                const previousRecords = new Map(
                  previous.map((record) => [record.id, record]),
                );
                for (const record of major.examHistory) {
                  const retained = previousRecords.get(record.id);
                  for (const key of [
                    'writtenDate',
                    'interviewDate',
                    'resultDate',
                  ]) {
                    if (
                      record[key] === undefined &&
                      retained?.[key] !== undefined
                    )
                      record[key] = retained[key];
                  }
                }
              }
            }
            for (const university of data.universities) {
              if (university.logoId)
                await safeFile(
                  path.posix.join('university-logos', university.logoId),
                );
            }
            const majors = new Set(data.majors.map((item) => item.id));
            const professors = new Set(data.professors.map((item) => item.id));
            experiences.prepare(data, current.data);

            validateExplorer(data);
            transaction(() => {
              // Remove metadata atomically with parent records. Original files remain recoverable on disk.
              for (const row of db
                .prepare('SELECT id, owner_type, owner_id FROM documents')
                .all()) {
                if (
                  !(row.owner_type === 'major' ? majors : professors).has(
                    row.owner_id,
                  )
                )
                  db.prepare('DELETE FROM documents WHERE id = ?').run(row.id);
              }
              for (const row of db
                .prepare('SELECT id, professor_id FROM messages')
                .all()) {
                if (!professors.has(row.professor_id))
                  db.prepare('DELETE FROM messages WHERE id = ?').run(row.id);
              }
              writeWorkspace(data, current.revision, current.data);
            });
            return json(res, snapshot());
          });
        }
        if (
          route === '/api/japangrad/university-logos' &&
          req.method === 'POST'
        ) {
          const content = await body(
            req,
            3 * 1024 * 1024,
            '校徽图片不能超过 3 MB。',
          );
          const properties = logoProperties(content);
          const id = `${randomUUID()}.${properties.extension}`;
          const directory = await ensureDirectory('university-logos');
          await writeFile(path.join(directory, id), content, { flag: 'wx' });
          return json(res, { id }, 201);
        }
        if (
          route.startsWith('/api/japangrad/university-logos/') &&
          ['GET', 'HEAD'].includes(req.method)
        ) {
          const id = route.slice('/api/japangrad/university-logos/'.length);
          if (!validLogoId(id)) fail('校徽不存在。', 404);
          const target = await safeFile(
            path.posix.join('university-logos', id),
          );
          const types = {
            png: 'image/png',
            jpg: 'image/jpeg',
            webp: 'image/webp',
          };
          const info = await stat(target);
          res.writeHead(200, {
            'Content-Type': types[id.split('.').at(-1)],
            'Content-Length': info.size,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=31536000, immutable',
          });
          if (req.method === 'HEAD') return res.end();
          return createReadStream(target)
            .on('error', () => res.destroy())
            .pipe(res);
        }
        if (
          route === '/api/japangrad/documents/index' &&
          req.method === 'GET'
        ) {
          return json(
            res,
            db
              .prepare('SELECT data FROM documents')
              .all()
              .map((row) => JSON.parse(row.data)),
          );
        }
        if (route === '/api/japangrad/documents' && req.method === 'GET') {
          const type = url.searchParams.get('ownerType');
          const id = url.searchParams.get('ownerId');
          if (!['major', 'professor'].includes(type) || !ownerExists(type, id))
            fail('所属记录不存在。', 404);
          return json(
            res,
            db
              .prepare(
                'SELECT data FROM documents WHERE owner_type = ? AND owner_id = ?',
              )
              .all(type, id)
              .map((row) => JSON.parse(row.data)),
          );
        }
        if (route === '/api/japangrad/documents' && req.method === 'POST') {
          let meta;
          try {
            meta = JSON.parse(
              decodeURIComponent(req.headers['x-japangrad-metadata'] ?? ''),
            );
          } catch {
            fail('上传信息不合法。');
          }
          if (
            !meta ||
            !['major', 'professor'].includes(meta.ownerType) ||
            !ownerExists(meta.ownerType, meta.ownerId)
          )
            fail('所属记录不存在。', 404);
          if (
            ![
              'answer',
              'consent',
              'guidelines',
              'other',
              'paper',
              'question',
            ].includes(meta.kind) ||
            (meta.ownerType === 'professor') !==
              ['consent', 'paper'].includes(meta.kind)
          )
            fail('文件分类不合法。');
          if (
            !Number.isInteger(meta.year) ||
            meta.year < 1900 ||
            meta.year > 2200 ||
            !text(meta.title, 240) ||
            !meta.title.trim() ||
            !text(meta.filename, 240)
          )
            fail('请填写标题和有效年份。');
          const consentMeta =
            meta.kind === 'consent' ? experiences.consentMetadata(meta) : {};
          if (meta.kind === 'answer') {
            const question = document(meta.questionId);
            if (
              question.kind !== 'question' ||
              question.ownerId !== meta.ownerId ||
              question.ownerType !== 'major' ||
              question.year !== meta.year
            )
              fail('答案必须关联同专攻、同年份的过去问。');
          }
          const content = await body(req, 50 * 1024 * 1024);
          let properties;
          try {
            properties = validateFile(meta.filename, content);
          } catch (error) {
            fail(error.message);
          }
          if (!ownerExists(meta.ownerType, meta.ownerId))
            fail('所属记录已删除。', 409);
          const id = randomUUID();
          const filename =
            path
              .basename(meta.filename.replaceAll('\\', '/'))
              .replaceAll(/[^\p{L}\p{N}._ -]/gu, '_')
              .slice(0, 160 - properties.extension.length)
              .replace(/\.(?:pdf|docx?|md|txt)$/i, '') + properties.extension;
          const relative = path.posix.join(
            meta.ownerType === 'major' ? 'majors' : 'professors',
            meta.ownerId,
            meta.kind,
            String(meta.year),
            `${id}-${filename}`,
          );
          const target = path.join(workspace, relative);
          await ensureDirectory(path.posix.dirname(relative));
          // An identical file already in this workspace is linked, not stored twice.
          const { digest } = await storeContent({
            db,
            workspace,
            target,
            bytes: content,
          });
          if (!ownerExists(meta.ownerType, meta.ownerId))
            fail('所属记录已删除，原文件保留在工作区。', 409);
          if (meta.kind === 'consent')
            experiences.consentMetadata({
              ...meta,
              experienceId: consentMeta.experienceId,
            });
          const record = {
            id,
            ownerType: meta.ownerType,
            ownerId: meta.ownerId,
            kind: meta.kind,
            year: meta.year,
            title: meta.title.trim(),
            filename,
            path: relative,
            size: content.length,
            ...properties,
            sha256: digest,
            ...consentMeta,
            questionId: meta.kind === 'answer' ? meta.questionId : '',
            notes: '',
            authors: '',
            venue: '',
            createdAt: new Date().toISOString(),
          };
          saveDocument(record);
          return json(res, record, 201);
        }
        const fileMatch = route.match(
          /^\/api\/japangrad\/documents\/([\w-]+)(\/file)?$/,
        );
        if (fileMatch) {
          const record = document(fileMatch[1]);
          if (fileMatch[2] && ['GET', 'HEAD'].includes(req.method)) {
            const target = await safeFile(record.path);
            const info = await stat(target);
            const delivery = deliveryProperties(
              record,
              url.searchParams.has('download'),
            );
            let end = info.size - 1;
            let partial = false;
            let start = 0;
            if (req.headers.range) {
              const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
              if (!match || (!match[1] && !match[2])) {
                res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
                return res.end();
              }
              if (match[1]) {
                start = Number(match[1]);
                if (match[2]) end = Math.min(end, Number(match[2]));
              } else {
                start = Math.max(0, info.size - Number(match[2]));
              }
              if (
                !Number.isSafeInteger(start) ||
                !Number.isSafeInteger(end) ||
                start > end ||
                start >= info.size
              ) {
                res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
                return res.end();
              }
              partial = true;
            }
            res.writeHead(partial ? 206 : 200, {
              'Content-Type': delivery.contentType,
              'Content-Length': Math.max(0, end - start + 1),
              'Accept-Ranges': 'bytes',
              ...(partial
                ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` }
                : {}),
              'Content-Disposition': `${delivery.disposition}; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
              ...(delivery.plainText
                ? { 'Content-Security-Policy': "sandbox; default-src 'none'" }
                : {}),
            });
            if (req.method === 'HEAD') return res.end();
            createReadStream(target, partial ? { start, end } : undefined)
              .on('error', () => res.destroy())
              .pipe(res);
            return;
          }
          if (!fileMatch[2] && req.method === 'PATCH') {
            const input = await jsonBody(req);
            for (const field of ['title', 'notes', 'authors', 'venue']) {
              if (input[field] !== undefined) {
                if (
                  !text(input[field], field === 'notes' ? 8000 : 500) ||
                  (field === 'title' && !input[field].trim())
                )
                  fail('资料字段格式不合法。');
                record[field] = input[field].trim();
              }
            }
            if (record.kind === 'consent')
              Object.assign(
                record,
                experiences.consentMetadata({
                  ...record,
                  experienceId: input.experienceId ?? record.experienceId,
                  signed: input.signed ?? record.signed,
                  signedDate: input.signedDate ?? record.signedDate,
                }),
              );
            if (input.analysis !== undefined)
              fail('募集要项自动提取暂未启用。');
            saveDocument(record);
            return json(res, record);
          }
          if (!fileMatch[2] && req.method === 'DELETE') {
            // Move files to a recoverable folder before removing metadata.
            const related = db
              .prepare(
                'SELECT data FROM documents WHERE owner_type = ? AND owner_id = ?',
              )
              .all(record.ownerType, record.ownerId)
              .map((row) => JSON.parse(row.data))
              .filter(
                (item) =>
                  item.id === record.id || item.questionId === record.id,
              );
            const trash = await ensureDirectory('.trash');
            const moved = [];
            try {
              for (const item of related) {
                const source = await safeFile(item.path);
                const target = path.join(
                  trash,
                  `${item.id}${fileProperties(item.filename).extension}`,
                );
                await rename(source, target);
                moved.push([source, target]);
              }
              transaction(() => {
                for (const item of related)
                  db.prepare('DELETE FROM documents WHERE id = ?').run(item.id);
              });
            } catch (error) {
              for (const [source, target] of moved.toReversed())
                await rename(target, source);
              throw error;
            }
            return json(res, { removed: related.map((item) => item.id) });
          }
        }
        if (route === '/api/japangrad/messages' && req.method === 'GET') {
          const id = url.searchParams.get('professorId');
          if (!ownerExists('professor', id)) fail('老师不存在。', 404);
          return json(
            res,
            db
              .prepare('SELECT data FROM messages WHERE professor_id = ?')
              .all(id)
              .map((row) => JSON.parse(row.data)),
          );
        }
        const mailMatch = route.match(/^\/api\/japangrad\/messages\/([\w-]+)$/);
        if (
          (route === '/api/japangrad/messages' && req.method === 'POST') ||
          (mailMatch && req.method === 'PUT')
        ) {
          const input = await jsonBody(req);
          if (!ownerExists('professor', input.professorId))
            fail('老师不存在。', 404);
          if (
            !['received', 'sent'].includes(input.direction) ||
            !text(input.subject, 240) ||
            !input.subject.trim() ||
            !text(input.body, 100_000) ||
            !input.body.trim() ||
            !text(input.address, 300) ||
            !text(input.notes, 8000) ||
            !text(input.nextAction, 2000) ||
            !validPlannerMinute(input.date) ||
            (input.followUpDate && !validPlannerDay(input.followUpDate))
          )
            fail('请填写主题、正文和有效日期。');
          const existing =
            mailMatch &&
            db
              .prepare('SELECT data FROM messages WHERE id = ?')
              .get(mailMatch[1]);
          if (
            mailMatch &&
            (!existing ||
              JSON.parse(existing.data).professorId !== input.professorId)
          )
            fail('邮件记录不存在。', 404);
          const record = {
            id: mailMatch ? mailMatch[1] : randomUUID(),
            professorId: input.professorId,
            direction: input.direction,
            subject: input.subject.trim(),
            body: input.body,
            address: input.address.trim(),
            date: input.date,
            notes: input.notes,
            nextAction: input.nextAction,
            followUpDate: input.followUpDate || '',
            createdAt: existing
              ? JSON.parse(existing.data).createdAt
              : new Date().toISOString(),
          };
          experiences.writeMessage(
            record,
            input.experienceId,
            existing ? JSON.parse(existing.data) : undefined,
          );
          return json(res, record);
        }
        if (mailMatch && req.method === 'DELETE') {
          if (
            !db
              .prepare('SELECT id FROM messages WHERE id = ?')
              .get(mailMatch[1])
          )
            fail('邮件记录不存在。', 404);
          experiences.removeMessage(mailMatch[1]);
          return json(res, { removed: mailMatch[1] });
        }
        fail('接口不存在。', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method) || !staticDir)
        fail('页面不存在。', 404);
      const decoded = decodeURIComponent(route);
      const candidate = path.resolve(staticDir, `.${decoded}`);
      if (
        !candidate.startsWith(`${path.resolve(staticDir)}${path.sep}`) &&
        candidate !== path.resolve(staticDir)
      )
        fail('路径不合法。', 403);
      let target = candidate;
      try {
        const info = await stat(target);
        if (!info.isFile()) target = path.join(staticDir, 'index.html');
      } catch {
        if (path.extname(decoded)) fail('文件不存在。', 404);
        target = path.join(staticDir, 'index.html');
      }
      const actual = await realpath(target);
      if (!actual.startsWith(`${await realpath(staticDir)}${path.sep}`))
        fail('路径不合法。', 403);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.bcmap': 'application/octet-stream',
        '.ttf': 'font/ttf',
        '.wasm': 'application/wasm',
      };
      res.writeHead(200, {
        'Content-Type':
          types[path.extname(actual)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      });
      createReadStream(actual)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else {
        let status = 500;
        let description = '本地保存或读取失败，请检查文件权限和磁盘空间。';
        if (error instanceof HttpError) {
          status = error.status;
          description = error.message;
        } else if (error.code === 'ENOENT') {
          status = 404;
          description = '本地文件未找到，请检查工作区文件夹。';
        }
        const importCodes = new Set([
          'CREATE_ONLY_VIOLATION',
          'DUPLICATE_RECORD',
          'IMPORT_IN_PROGRESS',
          'LEGACY_REVIEW_REQUIRED',
          'PARENT_MISMATCH',
          'RESOURCE_SCOPE_REQUIRED',
          'REVIEW_STALE',
          'SOURCE_CHANGED',
        ]);
        const code = importCodes.has(error.code) ? error.code : undefined;
        if (code) {
          status = error.status;
          description = error.message;
        }
        json(res, { error: description, ...(code ? { code } : {}) }, status);
      }
    }
  };
  const server = createServer(handler);
  server.handleRequest = handler;
  server.activeTaskCount = () => {
    let total = collection.isImportBusy() ? 1 : 0;
    for (const table of [
      'collection_jobs',
      'admission_ai_runs',
      'analysis_jobs',
      'assistant_runs',
    ]) {
      try {
        total += db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${table} WHERE json_extract(data,'$.status') IN ('preparing','collecting','analyzing','queued','parsing','running')`,
          )
          .get().n;
      } catch {}
    }
    return total;
  };
  server.isBusy = () => server.activeTaskCount() > 0;
  server.dispose = () => {
    server.emit('japangrad:shutdown');
    server.emit('close');
  };
  server.on('japangrad:shutdown', () => {
    collection.close();
    admissionAi.close();
    ai.close();
    reader.close();
    assistant.close();
    analysis.close();
  });
  server.on('close', () => {
    collection.close();
    admissionAi.close();
    ai.close();
    reader.close();
    assistant.close();
    analysis.close();
    db.close();
  });
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const workspace = path.resolve(
    process.env.JAPANGRAD_WORKSPACE ||
      path.join(homedir(), 'Documents', 'JapanGradWorkspace'),
  );
  const port = Number(process.env.JAPANGRAD_PORT || 5667);
  const server = await createLocalApp({
    workspace,
    staticDir: path.resolve(
      process.env.JAPANGRAD_STATIC_DIR ||
        path.join(here, '../apps/web-antd/dist'),
    ),
    allowedOrigins:
      process.env.JAPANGRAD_DEV === '1'
        ? ['http://127.0.0.1:5666', 'http://localhost:5666']
        : [],
  });
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `端口 ${port} 已被占用，请关闭已有的 JapanGrad 服务，或设置 JAPANGRAD_PORT。`
        : error.message,
    );
    process.exitCode = 1;
    server.close();
  });
  server.listen(port, '127.0.0.1', () => {
    const address = `http://127.0.0.1:${server.address().port}/welcome`;
    // oxlint-disable-next-line no-console -- The local launcher reports its address and data folder.
    console.log(
      `JapanGrad: ${address}\n本地工作区: ${workspace}\n关闭本窗口或按 Ctrl+C 停止服务。`,
    );
    if (process.argv.includes('--open')) {
      let executable = 'xdg-open';
      if (process.platform === 'darwin') executable = 'open';
      else if (process.platform === 'win32') executable = 'rundll32';
      const args =
        process.platform === 'win32'
          ? ['url.dll,FileProtocolHandler', address]
          : [address];
      execFile(executable, args, () => {});
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.emit('japangrad:shutdown');
      server.close();
    });
}
