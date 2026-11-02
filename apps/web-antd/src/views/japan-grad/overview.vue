<script setup lang="ts">
import type { PlannerEvent } from './application-calendar';
import type { ApplicationTask } from './application-planning';
import type { LabTarget } from './lab-targets';
import type { InformationGap } from './overview-data';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useNow, useStorage } from '@vueuse/core';
import {
  App,
  Button,
  Checkbox,
  Input,
  Modal,
  Popover,
  Segmented,
  Select,
} from 'ant-design-vue';

import { buildPlannerEvents } from './application-calendar';
import {
  CONTACT_RESULT_LABELS,
  dayNumber,
  japanToday,
  materialProgress,
  validPlannerDay,
} from './application-planning';
import EntityCreateFlow from './components/entity-create-flow.vue';
import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import JourneyLabPicker from './components/journey-lab-picker.vue';
import OverviewCalendar from './components/overview-calendar.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore } from './explorer';
import { labContext, labPath } from './lab-targets';
import { actionDay, informationGaps } from './overview-data';
import { APPLICATION_STAGES, applicationStage } from './overview-progress';
import { filterInformationGaps, REMINDER_OPTIONS } from './overview-reminders';
import { vAccessibleSelect } from './select-accessibility';
import { useSpecialProgramEvents } from './special-program-events';

import './overview.css';

const store = useExplorerStore();
const router = useRouter();
const { message } = App.useApp();
const now = useNow({ interval: 60_000 });
const today = computed(() => japanToday(now.value));
const targets = computed(() =>
  store.labs
    .filter((lab) => lab.wantApply)
    .flatMap((lab) => {
      const target = labContext(store, lab.id);
      return target ? [target] : [];
    }),
);
const programEvents = useSpecialProgramEvents();
const events = computed(() => [
  ...buildPlannerEvents(targets.value),
  ...programEvents.value,
]);
const selectedReminders = useStorage<string[]>(
  `japangrad-overview-reminders:${store.workspacePath}`,
  REMINDER_OPTIONS.map((option) => option.value),
);
const allGaps = computed(() => informationGaps(targets.value, today.value));
const gaps = computed(() =>
  filterInformationGaps(allGaps.value, selectedReminders.value),
);
const gapCount = computed(() =>
  gaps.value.reduce((sum, gap) => sum + gap.fields.length, 0),
);
const taskFilter = ref('all');
const tasks = computed(() =>
  targets.value
    .flatMap((target) =>
      (target.lab.tasks ?? [])
        .filter((task) => task.kind === 'todo' && task.progress < 100)
        .map((task) => ({ target, task })),
    )
    .toSorted(
      (a, b) =>
        (a.task.dueDate || '9999').localeCompare(b.task.dueDate || '9999') ||
        a.task.title.localeCompare(b.task.title, 'zh-CN'),
    ),
);
const overdue = computed(() =>
  tasks.value.filter(({ task }) => task.dueDate && task.dueDate < today.value),
);
const dueToday = computed(() =>
  tasks.value.filter(({ task }) => task.dueDate === today.value),
);
const visibleTasks = computed(() =>
  tasks.value.filter(
    ({ task }) =>
      taskFilter.value === 'all' ||
      (taskFilter.value === 'today'
        ? task.dueDate === today.value
        : task.dueDate && task.dueDate < today.value),
  ),
);
const progressByLab = computed(
  () =>
    new Map(
      targets.value.map((target) => [
        target.lab.id,
        {
          ...applicationStage(target),
          materials: materialProgress(target.lab.tasks),
        },
      ]),
    ),
);
const pendingTasks = ref(new Set<string>());
const editorOpen = ref(false);
const createUniversityOpen = ref(false);
const pickerOpen = ref(false);
const editor = ref<NonNullable<InformationGap['editor']>>({
  kind: 'university',
  id: '',
});
const reminderOpen = ref(false);
const taskOpen = ref(false);
const taskSaving = ref(false);
const taskError = ref('');
const taskSource = ref('');
const taskDraft = ref({ labId: '', title: '', dueDate: '', notes: '' });
const labOptions = computed(() =>
  targets.value.map((target) => ({
    value: target.lab.id,
    label: `${target.university.name} · ${target.lab.name}`,
  })),
);

