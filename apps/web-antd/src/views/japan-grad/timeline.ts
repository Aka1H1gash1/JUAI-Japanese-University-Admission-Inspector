import {
  TIMELINE_LABELS,
  timelineError,
} from '../../../../../local-server/timeline-fields.mjs';
export { TIMELINE_LABELS, timelineError };
export type TimelineKind = keyof typeof TIMELINE_LABELS;
export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  start: string;
  end: string;
  at: string;
  endAt: string;
  complete: boolean;
  notes: string;
  replaces: string;
  linkContact?: boolean;
}
export interface LabTimeline {
  events: TimelineEntry[];
  hiddenSources: string[];
}
export function emptyTimeline(): LabTimeline {
  return { events: [], hiddenSources: [] };
}

export const TIMELINE_PRESETS = [
  'contact',
  'consent',
  'application',
  'written',
  'interview',
  'result',
] as const;
export const TIMELINE_OPTIONS = [
  ...TIMELINE_PRESETS.map((value) => ({
    value,
    label: TIMELINE_LABELS[value],
  })),
  { value: 'custom' as const, label: '自定义' },
];
interface TimelineDisplayEvent {
  kind: string;
  title: string;
  start: string;
  end: string;
  at: string;
  endAt?: string;
  imported?: boolean;
  entryId?: string;
}
const oldDefaultNames: Record<string, string[]> = {
  contact: ['首次联系教授', '首次联系', '首次联络'],
  consent: ['拿到内诺', '内诺'],
  application: ['出愿'],
  written: ['笔试'],
  interview: ['入试面试', '面试'],
  result: ['结果公布', '结果发布', '放榜'],
  sent: ['首封邮件已发'],
  teacher_interview: ['教授面试'],
  followup: ['跟进教授'],
  task: ['材料 / 待办'],
  exam: ['考试'],
};
export function timelineCategory(kind: string): string {
  if (kind === 'sent') return 'contact';
  if (kind === 'teacher_interview') return 'interview';
  return TIMELINE_PRESETS.some((value) => value === kind) ? kind : 'custom';
}
export function timelineNodeLabel(event: TimelineDisplayEvent): string {
  const category = timelineCategory(event.kind);
  const preset =
    category === 'custom'
      ? TIMELINE_LABELS[event.kind as TimelineKind]
      : TIMELINE_LABELS[category as TimelineKind];
  if (event.imported && event.kind !== 'task') return preset || event.title;
  if (
    oldDefaultNames[event.kind]?.includes(event.title.trim()) ||
    (event.entryId?.startsWith('legacy-') &&
      /^\d{4} · (出愿|笔试|入试面试|结果公布)$/.test(event.title))
  )
    return preset || event.title;
  return event.title;
}
export function timelineDateText(event: TimelineDisplayEvent): string {
  const start = event.at ? event.at.replace('T', ' ') : event.start;
  if (event.endAt)
    return `${start} ～ ${event.end === event.start ? event.endAt.slice(11, 16) : event.endAt.replace('T', ' ')}`;
  return event.end !== event.start ? `${start} ～ ${event.end}` : start;
}
