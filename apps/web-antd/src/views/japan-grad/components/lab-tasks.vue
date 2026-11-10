<script setup lang="ts">
import type { ApplicationTask, TaskOrigin } from '../application-planning';

import { computed, ref } from 'vue';

import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Progress,
} from 'ant-design-vue';

import {
  dateFromText,
  japanToday,
  MATERIAL_TEMPLATES,
  materialProgress,
} from '../application-planning';
import { useExplorerStore } from '../explorer';
import { labContext, majorPath } from '../lab-targets';
import ExplorerIcon from './explorer-icon.vue';

type ChecklistKind = ApplicationTask['kind'];
interface SmartSuggestion extends ApplicationTask {
  key: string;
  source: string;
}

const props = defineProps<{ kind: ChecklistKind; labId: string }>();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const lab = computed(() => store.labs.find((item) => item.id === props.labId));
const major = computed(() =>
  store.majors.find((item) => item.id === lab.value?.majorId),
);
const allTasks = computed(() => lab.value?.tasks ?? []);
const tasks = computed(() =>
  allTasks.value.filter((item) => item.kind === props.kind),
);
const progress = computed(() => materialProgress(tasks.value));
const label = computed(() => (props.kind === 'material' ? '材料' : '待办'));
const editorOpen = ref(false);
const smartOpen = ref(false);
const saving = ref(false);
const feedback = ref('');
const selectedSuggestions = ref<string[]>([]);
const draft = ref<ApplicationTask>(emptyDraft());

function emptyDraft(): ApplicationTask {
  return {
    id: '',
    title: '',
    kind: props.kind,
    progress: 0,
    dueDate: '',
    notes: '',
  };
}

function normalizedKey(
  item: Pick<ApplicationTask, 'dueDate' | 'kind' | 'title'>,
) {
  return `${item.kind}:${item.title.trim().replaceAll(/\s+/g, '').toLowerCase()}:${item.dueDate}`;
}

function addTodoSuggestion(
  target: SmartSuggestion[],
  title: string,
  rawDate: string,
  source: string,
  importedFrom: TaskOrigin,
) {
  const dueDate = dateFromText(rawDate);
  if (!dueDate) return;
  target.push({
    id: '',
    key: `todo:${title}:${dueDate}`,
    title,
    kind: 'todo',
    progress: 0,
    dueDate,
    importedFrom,
    notes: `智能导入自募集要项 · ${source}`,
    source,
  });
}

const smartSuggestions = computed<SmartSuggestion[]>(() => {
  const value = major.value;
  if (!value) return [];
  const suggestions: SmartSuggestion[] = [];
  if (props.kind === 'material') {
    for (const [index, raw] of value.applicationMaterials
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .entries()) {
      const title = raw.slice(0, 160);
      suggestions.push({
        id: '',
        key: `material:${index}:${title}`,
        title,
        kind: 'material',
        progress: 0,
        dueDate: '',
        importedFrom: 'applicationMaterials',
        notes:
          raw.length > 160
            ? `${raw.slice(0, 3900)}\n智能导入自募集要项 · 出愿材料`
            : '智能导入自募集要项 · 出愿材料',
        source: '出愿材料',
      });
    }
  } else {
    addTodoSuggestion(
      suggestions,
      '开始出愿手续',
      value.applicationStart,
      '出愿开始日',
      'applicationStart',
    );
    addTodoSuggestion(
      suggestions,
      '完成出愿提交',
      value.applicationEnd,
      '出愿截止日',
      'applicationEnd',
    );
    for (const record of value.examHistory ?? []) {
      const context = `${record.year} 年${record.session ? ` · ${record.session}` : ''}`;
      addTodoSuggestion(
        suggestions,
        `${context} · 参加笔试`,
        record.writtenDate,
        '笔试日期',
        'writtenDate',
      );
      addTodoSuggestion(
        suggestions,
        `${context} · 参加面试`,
        record.interviewDate,
        '面试日期',
        'interviewDate',
      );
      addTodoSuggestion(
        suggestions,
        `${context} · 确认合格结果`,
        record.resultDate,
        '结果发布日',
        'resultDate',
      );
    }
  }
  const existing = new Set(allTasks.value.map(normalizedKey));
  const unique = new Map<string, SmartSuggestion>();
  // Past dates (for example last year's exams) would only arrive as overdue items.
  const today = japanToday();
  for (const suggestion of suggestions.filter(
    (item) => !item.dueDate || item.dueDate >= today,
  )) {
    const key = normalizedKey(suggestion);
    if (!existing.has(key) && !unique.has(key)) unique.set(key, suggestion);
  }
  return [...unique.values()];
});