function openTask(event?: PlannerEvent) {
  const firstTarget = targets.value[0];
  if (!firstTarget) {
    pickerOpen.value = true;
    return;
  }
  taskDraft.value = {
    labId:
      targets.value.find((target) => target.lab.id === event?.labId)?.lab.id ??
      firstTarget.lab.id,
    title: event?.title || '',
    dueDate: event ? actionDay(event, today.value) : today.value,
    notes: '',
  };
  taskSource.value = event ? '从日程节点创建；保存后可在这里勾选完成。' : '';
  taskError.value = '';
  taskOpen.value = true;
}
async function saveTask() {
  if (taskSaving.value) return;
  taskError.value = '';
  if (
    !taskDraft.value.title.trim() ||
    !validPlannerDay(taskDraft.value.dueDate)
  ) {
    taskError.value = '请填写事项和有效截止日期。';
    return;
  }
  const lab = targets.value.find(
    (target) => target.lab.id === taskDraft.value.labId,
  )?.lab;
  if (!lab) {
    taskError.value = '请选择一个想考的研究室。';
    return;
  }
  if (
    lab.tasks?.some(
      (task) =>
        task.kind === 'todo' &&
        task.title === taskDraft.value.title.trim() &&
        task.dueDate === taskDraft.value.dueDate,
    )
  ) {
    taskError.value = '这个研究室已有同名、同截止日期的待办。';
    return;
  }
  taskSaving.value = true;
  try {
    await store.saveLabTask(lab.id, {
      id: '',
      kind: 'todo',
      title: taskDraft.value.title,
      dueDate: taskDraft.value.dueDate,
      notes: taskDraft.value.notes,
      progress: 0,
    });
    taskOpen.value = false;
    taskFilter.value = 'all';
    message.success('待办已添加');
  } catch (error) {
    taskError.value =
      error instanceof Error ? error.message : '添加失败，请重试。';
  } finally {
    taskSaving.value = false;
  }
}
function dueLabel(date: string) {
  if (!date) return '未设截止';
  const days = dayNumber(date) - dayNumber(today.value);
  if (days < 0) return `逾期 ${-days} 天`;
  if (days === 0) return '今天截止';
  if (days === 1) return '明天截止';
  return `${date.slice(5).replace('-', '/')} 截止`;
}
async function completeTask(target: LabTarget, task: ApplicationTask) {
  const key = `${target.lab.id}/${task.id}`;
  if (pendingTasks.value.has(key)) return;
  pendingTasks.value.add(key);
  try {
    await store.saveLabTask(target.lab.id, { ...task, progress: 100 });
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '更新失败，请重试。',
    );
  } finally {
    pendingTasks.value.delete(key);
  }
}
function fillGap(gap: InformationGap) {
  if (gap.editor) {
    editor.value = gap.editor;
    editorOpen.value = true;
  } else void router.push(gap.path);
}
</script>

<template>
  <section class="explorer-page overview-page">
    <header class="overview-heading">
      <div>
        <h1 class="workspace-title">申请总览</h1>
      </div>
      <Button @click="pickerOpen = true">
<ExplorerIcon name="heart" />想考研究室
        <span>{{ targets.length }}</span>
</Button>
    </header>
    <div class="overview-grid">
      <OverviewCalendar :events="events" :today="today" @todo="openTask" />

      <section
        id="overview-tasks"
        class="overview-panel overview-todos"
        aria-labelledby="overview-tasks-heading"
      >
        <header class="overview-section-heading">
          <div>
            <h2 id="overview-tasks-heading">
              待办事项 <span>{{ tasks.length }}</span>
            </h2>
          </div>
          <Button size="small" type="primary" @click="openTask()">
<ExplorerIcon name="plus" />新增待办
</Button>
        </header>
        <div class="overview-task-controls">
          <Segmented
            v-model:value="taskFilter"
            :options="[
              { label: '全部', value: 'all' },
              { label: `今天 ${dueToday.length}`, value: 'today' },
              { label: `逾期 ${overdue.length}`, value: 'overdue' },
            ]"
            aria-label="待办筛选"
          /><Popover
            trigger="click"
            placement="bottomRight"
            title="哪些事情会成为待办？"
            >
<template #content>
<p class="overview-help">
                在这里或研究室的「待办」中新增，也可以确认智能导入。<br />日历里的日期节点不会自动变成待办，点击节点可选择「加入待办」。
              </p>
</template><button class="overview-icon-button" aria-label="待办来源说明">
              <ExplorerIcon name="info" />
</button>
</Popover>
        </div>
        <div class="overview-panel-body">
          <div
            v-if="visibleTasks.length"
            class="overview-task-list"
            aria-live="polite"
          >
            <div
              v-for="{ target, task } in visibleTasks"
              :key="`${target.lab.id}/${task.id}`"
              class="overview-task"
            >
              <Checkbox
                :checked="false"
                :disabled="
                  store.saving ||
                  pendingTasks.has(`${target.lab.id}/${task.id}`)
                "
                :aria-label="`完成${target.lab.name}的${task.title}`"
                @change="completeTask(target, task)"
              /><RouterLink :to="`${labPath(target)}?tab=todos`">
