<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Tabs,
} from 'ant-design-vue';
import {
  ADMISSION_FIELDS,
  cycleLabel,
  CYCLE_STATUS_LABELS,
  RESULT_LABELS,
  useAdmissionsStore,
} from './admissions';
import type { AdmissionCycle, CycleDetail, CycleTask } from './admissions';
import { useExplorerStore } from './explorer';
import { localApi } from './local-api';
import { fileUrl } from './documents';
import { labContext } from './lab-targets';
import { buildCyclePlannerEvents } from './admission-calendar';
import { downloadCalendar, eventCountdown } from './application-calendar';
import { japanToday } from './application-planning';
import AdmissionCycleEditor from './components/admission-cycle-editor.vue';
import AdmissionAnalysis from './components/admission-analysis.vue';
import ExplorerIcon from './components/explorer-icon.vue';
const route = useRoute(),
  admissions = useAdmissionsStore(),
  store = useExplorerStore(),
  { message } = App.useApp();
const detail = ref<CycleDetail>(),
  loading = ref(false),
  feedback = ref(''),
  editorOpen = ref(false),
  tasks = ref<CycleTask[]>([]),
  taskTitle = ref(''),
  taskEditing = ref(false),
  historyOpen = ref(false),
  history = ref<
    {
      id: string;
      createdAt: string;
      kind: string;
      before: AdmissionCycle | null;
      after: AdmissionCycle;
    }[]
  >([]);