const skippedPastDates = computed(() => {
  const value = major.value;
  if (props.kind !== 'todo' || !value) return 0;
  const today = japanToday();
  return [
    value.applicationStart,
    value.applicationEnd,
    ...(value.examHistory ?? []).flatMap((record) => [
      record.writtenDate,
      record.interviewDate,
      record.resultDate,
    ]),
  ].filter((raw) => {
    const day = dateFromText(raw);
    return day && day < today;
  }).length;
});

const admissionsPath = computed(() => {
  const target = labContext(store, props.labId);
  return target ? `${majorPath(target)}#major-admissions` : '';
});

const analysisPath = computed(() => ({
  path: `/japan-grad/analysis/${major.value?.id ?? ''}`,
  query: {
    importTarget: props.kind === 'material' ? 'materials' : 'todos',
  },
}));

function edit(task?: ApplicationTask) {
  draft.value = task ? { ...task } : emptyDraft();
  feedback.value = '';
  editorOpen.value = true;
}

function openSmartImport() {
  selectedSuggestions.value = smartSuggestions.value.map((item) => item.key);
  smartOpen.value = true;
}

function toggleSuggestion(key: string) {
  selectedSuggestions.value = selectedSuggestions.value.includes(key)
    ? selectedSuggestions.value.filter((item) => item !== key)
    : [...selectedSuggestions.value, key];
}

async function save() {
  if (saving.value) return;
  if (!draft.value.title.trim()) {
    feedback.value = `请填写${label.value}名称。`;
    return;
  }
  if (props.kind === 'todo' && !draft.value.dueDate) {
    feedback.value = '请为待办选择日期。';
    return;
  }
  saving.value = true;
  feedback.value = '';
  // Editing the progress by hand replaces whatever was remembered before ticking.
  const { progressBeforeDone, ...edited } = draft.value;
  const original = allTasks.value.find((item) => item.id === draft.value.id);
  const keep =
    props.kind === 'material' &&
    edited.progress === 100 &&
    original?.progress === 100 &&
    progressBeforeDone !== undefined;
  try {
    await store.saveLabTask(props.labId, {
      ...edited,
      ...(keep ? { progressBeforeDone } : {}),
      kind: props.kind,
      dueDate: props.kind === 'todo' ? draft.value.dueDate : '',
    });
    editorOpen.value = false;
    message.success(`${label.value}已保存`);
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '保存失败。';
  } finally {
    saving.value = false;
  }
}

// Ticking a material remembers its progress in the workspace, so unticking restores it.
function toggled(task: ApplicationTask): ApplicationTask {
  const { progressBeforeDone, ...rest } = task;
  if (task.progress !== 100)
    return task.kind === 'material' && task.progress > 0
      ? { ...rest, progress: 100, progressBeforeDone: task.progress }
      : { ...rest, progress: 100 };
  return {
    ...rest,
    progress: task.kind === 'material' ? (progressBeforeDone ?? 0) : 0,
  };
}

async function toggle(task: ApplicationTask) {
  const next = toggled(task);
  const { progress } = next;
  try {
    await store.saveLabTask(props.labId, next);
    if (task.kind === 'material' && task.progress === 100)
      message.info(`已恢复为 ${progress}%，可点编辑调整准备进度。`);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新失败。');
  }
}

function remove(task: ApplicationTask) {
  modal.confirm({
    title: `移除「${task.title}」？`,
    content: `将从此研究室的${label.value}中移除这一项。`,
    okText: '移除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeLabTask(props.labId, task.id);
    },
  });
}

