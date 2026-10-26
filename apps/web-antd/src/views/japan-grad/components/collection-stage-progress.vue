<script setup lang="ts">
import type { CollectionJob } from '../collection-types';

import { computed } from 'vue';

import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{ job: CollectionJob }>();
const labels = ['等待AI启动', 'AI搜索中', 'AI总结中', '已完成'];
const done = computed(() => ['applied', 'review'].includes(props.job.status));
const failed = computed(() => props.job.status === 'failed');
const stopped = computed(() => props.job.status === 'cancelled');
const running = computed(() => !done.value && !failed.value && !stopped.value);
const step = computed(() => {
  if (done.value) return 3;
  if (props.job.phase === 'finalizing') return 2;
  if (
    props.job.status === 'analyzing' ||
    props.job.model ||
    props.job.sources?.length
  )
    return 1;
  return 0;
});
const heading = computed(() => {
  if (failed.value) {
    return '解析失败';
  }
  if (stopped.value) {
    return '解析已停止';
  }
  return labels[step.value];
});
const hint = computed(() => {
  if (failed.value) return '进度停留在失败阶段，已读取的来源仍保留，可重试。';
  if (stopped.value) return '已保留当前资料，继续查询后会恢复进度。';
  if (props.job.status === 'applied') return '解析结果已确认，档案已保存。';
  if (done.value) return 'AI 已完成整理，请核对下方信息后生成档案。';
  if (step.value === 2) return '正在整理要求、时间与来源，生成待核对的信息。';
  if (step.value === 1) return '正在读取官网、查找关联页面和募集要项。';
  return '正在准备任务、连接所选 AI 并读取起始网页。';
});
</script>
<template>
  <section
    class="collection-stage-progress"
    :class="{
      'is-failed': failed,
      'is-stopped': stopped,
      'is-running': running,
    }"
    aria-label="AI 网址解析进度"
  >
    <header>
      <div>
        <strong aria-live="polite" role="status">{{ heading }}</strong>
        <p>{{ hint }}</p>
      </div>
      <span>{{ done ? '4 / 4' : `${step + 1} / 4` }}</span>
    </header>
    <div
      class="collection-stage-track"
      role="progressbar"
      aria-label="网址解析阶段"
      :aria-valuemin="0"
      :aria-valuemax="3"
      :aria-valuenow="step"
      :aria-valuetext="`${heading}，${hint}`"
    >
      <div :style="{ width: `${(step / 3) * 100}%` }"></div>
    </div>
    <ol>
      <li
        v-for="(label, i) in labels"
        :key="label"
        :class="{ complete: i < step || done, current: i === step }"
        :aria-current="i === step ? 'step' : undefined"
      >
        <span class="collection-stage-marker"><ExplorerIcon v-if="i < step || done" name="check" /><ExplorerIcon
            v-else-if="i === step && failed"
            name="close"
          /><span v-else>{{ i + 1 }}</span></span><span class="collection-stage-label">{{ label }}</span>
      </li>
    </ol>
  </section>
</template>
<style scoped>
.collection-stage-progress {
  padding: 24px;
  margin: 22px 0;
  background: var(--jg-surface);
  border: 1px solid var(--jg-accent-line);
  border-radius: 12px;
}

.collection-stage-progress header {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  justify-content: space-between;
}

.collection-stage-progress strong {
  font-size: 17px;
  font-weight: 600;
}

.collection-stage-progress header p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.collection-stage-progress header > span {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--jg-muted);
  white-space: nowrap;
}

.collection-stage-track {
  height: 5px;
  margin: 22px 0 18px;
  overflow: hidden;
  background: var(--jg-subtle);
  border-radius: 6px;
}

.collection-stage-track > div {
  height: 100%;
  background: var(--jg-accent);
  border-radius: inherit;
  transition: width 0.35s ease;
}

.collection-stage-progress ol {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.collection-stage-progress li {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--jg-muted);
}

.collection-stage-marker {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 28px;
  height: 28px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--jg-muted);
  border: 1px solid var(--jg-line);
  border-radius: 50%;
}

.collection-stage-marker svg {
  width: 15px;
  height: 15px;
}

.collection-stage-progress li.complete,
.collection-stage-progress li.current {
  color: var(--jg-accent-text);
}

.complete .collection-stage-marker {
  color: var(--jg-accent-text);
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent-line);
}

.current .collection-stage-marker {
  color: #fff;
  background: var(--jg-accent);
  border-color: var(--jg-accent);
}

.is-running .current .collection-stage-marker {
  animation: stage-pulse 1.8s ease-in-out infinite;
}

.is-failed .collection-stage-track > div,
.is-failed .current .collection-stage-marker {
  background: var(--jg-error);
  border-color: var(--jg-error);
}

.is-failed li.current {
  color: var(--jg-error);
}

.is-failed .current .collection-stage-marker,
.is-stopped .current .collection-stage-marker {
  color: var(--jg-bg);
}

.is-stopped .collection-stage-track > div,
.is-stopped .current .collection-stage-marker {
  background: var(--jg-muted);
  border-color: var(--jg-muted);
}

@keyframes stage-pulse {
  50% {
    box-shadow: 0 0 0 5px var(--jg-accent-soft);
  }
}

@media (max-width: 650px) {
  .collection-stage-progress {
    padding: 18px;
  }

  .collection-stage-progress li {
    flex-direction: column;
    gap: 8px;
    font-size: 11px;
    text-align: center;
  }

  .collection-stage-progress ol {
    gap: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-running .current .collection-stage-marker {
    animation: none;
  }

  .collection-stage-track > div {
    transition: none;
  }
}
</style>
