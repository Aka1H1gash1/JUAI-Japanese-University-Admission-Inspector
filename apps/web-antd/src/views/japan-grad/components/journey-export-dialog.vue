<script setup lang="ts">
/* oxlint-disable unicorn/explicit-length-check, unicorn/no-array-reverse, unicorn/no-array-sort -- Existing year option ordering remains stable. */
/* eslint-disable perfectionist/sort-imports -- Export dialog imports retain their existing grouping. */
import type { LabTarget } from '../lab-targets';
import type { JourneyExportFieldId } from '../journey-export-fields';
import { computed, ref, watch } from 'vue';
import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';
import {
  DEFAULT_EXPORT_FIELDS,
  JOURNEY_EXPORT_FIELDS,
  JOURNEY_EXPORT_PRESETS,
  selectedExportFields,
} from '../journey-export-fields';
import { geographySearchTerms } from '../japan-geography';
import { vAccessibleSelect } from '../select-accessibility';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{
  targets: LabTarget[];
  initialIds: string[];
  initialYear: string;
}>();
const open = defineModel<boolean>('open', { default: false });
const { message } = App.useApp();
const roomIds = ref<string[]>([]);
const fieldIds = ref<JourneyExportFieldId[]>([...DEFAULT_EXPORT_FIELDS]);
const query = ref('');
const universityId = ref('');
const year = ref('latest');
const examDetails = ref(false);
const taskDetails = ref(false);
const includeNotes = ref(false);
const exporting = ref(false);
const feedback = ref('');
const selectedTargets = computed(() =>
  props.targets.filter((t) => roomIds.value.includes(t.lab.id)),
);
const fields = computed(() => selectedExportFields(fieldIds.value));
const groups = [...new Set(JOURNEY_EXPORT_FIELDS.map((f) => f.group))].map(
  (label) => ({
    label,
    fields: JOURNEY_EXPORT_FIELDS.filter((f) => f.group === label),
  }),
);
const hasExamFields = computed(() => fields.value.some((f) => f.examField));
const hasTaskFields = computed(() => fields.value.some((f) => f.taskField));
const visible = computed(() =>
  props.targets.filter(
    (t) =>
      (!universityId.value || t.university.id === universityId.value) &&
      [
        t.university.name,
        t.lab.name,
        t.major.name,
        t.lab.research,
        ...geographySearchTerms(t.university),
      ].some((value) =>
        value.toLowerCase().includes(query.value.trim().toLowerCase()),
      ),
  ),
);
const universityOptions = computed(() => [
  ...new Map(
    props.targets.map((t) => [
      t.university.id,
      { value: t.university.id, label: t.university.name },
    ]),
  ).values(),
]);
const visibleSelected = computed(
  () => visible.value.filter((t) => roomIds.value.includes(t.lab.id)).length,
);
const allVisibleSelected = computed(
  () =>
    visible.value.length > 0 && visibleSelected.value === visible.value.length,
);
const yearOptions = computed(() => [
  { value: 'latest', label: '各专攻最新记录年份' },
  { value: 'all', label: '全部已记录年份' },
  ...[
    ...new Set(
      props.targets.flatMap((t) => t.major.examHistory.map((e) => e.year)),
    ),
  ]
    .sort()
    .reverse()
    .map((value) => ({ value, label: `${value} 年` })),
]);
const preview = computed(() =>
  selectedTargets.value.slice(0, 3).map((target) => ({
    id: target.lab.id,
    university: target.university.name,
    lab: target.lab.name,
    values: fields.value.map((f) => {
      const value = f.value(target, year.value);
      return typeof value === 'number' ? value.toLocaleString('ja-JP') : value;
    }),
  })),
);
const sheetCount = computed(
  () =>
    1 +
    Number(examDetails.value && hasExamFields.value) +
    Number(taskDetails.value && hasTaskFields.value) +
    Number(includeNotes.value),
);
watch(open, (value) => {
  if (!value) return;
  roomIds.value = props.initialIds.filter((id) =>
    props.targets.some((t) => t.lab.id === id),
  );
  fieldIds.value = [...DEFAULT_EXPORT_FIELDS];
  year.value = yearOptions.value.some((o) => o.value === props.initialYear)
    ? props.initialYear
    : 'latest';
  query.value = '';
  universityId.value = '';
  examDetails.value = taskDetails.value = includeNotes.value = false;
  feedback.value = '';
});
watch(
  () => props.targets.map((t) => t.lab.id),
  (ids) => {
    roomIds.value = roomIds.value.filter((id) => ids.includes(id));
  },
);
watch(yearOptions, (options) => {
  if (!options.some((o) => o.value === year.value)) year.value = 'latest';
});
watch(hasExamFields, (value) => {
  if (!value) examDetails.value = false;
});
watch(hasTaskFields, (value) => {
  if (!value) taskDetails.value = false;
});
function toggleRoom(id: string) {
  roomIds.value = roomIds.value.includes(id)
    ? roomIds.value.filter((value) => value !== id)
    : [...roomIds.value, id];
}
function toggleVisible() {
  const ids = new Set(visible.value.map((t) => t.lab.id));
  roomIds.value = allVisibleSelected.value
    ? roomIds.value.filter((id) => !ids.has(id))
    : [...new Set([...roomIds.value, ...ids])];
}
function toggleField(id: JourneyExportFieldId) {
  fieldIds.value = fieldIds.value.includes(id)
    ? fieldIds.value.filter((value) => value !== id)
    : [...fieldIds.value, id];
}
function groupSelected(ids: JourneyExportFieldId[]) {
  return ids.every((id) => fieldIds.value.includes(id));
}
function toggleGroup(ids: JourneyExportFieldId[]) {
  fieldIds.value = groupSelected(ids)
    ? fieldIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...fieldIds.value, ...ids])];
}
async function download() {
  if (exporting.value || !selectedTargets.value.length || !fields.value.length)
    return;
  exporting.value = true;
  feedback.value = '';
  const targets = [...selectedTargets.value];
  const exportYear = year.value;
  const options = {
    fieldIds: [...fieldIds.value],
    examDetails: examDetails.value,
    taskDetails: taskDetails.value,
    includeNotes: includeNotes.value,
  };
  try {
    const { downloadJourneyWorkbook } = await import('../journey-export');
    downloadJourneyWorkbook(targets, exportYear, options);
    open.value = false;
    message.success(
      `已导出 ${targets.length} 个研究室、${options.fieldIds.length} 个所选属性。`,
    );
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '导出失败，请重试。';
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <!-- eslint-disable vue/html-closing-bracket-newline, vue/multiline-html-element-content-newline -->
  <Modal
    v-model:open="open"
    title="自定义导出 Excel"
    :width="1120"
    :footer="null"
    :mask-closable="!exporting"
    :closable="!exporting"
    :keyboard="!exporting"
    class="journey-export-dialog"
  >
    <p class="export-intro">
      选择要带走的研究室与属性。大学、研究室名称固定保留，用于识别每一行。
    </p>
    <fieldset class="export-content" :disabled="exporting">
      <div class="export-config-grid">
        <section class="export-rooms" aria-labelledby="export-rooms-title">
          <header class="export-section-heading">
            <h3 id="export-rooms-title">
              选择研究室
              <span>{{ selectedTargets.length }} / {{ targets.length }}</span>
            </h3>
            <Button
              type="text"
              size="small"
              :disabled="exporting || !roomIds.length"
              @click="roomIds = []"
              >清空</Button
            >
          </header>
          <Input
            v-model:value="query"
            allow-clear
            :disabled="exporting"
            placeholder="搜索研究室、大学或地域"
            aria-label="搜索导出研究室"
            ><template #prefix><ExplorerIcon name="search" /></template
          ></Input>
          <Select
            v-accessible-select
            :value="universityId || undefined"
            :disabled="exporting"
            :options="universityOptions"
            allow-clear
            placeholder="全部大学"
            aria-label="按大学筛选导出研究室"
            @change="universityId = typeof $event === 'string' ? $event : ''"
          />
          <div class="export-room-actions">
            <Checkbox
              :checked="allVisibleSelected"
              :indeterminate="visibleSelected > 0 && !allVisibleSelected"
              :disabled="exporting || !visible.length"
              @change="toggleVisible"
              >全选当前结果</Checkbox
            ><span>{{ visible.length }} 个结果</span>
          </div>
          <div class="export-room-list">
            <Checkbox
              v-for="target in visible"
              :key="target.lab.id"
              class="export-room"
              :class="{ 'is-selected': roomIds.includes(target.lab.id) }"
              :checked="roomIds.includes(target.lab.id)"
              :disabled="exporting"
              @change="toggleRoom(target.lab.id)"
              ><strong>{{ target.lab.name }}</strong
              ><small>{{ target.university.name }}</small
              ><small
                >{{ target.school.name }} / {{ target.major.name }}</small
              ></Checkbox
            >
            <p v-if="!visible.length" class="export-empty">
              没有符合条件的研究室
            </p>
          </div>
          <p class="export-hint">
            搜索仅筛选列表，已勾选项会保留。导出数量不限。
          </p>
        </section>
        <section
          class="export-properties"
          aria-labelledby="export-fields-title"
        >
          <header class="export-section-heading">
            <h3 id="export-fields-title">
              选择属性 <span>已选 {{ fields.length }} 项</span>
            </h3>
            <Button
              type="text"
              size="small"
              :disabled="exporting || !fieldIds.length"
              @click="fieldIds = []"
              >清空属性</Button
            >
          </header>
          <div class="export-presets">
            <span>快速选择</span
            ><Button
              v-for="preset in JOURNEY_EXPORT_PRESETS"
              :key="preset.label"
              size="small"
              :disabled="exporting"
              @click="fieldIds = [...preset.ids]"
              >{{ preset.label }}</Button
            >
          </div>
          <div class="export-field-groups">
            <section
              v-for="group in groups"
              :key="group.label"
              class="export-field-group"
            >
              <header>
                <h4>{{ group.label }}</h4>
                <Button
                  type="text"
                  size="small"
                  :disabled="exporting"
                  @click="toggleGroup(group.fields.map((f) => f.id))"
                  >{{
                    groupSelected(group.fields.map((f) => f.id))
                      ? '取消本组'
                      : '全选本组'
                  }}</Button
                >
              </header>
              <div class="export-field-grid">
                <Checkbox
                  v-for="field in group.fields"
                  :key="field.id"
                  :checked="fieldIds.includes(field.id)"
                  :disabled="exporting"
                  @change="toggleField(field.id)"
                  >{{ field.label }}</Checkbox
                >
              </div>
            </section>
          </div>
        </section>
      </div>
      <section class="export-options" aria-label="导出年份与附加工作表">
        <label for="export-exam-year">考试年份</label
        ><Select
          id="export-exam-year"
          v-accessible-select
          v-model:value="year"
          :disabled="exporting"
          :options="yearOptions"
          aria-label="导出考试年份"
        />
        <div class="export-extra-sheets">
          <Checkbox
            v-model:checked="examDetails"
            :disabled="exporting || !hasExamFields"
            >另附考试明细</Checkbox
          ><Checkbox
            v-model:checked="taskDetails"
            :disabled="exporting || !hasTaskFields"
            >另附材料、待办明细（分表）</Checkbox
          ><Checkbox v-model:checked="includeNotes" :disabled="exporting"
            >附导出说明</Checkbox
          >
        </div>
        <p class="export-hint">
          明细也仅包含所选属性，另保留年份 /
          批次或项目名称用于识别记录。考试明细按所选年份逐批次列出；材料明细需先勾选准备进度相关属性。语言要求可在专攻出愿信息或编辑研究室中维护。
        </p>
        <p v-if="fields.some((f) => f.money)" class="export-hint">
          费用缺项时合计留空；同时选中所需费用输入列可在 Excel
          中重算，否则仅导出所选合计的当前数值。
        </p>
      </section>
      <section class="export-preview" aria-labelledby="export-preview-title">
        <header class="export-section-heading">
          <h3 id="export-preview-title">
            表格预览
            <span>前 {{ preview.length }} 行 · {{ fields.length + 2 }} 列</span>
          </h3>
          <span>{{ sheetCount }} 张工作表</span>
        </header>
        <div
          v-if="preview.length && fields.length"
          class="export-preview-scroll"
        >
          <table>
            <caption class="sr-only">
              所选研究室和属性的导出预览
            </caption>
            <thead>
              <tr>
                <th scope="col">大学</th>
                <th scope="col">研究室名称</th>
                <th v-for="field in fields" :key="field.id" scope="col">
                  {{ field.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview" :key="row.id">
                <td>{{ row.university }}</td>
                <td>{{ row.lab }}</td>
                <td
                  v-for="(value, index) in row.values"
                  :key="fields[index]!.id"
                >
                  <span :title="String(value)">{{
                    value === '' ? '-' : value
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="export-empty">
          请选择至少一个研究室和一个属性，预览会在这里显示。
        </p>
      </section>
    </fieldset>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <footer class="export-footer">
      <span aria-live="polite"
        >{{ selectedTargets.length }} 个研究室 · {{ fields.length }} 个所选属性
        + 2 个识别列</span
      ><Button :disabled="exporting" @click="open = false">取消</Button
      ><Button
        type="primary"
        :disabled="!selectedTargets.length || !fields.length"
        :loading="exporting"
        @click="download"
        ><ExplorerIcon name="export" />导出所选内容</Button
      >
    </footer>
  </Modal>
</template>

<style scoped>
.export-intro {
  margin: 8px 0 20px;
  color: var(--jg-muted);
}

.export-content {
  min-width: 0;
  max-height: 66vh;
  padding: 0 8px 0 0;
  margin: 0;
  overflow: auto;
  border: 0;
}

.export-config-grid {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 24px;
}

.export-rooms,
.export-properties {
  min-width: 0;
}

.export-section-heading,
.export-field-group header,
.export-room-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.export-section-heading {
  margin-bottom: 12px;
}

.export-section-heading h3,
.export-field-group h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--jg-text);
}

.export-section-heading h3 span,
.export-section-heading > span {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--jg-muted);
}

.export-rooms > .ant-select {
  display: block;
  margin: 10px 0;
}

.export-room-actions {
  margin: 12px 0;
  font-size: 12px;
  color: var(--jg-muted);
}

.export-room-list {
  display: grid;
  gap: 8px;
  align-content: start;
  max-height: 440px;
  overflow-y: auto;
}

.export-room.ant-checkbox-wrapper {
  align-items: flex-start;
  padding: 12px;
  margin: 0;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.export-room.is-selected {
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent-line);
}

.export-room :deep(.ant-checkbox) {
  margin-top: 3px;
}

.export-room :deep(span:last-child) {
  min-width: 0;
}

.export-room strong,
.export-room small {
  display: block;
  overflow-wrap: anywhere;
}

.export-room strong {
  color: var(--jg-text);
}

.export-room small {
  margin-top: 3px;
  color: var(--jg-muted);
}

.export-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}

.export-presets > span {
  font-size: 12px;
  color: var(--jg-muted);
}

.export-field-groups {
  display: grid;
  gap: 16px;
}

.export-field-group {
  padding-top: 10px;
  border-top: 1px solid var(--jg-line);
}

.export-field-group header {
  margin-bottom: 8px;
}

.export-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}

.export-field-grid .ant-checkbox-wrapper {
  align-items: flex-start;
  margin: 0;
  font-size: 13px;
}

.export-field-grid :deep(.ant-checkbox) {
  margin-top: 3px;
}

.export-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--jg-muted);
}

