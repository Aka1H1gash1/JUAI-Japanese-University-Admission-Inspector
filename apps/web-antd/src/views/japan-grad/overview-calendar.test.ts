import type { PlannerEvent } from './application-calendar';
import type { LabTarget } from './lab-targets';

import { describe, expect, it } from 'vitest';

import { emptyContact } from './application-planning';
import {
  calendarDays,
  calendarEventSummary,
  eventsOnDay,
  moveCalendar,
  startOfWeek,
} from './overview-calendar';
import { applicationStage } from './overview-progress';
import { filterInformationGaps } from './overview-reminders';

const event = (patch: Partial<PlannerEvent> = {}): PlannerEvent => ({
  id: 'e1',
  source: 'exam',
  labId: 'l1',
  labName: '研究室',
  universityName: '大学',
  title: '出愿',
  kind: 'application',
  start: '2026-10-30',
  end: '2026-11-02',
  at: '',
  complete: false,
  details: '',
  path: '/lab',
  ...patch,
});

describe('overview calendar', () => {
  it('uses a Monday-to-Sunday week across month and year boundaries', () => {
    expect(startOfWeek('2027-01-03')).toBe('2026-12-28');
    expect(calendarDays('2027-01-03', 'week')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
  it('lays out full calendar weeks and includes leap day', () => {
    const days = calendarDays('2028-02-29', 'month');
    expect(days[0]).toBe('2028-01-31');
    expect(days).toContain('2028-02-29');
    expect(days.length % 7).toBe(0);
    expect(calendarDays('2026-03-01', 'month')).toHaveLength(42);
  });
  it('moves by real months without skipping February from the 31st', () => {
    expect(moveCalendar('2027-01-31', 'month', 1)).toBe('2027-02-01');
    expect(moveCalendar('2027-01-15', 'month', -1)).toBe('2026-12-01');
    expect(moveCalendar('2026-12-31', 'week', 1)).toBe('2027-01-07');
  });
  it('keeps both ends of date ranges, excludes todos, and preserves completed nodes', () => {
    const events = [
      event(),
      event({ id: 'todo', kind: 'task' }),
      event({ id: 'complete', complete: true }),
    ];
    expect(eventsOnDay(events, '2026-10-30').map((entry) => entry.id)).toEqual([
      'e1',
      'complete',
    ]);
    expect(eventsOnDay(events, '2026-11-02')).toHaveLength(2);
    expect(eventsOnDay(events, '2026-11-03')).toHaveLength(0);
  });
});

it('puts the event type first in a compact month summary', () => {
  expect(
    calendarEventSummary(
      event({ kind: 'written', title: '2026 秋季 · 计算机科学考试' }),
    ),
  ).toBe('笔试 · 研究室');
});

describe('optional information reminders', () => {
  const gaps = [
    {
      id: 'lab-l1',
      name: '研究室',
      context: '',
      fields: ['老师资料', '语言要求', '材料清单'],
      path: '/majors/m1/labs/l1?tab=teachers',
    },
  ];
  it('allows disabling all reminders without altering the underlying gaps', () => {
    expect(filterInformationGaps(gaps, [])).toEqual([]);
    expect(gaps[0]!.fields).toHaveLength(3);
  });
  it('changes the destination to match the remaining selected fields', () => {
    const filtered = filterInformationGaps(gaps, ['材料清单']);
    expect(filtered[0]!.fields).toEqual(['材料清单']);
    expect(filtered[0]!.path).toBe('/majors/m1/labs/l1?tab=materials');
  });
  it('treats an old exam-year warning as an exam-record reminder', () => {
    const old = [
      {
        ...gaps[0]!,
        id: 'major-m1',
        fields: ['新一年考试记录（最新为 2025 年，日期已过）'],
      },
    ];
    expect(filterInformationGaps(old, ['考试记录'])).toHaveLength(1);
    expect(filterInformationGaps(old, ['语言要求'])).toEqual([]);
  });
});

describe('recorded application stages', () => {
  function target(contact = emptyContact()): LabTarget {
    return {
      lab: { id: 'l1', mainProfessorId: 'p1' },
      professors: [{ id: 'p1', name: '导师', contact }],
    } as unknown as LabTarget;
  }
  it('does not infer completion from dates or from a closed contact alone', () => {
    expect(applicationStage(target()).index).toBe(0);
    expect(
      applicationStage(target({ ...emptyContact(), status: 'closed' })).index,
    ).toBe(0);
  });
  it('follows the main contact and distinguishes an outcome from admission', () => {
    expect(
      applicationStage(target({ ...emptyContact(), status: 'replied' })).index,
    ).toBe(2);
    expect(
      applicationStage(target({ ...emptyContact(), status: 'consent' })).index,
    ).toBe(3);
    expect(
      applicationStage(target({ ...emptyContact(), finalResult: 'rejected' })),
    ).toMatchObject({ index: 4, result: 'rejected' });
  });
});

it('does not mark consent as achieved when only an exam result was recorded', () => {
  const target = {
    lab: { id: 'l1' },
    professors: [
      { id: 'p1', contact: { ...emptyContact(), finalResult: 'rejected' } },
    ],
  } as unknown as LabTarget;
  expect(applicationStage(target).reached[3]).toBe(false);
});
