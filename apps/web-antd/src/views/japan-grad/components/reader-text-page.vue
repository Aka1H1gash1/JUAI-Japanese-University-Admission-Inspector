<script setup lang="ts">
import type { ReaderAnnotation, ReaderSelection } from '../reader-types';

import { computed, nextTick, ref, watch } from 'vue';
const props = defineProps<{
  text: string;
  page: number;
  annotations: ReaderAnnotation[];
  activeId: string;
  search: string;
  searchIndex: number;
  quote?: string;
}>();
const emit = defineEmits<{
  selection: [value: ReaderSelection];
  quoteLocated: [page: number, matched: boolean];
}>();
const root = ref<HTMLElement | null>(null);
const segments = computed(() => {
  const intervals: {
    start: number;
    end: number;
    color: string;
    active: boolean;
    search: boolean;
    selected: boolean;
  }[] = [];
  for (const note of props.annotations) {
    const anchor = note.anchor;
    if (!anchor) continue;
    let start = props.text.indexOf(anchor.quote);
    let best = start;
    while (start >= 0) {
      if (
        (!anchor.prefix ||
          props.text.slice(0, start).endsWith(anchor.prefix)) &&
        (!anchor.suffix ||
          props.text
            .slice(start + anchor.quote.length)
            .startsWith(anchor.suffix))
      ) {
        best = start;
        break;
      }
      start = props.text.indexOf(anchor.quote, start + 1);
    }
    if (best >= 0)
      intervals.push({
        start: best,
        end: best + anchor.quote.length,
        color: note.color,
        active: props.activeId === note.id,
        search: false,
        selected: false,
      });
  }
  const haystack = props.text.toLocaleLowerCase();
  const needle = props.search.toLocaleLowerCase();
  if (needle) {
    let index = 0;
    let start = haystack.indexOf(needle);
    while (start >= 0 && index < 200) {
      intervals.push({
        start,
        end: start + needle.length,
        color: 'search',
        active: false,
        search: true,
        selected: index === props.searchIndex,
      });
      start = haystack.indexOf(needle, start + needle.length);
      index++;
    }
  }
  if (props.quote) {
    const start = props.text.indexOf(props.quote);
    if (start !== -1)
      intervals.push({
        start,
        end: start + props.quote.length,
        color: 'citation',
        active: true,
        search: false,
        selected: true,
      });
  }
  const bounds = [
    ...new Set([
      0,
      props.text.length,
      ...intervals.flatMap((item) => [item.start, item.end]),
    ]),
  ].toSorted((a, b) => a - b);
  return bounds.slice(0, -1).map((start, index) => {
    const matches = intervals.filter(
      (item) => item.start <= start && item.end > start,
    );
    const highlight =
      matches.find((item) => item.selected) ||
      matches.find((item) => item.active) ||
      matches[0];
    return {
      text: props.text.slice(start, bounds[index + 1]),
      color: highlight?.color,
      active: matches.some((item) => item.active),
      searchActive: matches.some((item) => item.selected),
    };
  });
});
function select() {
  const selection = window.getSelection();
  if (
    !root.value ||
    !selection ||
    selection.isCollapsed ||
    !selection.rangeCount
  )
    return;
  const range = selection.getRangeAt(0);
  if (
    !root.value.contains(range.startContainer) ||
    !root.value.contains(range.endContainer)
  )
    return;
  const quote = selection.toString().trim();
  if (!quote || quote.length > 16_000) return;
  const after = range.cloneRange();
  const before = range.cloneRange();
  before.selectNodeContents(root.value);
  before.setEnd(range.startContainer, range.startOffset);
  after.selectNodeContents(root.value);
  after.setStart(range.endContainer, range.endOffset);
  const bound = range.getBoundingClientRect();
  emit('selection', {
    anchor: {
      version: 1,
      type: 'text',
      page: props.page,
      quote,
      prefix: before.toString().slice(-300),
      suffix: after.toString().slice(0, 300),
      rects: [],
    },
    x: bound.left + bound.width / 2,
    y: bound.bottom + 10,
  });
}
watch(
  [() => props.quote, () => props.text],
  () => {
    if (props.quote)
      void nextTick(() =>
        emit(
          'quoteLocated',
          props.page,
          !!root.value?.querySelector('.reader-text-citation'),
        ),
      );
  },
  { immediate: true, flush: 'post' },
);
</script>
<template>
  <div
    ref="root"
    class="reader-text-content"
    @mouseup="select"
    @touchend="select"
  >
    <template v-for="(part, index) in segments" :key="index">
      <mark
        v-if="part.color"
        class="reader-text-mark"
        :class="[
          `text-${part.color}`,
          {
            'is-active': part.active,
            'reader-text-search-active': part.searchActive,
            'reader-text-citation': part.color === 'citation',
          },
        ]"
        >{{ part.text }}</mark><span v-else>{{ part.text }}</span>
    </template>
  </div>
</template>