.export-options {
  padding: 16px;
  margin: 24px 0;
  background: var(--jg-subtle);
  border-radius: 8px;
}

.export-options > label {
  margin-right: 12px;
  font-weight: 600;
}

.export-options > .ant-select {
  width: 235px;
  max-width: 100%;
}

.export-extra-sheets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 16px;
}

.export-extra-sheets .ant-checkbox-wrapper {
  margin: 0;
}

.export-preview-scroll {
  width: 100%;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.export-preview table {
  width: max-content;
  min-width: 100%;
  font-size: 12px;
  text-align: left;
  border-collapse: collapse;
}

.export-preview th,
.export-preview td {
  min-width: 140px;
  max-width: 220px;
  padding: 12px;
  vertical-align: top;
  color: var(--jg-text);
  border-bottom: 1px solid var(--jg-line);
}

.export-preview th {
  position: sticky;
  top: 0;
  font-weight: 600;
  background: var(--jg-subtle);
}

.export-preview td span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  overflow-wrap: anywhere;
  white-space: pre-line;
  -webkit-box-orient: vertical;
}

.export-preview tbody tr:last-child td {
  border-bottom: 0;
}

.export-empty {
  padding: 24px 12px;
  color: var(--jg-muted);
  text-align: center;
  background: var(--jg-subtle);
  border-radius: 8px;
}

.export-footer {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-top: 16px;
  margin-top: 20px;
  border-top: 1px solid var(--jg-line);
}

.export-footer > span {
  flex: 1;
  font-size: 12px;
  color: var(--jg-muted);
}

.export-footer .ant-btn-primary {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

@media (max-width: 720px) {
  .export-config-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }

  .export-room-list {
    max-height: 220px;
  }

  .export-footer {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .export-footer > span {
    flex-basis: 100%;
  }
}

@media (max-width: 440px) {
  .export-field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
