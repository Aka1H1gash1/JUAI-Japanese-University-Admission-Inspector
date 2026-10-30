<script setup lang="ts">
/* oxlint-disable unicorn/numeric-separators-style, unicorn/prefer-string-replace-all -- Existing realtime interval and grouping normalization remain unchanged. */
/* eslint-disable perfectionist/sort-imports -- Existing panel imports retain their stable grouping. */
import { computed } from 'vue';
import { useNow } from '@vueuse/core';
import { App, Button, Checkbox, Progress } from 'ant-design-vue';
import type { LabTarget } from '../lab-targets';
import { labPath } from '../lab-targets';
import { japanToday, materialProgress } from '../application-planning';
import {
  buildPlannerEvents,
  eventCountdown,
  plannerReminders,
} from '../application-calendar';
import { useExplorerStore } from '../explorer';
const props = defineProps<{ targets: LabTarget[]; year?: string }>();
const emit = defineEmits<{ timeline: [] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const now = useNow({ interval: 60000 });
const today = computed(() => japanToday(now.value));
const entries = computed(() =>
  props.targets.flatMap((target) =>
    (target.lab.tasks ?? []).map((task) => ({ target, task })),
  ),
);
const progress = computed(() =>
  materialProgress(entries.value.map((item) => item.task)),
);
const coverage = computed(
  () =>
    props.targets.filter((target) =>
      (target.lab.tasks ?? []).some((item) => item.kind === 'material'),
    ).length,
);
const grouped = computed(() => {
  const groups = new Map<
    string,
    { title: string; total: number; progress: number; done: number }
  >();
  for (const { task } of entries.value.filter(
    (item) => item.task.kind === 'material',
  )) {
    const key = task.title.replace(/\s+/g, '').toLowerCase();
    const group = groups.get(key) ?? {
      title: task.title,
      total: 0,
      progress: 0,
      done: 0,
    };
    group.total++;
    group.progress += task.progress;
    if (task.progress === 100) group.done++;
    groups.set(key, group);
  }
  return [...groups.values()].map((item) => ({
    ...item,
    percent: Math.round(item.progress / item.total),
  }));
});
const todos = computed(() =>
  entries.value
    .filter((item) => item.task.kind === 'todo' && item.task.progress < 100)
    .toSorted((a, b) =>
      (a.task.dueDate || '9999').localeCompare(b.task.dueDate || '9999'),
    )
    .slice(0, 8),
);
const reminders = computed(() =>
  plannerReminders(
    buildPlannerEvents(props.targets, props.year ?? 'latest'),
    today.value,
  )
    .filter((item) => item.kind !== 'task')
    .slice(0, 5),
);
async function complete(item: (typeof entries.value)[number]) {
  try {
    await store.saveLabTask(item.target.lab.id, {
      ...item.task,
      progress: 100,
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新失败。');
  }
}
</script>
<template>
  <!-- eslint-disable vue/html-closing-bracket-newline, vue/multiline-html-element-content-newline, vue/no-useless-v-bind -->
  <aside class="journey-task-panel" aria-label="全部想考研究室的准备进度">
    <header>
      <h2>准备进度</h2>
      <span>全部 {{ targets.length }} 个想考研究室</span>
    </header>
    <div class="task-panel-total">
      <strong>{{
        progress.count ? `${progress.percent}%` : '未建清单'
      }}</strong>
      <p>{{ progress.done }} / {{ progress.count }} 项材料完成</p>
      <Progress
        :percent="progress.percent"
        :show-info="false"
        :stroke-color="'var(--jg-accent)'"
      /><small
        >已建立材料清单：{{ coverage }} / {{ targets.length }} 个研究室</small
      >
    </div>

    <section v-if="grouped.length" class="task-panel-section">
      <h3>各类材料</h3>
      <div
        v-for="group in grouped"
        :key="group.title"
        class="task-panel-material"
      >
        <span>{{ group.title }}</span
        ><small>{{ group.percent }}% · {{ group.done }}/{{ group.total }}</small
        ><Progress
          :percent="group.percent"
          :show-info="false"
          size="small"
          :stroke-color="'var(--jg-accent)'"
        />
      </div>
    </section>
    <section class="task-panel-section">
      <h3>
        待办事项<span>{{
          entries.filter(
            (item) => item.task.kind === 'todo' && item.task.progress < 100,
          ).length
        }}</span>
      </h3>
      <div
        v-for="entry in todos"
        :key="`${entry.target.lab.id}-${entry.task.id}`"
        class="task-panel-todo"
      >
        <Checkbox
          :disabled="store.saving"
          :aria-label="`完成${entry.target.lab.name}：${entry.task.title}`"
          @change="complete(entry)"
        /><RouterLink :to="`${labPath(entry.target)}?tab=todos`"
          ><strong>{{ entry.task.title }}</strong
          ><small
            >{{ entry.target.university.name }} ·
            {{ entry.target.lab.name }}</small
          ><small
            v-if="entry.task.dueDate"
            :class="{ 'planner-overdue': entry.task.dueDate < today }"
            >{{ entry.task.dueDate
            }}{{ entry.task.dueDate < today ? ' · 已逾期' : '' }}</small
          ></RouterLink
        >
      </div>
      <p v-if="!todos.length" class="planner-muted">
        {{
          entries.length
            ? '目前没有未完成待办。'
            : '进入研究室的「待办」安排有日期的事项。'
        }}
      </p>
    </section>
    <section class="task-panel-section">
      <h3>近期节点</h3>
      <RouterLink
        v-for="event in reminders"
        :key="event.id"
        :to="event.path"
        class="task-panel-reminder"
        ><strong>{{ event.title }}</strong
        ><small
          >{{ event.labName }} · {{ eventCountdown(event, today) }}</small
        ></RouterLink
      >
      <p v-if="!reminders.length" class="planner-muted">
        暂无 30 天内的已记录节点。
      </p>
      <Button type="text" @click="emit('timeline')">查看修考时间线 →</Button>
    </section>
  </aside>
</template>
