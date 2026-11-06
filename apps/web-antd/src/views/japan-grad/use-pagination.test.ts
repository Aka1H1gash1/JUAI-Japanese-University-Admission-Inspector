import { computed, effectScope, ref } from 'vue';

import { describe, expect, it } from 'vitest';

import { usePagination } from './use-pagination';

describe('workspace pagination', () => {
  it('searches the full list, resets filters and preserves updates on the current page', () => {
    const scope = effectScope();
    scope.run(() => {
      const items = ref(
        Array.from({ length: 31 }, (_, id) => ({ id, name: `记录${id}` })),
      );
      const query = ref('');
      const filtered = computed(() =>
        items.value.filter((item) => item.name.includes(query.value)),
      );
      const p = usePagination(filtered, [query]);
      p.page.value = 3;
      expect(p.paged.value[0]?.id).toBe(24);
      items.value = items.value.map((item) => ({ ...item }));
      expect(p.page.value).toBe(3);
      query.value = '30';
      expect(p.page.value).toBe(1);
      expect(p.paged.value.map((item) => item.id)).toEqual([30]);
      query.value = '不存在';
      expect(p.total.value).toBe(0);
      expect(p.page.value).toBe(1);
      expect(p.paged.value).toEqual([]);
    });
    scope.stop();
  });

  it('clamps deletion of the last page and resets page size and parent changes', () => {
    const scope = effectScope();
    scope.run(() => {
      const items = ref(Array.from({ length: 25 }, (_, id) => id));
      const parent = ref('school-a');
      const p = usePagination(items, [parent]);
      p.page.value = 3;
      items.value = items.value.slice(0, 24);
      expect(p.page.value).toBe(2);
      expect(p.paged.value).toHaveLength(12);
      p.pageSize.value = 24;
      expect(p.page.value).toBe(1);
      p.pageSize.value = 12;
      p.page.value = 2;
      parent.value = 'school-b';
      expect(p.page.value).toBe(1);
    });
    scope.stop();
  });
});