async function importSuggestions() {
  const selected = new Set(selectedSuggestions.value);
  const additions = smartSuggestions.value
    .filter((item) => selected.has(item.key))
    .map(({ key: _key, source: _source, ...item }) => ({
      ...item,
      id: crypto.randomUUID(),
    }));
  if (additions.length === 0) {
    message.info(`请先选择要导入的${label.value}。`);
    return;
  }
  saving.value = true;
  try {
    await store.saveLabTasks(props.labId, [...allTasks.value, ...additions]);
    smartOpen.value = false;
    message.success(`已智能导入 ${additions.length} 项${label.value}。`);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入失败。');
  } finally {
    saving.value = false;
  }
}

async function importTemplates() {
  const existing = new Set(allTasks.value.map(normalizedKey));
  const additions = MATERIAL_TEMPLATES.map((title) => ({
    id: crypto.randomUUID(),
    title,
    kind: 'material' as const,
    progress: 0,
    dueDate: '',
    notes: '手动添加自常用材料模板，请按实际募集要项调整。',
  })).filter((item) => !existing.has(normalizedKey(item)));
  if (additions.length === 0) {
    message.info('常用材料已在清单中。');
    return;
  }
  await store.saveLabTasks(props.labId, [...allTasks.value, ...additions]);
  message.success(`已添加 ${additions.length} 项常用材料。`);
}
</script>

