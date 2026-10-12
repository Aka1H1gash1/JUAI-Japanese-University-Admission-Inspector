import { randomUUID } from 'node:crypto';
import {
  CONTACT_EDITABLE_FIELDS,
  CONTACT_STATUSES,
  emptyContactRecord,
  validPlannerDay,
  validPlannerMinute,
} from './planning-fields.mjs';
const now = () => new Date().toISOString();
const validId = (value) =>
  typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
const early = (status) =>
  ['not_contacted', 'first_sent', 'replied'].includes(status);
const cases = (person) =>
  [person.contact, ...(person.contactHistory ?? [])].filter(Boolean);
const editableSignature = (value) =>
  JSON.stringify(
    Object.fromEntries(CONTACT_EDITABLE_FIELDS.map((key) => [key, value[key]])),
  );
export function createExperienceService({
  db,
  snapshot,
  transaction,
  fail,
  json,
  jsonBody,
  validateExplorer,
}) {
  const messages = () =>
    db
      .prepare('SELECT data FROM messages')
      .all()
      .map((row) => JSON.parse(row.data));
  const updateWorkspace = (data, previous) => {
    if (JSON.stringify(data) === JSON.stringify(previous.data)) return;
    validateExplorer(data);
    db.prepare(
      'UPDATE workspace_data SET data = ?, revision = revision + 1 WHERE id = 1',
    ).run(JSON.stringify(data));
  };
  function normalize(value, previous) {
    const contact = { ...emptyContactRecord(), ...previous, ...value };
    contact.experienceId ||= randomUUID();
    contact.experienceTitle = (contact.experienceTitle || '考学经历').trim();
    contact.createdAt = previous?.createdAt || contact.createdAt || now();
    contact.stageHistory = previous?.stageHistory ?? contact.stageHistory ?? [];
    contact.interviewQA ??= [];
    return contact;
  }
  function reconcileCase(
    value,
    previous,
    professorId,
    mailRows,
    origin,
    checkVersions,
  ) {
    let contact = normalize(value, previous);
    if (
      checkVersions &&
      previous &&
      value?.version !== undefined &&
      value.version !== previous.version &&
      editableSignature(contact) !== editableSignature(normalize(previous))
    )
      fail('考学记录已被更新，请重新读取后保存。', 409);
    const rows = mailRows
      .filter(
        (m) =>
          m.professorId === professorId &&
          m.experienceId === contact.experienceId,
      )
      .toSorted(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    const sent = rows.find((m) => m.direction === 'sent');
    const firstDay =
      sent && validPlannerDay(sent.date.slice(0, 10))
        ? sent.date.slice(0, 10)
        : '';
    if (
      !contact.firstSentDate ||
      contact.firstSentDate === contact.mailFirstSentDate
    )
      contact.firstSentDate = firstDay;
    contact.mailFirstSentDate = firstDay;
    const followDay = rows.at(-1)?.followUpDate || '';
    if (
      !contact.followUpDate ||
      contact.followUpDate === contact.mailFollowUpDate
    )
      contact.followUpDate = validPlannerDay(followDay) ? followDay : '';
    contact.mailFollowUpDate = validPlannerDay(followDay) ? followDay : '';
    let inferred = false;
    if (early(contact.status) && (rows.length || contact.mailManaged)) {
      const status = rows.some((m) => m.direction === 'received')
        ? 'replied'
        : sent
          ? 'first_sent'
          : 'not_contacted';
      inferred = contact.status !== status;
      contact.status = status;
      contact.mailManaged = true;
    }
    for (const [key, dateField, marker] of [
      ['consentEmailId', 'consentDate', 'consentMailDate'],
      ['resultEmailId', 'resultDate', 'resultMailDate'],
    ]) {
      if (!contact[key]) continue;
      const mail = rows.find(
        (m) => m.id === contact[key] && m.direction === 'received',
      );
      if (!mail) fail('引用的邮件必须是本段经历中该老师的来信。');
      const day = validPlannerDay(mail.date.slice(0, 10))
        ? mail.date.slice(0, 10)
        : '';
      if (
        day &&
        (!contact[dateField] || contact[dateField] === contact[marker])
      )
        contact[dateField] = day;
      contact[marker] = day;
    }
    const before = previous ? normalize(previous) : undefined;
    const changed =
      !before ||
      JSON.stringify({
        ...contact,
        version: 0,
        updatedAt: '',
        stageHistory: [],
      }) !==
        JSON.stringify({
          ...before,
          version: 0,
          updatedAt: '',
          stageHistory: [],
        });
    if (changed) {
      contact.version = (previous?.version ?? 0) + 1;
      contact.updatedAt = now();
      if (!previous || previous.status !== contact.status)
        contact.stageHistory = [
          ...(previous?.stageHistory ?? []),
          {
            id: randomUUID(),
            status: contact.status,
            at: now(),
            via: inferred || origin === 'mail' ? 'mail' : 'manual',
            description: !previous
              ? '建立考学经历'
              : inferred
                ? '根据本段经历的收发邮件更新阶段'
                : '更新考学阶段',
          },
        ].slice(-100);
    } else {
      contact.version = previous.version;
      contact.updatedAt = previous.updatedAt;
    }
    return contact;
  }
  function prepare(
    data,
    previousData,
    { origin = 'manual', checkVersions = true } = {},
  ) {
    const mailRows = messages();
    for (const person of data.professors) {
      const previousPerson = previousData.professors.find(
        (p) => p.id === person.id,
      );
      person.contactHistory ??= previousPerson?.contactHistory ?? [];
      const oldCases = new Map(
        cases(previousPerson ?? {}).map((c) => [c.experienceId, c]),
      );
      const active = { ...previousPerson?.contact, ...person.contact };
      active.experienceId ||=
        previousPerson?.contact?.experienceId || randomUUID();
      active.experienceTitle ||= `${person.name} · 考学经历`;
      if (
        previousPerson?.contact?.experienceId &&
        active.experienceId !== previousPerson.contact.experienceId &&
        !person.contactHistory.some(
          (c) => c.experienceId === previousPerson.contact.experienceId,
        )
      )
        fail('新建经历时必须保留上一段经历。');
      for (const previous of previousPerson?.contactHistory ?? [])
        if (
          !person.contactHistory.some(
            (c) => c.experienceId === previous.experienceId,
          ) &&
          previous.experienceId !== active.experienceId
        )
          person.contactHistory.push(previous);
      person.contact = reconcileCase(
        active,
        oldCases.get(active.experienceId),
        person.id,
        mailRows,
        origin,
        checkVersions,
      );
      person.contactHistory = person.contactHistory.map((value) =>
        reconcileCase(
          value,
          oldCases.get(value.experienceId),
          person.id,
          mailRows,
          origin,
          checkVersions,
        ),
      );
    }
    return data;
  }
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version = 5').get()
  )
    transaction(() => {
      const current = snapshot(),
        data = structuredClone(current.data);
      for (const person of data.professors) {
        person.contact = normalize({
          ...person.contact,
          experienceTitle:
            person.contact?.experienceTitle || `${person.name} · 考学经历`,
        });
        person.contactHistory ??= [];
      }
      for (const row of db.prepare('SELECT id, data FROM messages').all()) {
        const mail = JSON.parse(row.data),
          person = data.professors.find((p) => p.id === mail.professorId);
        if (person && !mail.experienceId) {
          mail.experienceId = person.contact.experienceId;
          db.prepare('UPDATE messages SET data = ? WHERE id = ?').run(
            JSON.stringify(mail),
            row.id,
          );
        }
      }
      for (const row of db
        .prepare(
          "SELECT id, owner_id, data FROM documents WHERE owner_type = 'professor'",
        )
        .all()) {
        const doc = JSON.parse(row.data),
          person = data.professors.find((p) => p.id === row.owner_id);
        if (doc.kind === 'consent' && person && !doc.experienceId) {
          doc.experienceId = person.contact.experienceId;
          db.prepare('UPDATE documents SET data = ? WHERE id = ?').run(
            JSON.stringify(doc),
            row.id,
          );
        }
      }
      for (const lab of data.labs ?? [])
        for (const person of data.professors.filter(
          (p) => p.labId === lab.id,
        )) {
          for (const suffix of [
            'planned',
            'sent',
            'followup',
            'interview',
            'consent',
            'outcome',
          ]) {
            const oldSource = `${person.id}-${suffix}`,
              next = `${person.id}-${person.contact.experienceId}-${suffix}`;
            for (const entry of lab.timeline?.events ?? [])
              if (entry.replaces === oldSource) entry.replaces = next;
            if (lab.timeline)
              lab.timeline.hiddenSources = lab.timeline.hiddenSources.map(
                (s) => (s === oldSource ? next : s),
              );
          }
        }
      prepare(data, data, { checkVersions: false });
      updateWorkspace(data, current);
      db.prepare(
        "INSERT INTO schema_migrations VALUES (5, datetime('now'))",
      ).run();
    });
  function selectedCase(person, experienceId) {
    const record = cases(person).find((c) => c.experienceId === experienceId);
    if (!record) fail('考学经历不存在或不属于该老师。', 404);
    return record;
  }
  function preserveReference(record, mail) {
    if (record.consentEmailId === mail.id) {
      record.consentOriginal = mail.body;
      record.consentSourceNote = `原邮件「${mail.subject}」已移除或转至其他经历，保留当时原文。`;
      record.consentEmailId = '';
    }
    if (record.resultEmailId === mail.id) {
      record.resultOriginal = mail.body;
      record.resultSourceNote = `原邮件「${mail.subject}」已移除或转至其他经历，保留当时原文。`;
      record.resultEmailId = '';
    }
  }
  function writeMessage(record, requestedExperienceId, previousMail) {
    const current = snapshot(),
      data = structuredClone(current.data),
      person = data.professors.find((p) => p.id === record.professorId);
    if (!person) fail('老师已不存在。', 404);
    record.experienceId =
      requestedExperienceId ||
      previousMail?.experienceId ||
      person.contact.experienceId;
    selectedCase(person, record.experienceId);
    transaction(() => {
      if (
        previousMail &&
        (previousMail.experienceId !== record.experienceId ||
          record.direction !== 'received')
      )
        for (const contact of cases(person))
          preserveReference(contact, previousMail);
      db.prepare(
        'INSERT INTO messages VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      ).run(record.id, record.professorId, JSON.stringify(record));
      prepare(data, current.data, { origin: 'mail', checkVersions: false });
      updateWorkspace(data, current);
    });
    return record;
  }
  function removeMessage(id) {
    const row = db.prepare('SELECT data FROM messages WHERE id = ?').get(id);
    if (!row) fail('邮件记录不存在。', 404);
    const mail = JSON.parse(row.data),
      current = snapshot(),
      data = structuredClone(current.data);
    transaction(() => {
      for (const person of data.professors)
        for (const contact of cases(person)) preserveReference(contact, mail);
      db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      prepare(data, current.data, { origin: 'mail', checkVersions: false });
      updateWorkspace(data, current);
    });
  }
  function consentMetadata(meta) {
    const person = snapshot().data.professors.find(
      (p) => p.id === meta.ownerId,
    );
    if (!person) fail('老师不存在。', 404);
    const experienceId = meta.experienceId || person.contact.experienceId;
    selectedCase(person, experienceId);
    if (meta.signed !== undefined && typeof meta.signed !== 'boolean')
      fail('内诺文件签署状态格式错误。');
    if (meta.signedDate && (!meta.signed || !validPlannerDay(meta.signedDate)))
      fail('请填写有效签署日期，并确认文件已签署。');
    return {
      experienceId,
      signed: meta.signed === true,
      signedDate: meta.signedDate || '',
    };
  }
  async function handle(req, res, route) {
    if (route === '/api/japangrad/experience-library' && req.method === 'GET') {
      const url = new URL(req.url, 'http://127.0.0.1'),
        ids = [
          ...new Set(
            (url.searchParams.get('professorIds') || '')
              .split(',')
              .filter(Boolean),
          ),
        ];
      if (!ids.length || ids.length > 100 || ids.some((id) => !validId(id)))
        fail('每次最多读取 100 位老师的关联资料。');
      const owners = new Set(
        snapshot()
          .data.professors.filter((p) => ids.includes(p.id))
          .map((p) => p.id),
      );
      const mail = messages().filter((m) => owners.has(m.professorId));
      const docs = db
        .prepare("SELECT data FROM documents WHERE owner_type = 'professor'")
        .all()
        .map((row) => JSON.parse(row.data))
        .filter((d) => owners.has(d.ownerId));
      const requirements = {};
      for (const majorId of new Set(
        snapshot()
          .data.professors.filter((p) => owners.has(p.id))
          .map((p) => p.majorId),
      )) {
        const row = db
          .prepare('SELECT data FROM analysis_requirements WHERE major_id = ?')
          .get(majorId);
        if (row) requirements[majorId] = JSON.parse(row.data).fields ?? {};
      }
      json(res, {
        messages: mail,
        documents: docs,
        requirements,
        revision: snapshot().revision,
      });
      return true;
    }
    const match = route.match(
      /^\/api\/japangrad\/professors\/([\w-]+)\/experiences(?:\/([\w-]+))?$/,
    );
    if (!match) return false;
    const input = await jsonBody(req),
      current = snapshot(),
      data = structuredClone(current.data),
      person = data.professors.find((p) => p.id === match[1]);
    if (!person) fail('老师不存在。', 404);
    if (!match[2] && req.method === 'POST') {
      if (
        !input ||
        typeof input.title !== 'string' ||
        !input.title.trim() ||
        input.title.length > 160
      )
        fail('请填写考学经历名称。');
      if (
        input.expectedExperienceId !== person.contact.experienceId ||
        input.version !== person.contact.version
      )
        fail('当前经历已更新，请刷新后再新建。', 409);
      if (person.contactHistory.length >= 20)
        fail('已达到 20 段历史经历上限。');
      person.contactHistory.push(structuredClone(person.contact));
      person.contact = {
        ...emptyContactRecord(),
        experienceId: randomUUID(),
        experienceTitle: input.title.trim(),
        createdAt: now(),
      };
      if (input.labId) {
        const lab = data.labs.find(
          (l) => l.id === input.labId && person.labId === l.id,
        );
        if (!lab) fail('主要联系老师必须属于该研究室。');
        lab.mainProfessorId = person.id;
      }
      prepare(data, current.data, { checkVersions: false });
      transaction(() => updateWorkspace(data, current));
      json(
        res,
        { experience: person.contact, revision: snapshot().revision },
        201,
      );
      return true;
    }
    if (match[2] && req.method === 'PATCH') {
      const record = selectedCase(person, match[2]);
      if (
        !input?.patch ||
        typeof input.patch !== 'object' ||
        Array.isArray(input.patch) ||
        Object.keys(input.patch).some(
          (key) => !CONTACT_EDITABLE_FIELDS.includes(key),
        )
      )
        fail('考学记录字段不合法。');
      if (!Number.isSafeInteger(input.version)) fail('缺少考学记录版本。');
      if (input.version !== record.version)
        for (const key of Object.keys(input.patch))
          if (JSON.stringify(input.base?.[key]) !== JSON.stringify(record[key]))
            fail('填写内容与最新记录冲突，请重新读取后核对。', 409);
      Object.assign(record, input.patch);
      if (input.labId) {
        const lab = data.labs.find(
          (l) => l.id === input.labId && person.labId === l.id,
        );
        if (!lab) fail('主要联系老师必须属于该研究室。');
        lab.mainProfessorId = person.id;
      }
      prepare(data, current.data, { checkVersions: false });
      transaction(() => updateWorkspace(data, current));
      json(res, {
        experience: selectedCase(person, match[2]),
        revision: snapshot().revision,
      });
      return true;
    }
    fail('考学记录接口不存在。', 404);
  }
  return { prepare, handle, writeMessage, removeMessage, consentMetadata };
}
