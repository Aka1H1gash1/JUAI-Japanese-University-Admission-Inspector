import type { PlannerEvent } from './application-calendar';
import type { ProfessorContact } from './application-planning';

export const FLOW_STAGES = [
  { id: 'prepare', label: '资料准备', hint: '确定目标、核对要求' },
  { id: 'contact', label: '联系教授', hint: '首封联络、沟通记录' },
  { id: 'interview', label: '教授面谈', hint: '预约、准备与复盘' },
  { id: 'consent', label: '内诺确认', hint: '内诺原文与签署文件' },
  { id: 'apply', label: '出愿提交', hint: '材料寄送、报名确认' },
  { id: 'exam', label: '笔试与面试', hint: '入试安排、准考资料' },
  { id: 'result', label: '结果与入学', hint: '结果、手续与入学' },
] as const;
export type FlowStageId = (typeof FLOW_STAGES)[number]['id'];
export const FLOW_FIELDS: Record<
  FlowStageId,
  { key: string; label: string; type?: 'date' | 'textarea' }[]
> = {
  prepare: [
    { key: 'goal', label: '申请目标与准备方向' },
    { key: 'requirements', label: '待确认的申请要求', type: 'textarea' },
  ],
  contact: [
    { key: 'firstSentDate', label: '首封发出日期', type: 'date' },
    { key: 'followUpDate', label: '下次跟进日期', type: 'date' },
    {
      key: 'replySummary',
      label: '已明确的回复与待确认事项',
      type: 'textarea',
    },
  ],
  interview: [
    { key: 'interviewDate', label: '预约面谈日期', type: 'date' },
    { key: 'actualInterviewDate', label: '实际面谈日期', type: 'date' },
    { key: 'interviewPreparation', label: '面谈准备', type: 'textarea' },
    { key: 'interviewNotes', label: '面谈记录与复盘', type: 'textarea' },
  ],
  consent: [
    { key: 'consentDate', label: '内诺确认日期', type: 'date' },
    { key: 'followUpDate', label: '下次跟进日期', type: 'date' },
    { key: 'consentOriginal', label: '内诺邮件原文', type: 'textarea' },
    { key: 'notes', label: '内诺说明与待办', type: 'textarea' },
  ],
  apply: [
    { key: 'submissionDate', label: '实际提交日期', type: 'date' },
    { key: 'applicationNumber', label: '报名编号 / 邮寄单号' },
    { key: 'submissionNotes', label: '提交方式与确认记录', type: 'textarea' },
  ],
  exam: [
    { key: 'candidateNumber', label: '准考证号' },
    { key: 'examLocation', label: '考场 / 面试方式' },
    { key: 'examPreparation', label: '考试准备与注意事项', type: 'textarea' },
  ],
  result: [
    { key: 'resultDate', label: '结果确认日期', type: 'date' },
    { key: 'finalResult', label: '录取 / 最终结果' },
    { key: 'enrollmentNotes', label: '入学手续与后续安排', type: 'textarea' },
  ],
};
export function suggestedFlowStage(contact: ProfessorContact): FlowStageId {
  if (contact.finalResult !== 'pending' || contact.status === 'closed')
    return 'result';
  if (contact.status === 'consent' || contact.consentDate) return 'consent';
  if (['interview_completed', 'interview_scheduled'].includes(contact.status))
    return 'interview';
  if (['first_sent', 'replied'].includes(contact.status)) return 'contact';
  return 'prepare';
}
export function materialSummary(
  items: { complete: boolean; files: unknown[] }[],
) {
  return {
    total: items.length,
    complete: items.filter((item) => item.complete).length,
    pending: items.filter((item) => !item.complete).length,
    withoutFiles: items.filter((item) => item.files.length === 0).length,
  };
}
/** Keep past dates visible as past; never invent a date or combine different batches. */
export function nearestRecordedEvent(
  events: PlannerEvent[],
  kinds: string[],
  today: string,
) {
  const relevant = events.filter((event) => kinds.includes(event.kind));
  return (
    relevant
      .filter((event) => event.end >= today)
      .toSorted((a, b) => a.start.localeCompare(b.start))[0] ||
    relevant.toSorted((a, b) => b.start.localeCompare(a.start))[0]
  );
}
export function materialCandidates(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Summarize same-day nodes without deleting or treating their sources as one exam. */
export function agendaGroups(events: PlannerEvent[]) {
  const groups = new Map<string, PlannerEvent & { sourceIds: string[] }>();
  for (const event of events) {
    const key = [
      event.labId,
      event.kind,
      event.start,
      event.end,
      event.at,
    ].join('|');
    const group = groups.get(key);
    if (group) group.sourceIds.push(event.id);
    else groups.set(key, { ...event, sourceIds: [event.id] });
  }
  return [...groups.values()];
}
