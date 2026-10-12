export const CONTACT_STATUSES = [
  'not_contacted',
  'first_sent',
  'replied',
  'interview_scheduled',
  'interview_completed',
  'consent',
  'closed',
];
export function validPlannerDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 2200 &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}
export function validPlannerMinute(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
    validPlannerDay(value.slice(0, 10)) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60
  );
}
export const CONTACT_RESULTS = [
  'pending',
  'admitted',
  'rejected',
  'withdrawn',
  'other',
];
export const CONTACT_EDITABLE_FIELDS = [
  'status',
  'experienceTitle',
  'plannedDate',
  'firstSentDate',
  'interviewDate',
  'interviewAt',
  'actualInterviewDate',
  'actualInterviewAt',
  'consentDate',
  'followUpDate',
  'draftSubject',
  'draftBody',
  'replySummary',
  'notes',
  'requirements',
  'interviewPreparation',
  'interviewNotes',
  'interviewQA',
  'consentEmailId',
  'consentOriginal',
  'finalResult',
  'resultDate',
  'resultNotes',
  'resultEmailId',
  'resultOriginal',
];
export function emptyContactRecord() {
  return {
    status: 'not_contacted',
    experienceId: '',
    experienceTitle: '',
    createdAt: '',
    updatedAt: '',
    version: 0,
    plannedDate: '',
    firstSentDate: '',
    interviewDate: '',
    interviewAt: '',
    actualInterviewDate: '',
    actualInterviewAt: '',
    consentDate: '',
    followUpDate: '',
    draftSubject: '',
    draftBody: '',
    replySummary: '',
    notes: '',
    requirements: '',
    interviewPreparation: '',
    interviewNotes: '',
    interviewQA: [],
    consentEmailId: '',
    consentOriginal: '',
    consentSourceNote: '',
    consentMailDate: '',
    finalResult: 'pending',
    resultDate: '',
    resultNotes: '',
    resultEmailId: '',
    resultOriginal: '',
    resultSourceNote: '',
    resultMailDate: '',
    stageHistory: [],
    mailManaged: false,
    mailFirstSentDate: '',
    mailFollowUpDate: '',
  };
}
export function planningError(data) {
  const text = (value, max) =>
    value === undefined || (typeof value === 'string' && value.length <= max);
  const validId = (value) =>
    typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
  const experienceIds = new Set();
  for (const person of data.professors ?? []) {
    if (
      person.contactHistory !== undefined &&
      (!Array.isArray(person.contactHistory) ||
        person.contactHistory.length > 20)
    )
      return '每位老师最多保留 20 段过往考学经历。';
    for (const contact of [
      person.contact,
      ...(person.contactHistory ?? []),
    ].filter((value) => value !== undefined)) {
      if (
        !contact ||
        typeof contact !== 'object' ||
        Array.isArray(contact) ||
        !CONTACT_STATUSES.includes(contact.status)
      )
        return '教授联系状态格式错误。';
      if (contact.experienceId) {
        if (
          !validId(contact.experienceId) ||
          experienceIds.has(contact.experienceId)
        )
          return '考学经历 ID 不合法或重复。';
        experienceIds.add(contact.experienceId);
      }
      if (
        contact.version !== undefined &&
        (!Number.isSafeInteger(contact.version) || contact.version < 0)
      )
        return '考学记录版本格式错误。';
      for (const key of [
        'plannedDate',
        'firstSentDate',
        'interviewDate',
        'actualInterviewDate',
        'consentDate',
        'followUpDate',
        'resultDate',
        'mailFirstSentDate',
        'mailFollowUpDate',
        'consentMailDate',
        'resultMailDate',
      ])
        if (
          !text(contact[key], 10) ||
          (contact[key] && !validPlannerDay(contact[key]))
        )
          return '联络或结果日期请填写有效的年月日。';
      for (const key of ['interviewAt', 'actualInterviewAt'])
        if (
          !text(contact[key], 16) ||
          (contact[key] && !validPlannerMinute(contact[key]))
        )
          return '面试时间请填写有效日期和时间。';
      for (const [key, max] of Object.entries({
        experienceTitle: 160,
        draftSubject: 240,
        draftBody: 20000,
        replySummary: 8000,
        notes: 4000,
        requirements: 8000,
        interviewPreparation: 12000,
        interviewNotes: 8000,
        consentOriginal: 100000,
        consentSourceNote: 500,
        resultOriginal: 100000,
        resultSourceNote: 500,
      }))
        if (!text(contact[key], max))
          return '考学记录的正文、准备内容或备注过长。';
      for (const key of ['consentEmailId', 'resultEmailId'])
        if (
          contact[key] !== undefined &&
          contact[key] !== '' &&
          !validId(contact[key])
        )
          return '关联邮件 ID 不合法。';
      if (
        contact.finalResult !== undefined &&
        !CONTACT_RESULTS.includes(contact.finalResult)
      )
        return '考学结果格式错误。';
      if (
        contact.mailManaged !== undefined &&
        typeof contact.mailManaged !== 'boolean'
      )
        return '邮件联动状态格式错误。';
      if (contact.interviewQA !== undefined) {
        if (
          !Array.isArray(contact.interviewQA) ||
          contact.interviewQA.length > 30
        )
          return '每段经历最多保存 30 条面试问答。';
        const ids = new Set();
        for (const entry of contact.interviewQA) {
          if (
            !entry ||
            !validId(entry.id) ||
            ids.has(entry.id) ||
            typeof entry.question !== 'string' ||
            !entry.question.trim() ||
            entry.question.length > 2000 ||
            typeof entry.answer !== 'string' ||
            entry.answer.length > 6000
          )
            return '请填写面试问题，问题最多 2000 字，回答最多 6000 字。';
          ids.add(entry.id);
        }
      }
      if (
        contact.stageHistory !== undefined &&
        (!Array.isArray(contact.stageHistory) ||
          contact.stageHistory.length > 100 ||
          contact.stageHistory.some(
            (entry) =>
              !entry ||
              !validId(entry.id) ||
              !CONTACT_STATUSES.includes(entry.status) ||
              !['mail', 'manual'].includes(entry.via) ||
              typeof entry.at !== 'string' ||
              !Number.isFinite(Date.parse(entry.at)) ||
              !text(entry.description, 500),
          ))
      )
        return '考学阶段变更记录格式错误。';
    }
  }
  for (const lab of data.labs ?? []) {
    if (
      lab.languageRequirements !== undefined &&
      !text(lab.languageRequirements, 4000)
    )
      return '研究室语言要求格式错误或超过 4000 字。';
    if (
      lab.mainProfessorId !== undefined &&
      (typeof lab.mainProfessorId !== 'string' ||
        (lab.mainProfessorId &&
          !(data.professors ?? []).some(
            (person) =>
              person.id === lab.mainProfessorId && person.labId === lab.id,
          )))
    )
      return '主要联系老师必须属于该研究室。';
    if (lab.tasks === undefined) continue;
    if (!Array.isArray(lab.tasks) || lab.tasks.length > 200)
      return '每个研究室最多记录 200 条材料或待办。';
    const ids = new Set();
    for (const task of lab.tasks) {
      if (
        !task ||
        typeof task.id !== 'string' ||
        !/^[\w-]{1,100}$/.test(task.id) ||
        ids.has(task.id) ||
        typeof task.title !== 'string' ||
        !task.title.trim() ||
        task.title.length > 160 ||
        !['material', 'todo'].includes(task.kind) ||
        !Number.isInteger(task.progress) ||
        task.progress < 0 ||
        task.progress > 100 ||
        typeof task.notes !== 'string' ||
        task.notes.length > 4000 ||
        typeof task.dueDate !== 'string' ||
        (task.dueDate && !validPlannerDay(task.dueDate))
      )
        return '材料 / 待办的名称、进度或截止日期不合法。';
      ids.add(task.id);
    }
  }
  return '';
}
