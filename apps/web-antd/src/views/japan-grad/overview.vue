<script setup lang="ts">
import type { PlannerEvent } from './application-calendar';
import type { ApplicationTask } from './application-planning';
import type { LabTarget } from './lab-targets';
import type { InformationGap } from './overview-data';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useNow } from '@vueuse/core';
import { App, Button, Checkbox, Segmented } from 'ant-design-vue';

import { buildPlannerEvents, eventCountdown } from './application-calendar';
import {
  CONTACT_LABELS,
  dayNumber,
  japanToday,
  materialProgress,
  normalizedContact,
} from './application-planning';
import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import JourneyLabPicker from './components/journey-lab-picker.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore } from './explorer';
import { labContext, labPath } from './lab-targets';
import { actionDay, informationGaps, upcomingEvents } from './overview-data';

import './overview.css';

const store = useExplorerStore();
const router = useRouter();
const { message } = App.useApp();
const now = useNow({ interval: 60_000 });
const today = computed(() => japanToday(now.value));
const dateLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now.value),
);
const targets = computed(() =>
  store.labs
    .filter((lab) => lab.wantApply)
    .flatMap((lab) => {
      const target = labContext(store, lab.id);
      return target ? [target] : [];
    }),
);
const events = computed(() => buildPlannerEvents(targets.value));
const horizon = ref(30);
const upcoming = computed(() =>
  upcomingEvents(events.value, today.value, horizon.value),
);
const gaps = computed(() => informationGaps(targets.value));
const taskFilter = ref('priority');
const taskLimit = ref(6);
const eventLimit = ref(6);
const gapLimit = ref(4);
const labLimit = ref(6);
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
  tasks.value.filter(({ task }) => {
    if (taskFilter.value === 'today') {
      return task.dueDate === today.value;
    }
    if (taskFilter.value === 'overdue') {
      return task.dueDate && task.dueDate < today.value;
    }
    return true;
  }),
);
const materials = computed(() =>
  materialProgress(targets.value.flatMap((target) => target.lab.tasks ?? [])),
);
const progressByLab = computed(
  () =>
    new Map(
      targets.value.map((target) => [
        target.lab.id,
        materialProgress(target.lab.tasks),
      ]),
    ),
);
const nextByLab = computed(() => {
  const map = new Map<string, (typeof events.value)[number]>();
  for (const event of upcomingEvents(events.value, today.value, Infinity)) {
    if (!map.has(event.labId)) map.set(event.labId, event);
  }
  return map;
});
const pendingTasks = ref(new Set<string>());
const editorOpen = ref(false);
const pickerOpen = ref(false);
const editor = ref<NonNullable<InformationGap['editor']>>({
  kind: 'university',
  id: '',
});
watch(taskFilter, () => {
  taskLimit.value = 6;
});
watch(horizon, () => {
  eventLimit.value = 6;
});

function eventPath(event: PlannerEvent) {
  return event.imported === false
    ? '/japan-grad/journey?view=timeline'
    : event.path;
}

