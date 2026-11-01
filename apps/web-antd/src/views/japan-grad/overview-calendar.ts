import type { PlannerEvent } from './application-calendar';

import { addDays, dayNumber } from './application-planning';

export function startOfWeek(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function calendarDays(anchor: string, view: 'month' | 'week') {
  if (view === 'week')
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const first = `${anchor.slice(0, 7)}-01`;
  const date = new Date(`${first}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const next = date.toISOString().slice(0, 10);
  const start = startOfWeek(first);
  const count = Math.ceil((dayNumber(next) - dayNumber(start)) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function moveCalendar(
  anchor: string,
  view: 'month' | 'week',
  step: number,
) {
  if (view === 'week') return addDays(anchor, step * 7);
  const date = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 10);
}

export function eventsOnDay(events: PlannerEvent[], day: string) {
  return events
    .filter(
      (event) =>
        event.kind !== 'task' && event.start <= day && event.end >= day,
    )
    .toSorted(
      (a, b) =>
        a.at.localeCompare(b.at) || a.title.localeCompare(b.title, 'zh-CN'),
    );
}

export function calendarEventSummary(event: PlannerEvent) {
  const labels: Partial<Record<PlannerEvent['kind'], string>> = {
    application: '出愿',
    written: '笔试',
    interview: '面试',
    result: '放榜',
    contact: '联络',
    followup: '跟进',
    teacher_interview: '导师面试',
    sent: '发信',
    consent: '内诺',
    exam: '考试',
  };
  return [labels[event.kind] || event.title, event.labName]
    .filter(Boolean)
    .join(' · ');
}
