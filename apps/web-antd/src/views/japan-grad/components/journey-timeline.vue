<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNow } from '@vueuse/core';
import { App, Button, Input, Modal, Select } from 'ant-design-vue';
import type { LabTarget } from '../lab-targets';
import { labPath } from '../lab-targets';
import type { PlannerEvent } from '../application-calendar';
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
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{ targets: LabTarget[]; year: string }>();
const { message } = App.useApp();
const now = useNow({ interval: 60000 });
const today = computed(() => japanToday(now.value));
const startMonth = ref(today.value.slice(0, 7));
const monthCount = ref(6);
const selectedEvent = ref<PlannerEvent>();
const detailsOpen = ref(false);
const events = computed(() =>
  buildPlannerEvents(props.targets, props.year, today.value),
);
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
const rows = computed(() =>
  props.targets.map((target) => {
    const lanes: number[] = [];
    const items = visibleEvents.value
      .filter((event) => event.labId === target.lab.id)
      .map((event) => {
        const start = Math.max(
          dayNumber(event.start),
          dayNumber(bounds.value.start),
        );
        const end = Math.min(dayNumber(event.end), dayNumber(bounds.value.end));
        const point = event.start === event.end;
        let lane = lanes.findIndex((until) => until < start);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = point ? start + 14 : end;
        const left =
          ((start - dayNumber(bounds.value.start)) / span.value) * 100;
        return {
          event,
          point,
          left,
          top: lane * 30 + 8,
          width: ((end - start + 1) / span.value) * 100,
        };
      });
    return { target, items, height: Math.max(58, lanes.length * 30 + 16) };
  }),
);
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
  if (!visibleEvents.value.length) return;
  downloadCalendar(visibleEvents.value);
  message.success('已导出当前时间范围的日历，导入系统日历后可使用提醒。');
}
</script>
<template>
  <section class="journey-timeline">
    <header class="planner-timeline-heading">
      <div>
        <h2>修考时间线与日程</h2>
        <p>出愿、考试、教授联络和待办按日本时间整理；提醒显示已记录的日期。</p>
      </div>
      <Button :disabled="!visibleEvents.length" @click="exportCalendar"
        >导出日历（.ics）</Button
      >
    </header>
    <div class="timeline-controls">
      <label
        >起始月份<Input
          v-model:value="startMonth"
          type="month"
          min="1900-01"
          max="2200-12"
          aria-label="时间线起始月份" /></label
      ><Select
        v-accessible-select
        v-model:value="monthCount"
        aria-label="时间线显示范围"
        :options="[
          { label: '3 个月', value: 3 },
          { label: '6 个月', value: 6 },
          { label: '12 个月', value: 12 },
        ]"
      /><Button @click="startMonth = today.slice(0, 7)">回到本月</Button
      ><span
        >出愿 <i class="legend-application" />考试
        <i class="legend-written" />联络 <i class="legend-contact" />待办
        <i class="legend-task"
      /></span>
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
              >{{ month.label }}</span
            >
          </div>
        </div>
        <div v-for="row in rows" :key="row.target.lab.id" class="gantt-row">
          <div class="gantt-row-label">
            <RouterLink :to="`${labPath(row.target)}?tab=admissions`"
              ><strong>{{ row.target.lab.name }}</strong></RouterLink
            >
            <small>{{ row.target.university.name }}</small>
          </div>
          <div class="gantt-track" :style="{ height: `${row.height}px` }">
            <span
              v-for="month in months"
              :key="month.label"
              class="gantt-grid-line"
              :style="{ left: `${month.left}%` }"
            /><span
              v-if="todayLeft >= 0 && todayLeft <= 100"
              class="gantt-today"
              :style="{ left: `${todayLeft}%` }"
              title="今天（日本时间）"
            /><button
              v-for="item in row.items"
              :key="item.event.id"
              class="gantt-event"
              :class="[
                `event-${item.event.kind}`,
                { 'is-point': item.point, 'is-complete': item.event.complete },
              ]"
              :style="{
                left: `${item.left}%`,
                top: `${item.top}px`,
                width: item.point ? undefined : `${item.width}%`,
                maxWidth: `${100 - item.left}%`,
              }"
              :title="`${item.event.title} · ${item.event.start}${item.event.end !== item.event.start ? ` ～ ${item.event.end}` : ''}`"
              @click="viewEvent(item.event)"
            >
              {{ item.event.title }}</button
            ><small v-if="!row.items.length" class="gantt-no-events"
              >此范围内暂无明确日期</small
            >
          </div>
        </div>
      </div>
    </div>
    <section v-if="conflicts.length" class="planner-conflicts">
      <h3>当前范围时间重叠提示 · {{ conflicts.length }}</h3>
      <p>
        同一专攻共享的同一场考试不会重复提示；同日安排需结合具体时段、地点和交通判断。
      </p>
      <article v-for="conflict in conflicts.slice(0, 12)" :key="conflict.key">
        <strong>{{ conflict.label }}</strong
        ><span
          >{{ conflict.a.labName }} · {{ conflict.a.title }} ↔
          {{ conflict.b.labName }} · {{ conflict.b.title }}</span
        ><small
          >{{ conflict.a.start }} ～ {{ conflict.a.end }} /
          {{ conflict.b.start }} ～ {{ conflict.b.end }}</small
        >
      </article>
    </section>
    <section class="planner-reminder-section">
      <h3>关键节点倒计时</h3>
      <div v-if="reminders.length" class="planner-reminder-grid">
        <button
          v-for="event in reminders"
          :key="event.id"
          :class="{ overdue: event.end < today }"
          @click="viewEvent(event)"
        >
          <strong>{{ eventCountdown(event, today) }}</strong
          ><span>{{ event.title }}</span
          ><small
            >{{ event.universityName }} · {{ event.labName }}<br />{{
              event.at
                ? event.at.replace('T', ' ') + ' JST'
                : `${event.start}${event.end !== event.start ? ` ～ ${event.end}` : ''}`
            }}</small
          >
        </button>
      </div>
      <p v-else class="planner-muted">暂无 30 天内的已记录节点或逾期待办。</p>
    </section>
    <p class="planner-date-hint">
      出愿与考试会读取所属专攻的信息。请填写含年份的明确日期（如
      2027-02-05）；「每年 12
      月」等常规时段会保留在报考资料中，不自动推测日期。页面内提醒在工作台打开时显示；后台提醒可通过导出的日历添加。
    </p>
    <Modal
      v-model:open="detailsOpen"
      :title="selectedEvent?.title"
      :footer="null"
      :width="620"
      ><dl v-if="selectedEvent" class="planner-event-details">
        <div>
          <dt>研究室</dt>
          <dd>
            {{ selectedEvent.universityName }} / {{ selectedEvent.labName }}
          </dd>
        </div>
        <div>
          <dt>日期（JST）</dt>
          <dd>
            {{
              selectedEvent.at
                ? selectedEvent.at.replace('T', ' ')
                : `${selectedEvent.start} ～ ${selectedEvent.end}`
            }}
          </dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{{ eventCountdown(selectedEvent, today) }}</dd>
        </div>
        <div v-if="selectedEvent.details">
          <dt>科目 / 备注</dt>
          <dd>{{ selectedEvent.details }}</dd>
        </div>
      </dl>
      <RouterLink
        v-if="selectedEvent"
        :to="selectedEvent.path"
        class="back-link"
        @click="detailsOpen = false"
        >查看 / 编辑来源记录 →</RouterLink
      ></Modal
    >
  </section>
</template>
