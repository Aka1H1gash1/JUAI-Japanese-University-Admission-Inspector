export const CONTACT_STATUSES = [
  'not_contacted',
  'first_sent',
  'replied',
  'interview_scheduled',
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
export function planningError(data) {
  const text = (value, max) =>
    value === undefined || (typeof value === 'string' && value.length <= max);
  for (const person of data.professors ?? []) {
    const contact = person.contact;
    if (contact === undefined) continue;
    if (
      !contact ||
      typeof contact !== 'object' ||
      Array.isArray(contact) ||
      !CONTACT_STATUSES.includes(contact.status)
    )
      return '教授联系状态格式错误。';
    for (const key of [
      'plannedDate',
      'firstSentDate',
      'consentDate',
      'followUpDate',
    ]) {
      if (
        !text(contact[key], 10) ||
        (contact[key] && !validPlannerDay(contact[key]))
      )
        return '联络日期请填写有效的年月日。';
    }
    if (
      !text(contact.interviewAt, 16) ||
      (contact.interviewAt && !validPlannerMinute(contact.interviewAt))
    )
      return '教授面试时间格式错误，请填写有效日期和时间。';
    for (const [key, max] of Object.entries({
      draftSubject: 240,
      draftBody: 20000,
      replySummary: 8000,
      notes: 4000,
    }))
      if (!text(contact[key], max)) return '教授联络草稿或备注过长。';
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