function dueLabel(date: string) {
  if (!date) return '未设截止';
  const days = dayNumber(date) - dayNumber(today.value);
  if (days < 0) {
    return `逾期 ${-days} 天`;
  }
  if (days === 0) {
    return '今天截止';
  }
  if (days === 1) {
    return '明天截止';
  }
  return `${date.slice(5).replace('-', '/')} 截止`;
}
function contactSummary(target: LabTarget) {
  if (target.professors.length === 0) return '尚未添加老师';
  const counts = new Map<string, number>();
  for (const person of target.professors) {
    const label = CONTACT_LABELS[normalizedContact(person.contact).status];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(
      ([label, count]) =>
        `${label}${target.professors.length > 1 ? ` ${count} 位` : ''}`,
    )
    .join(' · ');
}
async function completeTask(target: LabTarget, task: ApplicationTask) {
  const key = `${target.lab.id}/${task.id}`;
  if (pendingTasks.value.has(key)) return;
  pendingTasks.value.add(key);
  try {
    await store.saveLabTask(target.lab.id, { ...task, progress: 100 });
    message.success('已完成，研究室清单同步更新');
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
function addUniversity() {
  editor.value = { kind: 'university', id: '' };
  editorOpen.value = true;
}
</script>

<template>
  <!-- eslint-disable vue/html-closing-bracket-newline -->
  <section class="explorer-page overview-page">
    <header class="overview-heading">
      <div>
        <p class="overview-date">{{ dateLabel }} <span>日本时间</span></p>
        <h1>申请总览<span class="heading-dot">。</span></h1>
      </div>
    </header>

    <template v-if="targets.length">
      <div class="overview-columns">
        <div class="overview-primary">
          <section class="overview-panel" aria-labelledby="overview-deadlines">
            <header class="overview-section-heading">
              <div>
                <h2 id="overview-deadlines">
                  近期节点 <span>{{ upcoming.length }}</span>
                </h2>
                <p>出愿、考试与已安排的联络计划</p>
              </div>
              <Segmented
                v-model:value="horizon"
                :options="[
                  { label: '7 天', value: 7 },
                  { label: '30 天', value: 30 },
                  { label: '90 天', value: 90 },
                ]"
                aria-label="近期节点时间范围"
              />
            </header>
            <div v-if="upcoming.length" class="overview-event-list">
              <RouterLink
                v-for="event in upcoming.slice(0, eventLimit)"
                :key="event.id"
                :to="eventPath(event)"
                class="overview-event"
                :title="
                  [
                    event.at ? `${event.at.replace('T', ' ')} JST` : '',
                    event.details,
                  ]
                    .filter(Boolean)
                    .join('\n')
                "
              >
                <div class="overview-event-date">
                  <strong>{{ actionDay(event, today).slice(8) }}</strong
                  ><span>{{
                    actionDay(event, today).slice(0, 7).replace('-', '/')
                  }}</span>
                </div>
                <div class="overview-event-copy">
                  <strong>{{ event.title }}</strong
                  ><span>{{ event.universityName }} · {{ event.labName }}</span
                  ><time :datetime="event.start"
                    >{{ event.start
                    }}<template v-if="event.end !== event.start">
                      至 {{ event.end }}</template
                    ><template v-if="event.at">
                      · {{ event.at.slice(11) }} JST</template
                    ></time
                  >
                </div>
                <span
                  class="overview-countdown"
                  :class="{
                    'is-urgent':
                      dayNumber(actionDay(event, today)) - dayNumber(today) <=
                      3,
                  }"
                  >{{ eventCountdown(event, today) }}</span
                >
                <ExplorerIcon name="chevron" />
              </RouterLink>
              <button
                v-if="upcoming.length > eventLimit"
                class="overview-more"
                @click="eventLimit += 6"
              >
                再显示 {{ Math.min(6, upcoming.length - eventLimit) }} 个节点
              </button>
            </div>
            <div v-else class="overview-empty-inline">
              <ExplorerIcon name="calendar" />
              <p>未来 {{ horizon }} 天暂无已记录节点</p>
              <span>未填写或无法识别的日期不会计入日程。</span>
            </div>
            <RouterLink
              to="/japan-grad/journey?view=timeline"
              class="overview-panel-footer"
            >
              查看与编辑完整时间线 <ExplorerIcon name="arrow" />
            </RouterLink>
          </section>

          <section
            id="overview-progress"
            class="overview-panel"
            aria-labelledby="overview-labs-heading"
          >
            <header class="overview-section-heading">
              <div>
                <h2 id="overview-labs-heading">研究室进度</h2>
                <p>联络、材料与下一个节点</p>
              </div>
              <RouterLink to="/japan-grad/journey" class="overview-inline-link">
                修考之路 <ExplorerIcon name="arrow" />
              </RouterLink>
            </header>
            <div class="overview-lab-list">
              <article
                v-for="target in targets.slice(0, labLimit)"
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
                      {{ target.lab.name }}
                    </RouterLink>
                    <p>
                      {{ target.university.name }} · {{ target.major.name }}
                    </p>
                  </div>
                </div>
                <div class="overview-lab-details">
                  <RouterLink
                    :to="labPath(target)"
                    class="overview-lab-contact"
                  >
                    <ExplorerIcon name="mail" /><span>{{
                      contactSummary(target)
                    }}</span>
                  </RouterLink>
                  <RouterLink
                    :to="`${labPath(target)}?tab=materials`"
                    class="overview-lab-material"
                  >
                    <span>材料</span
                    ><strong>{{
                      progressByLab.get(target.lab.id)?.count
                        ? `${progressByLab.get(target.lab.id)!.percent}%`
                        : '未建清单'
                    }}</strong
                    ><span v-if="progressByLab.get(target.lab.id)?.count"
                      >{{ progressByLab.get(target.lab.id)!.done }}/{{
                        progressByLab.get(target.lab.id)!.count
                      }}</span
                    >
                  </RouterLink>
                </div>
                <RouterLink
                  v-if="nextByLab.get(target.lab.id)"
                  :to="eventPath(nextByLab.get(target.lab.id)!)"
                  class="overview-lab-next"
                >
                  <span>下一步</span
                  ><strong>{{ nextByLab.get(target.lab.id)!.title }}</strong
                  ><small>{{
                    eventCountdown(nextByLab.get(target.lab.id)!, today)
                  }}</small>
                </RouterLink>
                <RouterLink
                  v-else
                  to="/japan-grad/journey?view=timeline"
                  class="overview-lab-next"
                >
                  <span>下一步</span><strong>安排时间节点</strong
                  ><ExplorerIcon name="plus" />
                </RouterLink>
              </article>
            </div>
            <button
              v-if="targets.length > labLimit"
              class="overview-more"
              @click="labLimit += 6"
            >
              查看更多研究室（剩余 {{ targets.length - labLimit }} 个）
            </button>
          </section>
        </div>

        <div class="overview-secondary">
          <section
            id="overview-tasks"
            class="overview-panel"
            aria-labelledby="overview-tasks-heading"
          >
            <header class="overview-section-heading">
              <div>
                <h2 id="overview-tasks-heading">
                  待办事项 <span>{{ tasks.length }}</span>
                </h2>
                <p>勾选后同步到研究室清单</p>
              </div>
              <ExplorerIcon name="check" />
            </header>
            <div class="overview-task-filters">
              <Segmented
                v-model:value="taskFilter"
                :options="[
                  { label: '全部', value: 'priority' },
                  { label: `今天 ${dueToday.length}`, value: 'today' },
                  { label: `逾期 ${overdue.length}`, value: 'overdue' },
                ]"
                aria-label="待办筛选"
              />
            </div>
            <div
              v-if="visibleTasks.length"
              class="overview-task-list"
              aria-live="polite"
            >
              <div
                v-for="{ target, task } in visibleTasks.slice(0, taskLimit)"
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
                />
                <RouterLink :to="`${labPath(target)}?tab=todos`">
                  <strong>{{ task.title }}</strong
                  ><span
                    >{{ target.university.name }} · {{ target.lab.name }}</span
                  >
                  <div>
                    <small
                      :class="{
                        'overview-danger': task.dueDate && task.dueDate < today,
                      }"
                      >{{ dueLabel(task.dueDate) }}</small
                    ><small>{{ task.progress }}%</small>
                  </div>
                </RouterLink>
              </div>
              <button
                v-if="visibleTasks.length > taskLimit"
                class="overview-more"
                @click="taskLimit += 6"
              >
                查看更多待办（剩余 {{ visibleTasks.length - taskLimit }} 项）
              </button>
            </div>
            <div v-else class="overview-empty-inline">
              <ExplorerIcon name="check" />
              <p>
                {{
                  taskFilter === 'today'
                    ? '今天没有截止待办'
                    : taskFilter === 'overdue'
                      ? '目前没有逾期待办'
                      : '目前没有未完成待办'
                }}
              </p>
              <span>{{
                materials.count
                  ? '可以继续检查近期节点和申请资料。'
                  : '在研究室的「待办」中安排有日期的事项。'
              }}</span>
            </div>
          </section>

          <section
            class="overview-panel overview-gaps"
            aria-labelledby="overview-gaps-heading"
          >
            <header class="overview-section-heading">
              <div>
                <h2 id="overview-gaps-heading">
                  待补信息 <span>{{ gaps.length }}</span>
                </h2>
                <p>共用的大学、专攻资料只列一次</p>
              </div>
              <ExplorerIcon name="edit" />
            </header>
            <div v-if="gaps.length" class="overview-gap-list">
              <button
                v-for="gap in gaps.slice(0, gapLimit)"
                :key="gap.id"
                class="overview-gap"
                @click="fillGap(gap)"
              >
                <span
                  ><strong>{{ gap.name }}</strong
                  ><small>{{ gap.context }}</small
                  ><span>{{ gap.fields.join('、') }}</span></span
                ><ExplorerIcon name="chevron" />
              </button>
              <button
                v-if="gaps.length > gapLimit"
                class="overview-more"
                @click="gapLimit += 4"
              >
                查看更多缺项（剩余 {{ gaps.length - gapLimit }} 组）
              </button>
            </div>
            <div v-else class="overview-empty-inline">
              <ExplorerIcon name="check" />
              <p>基础信息已填写</p>
              <span>临近出愿时，请再核对当年募集要项。</span>
            </div>
          </section>
        </div>
      </div>
      <p class="overview-footnote">
        仅汇总已标记想考的研究室；考试日期采用各专攻最新记录年份，具体要求请核对当年募集要项。
      </p>
    </template>

    <section v-else class="overview-onboarding">
      <div class="overview-onboarding-symbol">
        <ExplorerIcon name="calendar" />
      </div>
      <h2>
        {{
          store.universities.length
            ? '把想考的研究室放到这里'
            : '从第一所大学，开始准备'
        }}
      </h2>
      <p>
        {{
          store.universities.length
            ? '标记想考后，联络进度、考试日期和材料待办会自动汇总到首页。'
            : '先建立大学与研究室资料，再为想考目标安排日程、准备材料。'
        }}
      </p>
      <ol>
        <li><span>1</span>整理大学与研究室</li>
        <li><span>2</span>标记想考目标</li>
        <li><span>3</span>安排日程与待办</li>
      </ol>
      <Button
        v-if="store.labs.length"
        type="primary"
        @click="pickerOpen = true"
      >
        选择想考研究室
      </Button>
      <Button
        v-else-if="!store.universities.length"
        type="primary"
        @click="addUniversity"
      >
        添加第一所大学
      </Button>
      <RouterLink
        v-else
        to="/japan-grad/universities"
        class="overview-inline-link"
      >
        前往大学清单完善资料 <ExplorerIcon name="arrow" />
      </RouterLink>
    </section>
    <EntityEditor
      v-model:open="editorOpen"
      :kind="editor.kind"
      :entity-id="editor.id"
      :parent-id="editor.parentId"
    />
    <JourneyLabPicker v-model:open="pickerOpen" />
  </section>
</template>
