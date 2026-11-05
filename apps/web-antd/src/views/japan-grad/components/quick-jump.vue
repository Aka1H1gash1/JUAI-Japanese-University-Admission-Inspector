<script setup lang="ts">
// Jump straight to any university, school, major, lab or professor.
// Opens from the header button, ⌘K / Ctrl+K, or "/" outside text fields.
import type { JumpEntry } from '../quick-jump';

import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useEventListener } from '@vueuse/core';
import { Modal } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import { buildJumpIndex, KIND_LABELS, searchJump } from '../quick-jump';
import ExplorerIcon from './explorer-icon.vue';

const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const router = useRouter();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();
const index = computed(() =>
  open.value
    ? buildJumpIndex({
        labs: store.labs,
        majors: store.majors,
        professors: store.professors,
        schools: store.schools,
        universities: store.universities,
      })
    : [],
);
const results = computed(() => searchJump(index.value, query.value));
const labCount = computed(() => store.labs.length);
const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

watch(open, async (value) => {
  if (!value) return;
  query.value = '';
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(results, () => (active.value = 0));

function go(entry?: JumpEntry) {
  if (!entry) return;
  open.value = false;
  void router.push(entry.path);
}
function move(step: number) {
  const count = results.value.length;
  if (!count) return;
  active.value = (active.value + step + count) % count;
  void nextTick(() =>
    list.value
      ?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)
      ?.scrollIntoView({ block: 'nearest' }),
  );
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Enter') go(results.value[active.value]);
  else return;
  event.preventDefault();
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const typing =
    target?.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '');
  const shortcut =
    (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) ||
    (event.key === '/' &&
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey);
  if (!shortcut || !store.loaded) return;
  event.preventDefault();
  open.value = !open.value || event.key === '/';
});
</script>
<template>
  <Modal
    v-model:open="open"
    :footer="null"
    :closable="false"
    :width="640"
    wrap-class-name="quick-jump-wrap"
    class="quick-jump"
    title="快速跳转"
  >
    <label class="quick-jump-field">
      <ExplorerIcon name="search" />
      <input
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="quick-jump-list"
        :aria-expanded="results.length > 0"
        :aria-activedescendant="
          results.length ? `quick-jump-${active}` : undefined
        "
        placeholder="研究室、老师、专攻、研究科或大学，可输入多个词"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKey"
      />
      <kbd>Esc</kbd>
    </label>
    <p v-if="!query.trim() && results.length" class="quick-jump-caption">
      全部研究室 {{ labCount }} 个，想考的排在前面
    </p>
    <ul
      v-if="results.length"
      id="quick-jump-list"
      ref="list"
      class="quick-jump-list"
      role="listbox"
      aria-label="跳转结果"
    >
      <li
        v-for="(entry, i) in results"
        :id="`quick-jump-${i}`"
        :key="`${entry.kind}:${entry.id}`"
        :data-index="i"
        role="option"
        :aria-selected="i === active"
        :class="{ 'is-active': i === active }"
        @click="go(entry)"
        @mousemove="active = i"
      >
        <span class="quick-jump-kind" :data-kind="entry.kind">{{
          KIND_LABELS[entry.kind]
        }}</span>
        <span class="quick-jump-text">
          <strong>{{ entry.name
            }}<ExplorerIcon
              v-if="entry.wanted && entry.kind === 'lab'"
              name="heart"
              class="quick-jump-heart"
          /></strong>
          <small v-if="entry.crumbs">{{ entry.crumbs }}</small>
        </span>
        <ExplorerIcon name="arrow" class="quick-jump-go" />
      </li>
    </ul>
    <div v-else class="quick-jump-empty">
      <template v-if="query.trim()">
        没有找到“{{ query.trim() }}”。可以换个关键词，或用空格分开多个词。
      </template>
      <template v-else>
        还没有研究室。可以在“网址解析”导入，或在“大学清单”里添加。
      </template>
    </div>
    <footer class="quick-jump-hint">
      <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>{{ modKey }}</kbd><kbd>K</kbd> 或 <kbd>/</kbd> 随时打开</span>
    </footer>
  </Modal>
</template>
