<script setup lang="ts">
import type { PlannerEvent } from '../application-calendar';

import { computed, ref } from 'vue';

import { Button, Modal, Segmented } from 'ant-design-vue';

import {
  calendarDays,
  calendarEventSummary,
  eventsOnDay,
  moveCalendar,
} from '../overview-calendar';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{ events: PlannerEvent[]; today: string }>();
const emit = defineEmits<{ todo: [event: PlannerEvent] }>();
const view = ref<'month' | 'week'>('week');
const anchor = ref(props.today);
const selectedDay = ref('');
const selectedEvent = ref<PlannerEvent>();
const detailOpen = computed({
  get: () => !!selectedDay.value,
  set: (open: boolean) => {
    if (!open) selectedDay.value = '';
  },
});
const days = computed(() => calendarDays(anchor.value, view.value));
const dayEvents = computed(
  () => new Map(days.value.map((day) => [day, eventsOnDay(props.events, day)])),
);
const detailEvents = computed(() =>
  selectedEvent.value
    ? [selectedEvent.value]
    : eventsOnDay(props.events, selectedDay.value),
);
const visibleCount = computed(
  () =>
    new Set([...dayEvents.value.values()].flat().map((event) => event.id)).size,
);
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const monthLimit = 1;
const period = computed(() => {
  if (view.value === 'month')
    return `${anchor.value.slice(0, 4)} 年 ${Number(anchor.value.slice(5, 7))} 月`;
  const first = days.value[0] ?? anchor.value;
  const last = days.value.at(-1) ?? anchor.value;
  return `${first.slice(0, 4)} 年 ${Number(first.slice(5, 7))} 月 ${Number(first.slice(8))} 日 — ${first.slice(0, 7) === last.slice(0, 7) ? '' : `${Number(last.slice(5, 7))} 月 `}${Number(last.slice(8))} 日`;
});
function openDay(day: string, event?: PlannerEvent) {
  selectedDay.value = day;
  selectedEvent.value = event;
}
function path(event: PlannerEvent) {
  return event.imported === false
    ? '/japan-grad/journey?view=timeline'
    : event.path;
}
function time(event: PlannerEvent) {
  return event.at ? (event.at.split('T').at(-1) ?? '').slice(0, 5) : '全天';
}
function tone(event: PlannerEvent) {
  if (
    ['exam', 'interview', 'teacher_interview', 'written'].includes(event.kind)
  )
    return 'exam';
  if (['consent', 'contact', 'followup', 'sent'].includes(event.kind))
    return 'contact';
  if (event.kind === 'result') return 'result';
  return 'application';
}
function addTodo(event: PlannerEvent) {
  selectedDay.value = '';
  emit('todo', event);
}
</script>

<template>
  <section
    class="overview-panel overview-calendar"
    aria-labelledby="overview-deadlines"
  >
    <header class="overview-section-heading">
      <div>
        <h2 id="overview-deadlines">
          近期日历 <span>{{ visibleCount }}</span>
        </h2>
      </div>
      <Segmented
        v-model:value="view"
        :options="[
          { label: '7 天 · 周', value: 'week' },
          { label: '30 天 · 月', value: 'month' },
        ]"
        aria-label="日历视图"
      />
    </header>
    <div class="calendar-toolbar">
      <strong aria-live="polite">{{ period }}</strong>
      <div>
        <Button
          size="small"
          :aria-label="view === 'week' ? '上一周' : '上个月'"
          @click="anchor = moveCalendar(anchor, view, -1)"
          >
<ExplorerIcon name="back" />
</Button><Button size="small" @click="anchor = today">今天</Button><Button
          size="small"
          :aria-label="view === 'week' ? '下一周' : '下个月'"
          @click="anchor = moveCalendar(anchor, view, 1)"
          >
<ExplorerIcon name="chevron" />
</Button>
      </div>
    </div>
    <div class="calendar-scroll">
      <div
        class="calendar-grid"
        :class="`is-${view}`"
        :aria-label="view === 'week' ? '周日历' : '月日历'"
      >
        <div v-for="day in weekdays" :key="day" class="calendar-weekday">
          周{{ day }}
        </div>
        <div
          v-for="day in days"
          :key="day"
          class="calendar-day"
          :class="{
            'is-today': day === today,
            'is-outside':
              view === 'month' && day.slice(0, 7) !== anchor.slice(0, 7),
          }"
        >
          <button
            class="calendar-day-number"
            :aria-label="`${day}，${dayEvents.get(day)?.length || 0} 个节点`"
            :aria-current="day === today ? 'date' : undefined"
            @click="openDay(day)"
          >
            {{ Number(day.slice(8)) }}
          </button>
          <div class="calendar-day-events">
            <button
              v-for="event in view === 'week'
                ? dayEvents.get(day)
                : dayEvents.get(day)?.slice(0, monthLimit)"
              :key="event.id"
              class="calendar-event"
              :class="[
                `tone-${tone(event)}`,
                { 'is-complete': event.complete },
              ]"
              :aria-label="`${day} ${event.title}，${event.labName}，${time(event)}`"
              @click="openDay(day, event)"
            >
              <span v-if="view === 'week'" class="calendar-event-time">{{ time(event)
                }}<span v-if="event.start !== event.end"> · 跨日</span></span>
              <strong>{{
                view === 'month' ? calendarEventSummary(event) : event.title
              }}</strong><span v-if="view === 'week'" class="calendar-event-context">{{
                [event.universityName, event.labName]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </button>
            <span
              v-if="view === 'week' && !dayEvents.get(day)?.length"
              class="calendar-free"
              >—</span>
            <button
              v-if="
                view === 'month' &&
                (dayEvents.get(day)?.length || 0) > monthLimit
              "
              class="calendar-more"
              @click="openDay(day)"
            >
              另 {{ dayEvents.get(day)!.length - monthLimit }} 项
            </button>
          </div>
        </div>
      </div>
    </div>
    <footer class="calendar-footer">
      <div>
        <span class="calendar-key tone-application">出愿</span><span class="calendar-key tone-exam">考试</span><span class="calendar-key tone-contact">联络</span><span class="calendar-key tone-result">结果</span>
      </div>
      <RouterLink to="/japan-grad/journey?view=timeline">
编辑日程 <ExplorerIcon name="arrow" />
</RouterLink>
    </footer>
    <Modal
      v-model:open="detailOpen"
      :title="`${selectedDay} · 日程节点`"
      :footer="null"
      :width="520"
    >
      <div v-if="detailEvents.length" class="calendar-detail-list">
        <article
          v-for="event in detailEvents"
          :key="event.id"
          class="calendar-detail"
        >
          <span>{{ time(event) }} · {{ event.start
            }}{{ event.end !== event.start ? ` — ${event.end}` : ''
            }}{{ event.complete ? ' · 已完成' : '' }}</span>
          <h3>{{ event.title }}</h3>
          <p>
            {{
              [event.universityName, event.labName].filter(Boolean).join(' · ')
            }}
          </p>
          <p v-if="event.details" class="calendar-detail-notes">
            {{ event.details }}
          </p>
          <div>
            <RouterLink :to="path(event)" @click="selectedDay = ''">
查看原记录 <ExplorerIcon name="arrow" />
</RouterLink><Button v-if="!event.complete" size="small" @click="addTodo(event)">
<ExplorerIcon name="plus" />加入待办
</Button>
          </div>
        </article>
      </div>
      <p v-else class="calendar-detail-empty">这一天没有日程节点。</p>
    </Modal>
  </section>
</template>
