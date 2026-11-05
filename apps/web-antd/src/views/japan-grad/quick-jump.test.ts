import type { JumpWorkspace } from './quick-jump';

import { describe, expect, it } from 'vitest';

import { buildJumpIndex, searchJump } from './quick-jump';

const workspace = {
  universities: [
    { id: 'u1', name: '京都大学', japaneseName: '京都大学' },
    { id: 'u2', name: '北海道大学', japaneseName: '北海道大学' },
  ],
  schools: [
    { id: 's1', universityId: 'u1', name: '情報学研究科', japaneseName: '' },
    { id: 's2', universityId: 'u2', name: '情報科学院', japaneseName: '' },
  ],
  majors: [
    { id: 'm1', schoolId: 's1', name: '知能情報学専攻', japaneseName: '' },
    { id: 'm2', schoolId: 's2', name: '情報科学専攻', japaneseName: '' },
  ],
  labs: [
    {
      id: 'l1',
      majorId: 'm1',
      name: '言語メディア研究室',
      japaneseName: '',
      research: '自然言語処理',
      wantApply: false,
    },
    {
      id: 'l2',
      majorId: 'm2',
      name: '大規模知識処理研究室',
      japaneseName: '',
      research: '知識グラフ',
      wantApply: true,
    },
    {
      id: 'orphan',
      majorId: 'missing',
      name: '孤立研究室',
      japaneseName: '',
      research: '',
      wantApply: false,
    },
  ],
  professors: [
    {
      id: 'p1',
      majorId: 'm1',
      labId: 'l1',
      name: '黒橋',
      japaneseName: 'Kurohashi',
      title: '教授',
      research: '',
    },
    {
      id: 'p2',
      majorId: 'm2',
      name: '湊',
      japaneseName: '',
      title: '教授',
      research: '',
    },
  ],
} as unknown as JumpWorkspace;

describe('quick jump', () => {
  const index = buildJumpIndex(workspace);

  it('links every level directly and skips records without a parent chain', () => {
    const lab = index.find((e) => e.id === 'l2');
    expect(lab?.path).toBe(
      '/japan-grad/universities/u2/schools/s2/majors/m2/labs/l2',
    );
    expect(lab?.crumbs).toBe('北海道大学 / 情報科学院 / 情報科学専攻');
    expect(index.find((e) => e.id === 'p1')?.path).toBe(
      '/japan-grad/universities/u1/schools/s1/majors/m1/labs/l1/professors/p1',
    );
    expect(index.find((e) => e.id === 'p2')?.path).toBe(
      '/japan-grad/universities/u2/schools/s2/majors/m2/professors/p2',
    );
    expect(index.some((e) => e.id === 'orphan')).toBe(false);
  });

  it('with no query lists labs, 想考 first', () => {
    expect(searchJump(index, '').map((e) => e.id)).toEqual(['l2', 'l1']);
  });

  it('matches every term across name, parents, research and professors', () => {
    // The lab's own name matches, so it ranks above its professor (found via the lab).
    expect(searchJump(index, '京都 言語').map((e) => e.id)).toEqual([
      'l1',
      'p1',
    ]);
    expect(searchJump(index, 'kurohashi').map((e) => e.id)).toEqual([
      'p1',
      'l1',
    ]);
    expect(searchJump(index, '知識グラフ').map((e) => e.id)).toEqual(['l2']);
    expect(searchJump(index, '不存在')).toEqual([]);
  });

  it('finds Japanese names from simplified Chinese input', () => {
    expect(searchJump(index, '言语').map((e) => e.id)).toContain('l1');
    expect(searchJump(index, '情报学').map((e) => e.id)[0]).toBe('s1');
    expect(searchJump(index, '知识处理').map((e) => e.id)).toEqual(['l2']);
    expect(searchJump(index, '北海道 情报科学').map((e) => e.id)).toContain(
      'm2',
    );
  });

  it('ranks name matches before matches on a parent', () => {
    const ids = searchJump(index, '北海道').map((e) => e.id);
    expect(ids[0]).toBe('u2');
    expect(ids).toContain('l2');
  });
});