<strong>{{ task.title }}</strong><span>{{ target.university.name }} · {{ target.lab.name }}</span><small
                  :class="{
                    'overview-danger': task.dueDate && task.dueDate < today,
                  }"
                  >{{ dueLabel(task.dueDate) }}</small>
</RouterLink>
            </div>
          </div>
          <div v-else class="overview-empty-inline">
            <ExplorerIcon name="check" />
            <h3>
              {{
                taskFilter === 'all'
                  ? '暂时没有待办'
                  : taskFilter === 'today'
                    ? '今天没有截止事项'
                    : '没有逾期事项'
              }}
            </h3>
            <button v-if="!targets.length" class="text-button" @click="openTask()">
              选择想考研究室
              <ExplorerIcon name="plus" />
            </button>
          </div>
        </div>
      </section>

      <section
        id="overview-progress"
        class="overview-panel overview-progress-panel"
        aria-labelledby="overview-labs-heading"
      >
        <header class="overview-section-heading">
          <div>
            <h2 id="overview-labs-heading">
              研究室进度 <span>{{ targets.length }}</span>
            </h2>
          </div>
          <RouterLink to="/japan-grad/journey" class="overview-inline-link">
修考之路 <ExplorerIcon name="arrow" />
</RouterLink>
        </header>
        <div class="overview-panel-body">
          <div v-if="targets.length" class="overview-lab-list">
            <article
              v-for="target in targets"
              :key="target.lab.id"
              class="overview-lab-row"
            >
              <div class="overview-lab-identity">
                <UniversityLogo
                  :name="target.university.name"
                  :logo-id="target.university.logoId"
                />
                <div>
                  <RouterLink :to="labPath(target)">
{{
                    target.lab.name
                  }}
</RouterLink>
                  <p>
                    {{ target.university.name }} ·
                    {{ progressByLab.get(target.lab.id)!.label }}
                  </p>
                </div>
              </div>
              <ol
                class="overview-stage-axis"
                :aria-label="`${target.lab.name}，当前阶段：${APPLICATION_STAGES[progressByLab.get(target.lab.id)!.index]}`"
              >
                <li
                  v-for="(stage, index) in APPLICATION_STAGES"
                  :key="stage"
                  :class="{
                    'is-passed':
                      index < progressByLab.get(target.lab.id)!.index,
                    'is-current':
                      index === progressByLab.get(target.lab.id)!.index,
                  }"
                  :aria-current="
                    index === progressByLab.get(target.lab.id)!.index
                      ? 'step'
                      : undefined
                  "
                >
                  <span class="stage-dot"><ExplorerIcon
                      v-if="
                        index < progressByLab.get(target.lab.id)!.index &&
                        progressByLab.get(target.lab.id)!.reached[index]
                      "
                      name="check"
                    /><span v-else>{{ index + 1 }}</span></span><span>{{ stage }}</span>
                </li>
              </ol>
              <div class="overview-lab-bottom">
                <RouterLink
                  :to="`${labPath(target)}?tab=materials`"
                  class="overview-material-progress"
                  >
<span>材料
                    {{
                      progressByLab.get(target.lab.id)!.materials.percent
                    }}%</span><meter
                    min="0"
                    max="100"
                    :value="progressByLab.get(target.lab.id)!.materials.percent"
                    :aria-label="`${target.lab.name}材料准备进度`"
                  ></meter><small>{{ progressByLab.get(target.lab.id)!.materials.done }}/{{
                      progressByLab.get(target.lab.id)!.materials.count
                    }}
                    项</small>
</RouterLink><span
                  v-if="progressByLab.get(target.lab.id)!.result !== 'pending'"
                  class="overview-result"
                  >{{
                    CONTACT_RESULT_LABELS[
                      progressByLab.get(target.lab.id)!.result
                    ]
                  }}</span><RouterLink
                  v-else
                  :to="labPath(target)"
                  class="overview-inline-link"
                  >
更新记录 <ExplorerIcon name="chevron" />
</RouterLink>
              </div>
            </article>
          </div>
          <div v-else class="overview-empty-inline">
            <ExplorerIcon name="building" />
            <h3>
              {{
                store.universities.length
                  ? '选择想考的研究室'
                  : '从第一所大学开始'
              }}
            </h3>
            <p>想考目标的联络阶段和材料进度会显示在这里。</p>
            <Button v-if="store.labs.length" @click="pickerOpen = true">
