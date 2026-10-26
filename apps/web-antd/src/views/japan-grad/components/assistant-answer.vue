<script setup lang="ts">
import type { ReaderSource } from '../reader-types';

import { computed } from 'vue';

import { requireValue } from '../required-value';
const props = defineProps<{ text: string; sources?: ReaderSource[] }>();
const emit = defineEmits<{ locate: [source: ReaderSource] }>();
const sourceMap = computed(
  () => new Map((props.sources ?? []).map((source) => [source.id, source])),
);
function parts(text: string) {
  const result: { type: string; text: string; source?: ReaderSource }[] = [];
  const pattern = /(\[S\d{1,6}\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (requireValue(match.index) > offset)
      result.push({ type: 'text', text: text.slice(offset, match.index) });
    const value = match[0];
    const source = sourceMap.value.get(value.slice(1, -1));
    result.push(
      (() => {
        if (source) {
          return { type: 'source', text: source.id, source };
        }
        if (value.startsWith('**')) {
          return { type: 'strong', text: value.slice(2, -2) };
        }
        if (value.startsWith('`')) {
          return { type: 'code', text: value.slice(1, -1) };
        }
        return { type: 'text', text: value };
      })(),
    );
    offset = requireValue(match.index) + value.length;
  }
  if (offset < text.length)
    result.push({ type: 'text', text: text.slice(offset) });
  return result;
}
const blocks = computed(() => {
  const blocks: { kind: string; lines: string[] }[] = [];
  let fenced = false;
  for (const line of props.text.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      if (fenced) blocks.push({ kind: 'code', lines: [] });
      continue;
    }
    if (fenced) {
      requireValue(blocks.at(-1)).lines.push(line);
      continue;
    }
    if (!line.trim()) {
      blocks.push({ kind: 'gap', lines: [] });
      continue;
    }
    if (/^#{1,6}\s/.test(line))
      blocks.push({ kind: 'heading', lines: [line.replace(/^#{1,6}\s+/, '')] });
    else if (/^\s*(?:[-*+] |\d+[.)]\s)/.test(line)) {
      const content = line.replace(/^\s*(?:[-*+] |\d+[.)]\s)/, '');
      if (blocks.at(-1)?.kind === 'list')
        requireValue(blocks.at(-1)).lines.push(content);
      else blocks.push({ kind: 'list', lines: [content] });
    } else if (blocks.at(-1)?.kind === 'paragraph')
      requireValue(blocks.at(-1)).lines.push(line);
    else blocks.push({ kind: 'paragraph', lines: [line] });
  }
  return blocks;
});
</script>
<template>
  <div class="assistant-answer">
    <template v-for="(block, index) in blocks" :key="index">
      <pre
        v-if="block.kind === 'code'"
      ><code>{{ block.lines.join('\n') }}</code></pre>
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(line, i) in block.lines" :key="i">
          <template v-for="(part, n) in parts(line)" :key="n">
            <button
              v-if="part.source"
              class="assistant-citation"
              :title="`${part.source.locator}\n${part.source.quote}`"
              :aria-label="`查看引用 ${part.source.id}，${part.source.locator}`"
              @click="emit('locate', part.source)"
            >
              {{ part.text }}
</button><strong v-else-if="part.type === 'strong'">{{ part.text }}</strong><code v-else-if="part.type === 'code'">{{ part.text }}</code><span v-else>{{ part.text }}</span>
          </template>
        </li>
      </ul>
      <component
        :is="block.kind === 'heading' ? 'h4' : 'p'"
        v-else-if="block.kind !== 'gap'"
      >
        <template v-for="(part, n) in parts(block.lines.join('\n'))" :key="n">
          <button
            v-if="part.source"
            class="assistant-citation"
            :title="`${part.source.locator}\n${part.source.quote}`"
            :aria-label="`查看引用 ${part.source.id}，${part.source.locator}`"
            @click="emit('locate', part.source)"
          >
            {{ part.text }}
</button><strong v-else-if="part.type === 'strong'">{{ part.text }}</strong><code v-else-if="part.type === 'code'">{{ part.text }}</code><span v-else>{{ part.text }}</span>
        </template>
      </component>
    </template>
  </div>
</template>
<style scoped>
.assistant-answer {
  font-size: 13px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}

.assistant-answer p {
  margin: 0 0 10px !important;
  white-space: pre-wrap;
}

.assistant-answer h4 {
  margin: 16px 0 8px !important;
  font-size: 14px;
  font-weight: 650;
}

.assistant-answer h4:first-child {
  margin-top: 0 !important;
}

.assistant-answer ul {
  padding-left: 20px;
  margin: 8px 0 14px;
}

.assistant-answer li + li {
  margin-top: 5px;
}

.assistant-answer code {
  padding: 1px 4px;
  font-size: 12px;
  background: var(--jg-subtle);
  border-radius: 4px;
}

.assistant-answer pre {
  padding: 12px;
  overflow: auto;
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 7px;
}

.assistant-answer pre code {
  padding: 0;
  white-space: pre;
}

.assistant-citation {
  display: inline;
  padding: 1px 5px;
  margin-inline: 3px;
  font-size: 10px;
  font-weight: 650;
  vertical-align: baseline;
  color: var(--jg-accent-text);
  cursor: pointer;
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 4px;
}
</style>