let generation = 0;
const cycle = computed(() => detail.value?.cycle);
const tab = ref('requirements');
watch(
  () => route.params.cycleId,
  () => {
    tab.value = route.query.tab === 'analysis' ? 'analysis' : 'requirements';
    taskEditing.value = false;
    void load();
  },
  { immediate: true },
);
async function load() {
  const current = ++generation;
  loading.value = true;
  feedback.value = '';
  try {
    const data = await localApi<CycleDetail>(
      `/admissions/cycles/${route.params.cycleId}`,
    );
    if (current !== generation) return;
    detail.value = data;
    admissions.upsert(data.cycle);
    tasks.value = structuredClone(data.cycle.tasks);
  } catch (e) {
    if (current === generation) {
      detail.value = undefined;
      feedback.value = e instanceof Error ? e.message : '申请轮次读取失败。';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
function updated(value: AdmissionCycle) {
  if (detail.value) detail.value.cycle = value;
  tasks.value = structuredClone(value.tasks);
  taskEditing.value = false;
}
const events = computed(() =>
  !cycle.value
    ? []
    : buildCyclePlannerEvents(
        [cycle.value],
        cycle.value.labIds.flatMap((id) => {
          const target = labContext(store, id);
          return target ? [target] : [];
        }),
      ),
);
const uniqueEvents = computed(() =>
  [
    ...new Map(events.value.map((event) => [event.source, event])).values(),
  ].sort((a, b) => a.start.localeCompare(b.start)),
);
function editTasks() {
  if (!cycle.value) return;
  tasks.value = JSON.parse(JSON.stringify(cycle.value.tasks));
  taskTitle.value = '';
  taskEditing.value = true;
  feedback.value = '';
}
function addTask() {
  const title = taskTitle.value.trim();
  if (!title || tasks.value.length >= 200) return;
  if (tasks.value.some((t) => t.title === title)) {
    message.info('清单中已有同名项目。');
    return;
  }
  tasks.value.push({
    id: crypto.randomUUID(),
    title,
    progress: 0,
    dueDate: '',
  });
  taskTitle.value = '';
}
function importMaterials() {
  if (!cycle.value) return;
  const lines = cycle.value.fields.applicationMaterials
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (lines.some((t) => t.length > 240)) {
    feedback.value =
      '材料中有超过 240 字的行，请先在本轮要求中拆分为逐项内容。';
    return;
  }
  const additions = [...new Set(lines)].filter(
    (title) => !tasks.value.some((t) => t.title === title),
  );
  if (tasks.value.length + additions.length > 200) {
    feedback.value = '导入后超过 200 项，请减少条目再导入。';
    return;
  }
  for (const title of lines)
    if (!tasks.value.some((t) => t.title === title) && tasks.value.length < 200)
      tasks.value.push({
        id: crypto.randomUUID(),
        title,
        progress: 0,
        dueDate: '',
      });
}
async function saveTasks() {
  if (!cycle.value) return;
  feedback.value = '';
  try {
    const data = await admissions.save({ ...cycle.value, tasks: tasks.value });
    updated(data);
    message.success('本轮材料清单已保存');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '保存失败。';
  }
}
async function openHistory() {
  if (!cycle.value) return;
  feedback.value = '';
  try {
    history.value = await localApi(
      `/admissions/cycles/${cycle.value.id}/history`,
    );
    historyOpen.value = true;
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '版本记录加载失败。';
  }
}
function changes(item: (typeof history.value)[number]) {
  return (
    ADMISSION_FIELDS.filter(
      (f) => item.before?.fields[f.id] !== item.after.fields[f.id],
    )
      .map((f) => f.label)
      .join('、') ||
    (item.kind === 'created'
      ? '建立申请轮次'
      : '轮次基本资料、提交结果或材料进度更新')
  );
}
</script>
<template>
  <section class="explorer-page admission-cycle-page">
    <p v-if="loading">正在读取申请轮次…</p>
    <p v-if="feedback" class="form-error" role="alert">
      {{ feedback }} <Button @click="load">重新读取</Button>
    </p>
    <template v-if="cycle && detail"
      ><nav class="explorer-breadcrumb" aria-label="当前位置">
        <RouterLink to="/japan-grad/journey?view=admissions"
          >修考之路</RouterLink
        ><ExplorerIcon name="chevron" /><span>申请轮次</span>
      </nav>
      <header class="page-heading">
        <div>
          <h1>{{ cycle.intakeYear }} 年 {{ cycle.intakeMonth }} 月入学</h1>
          <p class="page-description">
            {{ detail.university.name }} / {{ detail.school.name }} /
            {{ detail.major.name }}<br />{{
              cycleLabel(cycle).split(' · ').slice(1).join(' · ')
            }}
          </p>
        </div>
        <div class="detail-actions">
          <Button :disabled="taskEditing" @click="openHistory">版本记录</Button
          ><Button
            type="primary"
            :disabled="taskEditing"
            @click="editorOpen = true"
            >编辑本轮申请</Button
          >
        </div>
      </header>
      <section class="entity-overview">
        <div class="overview-meta">
          <strong>{{ CYCLE_STATUS_LABELS[cycle.status] }}</strong
          ><span>结果：{{ RESULT_LABELS[cycle.result] }}</span
          ><span>关联 {{ cycle.labIds.length }} 个研究室</span>
        </div>
        <p class="overview-notes">
          {{
            cycle.labIds
              .map((id) => store.labs.find((l) => l.id === id)?.name)
              .filter(Boolean)
              .join('、') ||
            '编辑本轮申请可关联研究室，日程将同时出现在修考之路。'
          }}
        </p>
        <div class="cycle-submission-record">
          <span v-if="cycle.submittedAt">提交：{{ cycle.submittedAt }}</span
          ><span v-if="cycle.examNumber">受验番号：{{ cycle.examNumber }}</span
          ><span v-if="cycle.trackingNumber"
            >邮寄单号：{{ cycle.trackingNumber }}</span
          ><span v-if="cycle.enrollmentDeadline"
            >入学手续截止：{{ cycle.enrollmentDeadline }}</span
          >
        </div>
      </section>
      <Tabs v-model:active-key="tab"
        ><Tabs.TabPane
          key="requirements"
          tab="本轮要求与日程"
          :disabled="taskEditing"
          ><section class="cycle-requirements">
            <article v-for="field in ADMISSION_FIELDS" :key="field.id">
              <header>
                <h3>{{ field.label }}</h3>
                <small>{{
                  cycle.provenance[field.id]?.origin === 'analysis'
                    ? '提取后已核对'
                    : cycle.provenance[field.id]?.origin === 'reviewed_edit'
                      ? '核对时修改'
                      : cycle.fields[field.id]
                        ? '手动维护'
                        : '待填写'
                }}</small>
              </header>
              <p :class="{ 'not-filled': !cycle.fields[field.id] }">
                {{ cycle.fields[field.id] || '尚未填写' }}
              </p>
              <details v-if="cycle.provenance[field.id]?.evidence?.length">
                <summary>查看原文出处与核对时间</summary>
                <small
                  >{{
                    new Date(
                      cycle.provenance[field.id]!.confirmedAt,
                    ).toLocaleString()
                  }}
                  · {{ cycle.provenance[field.id]!.executor }}</small
                >
                <blockquote
                  v-for="(evidence, i) in cycle.provenance[field.id]!.evidence"
                  :key="i"
                >
                  <a
                    :href="`${fileUrl(evidence.documentId)}#page=${evidence.page}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    >打开来源 · 定位 {{ evidence.page }} ↗</a
                  >
                  <p>{{ evidence.quote }}</p>
                </blockquote>
              </details>
            </article>
          </section>
          <section class="cycle-dates">
            <header class="collection-heading">
              <div>
                <h2>本轮日程</h2>
                <p>
                  YYYY-MM-DD
                  格式的日期按整日进入日程，原文时段和待公布信息保留在要求中。
                </p>
              </div>
              <Button
                :disabled="!events.length"
                @click="downloadCalendar(events)"
                >导出本轮日历</Button
              >
            </header>
            <ul v-if="uniqueEvents.length">
              <li v-for="event in uniqueEvents" :key="event.source">
                <strong>{{ event.title.split(' · ')[0] }}</strong
                ><span
                  >{{ event.start
                  }}{{
                    event.end !== event.start ? ` ～ ${event.end}` : ''
                  }}</span
                ><small>{{
                  event.complete
                    ? '已完成'
                    : eventCountdown(event, japanToday())
                }}</small>
              </li>
            </ul>
            <p v-else>填写明确日期并关联研究室后显示日程。</p>
          </section> </Tabs.TabPane
        ><Tabs.TabPane
          key="tasks"
          :tab="`本轮材料与待办（${cycle.tasks.length}）`"
          ><section class="cycle-tasks">
            <header class="collection-heading">
              <div>
                <h2>本轮材料与待办</h2>
                <p>当前轮次独立记录，不影响其他年度的准备进度。</p>
              </div>
              <Button v-if="!taskEditing" @click="editTasks">编辑清单</Button>
            </header>
            <div v-if="taskEditing" class="cycle-task-add">
              <Input
                v-model:value="taskTitle"
                :maxlength="240"
                placeholder="新增材料或待办，如研究计划书"
                aria-label="新材料或待办名称"
                @press-enter="addTask"
              /><Button @click="addTask">新增一项</Button
              ><Button
                :disabled="!cycle.fields.applicationMaterials"
                @click="importMaterials"
                >导入本轮材料要求</Button
              >
            </div>
            <div class="cycle-task-list">
              <div
                v-for="task in taskEditing ? tasks : cycle.tasks"
                :key="task.id"
                class="cycle-task-row"
              >
                <Checkbox
                  :checked="task.progress === 100"
                  :disabled="!taskEditing || admissions.saving"
                  :aria-label="`${task.title}已完成`"
                  @change="task.progress = task.progress === 100 ? 0 : 100"
                /><Input
                  v-if="taskEditing"
                  v-model:value="task.title"
                  :maxlength="240"
                  aria-label="材料或待办名称"
                /><strong v-else>{{ task.title }}</strong
                ><InputNumber
                  v-if="taskEditing"
                  v-model:value="task.progress"
                  :min="0"
                  :max="100"
                  :precision="0"
                  addon-after="%"
                  aria-label="准备进度"
                /><span v-else>{{ task.progress }}%</span
                ><Input
                  v-if="taskEditing"
                  v-model:value="task.dueDate"
                  type="date"
                  aria-label="材料截止日期"
                /><small v-else>{{ task.dueDate || '截止日期未填写' }}</small
                ><Button
                  v-if="taskEditing"
                  danger
                  type="text"
                  :disabled="admissions.saving"
                  @click="tasks = tasks.filter((t) => t.id !== task.id)"
                  >移除</Button
                >
              </div>
            </div>
            <p v-if="!(taskEditing ? tasks : cycle.tasks).length">
              尚未建立清单，可从已确认的本轮材料要求导入。
            </p>
            <div v-if="taskEditing" class="form-footer">
              <span>{{ tasks.length }} / 200 项</span
              ><Button
                :disabled="admissions.saving"
                @click="taskEditing = false"
                >取消</Button
              ><Button
                type="primary"
                :loading="admissions.saving"
                @click="saveTasks"
                >保存本轮清单</Button
              >
            </div>
          </section></Tabs.TabPane
        ><Tabs.TabPane key="analysis" tab="募集要项分析" :disabled="taskEditing"
          ><AdmissionAnalysis
            v-if="tab === 'analysis'"
            :cycle="cycle"
            @updated="updated" /></Tabs.TabPane
      ></Tabs>
      <AdmissionCycleEditor
        v-model:open="editorOpen"
        :cycle="cycle"
        @saved="updated"
      />
      <section v-if="historyOpen" class="cycle-history">
        <header class="collection-heading">
          <div>
            <h2>版本记录</h2>
            <p>每次保存均记录版本与变更，可核对采纳前后的内容。</p>
          </div>
          <Button @click="historyOpen = false">收起</Button>
        </header>
        <details v-for="item in history" :key="item.id">
          <summary>
            {{ new Date(item.createdAt).toLocaleString() }} · 版本
            {{ item.after.revision }} · {{ changes(item) }}
          </summary>
          <div
            v-for="field in ADMISSION_FIELDS.filter(
              (f) => item.before?.fields[f.id] !== item.after.fields[f.id],
            )"
            :key="field.id"
          >
            <strong>{{ field.label }}</strong>
            <p>原值：{{ item.before?.fields[field.id] || '空' }}</p>
            <p>保存后：{{ item.after.fields[field.id] || '空' }}</p>
          </div>
        </details>
      </section> </template
    ><RouterLink v-else-if="!loading" to="/japan-grad/journey?view=admissions"
      >返回申请轮次</RouterLink
    >
  </section>
</template>
<style scoped>
.cycle-submission-record {
  display: flex;
  gap: 12px 24px;
  flex-wrap: wrap;
  color: var(--jg-muted);
  font-size: 13px;
}
.cycle-requirements {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.cycle-requirements > article {
  min-width: 0;
  padding: 20px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}
.cycle-requirements header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.cycle-requirements h3 {
  font-size: 14px;
  margin: 0;
}
.cycle-requirements small {
  color: var(--jg-muted);
  font-size: 12px;
}
.cycle-requirements p {
  margin-top: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.cycle-requirements details {
  margin-top: 12px;
  color: var(--jg-secondary);
  font-size: 12px;
}
.cycle-requirements summary,
.cycle-history summary {
  cursor: pointer;
}
.cycle-requirements blockquote {
  margin: 12px 0 0;
  padding-left: 12px;
  border-left: 2px solid var(--jg-accent-line);
}
.cycle-requirements a {
  color: var(--jg-accent-text);
  text-decoration: underline;
}
.cycle-dates,
.cycle-history {
  margin-top: 32px;
}
.cycle-dates ul {
  list-style: none;
  padding: 0;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  background: var(--jg-surface);
}
.cycle-dates li {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 16px;
  border-bottom: 1px solid var(--jg-line);
}
.cycle-dates li:last-child {
  border: 0;
}
.cycle-dates li small {
  margin-left: auto;
  color: var(--jg-muted);
}
.cycle-task-add {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
}
.cycle-task-add > .ant-input {
  flex: 1;
  min-width: 200px;
}
.cycle-task-list {
  display: grid;
  gap: 12px;
  margin: 20px 0;
}
.cycle-task-row {
  display: grid;
  grid-template-columns: 20px minmax(120px, 1fr) 110px 160px auto;
  gap: 12px;
  align-items: center;
  padding: 16px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}
.cycle-task-row small {
  color: var(--jg-muted);
}
.cycle-history > details {
  padding: 16px;
  border-bottom: 1px solid var(--jg-line);
}
.cycle-history details div {
  margin-top: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.cycle-history details p {
  margin-top: 6px;
  color: var(--jg-secondary);
}
@media (max-width: 760px) {
  .cycle-requirements {
    grid-template-columns: minmax(0, 1fr);
  }
  .cycle-task-row {
    grid-template-columns: 20px minmax(0, 1fr);
  }
  .cycle-task-row > :nth-child(n + 3) {
    grid-column: 2;
    max-width: 100%;
  }
}
</style>
