<script setup lang="ts">
import type { PlannerEvent } from '../application-calendar';
import type { LabTarget } from '../lab-targets';

import { computed, ref } from 'vue';

import { useNow } from '@vueuse/core';
import { App, Button, Input, Popconfirm, Select } from 'ant-design-vue';

import {
  buildPlannerEvents,
  downloadCalendar,
  eventCountdown,
  plannerConflicts,
  plannerReminders,
} from '../application-calendar';
import {
  dayNumber,
  japanToday,
  validPlannerDay,
} from '../application-planning';
import { useExplorerStore } from '../explorer';
import { labPath, majorPath } from '../lab-targets';
import { outdatedExamYear } from '../overview-data';
import { vAccessibleSelect } from '../select-accessibility';
import { useSpecialProgramEvents } from '../special-program-events';
import {
  TIMELINE_LABELS,
  TIMELINE_OPTIONS,
  TIMELINE_PRESETS,
  timelineCategory,
  timelineDateText,
  timelineNodeLabel,
} from '../timeline';
import TimelineEventEditor from './timeline-event-editor.vue';
import TimelineEventTooltip from './timeline-event-tooltip.vue';
const props = defineProps<{ targets: LabTarget[]; year: string }>();
const { message } = App.useApp();
const now = useNow({ interval: 60_000 });
const today = computed(() => japanToday(now.value));
const startMonth = ref(today.value.slice(0, 7));
const monthCount = ref(6);
const selectedEvent = ref<PlannerEvent>();
const detailsOpen = ref(false);
const store = useExplorerStore();
const newLabId = ref('');
const eventKind = ref('');
const listLimit = ref(30);

const events = computed(() => buildPlannerEvents(props.targets, props.year));
const listedEvents = computed(() =>
  events.value.filter(
    (e) => !eventKind.value || timelineCategory(e.kind) === eventKind.value,
  ),
);

