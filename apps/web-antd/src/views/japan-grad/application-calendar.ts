import type { LabTarget } from './lab-targets';
import { targetExams } from './lab-targets';
import {
  addDays,
  dateFromText,
  dayNumber,
  japanToday,
  normalizedContact,
  validPlannerDay,
} from './application-planning';
export type PlannerEventKind =
  | 'application'
  | 'written'
  | 'interview'
  | 'result'
  | 'contact'
  | 'followup'
  | 'teacher_interview'
  | 'task'
  | 'sent'
  | 'consent'
  | 'exam';
export interface PlannerEvent {
  id: string;
  source: string;
  labId: string;
  labName: string;
  universityName: string;
  title: string;
  kind: PlannerEventKind;
  start: string;
  end: string;
  at: string;
  complete: boolean;
  details: string;
  path: string;
}
function dateRange(text: string) {
  const parts = text.trim().split(/\s*(?:[~～〜]|至|到|—|–|\s-\s)\s*/);
  const start = dateFromText(parts[0] ?? '');
  const end = dateFromText(parts[1] ?? '') || start;
  return start && end >= start ? { start, end } : undefined;
}
export function buildPlannerEvents(targets: LabTarget[], year = 'latest') {
  const events: PlannerEvent[] = [];
  for (const target of targets) {
    const { lab, major, school, university } = target;
    const path = `/japan-grad/universities/${university.id}/schools/${school.id}/majors/${major.id}/labs/${lab.id}`;
    const add = (
      source: string,
      kind: PlannerEventKind,
      title: string,
      start: string,
      end = start,
      complete = false,
      details = '',
      at = '',
      eventPath = `${path}?tab=admissions`,
    ) => {
      if (!validPlannerDay(start) || !validPlannerDay(end) || end < start)
        return;
      events.push({
        id: `${lab.id}-${source}`,
        source,
        labId: lab.id,
        labName: lab.name,
        universityName: university.name,
        kind,
        title,
        start,
        end,
        complete,
        details,
        at,
        path: eventPath,
      });
    };
    const applicationStart = dateFromText(major.applicationStart);
    const applicationEnd = dateFromText(major.applicationEnd);
    if (applicationStart && applicationEnd)
      add(
        `application-${major.id}`,
        'application',
        '出愿',
        applicationStart,
        applicationEnd,
        false,
        major.applicationMaterials,
      );
    else if (applicationEnd)
      add(
        `application-${major.id}`,
        'application',
        '出愿截止（开始时间待确认）',
        applicationEnd,
        applicationEnd,
        false,
        major.applicationMaterials,
      );
    else if (applicationStart)
      add(
        `application-${major.id}`,
        'application',
        '出愿开始（截止时间待确认）',
        applicationStart,
        applicationStart,
        false,
        major.applicationMaterials,
      );
    for (const record of targetExams(target, year)) {
      for (const [field, kind, title] of [
        ['writtenDate', 'written', '笔试'],
        ['interviewDate', 'interview', '入试面试'],
        ['resultDate', 'result', '结果发布'],
        ['examDate', 'exam', '原考试时间'],
      ] as const) {
        const range = dateRange(record[field]);
        if (range)
          add(
            `${major.id}-${record.id}-${kind}`,
            kind,
            `${record.year} ${record.session} ${title}`.trim(),
            range.start,
            range.end,
            false,
            [
              `原时间：${record[field]}`,
              record.subjects,
              record.notes,
              lab.examNotes,
            ]
              .filter(Boolean)
              .join('\n'),
          );
      }
    }
    for (const person of target.professors) {
      const contact = normalizedContact(person.contact);
      const personPath = `${path}/professors/${person.id}?tab=contact`;
      add(
        `${person.id}-planned`,
        'contact',
        `联系 ${person.name}`,
        contact.plannedDate,
        contact.plannedDate,
        contact.status !== 'not_contacted',
        '',
        '',
        personPath,
      );
      add(
        `${person.id}-sent`,
        'sent',
        `首封已发 · ${person.name}`,
        contact.firstSentDate,
        contact.firstSentDate,
        true,
        '',
        '',
        personPath,
      );
      add(
        `${person.id}-followup`,
        'followup',
        `跟进 ${person.name}`,
        contact.followUpDate,
        contact.followUpDate,
        contact.status === 'closed',
        contact.notes,
        '',
        personPath,
      );
      if (contact.interviewAt)
        add(
          `${person.id}-interview`,
          'teacher_interview',
          `教授面试 · ${person.name}`,
          contact.interviewAt.slice(0, 10),
          contact.interviewAt.slice(0, 10),
          contact.status === 'closed',
          contact.replySummary,
          contact.interviewAt,
          personPath,
        );
      add(
        `${person.id}-consent`,
        'consent',
        `内诺 · ${person.name}`,
        contact.consentDate,
        contact.consentDate,
        true,
        '',
        '',
        personPath,
      );
    }
    for (const task of lab.tasks ?? [])
      add(
        `${lab.id}-${task.id}`,
        'task',
        task.title,
        task.dueDate,
        task.dueDate,
        task.progress === 100,
        task.notes,
        '',
        `${path}?tab=tasks`,
      );
  }
  return events.toSorted(
    (a, b) =>
      a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'zh-CN'),
  );
}
export function eventCountdown(event: PlannerEvent, today = japanToday()) {
  if (event.complete)
    return event.kind === 'task'
      ? '已完成'
      : ['sent', 'consent'].includes(event.kind)
        ? '已记录'
        : '已结束';
  if (event.end < today)
    return ['task', 'followup', 'contact'].includes(event.kind)
      ? `已逾期 ${Math.round(dayNumber(today) - dayNumber(event.end))} 天`
      : '日期已过';
  if (event.start <= today && event.end > today)
    return `进行中 · ${Math.round(dayNumber(event.end) - dayNumber(today))} 天后截止`;
  const days = Math.round(dayNumber(event.start) - dayNumber(today));
  return days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`;
}
export function plannerReminders(events: PlannerEvent[], today = japanToday()) {
  return events
    .filter(
      (event) =>
        !event.complete &&
        (['task', 'followup', 'contact'].includes(event.kind) ||
          event.end >= today) &&
        dayNumber(event.start) - dayNumber(today) <= 30,
    )
    .toSorted(
      (a, b) =>
        (a.end < today
          ? -1
          : a.start <= today
            ? dayNumber(a.end)
            : dayNumber(a.start)) -
          (b.end < today
            ? -1
            : b.start <= today
              ? dayNumber(b.end)
              : dayNumber(b.start)) || a.end.localeCompare(b.end),
    );
}
export function plannerConflicts(events: PlannerEvent[]) {
  const candidates = events.filter((item) =>
    [
      'written',
      'interview',
      'teacher_interview',
      'exam',
      'application',
    ].includes(item.kind),
  );
  const results: {
    key: string;
    a: PlannerEvent;
    b: PlannerEvent;
    label: string;
  }[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < candidates.length; index++) {
    const a = candidates[index]!;
    for (let next = index + 1; next < candidates.length; next++) {
      const b = candidates[next]!;
      if (b.start > a.end) break;
      const sameExam =
        ['written', 'interview', 'exam'].includes(a.kind) &&
        ['written', 'interview', 'exam'].includes(b.kind) &&
        a.source.replace(/-(?:written|interview|exam)$/, '') ===
          b.source.replace(/-(?:written|interview|exam)$/, '');
      if (
        a.labId === b.labId ||
        a.source === b.source ||
        sameExam ||
        a.end < b.start ||
        b.end < a.start ||
        (a.kind === 'application') !== (b.kind === 'application')
      )
        continue;
      const key = [a.source, b.source].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        key,
        a,
        b,
        label:
          a.kind === 'application'
            ? '同期出愿窗口'
            : '考试 / 教授面试同日，请核对时段和地点',
      });
    }
  }
  return results;
}
const icsText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
function foldCalendarLine(line: string) {
  const lines: string[] = [];
  let current = '';
  let length = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (length + size > 73) {
      lines.push(current);
      current = ' ';
      length = 1;
    }
    current += char;
    length += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function calendarText(events: PlannerEvent[]) {
  const today = japanToday();
  const grouped = new Map<string, PlannerEvent[]>();
  for (const event of events)
    grouped.set(event.source, [...(grouped.get(event.source) ?? []), event]);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JUAI//Exam Planner//ZH-CN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:JUAI 修考日程',
    'X-WR-TIMEZONE:Asia/Tokyo',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  for (const [source, values] of grouped) {
    const event = values[0]!;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${source.replace(/[^\w-]/g, '-')}@juai.local`,
      `DTSTAMP:${stamp}`,
    );
    if (event.at)
      lines.push(`DTSTART;TZID=Asia/Tokyo:${event.at.replace(/[-:]/g, '')}00`);
    else
      lines.push(
        `DTSTART;VALUE=DATE:${event.start.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(event.end, 1).replace(/-/g, '')}`,
      );
    lines.push(
      `SUMMARY:${icsText(`${event.universityName} · ${event.title}`)}`,
      `DESCRIPTION:${icsText([...new Set(values.map((item) => [item.labName, item.details].filter(Boolean).join('：'))), '时间按日本时间维护；请结合学校最新通知确认。'].filter(Boolean).join('\n'))}`,
    );
    if (!event.complete && event.end >= today)
      lines.push(
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(event.title)}`,
        'END:VALARM',
      );
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
export function downloadCalendar(events: PlannerEvent[]) {
  const url = URL.createObjectURL(
    new Blob([calendarText(events)], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `JUAI-修考日程-${japanToday()}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