<template>
  <!-- eslint-disable vue/html-closing-bracket-newline, vue/multiline-html-element-content-newline, vue/no-useless-v-bind -->
  <section v-if="lab" class="lab-tasks-section checklist-section">
    <header class="collection-heading checklist-heading">
      <div>
        <h2>
          {{ label }}<span>{{ tasks.length }}</span>
        </h2>
        <p>
          {{
            kind === 'material'
              ? '跟踪每份申请材料的准备进度，与日程待办分开管理。'
              : '每项待办都有明确日期，并同步到申请总览和时间线。'
          }}
        </p>
      </div>
      <div class="checklist-primary-actions">
        <Button
          class="icon-button smart-import-button"
          @click="openSmartImport"
        >
          <ExplorerIcon name="search" />智能导入
        </Button>
        <Button type="primary" class="icon-button" @click="edit()">
          <ExplorerIcon name="plus" />手动新增
        </Button>
      </div>
    </header>

    <div v-if="kind === 'material'" class="planner-material-summary">
      <span>
        材料准备：{{
          progress.count
            ? `${progress.percent}% · ${progress.done}/${progress.count} 项完成`
            : '尚未建立材料清单'
        }}
      </span>
      <Progress
        :percent="progress.percent"
        :show-info="false"
        :stroke-color="'var(--jg-accent)'"
      />
      <Button type="link" :disabled="store.saving" @click="importTemplates">
        从常用材料模板添加
      </Button>
    </div>

    <div v-if="tasks.length" class="planner-task-list checklist-list">
      <article
        v-for="task in tasks"
        :key="task.id"
        class="planner-task-row checklist-row"
        :class="{ completed: task.progress === 100, todo: kind === 'todo' }"
      >
        <Checkbox
          :checked="task.progress === 100"
          :disabled="store.saving"
          :aria-label="`完成：${task.title}`"
          @change="toggle(task)"
        />
        <div class="planner-task-content">
          <h3>{{ task.title }}</h3>
          <p v-if="task.notes">{{ task.notes }}</p>
          <span
            v-if="kind === 'todo'"
            class="checklist-date"
            :class="{
              'planner-overdue':
                task.progress < 100 && task.dueDate < japanToday(),
            }"
          >
            {{ task.dueDate
            }}{{
              task.progress < 100 && task.dueDate < japanToday()
                ? ' · 已逾期'
                : ''
            }}
          </span>
          <Progress
            v-else
            :percent="task.progress"
            size="small"
            :stroke-color="'var(--jg-accent)'"
          />
        </div>
        <Button
          type="text"
          :aria-label="`编辑${label}：${task.title}`"
          @click="edit(task)"
          ><ExplorerIcon name="edit"
        /></Button>
        <Button
          type="text"
          :aria-label="`移除${label}：${task.title}`"
          @click="remove(task)"
          ><ExplorerIcon name="trash"
        /></Button>
      </article>
    </div>

    <div v-else class="collection-empty checklist-empty">
      <ExplorerIcon :name="kind === 'material' ? 'book' : 'calendar'" />
      <h3>{{ kind === 'material' ? '尚未添加材料' : '尚未安排待办' }}</h3>
      <p>
        {{
          kind === 'material'
            ? '可从募集要项智能导入，也可以手动创建材料。'
            : '从募集要项导入出愿、笔试、面试与放榜日期。'
        }}
      </p>
      <div>
        <Button @click="openSmartImport">智能导入</Button>
        <Button type="primary" @click="edit()">手动新增</Button>
      </div>
    </div>

    <Modal
      v-model:open="smartOpen"
      :title="`智能导入${label}`"
      :width="720"
      :footer="null"
      :destroy-on-close="true"
    >
      <div class="smart-import-panel">
        <header>
          <span><ExplorerIcon name="notebook" /></span>
          <div>
            <h3>从专攻的出愿信息生成</h3>
            <p>
              {{ major?.name }} ·
              {{
                kind === 'material'
                  ? '「出愿信息」里的所需材料'
                  : '「出愿信息」和历年考试表里的具体日期'
              }}
            </p>
          </div>
        </header>
        <div v-if="smartSuggestions.length" class="smart-import-options">
          <label
            v-for="suggestion in smartSuggestions"
            :key="suggestion.key"
            class="smart-import-option"
          >
            <Checkbox
              :checked="selectedSuggestions.includes(suggestion.key)"
              @change="toggleSuggestion(suggestion.key)"
            />
            <span>
              <strong>{{ suggestion.title }}</strong>
              <small>
                {{ suggestion.source
                }}{{ suggestion.dueDate ? ` · ${suggestion.dueDate}` : '' }}
              </small>
            </span>
          </label>
        </div>
        <div v-else class="smart-import-missing">
          <h3>专攻里还没有可导入的{{ label }}</h3>
          <p>
            {{
              kind === 'material'
                ? '在专攻的「出愿信息」里逐行填写所需材料，或让 AI 从募集要项提取。'
                : '在专攻的「出愿信息」或历年考试表里填写 2027-06-01 这样的具体日期，或让 AI 从募集要项提取。'
            }}
          </p>
          <RouterLink
            v-if="admissionsPath"
            :to="admissionsPath"
            @click="smartOpen = false"
          >
            手动填写出愿信息 →
          </RouterLink>
          <RouterLink :to="analysisPath" @click="smartOpen = false">
            用 AI 分析募集要项 →
          </RouterLink>
        </div>
        <p v-if="skippedPastDates" class="smart-import-skipped">
          已跳过 {{ skippedPastDates }} 个已经过去的日期，例如往年的考试。
        </p>
        <footer>
          <span
            >只导入勾选项，已有同名内容不会重复。导入的待办和时间线上的考试节点是同一天时，时间线只显示一次。</span
          >
          <Button @click="smartOpen = false">取消</Button>
          <Button
            v-if="smartSuggestions.length"
            type="primary"
            :loading="saving"
            :disabled="selectedSuggestions.length === 0"
            @click="importSuggestions"
            >导入所选 {{ label }}</Button
          >
        </footer>
      </div>
    </Modal>

    <Modal
      v-model:open="editorOpen"
      :title="draft.id ? `编辑${label}` : `手动新增${label}`"
      :width="620"
      :footer="null"
      :mask-closable="!saving"
      :closable="!saving"
      :keyboard="!saving"
    >
      <form class="planner-task-editor" @submit.prevent="save">
        <div class="field">
          <label for="planner-task-title">{{ label }}名称</label>
          <Input
            id="planner-task-title"
            v-model:value="draft.title"
            :maxlength="160"
            :disabled="saving"
            :placeholder="
              kind === 'material'
                ? '如研究计划书、推荐信、成绩单'
                : '如完成网上出愿、参加面试'
            "
          />
        </div>
        <div v-if="kind === 'material'" class="field">
          <label for="planner-task-progress">准备进度（%）</label>
          <InputNumber
            id="planner-task-progress"
            :value="draft.progress"
            :min="0"
            :max="100"
            :precision="0"
            :disabled="saving"
            @change="draft.progress = typeof $event === 'number' ? $event : 0"
          />
        </div>
        <div v-else class="field">
          <label for="planner-task-due">日期（日本时间）</label>
          <Input
            id="planner-task-due"
            v-model:value="draft.dueDate"
            type="date"
            required
            :disabled="saving"
          />
        </div>
        <div class="field">
          <label for="planner-task-notes">备注</label>
          <Input.TextArea
            id="planner-task-notes"
            v-model:value="draft.notes"
            :rows="3"
            :maxlength="4000"
            :disabled="saving"
            :placeholder="
              kind === 'material'
                ? '份数、格式、翻译 / 认证要求……'
                : '办理方式、地点、准备事项……'
            "
          />
        </div>
        <p v-if="feedback" role="alert" class="form-error">{{ feedback }}</p>
        <div class="planner-form-footer">
          <Button :disabled="saving" @click="editorOpen = false">取消</Button>
          <Button type="primary" html-type="submit" :loading="saving">
            保存{{ label }}
          </Button>
        </div>
      </form>
    </Modal>
  </section>
