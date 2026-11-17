import type { PlannerEvent } from './application-calendar';

import { describe, expect, it } from 'vitest';

import {
  agendaGroups,
  materialCandidates,
  materialSummary,
  nearestRecordedEvent,
  suggestedFlowStage,
} from './application-flow-model';
import { emptyContact } from './application-planning';

describe('application flow prototype source semantics', () => {
  it('uses contact only as a suggestion and never assumes a consent means application submitted', () => {
    expect(suggestedFlowStage({ ...emptyContact(), status: 'consent' })).toBe(
      'consent',
    );
    expect(suggestedFlowStage({ ...emptyContact(), status: 'closed' })).toBe(
      'result',
    );
    expect(suggestedFlowStage(emptyContact())).toBe('prepare');
  });
  it('keeps uploaded files and explicit completion independent', () => {
    expect(
      materialSummary([
        { complete: false, files: [{}] },
        { complete: true, files: [] },
      ]),
    ).toEqual({ total: 2, complete: 1, pending: 1, withoutFiles: 1 });
    expect(materialSummary([]).total).toBe(0);
  });
  const event = (kind: string, start: string) =>
    ({ kind, start, end: start }) as PlannerEvent;
  it('prefers the nearest upcoming event but preserves the latest past date when all dates passed', () => {
    const events = [
      event('written', '2026-01-01'),
      event('interview', '2026-09-01'),
      event('written', '2027-02-11'),
      event('written', '2028-02-01'),
    ];
    expect(nearestRecordedEvent(events, ['written'], '2026-11-17')?.start).toBe(
      '2027-02-11',
    );
    expect(nearestRecordedEvent(events, ['written'], '2029-01-01')?.start).toBe(
      '2028-02-01',
    );
    expect(
      nearestRecordedEvent(events, ['teacher_interview'], '2026-11-17'),
    ).toBeUndefined();
  });
  it('does not manufacture material requirements for an empty target', () => {
    expect(materialCandidates('')).toEqual([]);
    expect(materialCandidates(' 成绩单\n\n研究计划书 ')).toEqual([
      '成绩单',
      '研究计划书',
    ]);
  });
});

// Original calendar records remain intact, including differing scope titles.
it('groups same-day agenda presentation while retaining every source id', () => {
  const base = {
    labId: 'lab',
    kind: 'written',
    start: '2027-02-11',
    end: '2027-02-11',
    at: '',
  } as PlannerEvent;
  const events = [
    { ...base, id: 'exam', title: '原考试记录' },
    { ...base, id: 'manual', title: '手工时间线' },
    { ...base, id: 'other', labId: 'another' },
  ];
  const grouped = agendaGroups(events);
  expect(grouped).toHaveLength(2);
  expect(grouped[0]?.sourceIds).toEqual(['exam', 'manual']);
  expect(events).toHaveLength(3);
});