function addEvent(labId = '') {
  selectedEvent.value = undefined;
  newLabId.value = labId;
  detailsOpen.value = true;
}
function saved(date: string) {
  startMonth.value = date.slice(0, 7);
}
const outdatedMajors = computed(() => {
  if (props.year !== 'latest') return [];
  const seen = new Map<string, { name: string; path: string; year: string }>();
  for (const target of props.targets) {
    if (seen.has(target.major.id)) continue;
    const year = outdatedExamYear(target, today.value);
    if (year)
      seen.set(target.major.id, {
        name: `${target.university.name} ${target.major.name}`,
        path: `${majorPath(target)}#exam-history`,
        year,
      });
  }
  return [...seen.values()];
});
async function restoreSources(labId: string) {
  try {
    await store.restoreTimelineSources(labId);
    message.success('已恢复这个研究室隐藏的日程');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '恢复失败。');
  }
}
const bounds = computed(() => {
  const start = validPlannerDay(`${startMonth.value}-01`)
    ? `${startMonth.value}-01`
    : `${today.value.slice(0, 7)}-01`;
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + monthCount.value);
  endDate.setUTCDate(0);
  return { start, end: endDate.toISOString().slice(0, 10) };
});
const span = computed(
  () => dayNumber(bounds.value.end) - dayNumber(bounds.value.start) + 1,
);
const visibleEvents = computed(() =>
  events.value.filter(
    (event) =>
      event.end >= bounds.value.start && event.start <= bounds.value.end,
  ),
);
const reminders = computed(() =>
  plannerReminders(events.value, today.value).slice(0, 12),
);
const conflicts = computed(() => plannerConflicts(visibleEvents.value));
const months = computed(() =>
  Array.from({ length: monthCount.value }, (_, index) => {
    const date = new Date(`${bounds.value.start}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    const day = date.toISOString().slice(0, 10);
    return {
      label: `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}`,
      left:
        ((dayNumber(day) - dayNumber(bounds.value.start)) / span.value) * 100,
    };
  }),
);
function layoutRow(rowEvents: PlannerEvent[]) {
  const lanes: number[] = [];
  const items = rowEvents.map((event) => {
    const start = Math.max(
      dayNumber(event.start),
      dayNumber(bounds.value.start),
    );
    const end = Math.min(dayNumber(event.end), dayNumber(bounds.value.end));
    const point = event.start === event.end;
    let lane = lanes.findIndex((until) => until < start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = point ? start + Math.max(14, Math.ceil(span.value / 8)) : end;
    const left = ((start - dayNumber(bounds.value.start)) / span.value) * 100;
    return {
      event,
      point,
      left,
      top: lane * 30 + 8,
      width: ((end - start + 1) / span.value) * 100,
    };
  });
  return { items, height: Math.max(58, lanes.length * 30 + 16) };
}
const rows = computed(() =>
  props.targets.map((target) => ({
    target,
    ...layoutRow(
      visibleEvents.value.filter((event) => event.labId === target.lab.id),
    ),
  })),
);
const programEvents = useSpecialProgramEvents();
const visibleProgramEvents = computed(() =>
  programEvents.value.filter(
    (event) =>
      event.end >= bounds.value.start && event.start <= bounds.value.end,
  ),
);
const programRow = computed(() => layoutRow(visibleProgramEvents.value));
const todayLeft = computed(
  () =>
    ((dayNumber(today.value) - dayNumber(bounds.value.start)) / span.value) *
    100,
);
function viewEvent(event: PlannerEvent) {
  selectedEvent.value = event;
  detailsOpen.value = true;
}
function exportCalendar() {
  const exported = [...visibleEvents.value, ...visibleProgramEvents.value];
  if (exported.length === 0) return;
  downloadCalendar(exported);
  message.success('已导出当前时间范围的日历，导入系统日历后可使用提醒。');
}
</script>
<template>
  <section class="journey-timeline">
    <header class="planner-timeline-heading">
      <div>
        <h2>时间线与日程</h2>
        <p>点击事件可查看或编辑详情</p>
      </div>
      <div class="detail-actions">
        <Button type="primary" :disabled="!targets.length" @click="addEvent()">
          新增日程
</Button><Button
          :disabled="!visibleEvents.length && !visibleProgramEvents.length"
          @click="exportCalendar"
        >
          导出日历
        </Button>
      </div>
    </header>

    <div class="timeline-controls">
      <label>起始月份<Input
          v-model:value="startMonth"
          type="month"
          min="1900-01"
          max="2200-12"
          aria-label="时间线起始月份"
/></label><Select
        v-accessible-select
        v-model:value="monthCount"
        aria-label="时间线显示范围"
        :options="[
          { label: '3 个月', value: 3 },
          { label: '6 个月', value: 6 },
          { label: '12 个月', value: 12 },
        ]"
      /><Button @click="startMonth = today.slice(0, 7)">回到本月</Button>
      <div class="timeline-stage-legend">
        <span v-for="kind in TIMELINE_PRESETS" :key="kind"><i :class="`stage-${kind}`"></i>{{ TIMELINE_LABELS[kind] }}</span>
      </div>
    </div>
    <div v-if="outdatedMajors.length" class="timeline-outdated" role="note">
      <strong>以下专攻只有往年的考试记录，时间线显示的是旧日期：</strong>
      <span v-for="item in outdatedMajors" :key="item.path"><RouterLink :to="item.path">{{ item.name }}</RouterLink>（{{ item.year }} 年）</span>
      <small>新一年的募集要项公布后，在专攻的历年考试表里新增记录即可。</small>
    </div>
    <div class="gantt-scroll">
      <div class="gantt-grid">
        <div class="gantt-header">
          <strong>研究室</strong>
          <div class="gantt-axis">
            <span
              v-for="month in months"
              :key="month.label"
              :style="{ left: `${month.left}%` }"
              >{{ month.label }}</span>
          </div>
        </div>
        <div v-for="row in rows" :key="row.target.lab.id" class="gantt-row">
          <div class="gantt-row-label">
            <RouterLink :to="`${labPath(row.target)}?tab=admissions`">
              <strong>{{ row.target.lab.name }}</strong>
            </RouterLink>
            <small>{{ row.target.university.name }}</small>
            <button
              type="button"
              class="text-button"
              @click="addEvent(row.target.lab.id)"
            >
              + 添加
            </button>
            <Popconfirm
              v-if="row.target.lab.timeline?.hiddenSources.length"
              title="恢复隐藏的日程？"
              :description="`重新显示你在这个研究室移除过的 ${row.target.lab.timeline?.hiddenSources.length} 个自动日程，包括考试、出愿和老师联络节点。你手动改过的日程保持不变。`"
              ok-text="恢复"
              cancel-text="取消"
              :disabled="store.saving"
              @confirm="restoreSources(row.target.lab.id)"
            >
              <Button size="small" type="text"> 恢复隐藏的日程 </Button>
            </Popconfirm>
          </div>
          <div class="gantt-track" :style="{ height: `${row.height}px` }">
            <span
              v-for="month in months"
              :key="month.label"
              class="gantt-grid-line"
              :style="{ left: `${month.left}%` }"
            ></span><span
              v-if="todayLeft >= 0 && todayLeft <= 100"
              class="gantt-today"
              :style="{ left: `${todayLeft}%` }"
              title="今天（日本时间）"
            ></span>
            <TimelineEventTooltip
              v-for="item in row.items"
              :key="item.event.id"
              :event="item.event"
            >
              <button
                type="button"
                class="gantt-event"
                :class="[
                  `event-${item.event.kind}`,
                  {
                    'is-point': item.point,
                    'is-complete': item.event.complete,
                    'is-auto-synced': item.event.autoGenerated,
                  },
                ]"
                :style="{
                  left: `${item.left}%`,
                  top: `${item.top}px`,
                  width: item.point ? undefined : `${item.width}%`,
                  maxWidth: item.point
                    ? `min(106px, ${100 - item.left}%)`
                    : `${100 - item.left}%`,
                }"
                :aria-label="`${item.event.title}，${timelineDateText(item.event)}，点击编辑`"
                :title="item.event.autoGenerated ? '来自考试安排' : ''"
                @click="viewEvent(item.event)"
              >
                {{ timelineNodeLabel(item.event) }}
              </button>
            </TimelineEventTooltip>
            <small v-if="!row.items.length" class="gantt-no-events">此范围内暂无明确日期</small>
          </div>
        </div>
        <div v-if="visibleProgramEvents.length" class="gantt-row">
          <div class="gantt-row-label">
            <RouterLink to="/japan-grad/special-programs">
              <strong>特殊入学项目</strong>
            </RouterLink>
            <small>关注或准备申请的项目，在项目详情中修改</small>
          </div>
          <div
            class="gantt-track"
            :style="{ height: `${programRow.height}px` }"
          >
            <span
              v-for="month in months"
              :key="month.label"
              class="gantt-grid-line"
              :style="{ left: `${month.left}%` }"
            ></span><span
              v-if="todayLeft >= 0 && todayLeft <= 100"
              class="gantt-today"
              :style="{ left: `${todayLeft}%` }"
              title="今天（日本时间）"
            ></span>
            <TimelineEventTooltip
              v-for="item in programRow.items"
              :key="item.event.id"
              :event="item.event"
            >
              <RouterLink
                :to="item.event.path"
                class="gantt-event"
                :class="[
                  `event-${item.event.kind}`,
                  {
                    'is-point': item.point,
                    'is-complete': item.event.complete,
                  },
                ]"
                :style="{
                  left: `${item.left}%`,
                  top: `${item.top}px`,
                  width: item.point ? undefined : `${item.width}%`,
                  maxWidth: item.point
                    ? `min(106px, ${100 - item.left}%)`
                    : `${100 - item.left}%`,
                }"
                :aria-label="`${item.event.labName} ${item.event.title}，${timelineDateText(item.event)}，打开项目详情`"
              >
                {{ item.event.title }}
              </RouterLink>
            </TimelineEventTooltip>
          </div>
        </div>
      </div>
    </div>
    <details v-if="conflicts.length" class="planner-conflicts timeline-fold">
      <summary>
        时间重叠 <span>{{ conflicts.length }}</span>
      </summary>
      <p>
        同一专攻共享的同一场考试不会重复提示；同日安排需结合具体时段、地点和交通判断。
      </p>
      <article v-for="conflict in conflicts.slice(0, 12)" :key="conflict.key">
        <strong>{{ conflict.label }}</strong><span>{{ conflict.a.labName }} · {{ conflict.a.title }} ↔
          {{ conflict.b.labName }} · {{ conflict.b.title }}</span><small>{{ conflict.a.start }} ～ {{ conflict.a.end }} /
          {{ conflict.b.start }} ～ {{ conflict.b.end }}</small>
      </article>
    </details>
    <details class="planner-reminder-section timeline-fold">
      <summary>
        近期提醒 <span>{{ reminders.length }}</span>
      </summary>
      <div v-if="reminders.length" class="planner-reminder-grid">
        <button
          v-for="event in reminders"
          :key="event.id"
          :class="{ overdue: event.end < today }"
          @click="viewEvent(event)"
        >
          <strong>{{ eventCountdown(event, today) }}</strong><span>{{ event.title }}</span><small>{{ event.universityName }} · {{ event.labName }}<br />{{
              event.at
                ? `${event.at.replace('T', ' ')} JST`
                : `${event.start}${event.end !== event.start ? ` ～ ${event.end}` : ''}`
            }}</small>
        </button>
      </div>
      <p v-else class="planner-muted">暂无 30 天内的已记录节点或逾期待办。</p>
    </details>
    <details class="timeline-records timeline-fold">
      <summary>
        日程清单 <span>{{ events.length }}</span>
      </summary>
      <header>
        <h3>
          已记录日程 <span>{{ listedEvents.length }}</span>
        </h3>
        <Select
          v-accessible-select
          :value="eventKind || undefined"
          :options="TIMELINE_OPTIONS"
          allow-clear
          placeholder="全部类型"
          aria-label="按日程类型筛选"
          @change="
            eventKind = typeof $event === 'string' ? $event : '';
            listLimit = 30;
          "
        />
      </header>
      <div v-if="listedEvents.length" class="timeline-record-list">
        <button
          v-for="event in listedEvents.slice(0, listLimit)"
          :key="event.id"
          type="button"
          @click="viewEvent(event)"
        >
          <div>
            <strong>{{ event.title }}</strong><small>{{ event.universityName }} / {{ event.labName }}</small>
          </div>
          <span>{{ event.at ? event.at.replace('T', ' ') : event.start
            }}{{
              event.endAt
                ? ` ～ ${event.endAt.replace('T', ' ')}`
                : event.end !== event.start
                  ? ` ～ ${event.end}`
                  : ''
            }}</span><small>{{
            event.complete ? '已完成 / 已记录' : eventCountdown(event, today)
          }}</small><span class="timeline-record-edit">编辑 →</span>
        </button>
      </div>
      <p v-else class="planner-muted">
        还没有此类型的日程，可以点击新增日程填写。
      </p>
      <Button v-if="listedEvents.length > listLimit" @click="listLimit += 30">
        显示更多日程
      </Button>
    </details>
    <p class="planner-date-hint">日本时间（JST） · 支持自定义节点</p>
    <TimelineEventEditor
      v-model:open="detailsOpen"
      :targets="targets"
      :event="selectedEvent"
      :lab-id="newLabId"
      @saved="saved"
    />
  </section>
</template>

<style scoped>
.timeline-stage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-left: auto;
}

.timeline-stage-legend > span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 11px;
  color: var(--jg-secondary);
}

.timeline-stage-legend i {
  width: 5px;
  height: 5px;
  background: var(--jg-muted);
  border-radius: 50%;
}

.timeline-stage-legend :is(.stage-contact, .stage-application) {
  background: var(--jg-accent);
}

.timeline-stage-legend .stage-consent {
  background: var(--jg-success);
}

.timeline-stage-legend :is(.stage-written, .stage-interview) {
  background: var(--jg-error);
}

.timeline-fold {
  padding: 14px 16px;
  margin-top: 12px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.timeline-fold > summary {
  font-size: 13px;
  font-weight: 500;
  color: var(--jg-secondary);
  cursor: pointer;
}

.timeline-fold > summary > span {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--jg-muted);
}

.timeline-fold[open] > summary {
  margin-bottom: 18px;
}

.gantt-event {
  font-size: 11px;
}

.gantt-event.event-custom {
  background: var(--jg-subtle);
  border-color: var(--jg-border);
}

.gantt-event.is-point {
  max-width: 106px;
}

.timeline-outdated {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
  padding: 12px 14px;
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--jg-secondary);
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.timeline-outdated small {
  flex-basis: 100%;
  color: var(--jg-muted);
}

a.gantt-event {
  display: block;
  line-height: 22px;
  text-decoration: none;
}

.timeline-stage-legend + span {
  display: none;
}

.timeline-records {
  margin-top: 28px;
}

.timeline-records > header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.timeline-records h3 {
  margin: 0;
  font-size: 16px;
}

.timeline-records h3 span {
  font-weight: 400;
  color: var(--jg-muted);
}

.timeline-records .ant-select {
  width: 200px;
}

.timeline-record-list {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.timeline-record-list > button {
  display: grid;
  grid-template-columns:
    minmax(0, 1.5fr) minmax(140px, 1fr) minmax(100px, 0.6fr)
    auto;
  gap: 18px;
  align-items: center;
  padding: 16px;
  color: var(--jg-text);
  text-align: left;
  cursor: pointer;
  background: var(--jg-surface);
  border: 0;
  border-bottom: 1px solid var(--jg-line);
}

.timeline-record-list > button:last-child {
  border: 0;
}

.timeline-record-list > button:hover {
  background: var(--jg-subtle);
}

.timeline-record-list small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--jg-muted);
}

.timeline-record-edit {
  font-size: 12px;
  color: var(--jg-accent-text);
}

.gantt-row-label > .text-button {
  display: block;
  margin-top: 8px;
  font-size: 12px;
}

@media (max-width: 700px) {
  .timeline-record-list > button {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .timeline-record-list > button > span:nth-child(2) {
    grid-column: 1;
  }

  .timeline-record-edit {
    grid-row: 1 / 4;
    grid-column: 2;
  }
}
</style>
