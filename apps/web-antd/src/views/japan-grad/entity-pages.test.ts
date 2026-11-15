import { describe, expect, it } from 'vitest';

import { compactUniversityLocation, universityCity } from './japan-geography';
import {
  catalogUniversities,
  universityDisplayGeography,
} from './university-catalog';
describe('university list location boundary', () => {
  it('displays the known district but never street numbers in compact lists', () => {
    const value = {
      region: '关东',
      prefecture: '东京都',
      location: '東京都文京区本郷7－3－1',
    };
    expect(universityCity(value)).toBe('文京区');
    expect(compactUniversityLocation(value)).toBe('关东 · 文京区');
    expect(value.location).toBe('東京都文京区本郷7－3－1');
  });
  it('does not invent a city from a prefecture or an unstructured address', () => {
    expect(universityCity({ region: '北海道', location: '北海道' })).toBe('');
    expect(universityCity({ region: '关东', location: '不明地址123号' })).toBe(
      '',
    );
    expect(compactUniversityLocation({ region: '关东' })).toBe('关东');
  });
  it('uses existing directory addresses for display without rewriting personal records', () => {
    const before = catalogUniversities.value;
    catalogUniversities.value = [
      {
        id: 'catalog-a',
        schoolCode: 'a',
        name: '目录大学',
        japaneseName: '目録大学',
        category: '国立',
        prefecture: '东京都',
        region: '关东',
        address: '東京都文京区本郷1',
        website: '',
        logo: null,
      },
    ];
    try {
      const personal = {
        name: '我的学校备注',
        catalogId: 'catalog-a',
        location: '',
      };
      expect(
        compactUniversityLocation(universityDisplayGeography(personal)),
      ).toBe('关东 · 文京区');
      expect(personal.location).toBe('');
      const edited = { ...personal, location: '京都市左京区1' };
      expect(universityDisplayGeography(edited)).toBe(edited);
    } finally {
      catalogUniversities.value = before;
    }
  });
});