</template>

<style scoped>
.checklist-heading {
  align-items: flex-start;
}

.checklist-eyebrow {
  margin: 0 0 7px !important;
  font-size: 10px !important;
  color: var(--jg-accent-text) !important;
  letter-spacing: 0.14em;
}

.checklist-primary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.smart-import-button {
  color: var(--jg-accent-text);
  border-color: color-mix(in srgb, var(--jg-accent) 42%, var(--jg-line));
}

.checklist-row.todo {
  border-left: 3px solid var(--jg-accent);
}

.checklist-row.todo .planner-task-content h3 {
  margin-bottom: 7px;
}

.checklist-date {
  display: inline-flex;
  width: fit-content;
  padding: 3px 7px;
  margin-top: 7px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--jg-accent-text);
  background: var(--jg-subtle);
  border-radius: 849px;
}

.checklist-empty > svg {
  width: 24px;
  height: 24px;
  margin-bottom: 8px;
  color: var(--jg-accent-text);
}

.checklist-empty > div {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.smart-import-panel > header {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  padding: 14px;
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.smart-import-panel > header > span {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--jg-on-accent);
  background: var(--jg-accent);
  border-radius: 8px;
}

.smart-import-panel h3,
.smart-import-panel p {
  margin: 0;
}

.smart-import-panel header p,
.smart-import-missing p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.smart-import-options {
  display: grid;
  gap: 7px;
  max-height: 306px;
  padding: 12px 0;
  overflow: auto;
}

.smart-import-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  cursor: pointer;
  border: 1px solid var(--jg-line);
  border-radius: 7px;
}

.smart-import-option:hover {
  background: var(--jg-subtle);
}

.smart-import-option span {
  display: grid;
  gap: 4px;
}

.smart-import-option strong {
  font-size: 11px;
  font-weight: 600;
  color: var(--jg-text);
}

.smart-import-option small {
  font-size: 11px;
  color: var(--jg-muted);
}

.smart-import-missing {
  padding: 27px 15px;
  margin: 12px 0;
  text-align: center;
  border: 1px dashed var(--jg-border);
  border-radius: 8px;
}

.smart-import-missing a {
  display: inline-block;
  margin: 12px 8px 0;
  color: var(--jg-accent-text);
}

.smart-import-skipped {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--jg-muted);
}

.smart-import-panel > footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--jg-line);
}

.smart-import-panel > footer span {
  margin-right: auto;
  font-size: 11px;
  color: var(--jg-muted);
}

@media (max-width: 640px) {
  .checklist-primary-actions,
  .checklist-primary-actions .ant-btn,
  .checklist-empty > div,
  .checklist-empty > div .ant-btn {
    width: 100%;
  }

  .smart-import-panel > footer .ant-btn {
    flex: 1;
  }
}
</style>