选择研究室
</Button><Button
              v-else-if="!store.universities.length"
              @click="createUniversityOpen = true"
              >
添加大学
</Button><RouterLink
              v-else
              to="/japan-grad/universities"
              class="overview-inline-link"
              >
前往大学清单 <ExplorerIcon name="arrow" />
</RouterLink>
          </div>
        </div>
      </section>

      <section
        class="overview-panel overview-gaps"
        aria-labelledby="overview-gaps-heading"
      >
        <header class="overview-section-heading">
          <div>
            <h2 id="overview-gaps-heading">
              待补信息 <span>{{ gapCount }}</span>
            </h2>
          </div>
          <Popover
            v-model:open="reminderOpen"
            trigger="click"
            placement="bottomRight"
            title="提醒我补充哪些信息"
            >
<template #content>
<div class="overview-reminder-options">
                <Checkbox.Group
                  v-model:value="selectedReminders"
                  :options="REMINDER_OPTIONS"
                />
                <div>
                  <button
                    class="text-button"
                    @click="
                      selectedReminders = REMINDER_OPTIONS.map(
                        (option) => option.value,
                      )
                    "
                  >
                    全选
</button><button class="text-button" @click="selectedReminders = []">
                    全部关闭
</button><Button size="small" @click="reminderOpen = false">
完成
</Button>
                </div>
              </div>
</template><Button size="small" aria-label="选择待补信息提醒项">
<ExplorerIcon name="edit" />提醒设置
</Button>
</Popover>
        </header>
        <div class="overview-panel-body">
          <div v-if="gaps.length" class="overview-gap-list">
            <button
              v-for="gap in gaps"
              :key="gap.id"
              class="overview-gap"
              @click="fillGap(gap)"
            >
              <span><strong>{{ gap.name }}</strong><small>{{ gap.context }}</small><span class="overview-gap-tags"><span v-for="field in gap.fields" :key="field">{{
                    field
                  }}</span></span></span><ExplorerIcon name="chevron" />
            </button>
          </div>
          <div v-else class="overview-empty-inline">
            <ExplorerIcon name="check" />
            <h3>
              {{
                selectedReminders.length
                  ? '没有需要提醒的缺项'
                  : '已关闭缺项提醒'
              }}
            </h3>
            <p>
              {{
                selectedReminders.length
                  ? '你选择关注的信息都已填写。'
                  : '想收到提醒时，随时打开右上角的提醒设置。'
              }}
            </p>
          </div>
        </div>
        <div class="overview-panel-tail">
          已选择 {{ selectedReminders.length }} 类提醒
        </div>
      </section>
    </div>
    <EntityEditor
      v-model:open="editorOpen"
      :kind="editor.kind"
      :entity-id="editor.id"
      :parent-id="editor.parentId"
    />
    <EntityCreateFlow v-model:open="createUniversityOpen" kind="university" />
    <JourneyLabPicker v-model:open="pickerOpen" />
    <Modal
      v-model:open="taskOpen"
      title="新增待办"
      :width="480"
      :footer="null"
      :mask-closable="!taskSaving"
      :closable="!taskSaving"
      :keyboard="!taskSaving"
      >
<form class="overview-task-form" @submit.prevent="saveTask">
        <p v-if="taskSource" class="overview-form-note">{{ taskSource }}</p>
        <label for="overview-task-lab">研究室</label><Select
          id="overview-task-lab"
          aria-label="所属研究室"
          v-accessible-select
          v-model:value="taskDraft.labId"
          :options="labOptions"
          :disabled="taskSaving"
        /><label for="overview-task-title">要做的事</label><Input
          id="overview-task-title"
          v-model:value="taskDraft.title"
          required
          :maxlength="160"
          :disabled="taskSaving"
          placeholder="如：完成研究计划书初稿"
        /><label for="overview-task-date">截止日期</label><Input
          id="overview-task-date"
          v-model:value="taskDraft.dueDate"
          required
          type="date"
          :disabled="taskSaving"
        /><label for="overview-task-notes">备注（可选）</label><Input.TextArea
          id="overview-task-notes"
          v-model:value="taskDraft.notes"
          :maxlength="4000"
          :rows="2"
          :disabled="taskSaving"
        />
        <p v-if="taskError" class="form-error" role="alert">{{ taskError }}</p>
        <footer>
          <Button :disabled="taskSaving" @click="taskOpen = false">取消</Button><Button type="primary" html-type="submit" :loading="taskSaving">
添加待办
</Button>
        </footer>
      </form>
</Modal>
  </section>
</template>
