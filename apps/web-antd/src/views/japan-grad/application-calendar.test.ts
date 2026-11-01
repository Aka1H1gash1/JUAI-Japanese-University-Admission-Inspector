import type { LabTarget } from './lab-targets';

import { describe, expect, it } from 'vitest';

import { buildPlannerEvents } from './application-calendar';
import { emptyTimeline } from './timeline';

function target(tasks: NonNullable<LabTarget['lab']['tasks']>): LabTarget {
  return {
    university: { id: 'u1', name: '北川大学' },
    school: { id: 's1', universityId: 'u1', name: '研究科' },
    major: {
      id: 'm1',
      schoolId: 's1',
      name: '专攻',
      applicationStart: '2027-06-01',
      applicationEnd: '2027-06-15',
      applicationMaterials: '',
      examHistory: [
        {
          id: 'e1',
          year: '2027',
          session: '夏季',
          subjects: '',
          examDate: '',
          writtenDate: '2027-08-20',
          interviewDate: '',
          resultDate: '',
          notes: '',
          sourceUrl: '',
        },
      ],
    },
    lab: {
      id: 'l1',
      majorId: 'm1',
      name: '语言研究室',
      wantApply: true,
      tasks,
      timeline: emptyTimeline(),
    },
    professors: [],
  } as unknown as LabTarget;
}

const imported = (
  id: string,
  dueDate: string,
  importedFrom: 'applicationEnd' | 'writtenDate',
  notes = '',
) => ({
  id,
  title: id,
  kind: 'todo' as const,
  progress: 0,
  dueDate,
  importedFrom,
  notes,
});

describe('buildPlannerEvents', () => {
  it('keeps one node when an imported todo repeats an exam date', () => {
    const events = buildPlannerEvents([
      target([
        imported('deadline', '2027-06-15', 'applicationEnd'),
        imported('written', '2027-08-20', 'writtenDate', '我改过的备注'),
      ]),
    ]);
    expect(events.filter((e) => e.kind === 'task')).toEqual([]);
    expect(events.map((e) => e.kind)).toEqual(['application', 'written']);
  });

  it('keeps imported todos whose dates differ and manual todos, whatever their notes say', () => {
    const events = buildPlannerEvents([
      target([
        imported('moved', '2027-06-14', 'applicationEnd'),
        {
          id: 'manual',
          title: '准备推荐信',
          kind: 'todo',
          progress: 0,
          dueDate: '2027-06-15',
          notes: '智能导入自募集要项 · 出愿截止日',
        },
      ]),
    ]);
    expect(events.filter((e) => e.kind === 'task').map((e) => e.title)).toEqual(
      ['moved', '准备推荐信'],
    );
  });
});
