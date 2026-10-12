<script setup lang="ts">
import { Tooltip } from 'ant-design-vue';
import type { PlannerEvent } from '../application-calendar';
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
    <template #title
      ><div class="timeline-hover-card">
        <header>
          <strong>{{ timelineNodeLabel(event) }}</strong
          ><span>JST</span>
        </header>
        <p
          v-if="event.title !== timelineNodeLabel(event)"
          class="timeline-hover-context"
        >
          {{ event.title }}
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
      </div></template
    >
    <slot />
  </Tooltip>
</template>
<style scoped>
.timeline-hover-card {
  min-width: 210px;
  max-height: 300px;
  overflow-y: auto;
  font-family: var(--jg-font);
  font-size: 12px;
  line-height: 1.7;
}
.timeline-hover-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.timeline-hover-card strong {
  font-size: 14px;
  color: var(--jg-text);
  overflow-wrap: anywhere;
}
.timeline-hover-card header span {
  color: var(--jg-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
}
.timeline-hover-context {
  margin: 6px 0 0;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
}
.timeline-hover-card dl {
  margin: 12px 0 0;
}
.timeline-hover-card dl > div + div {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--jg-line);
}
.timeline-hover-card dt {
  margin-bottom: 3px;
  color: var(--jg-muted);
  font-size: 11px;
}
.timeline-hover-card dd {
  margin: 0;
  color: var(--jg-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.timeline-hover-card dd.is-empty {
  color: var(--jg-muted);
}
</style>
