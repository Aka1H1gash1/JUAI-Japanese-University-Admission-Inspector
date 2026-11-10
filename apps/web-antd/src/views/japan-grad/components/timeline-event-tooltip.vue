<script setup lang="ts">
import type { PlannerEvent } from '../application-calendar';

import { Tooltip } from 'ant-design-vue';

import { timelineDateText, timelineNodeLabel } from '../timeline';
defineProps<{ event: PlannerEvent }>();
</script>
<template>
  <Tooltip
    placement="top"
    :trigger="['hover', 'focus']"
    :mouse-enter-delay="0.12"
    :mouse-leave-delay="0.1"
    color="var(--jg-elevated)"
    :destroy-tooltip-on-hide="true"
    :overlay-style="{ maxWidth: 'min(360px, calc(100vw - 32px))' }"
    :overlay-inner-style="{
      color: 'var(--jg-text)',
      border: '1px solid var(--jg-line)',
      boxShadow: 'var(--jg-overlay-shadow)',
      padding: '14px 16px',
      borderRadius: '8px',
    }"
  >
    <template #title>
      <div class="timeline-hover-card">
        <header>
          <strong>{{ timelineNodeLabel(event) }}</strong><span>JST</span>
        </header>
        <p
          v-if="
            (event.contextTitle || event.title) !== timelineNodeLabel(event)
          "
          class="timeline-hover-context"
        >
          {{ event.contextTitle || event.title }}
        </p>
        <dl>
          <div>
            <dt>日期时间</dt>
            <dd>{{ timelineDateText(event) }}</dd>
          </div>
          <div>
            <dt>备注</dt>
            <dd :class="{ 'is-empty': !event.details }">
              {{ event.details || '暂无备注' }}
            </dd>
          </div>
        </dl>
      </div>
    </template>
    <slot></slot>
  </Tooltip>
</template>
<style scoped>
.timeline-hover-card {
  min-width: 178px;
  max-height: 255px;
  overflow-y: auto;
  font-family: var(--jg-font);
  font-size: 11px;
  line-height: 1.7;
}

.timeline-hover-card header {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
}

.timeline-hover-card strong {
  font-size: 12px;
  color: var(--jg-text);
  overflow-wrap: anywhere;
}

.timeline-hover-card header span {
  font-size: 10px;
  color: var(--jg-muted);
  letter-spacing: 0.06em;
}

.timeline-hover-context {
  margin: 5px 0 0;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
}

.timeline-hover-card dl {
  margin: 10px 0 0;
}

.timeline-hover-card dl > div + div {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--jg-line);
}

.timeline-hover-card dt {
  margin-bottom: 3px;
  font-size: 11px;
  color: var(--jg-muted);
}

.timeline-hover-card dd {
  margin: 0;
  color: var(--jg-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.timeline-hover-card dd.is-empty {
  color: var(--jg-muted);
}
</style>
