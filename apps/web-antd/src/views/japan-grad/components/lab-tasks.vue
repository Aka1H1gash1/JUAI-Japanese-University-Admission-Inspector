<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
} from 'ant-design-vue';
import type { ApplicationTask } from '../application-planning';
import {
  japanToday,
  materialProgress,
  MATERIAL_TEMPLATES,
} from '../application-planning';
import { useExplorerStore } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{ labId: string }>();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const lab = computed(() => store.labs.find((item) => item.id === props.labId));
const tasks = computed(() => lab.value?.tasks ?? []);
const progress = computed(() => materialProgress(tasks.value));
const editorOpen = ref(false);
const saving = ref(false);
const feedback = ref('');
const draft = ref<ApplicationTask>({
  id: '',
  title: '',
  kind: 'material',
  progress: 0,
  dueDate: '',
  notes: '',
});
function edit(task?: ApplicationTask) {
  draft.value = task
    ? { ...task }
    : {
        id: '',
        title: '',
        kind: 'material',
        progress: 0,
        dueDate: '',
        notes: '',
      };
  feedback.value = '';
  editorOpen.value = true;
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  feedback.value = '';
  try {
    await store.saveLabTask(props.labId, { ...draft.value });
    editorOpen.value = false;
    message.success('材料 / 待办已保存');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '保存失败。';
  } finally {
    saving.value = false;
  }
}
async function toggle(task: ApplicationTask) {
  try {
    await store.saveLabTask(props.labId, {
      ...task,
      progress: task.progress === 100 ? 0 : 100,
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新失败。');
  }
}
function remove(task: ApplicationTask) {
  modal.confirm({
    title: `移除「${task.title}」？`,
    content: '将从此研究室的材料与待办中移除这一项。',
    okText: '移除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeLabTask(props.labId, task.id);
    },
  });
}
async function importTitles(titles: string[]) {
  const existing = new Set(
    tasks.value.map((item) => item.title.trim().toLowerCase()),
  );
  const additions: ApplicationTask[] = [];
  for (const raw of titles) {
    const text = raw.trim();
    const title = text.slice(0, 160);
    if (!title || existing.has(title.toLowerCase())) continue;
    existing.add(title.toLowerCase());
    additions.push({
      id: crypto.randomUUID(),
      title,
      kind: 'material',
      progress: 0,
      dueDate: '',
      notes:
        text.length > 160
          ? `${text.slice(0, 3900)}\n完整要求见所属专攻的出愿材料。`
          : '',
    });
  }
  if (!additions.length) {
    message.info('这些材料已在清单中。');
    return;
  }
  try {
    await store.saveLabTasks(props.labId, [...tasks.value, ...additions]);
    message.success(
      `已添加 ${additions.length} 项材料，请按实际招生要求调整。`,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败。');
  }
}
const admissionMaterials = computed(
  () =>
    store.majors
      .find((item) => item.id === lab.value?.majorId)
      ?.applicationMaterials.split(/\r?\n/)
      .filter((item) => item.trim()) ?? [],
);
</script>
<template>
  <section v-if="lab" class="lab-tasks-section">
    <header class="collection-heading">
      <div>
        <h2>
          材料与待办<span>{{ tasks.length }}</span>
        </h2>
        <p>按研究室逐项准备，材料进度会同步到修考之路。</p>
      </div>
      <Button type="primary" class="icon-button" @click="edit()"
        ><ExplorerIcon name="plus" />新增材料 / 待办</Button
      >
    </header>
    <div class="planner-material-summary">
      <span
        >材料准备：{{
          progress.count
            ? `${progress.percent}% · ${progress.done}/${progress.count} 项完成`
            : '尚未建立材料清单'
        }}</span
      ><Progress
        :percent="progress.percent"
        :show-info="false"
        :stroke-color="'var(--jg-accent)'"
      />
      <div class="planner-inline-actions">
        <Button
          :disabled="store.saving"
          @click="importTitles(MATERIAL_TEMPLATES)"
          >添加常用材料</Button
        ><Button
          :disabled="!admissionMaterials.length || store.saving"
          @click="importTitles(admissionMaterials)"
          >从专攻所需材料导入</Button
        ><small>常用清单可编辑，具体以招生要求为准。</small>
      </div>
    </div>
    <div v-if="tasks.length" class="planner-task-list">
      <article
        v-for="task in tasks"
        :key="task.id"
        class="planner-task-row"
        :class="{ completed: task.progress === 100 }"
      >
        <Checkbox
          :checked="task.progress === 100"
          :disabled="store.saving"
          :aria-label="`完成：${task.title}`"
          @change="toggle(task)"
        />
        <div class="planner-task-content">
          <h3>
            {{ task.title
            }}<small>{{ task.kind === 'material' ? '材料' : '待办' }}</small>
          </h3>
          <p v-if="task.notes">{{ task.notes }}</p>
          <span
            v-if="task.dueDate"
            :class="{
              'planner-overdue':
                task.progress < 100 && task.dueDate < japanToday(),
            }"
            >截止 {{ task.dueDate
            }}{{
              task.progress < 100 && task.dueDate < japanToday()
                ? ' · 已逾期'
                : ''
            }}</span
          ><Progress
            :percent="task.progress"
            size="small"
            :stroke-color="'var(--jg-accent)'"
          />
        </div>
        <Button
          type="text"
          :aria-label="`编辑进度：${task.title}`"
          @click="edit(task)"
          ><ExplorerIcon name="edit" /></Button
        ><Button
          type="text"
          :aria-label="`移除待办：${task.title}`"
          @click="remove(task)"
          ><ExplorerIcon name="trash"
        /></Button>
      </article>
    </div>
    <div v-else class="collection-empty">
      <h3>把准备工作拆成可完成的小项</h3>
      <p>
        研究计划书、推荐信、志望理由书、语言成绩，也可以记录联系教授等待办。
      </p>
      <Button @click="importTitles(MATERIAL_TEMPLATES)"
        >使用常用材料清单</Button
      >
    </div>
    <Modal
      v-model:open="editorOpen"
      :title="draft.id ? '编辑材料 / 待办' : '新增材料 / 待办'"
      :width="620"
      :footer="null"
      :mask-closable="!saving"
      :closable="!saving"
      :keyboard="!saving"
      ><form class="planner-task-editor" @submit.prevent="save">
        <div class="field">
          <label for="planner-task-title">名称</label
          ><Input
            id="planner-task-title"
            v-model:value="draft.title"
            :maxlength="160"
            :disabled="saving"
            placeholder="如研究计划书、推荐信、面试准备"
          />
        </div>
        <div class="planner-form-grid">
          <div class="field">
            <label for="planner-task-kind">类型</label
            ><Select
              v-accessible-select
              id="planner-task-kind"
              v-model:value="draft.kind"
              :disabled="saving"
              :options="[
                { label: '申请材料', value: 'material' },
                { label: '其他待办', value: 'todo' },
              ]"
            />
          </div>
          <div class="field">
            <label for="planner-task-progress">准备进度（%）</label
            ><InputNumber
              id="planner-task-progress"
              :value="draft.progress"
              @change="draft.progress = typeof $event === 'number' ? $event : 0"
              :min="0"
              :max="100"
              :precision="0"
              :disabled="saving"
            />
          </div>
        </div>
        <div class="field">
          <label for="planner-task-due">截止日期（日本时间）</label
          ><Input
            id="planner-task-due"
            v-model:value="draft.dueDate"
            type="date"
            :disabled="saving"
          />
        </div>
        <div class="field">
          <label for="planner-task-notes">备注</label
          ><Input.TextArea
            id="planner-task-notes"
            v-model:value="draft.notes"
            :rows="3"
            :maxlength="4000"
            :disabled="saving"
            placeholder="版本、所需份数、翻译 / 认证要求、下一步……"
          />
        </div>
        <p v-if="feedback" role="alert" class="form-error">{{ feedback }}</p>
        <div class="planner-form-footer">
          <Button :disabled="saving" @click="editorOpen = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="saving"
            >保存</Button
          >
        </div>
      </form></Modal
    >
  </section>
</template>
