import type { Ref, WatchSource } from 'vue';

import { computed, ref, watch } from 'vue';

/** Paginate after filtering. Data refreshes clamp the page; filters reset it. */
export function usePagination<T>(items: Ref<T[]>, resetOn: WatchSource[] = []) {
  const requestedPage = ref(1);
  const pageSize = ref(12);
  const total = computed(() => items.value.length);
  const page = computed({
    get: () =>
      Math.max(
        1,
        Math.min(
          requestedPage.value,
          Math.ceil(total.value / pageSize.value) || 1,
        ),
      ),
    set: (value: number) => {
      requestedPage.value = value;
    },
  });
  watch(
    [total, pageSize],
    () => {
      requestedPage.value = page.value;
    },
    { flush: 'sync' },
  );
  watch(
    [pageSize, ...resetOn],
    () => {
      requestedPage.value = 1;
    },
    { flush: 'sync' },
  );
  const paged = computed(() =>
    items.value.slice(
      (page.value - 1) * pageSize.value,
      page.value * pageSize.value,
    ),
  );
  return { page, pageSize, total, paged };
}
