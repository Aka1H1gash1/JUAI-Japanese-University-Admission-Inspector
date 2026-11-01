import type { SpecialProgramSummary } from './special-program-types';

import { describe, expect, it } from 'vitest';

import { specialProgramEvents } from './special-program-events';
import { emptyProgram } from './special-program-types';

function program(
  overrides: Partial<SpecialProgramSummary>,
): SpecialProgramSummary {
  return { ...emptyProgram(), id: 'sp1', name: 'SGU 项目', ...overrides };
}

describe('specialProgramEvents', () => {
  it('lists dates of followed or active programs', () => {
    const events = specialProgramEvents([
      program({
        favorite: true,
        institutionName: '北川大学',
        applicationStart: '2027-01-05',
        applicationEnd: '2027-01-20',
        assessmentDate: '2027-02-10',
        resultDate: '2027-03-01',
      }),
    ]);
    expect(events.map((e) => [e.title, e.start, e.end])).toEqual([
      ['项目出愿', '2027-01-05', '2027-01-20'],
      ['项目考核', '2027-02-10', '2027-02-10'],
      ['项目结果', '2027-03-01', '2027-03-01'],
    ]);
    expect(events[0]?.universityName).toBe('北川大学');
    expect(events[0]?.path).toBe('/japan-grad/special-programs/sp1');
  });

  it('skips programs the user is only browsing and invalid dates', () => {
    expect(
      specialProgramEvents([
        program({ status: 'researching', resultDate: '2027-03-01' }),
        program({ id: 'sp2', status: 'preparing', resultDate: '2027-13-40' }),
      ]),
    ).toEqual([]);
  });

  it('keeps a lone deadline', () => {
    const [event] = specialProgramEvents([
      program({ status: 'applied', applicationEnd: '2027-01-20' }),
    ]);
    expect(event?.title).toBe('项目出愿截止');
  });
});
