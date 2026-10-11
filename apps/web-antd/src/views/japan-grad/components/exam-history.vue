<script setup lang="ts">
import type { ExamHistoryRecord } from '../exam-history';

import { computed, ref } from 'vue';
import { App, Button, Input, Modal } from 'ant-design-vue';

import {
  blankExamRecord,
  examRecordKey,
  MAX_EXAM_BATCH_ROWS,
  normalizeExamRecord,
  parseExamPaste,
  prepareExamBatch,
} from '../exam-history';
import { useExplorerStore, websiteUrl } from '../explorer';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{ majorId: string }>();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const open = ref(false);
const feedback = ref('');
const form = ref(blankExamRecord());
const hasLegacyTime = ref(false);
const records = computed(() =>
  [
    ...(store.majors.find((item) => item.id === props.majorId)?.examHistory ??
      []),
  ].sort(
    (a, b) =>
      Number(b.year) - Number(a.year) ||
      a.session.localeCompare(b.session, 'zh-CN'),
  ),
);
const dateColumns = [
  { key: 'writtenDate', label: '笔试时间' },
  { key: 'interviewDate', label: '面试时间' },
  { key: 'resultDate', label: '结果发布时间' },
] as const;
const batchOpen = ref(false);
const batchRows = ref<ExamHistoryRecord[]>([]);
const batchFeedback = ref('');
const batchNotice = ref('');
const pasteText = ref('');
const rangeStart = ref('');
const rangeEnd = ref('');
const isBlank = (record: ExamHistoryRecord) =>
  Object.entries(record).every(([key, value]) => key === 'id' || !value.trim());
const batchCount = computed(
  () => batchRows.value.filter((row) => !isBlank(row)).length,
);
const newRow = (year = ''): ExamHistoryRecord => ({
  ...blankExamRecord(),
  id: crypto.randomUUID(),
  year,
});

function edit(record?: ExamHistoryRecord) {
  form.value = record ? normalizeExamRecord(record) : blankExamRecord();
  hasLegacyTime.value = !!record?.examDate;
  feedback.value = '';
  open.value = true;
}
async function save() {
  if (store.saving) return;
  const { id, ...fields } = form.value;
  const input = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, value.trim()]),
  ) as Omit<ExamHistoryRecord, 'id'>;
  if (
    !/^\d{4}$/.test(input.year) ||
    Number(input.year) < 1900 ||
    Number(input.year) > 2200
  ) {
    feedback.value = '请填写 1900-2200 之间的四位考试年份。';
    return;
  }
  if (input.sourceUrl && !websiteUrl(input.sourceUrl)) {
    feedback.value = '请填写有效的来源链接。';
    return;
  }
  if (input.sourceUrl) input.sourceUrl = websiteUrl(input.sourceUrl) ?? '';
  try {
    await store.saveExamRecord(props.majorId, input, id);
    open.value = false;
    message.success('考试记录已保存');
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '保存失败，请重试。';
  }
}
function remove(record: ExamHistoryRecord) {
  modal.confirm({
    title: `删除 ${record.year} 年${record.session ? ` · ${record.session}` : ''}的考试记录？`,
    content: '删除后该记录将不再出现在考试对比表中。',
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeExamRecord(props.majorId, record.id);
      message.success('考试记录已删除');
    },
  });
}
function openBatch() {
  batchRows.value = [newRow(), newRow(), newRow()];
  batchFeedback.value = '';
  batchNotice.value = '';
  pasteText.value = '';
  rangeStart.value = String(new Date().getFullYear() - 4);
  rangeEnd.value = String(new Date().getFullYear());
  batchOpen.value = true;
}
function addRow() {
  if (batchRows.value.length < MAX_EXAM_BATCH_ROWS)
    batchRows.value.push(newRow());
}
function generateYears() {
  batchFeedback.value = '';
  batchNotice.value = '';
  const start = Number(rangeStart.value);
  const end = Number(rangeEnd.value);
  if (
    !/^\d{4}$/.test(rangeStart.value) ||
    !/^\d{4}$/.test(rangeEnd.value) ||
    start < 1900 ||
    end > 2200 ||
    start > end
  ) {
    batchFeedback.value =
      '请填写 1900-2200 之间的起止年份，结束年份不能早于开始年份。';
    return;
  }
  if (end - start + 1 > MAX_EXAM_BATCH_ROWS) {
    batchFeedback.value = `一次最多生成 ${MAX_EXAM_BATCH_ROWS} 个年份。`;
    return;
  }
  const retained = batchRows.value.filter((row) => !isBlank(row));
  const keys = new Set([...records.value, ...retained].map(examRecordKey));
  const generated: ExamHistoryRecord[] = [];
  for (let year = end; year >= start; year--) {
    const row = newRow(String(year));
    if (!keys.has(examRecordKey(row))) generated.push(row);
  }
  if (retained.length + generated.length > MAX_EXAM_BATCH_ROWS) {
    batchFeedback.value = `每批最多录入 ${MAX_EXAM_BATCH_ROWS} 行，请先减少当前行数。`;
    return;
  }
  batchRows.value = [...retained, ...generated];
  batchNotice.value = `已追加 ${generated.length} 个年份，跳过 ${end - start + 1 - generated.length} 个已有年份。`;
}
function appendPaste() {
  batchFeedback.value = '';
  batchNotice.value = '';
  try {
    const incoming = parseExamPaste(pasteText.value).map((row) => ({
      ...row,
      id: crypto.randomUUID(),
    }));
    const retained = batchRows.value.filter((row) => !isBlank(row));
    if (retained.length + incoming.length > MAX_EXAM_BATCH_ROWS)
      throw new Error(`每批最多录入 ${MAX_EXAM_BATCH_ROWS} 行。`);
    batchRows.value = [...retained, ...incoming];
    pasteText.value = '';
    batchNotice.value = `已追加 ${incoming.length} 行，请检查后保存。`;
  } catch (error) {
    batchFeedback.value =
      error instanceof Error ? error.message : '无法读取粘贴内容。';
  }
}
async function saveBatch() {
  if (store.saving) return;
  batchFeedback.value = '';
  try {
    const prepared = prepareExamBatch(batchRows.value, records.value);
    const count = await store.saveExamRecords(props.majorId, prepared);
    batchOpen.value = false;
    message.success(`已保存 ${count} 条考试记录`);
  } catch (error) {
    batchFeedback.value =
      error instanceof Error ? error.message : '批量保存失败，请重试。';
  }
}
</script>

<template>
  <section class="exam-history" aria-label="历年考试信息">
    <header class="collection-heading exam-history-heading">
      <div>
        <h2>
          历年考试信息<span>{{ records.length }}</span>
        </h2>
        <p>按年份对比考试科目、笔试、面试与结果发布时间。</p>
      </div>
      <div class="exam-history-toolbar">
        <Button class="icon-button" @click="openBatch"
          ><ExplorerIcon name="plus" />批量录入</Button
        ><Button type="primary" class="icon-button" @click="edit()"
          ><ExplorerIcon name="plus" />新增考试记录</Button
        >
      </div>
    </header>
    <p class="exam-scroll-hint">左右滑动表格，查看全部考试时间。</p>
    <div
      class="exam-history-table-wrap"
      role="region"
      tabindex="0"
      aria-label="历年考试信息表格，可横向滚动"
    >
      <table class="exam-history-table" aria-label="历年考试对比">
        <colgroup>
          <col class="exam-year-column" />
          <col class="exam-subjects-column" />
          <col
            v-for="column in dateColumns"
            :key="column.key"
            class="exam-date-column"
          />
          <col class="exam-notes-column" />
          <col class="exam-actions-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">考试年份</th>
            <th scope="col">考试科目</th>
            <th v-for="column in dateColumns" :key="column.key" scope="col">
              {{ column.label }}
            </th>
            <th scope="col">备注</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="record in records"
            :key="record.id"
            class="exam-history-row"
          >
            <th scope="row" class="exam-history-year">
              <strong>{{ record.year }}</strong
              ><span v-if="record.session">{{ record.session }}</span>
            </th>
            <td>
              <p :class="{ 'not-filled': !record.subjects }">
                {{ record.subjects || '待填写' }}
              </p>
            </td>
            <td
              v-for="column in dateColumns"
              :key="column.key"
              :class="{ 'not-filled': !record[column.key] }"
            >
              {{ record[column.key] || '待填写' }}
            </td>
            <td class="exam-history-note-cell">
              <p :class="{ 'not-filled': !record.notes }">
                {{ record.notes || '无备注' }}
              </p>
              <a
                v-if="websiteUrl(record.sourceUrl)"
                class="exam-history-source"
                :href="websiteUrl(record.sourceUrl)"
                target="_blank"
                rel="noopener noreferrer"
                >查看官方来源<ExplorerIcon name="link"
              /></a>
              <details
                v-if="record.examDate"
                class="exam-history-context"
                :open="true"
              >
                <summary>原考试时间</summary>
                <p class="exam-history-legacy">{{ record.examDate }}</p>
              </details>
            </td>
            <td>
              <div class="exam-history-actions">
                <Button
                  type="text"
                  :aria-label="`编辑考试记录：${record.year}${record.session ? ` ${record.session}` : ''}`"
                  @click="edit(record)"
                  ><ExplorerIcon name="edit" /></Button
                ><Button
                  type="text"
                  danger
                  :aria-label="`删除考试记录：${record.year}${record.session ? ` ${record.session}` : ''}`"
                  @click="remove(record)"
                  ><ExplorerIcon name="trash"
                /></Button>
              </div>
            </td>
          </tr>
          <tr v-if="!records.length">
            <td colspan="7" class="exam-table-empty">
              <ExplorerIcon name="calendar" /><strong>还没有考试记录</strong>
              <p>新增一条记录，或批量填写多个年份开始对比。</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Modal
      v-model:open="open"
      :title="form.id ? '编辑考试记录' : '新增考试记录'"
      :footer="null"
      :width="720"
      :body-style="{ maxHeight: '75vh', overflowY: 'auto' }"
      :destroy-on-close="true"
      :mask-closable="!store.saving"
      :closable="!store.saving"
      :keyboard="!store.saving"
    >
      <form class="explorer-form" @submit.prevent="save">
        <p class="form-context">
          同一考试年份可分批次记录，时间可填写日期、时段或「待公布」。
        </p>
        <div class="form-fields">
          <div class="field">
            <label for="exam-history-year">考试年份 <span>*</span></label
            ><Input
              id="exam-history-year"
              v-model:value="form.year"
              inputmode="numeric"
              :maxlength="4"
              placeholder="如 2026"
              :disabled="store.saving"
            />
          </div>
          <div class="field">
            <label for="exam-history-session">入试批次 / 类别</label
            ><Input
              id="exam-history-session"
              v-model:value="form.session"
              :maxlength="120"
              placeholder="夏季入试、冬季入试……"
              :disabled="store.saving"
            />
          </div>
          <div class="field full">
            <label for="exam-history-subjects">考试科目</label
            ><Input.TextArea
              id="exam-history-subjects"
              v-model:value="form.subjects"
              :rows="2"
              :maxlength="2000"
              placeholder="如 数学、专业课、英语、口试"
              :disabled="store.saving"
            />
          </div>
          <div
            v-for="column in dateColumns"
            :key="column.key"
            class="field"
            :class="{ full: column.key === 'resultDate' }"
          >
            <label :for="`exam-history-${column.key}`">{{ column.label }}</label
            ><Input.TextArea
              :id="`exam-history-${column.key}`"
              v-model:value="form[column.key]"
              :rows="2"
              :maxlength="240"
              placeholder="如 2026-08-20 09:00，待定可留空"
              :disabled="store.saving"
            />
          </div>
          <div v-if="hasLegacyTime" class="field full exam-legacy-editor">
            <label for="exam-history-date">原考试时间</label
            ><Input.TextArea
              id="exam-history-date"
              v-model:value="form.examDate"
              :rows="2"
              :maxlength="240"
              :disabled="store.saving"
            /><small>可参考原内容填写上方时间栏，整理完成后可清空此项。</small>
          </div>
          <div class="field full">
            <label for="exam-history-source">来源链接</label
            ><Input
              id="exam-history-source"
              v-model:value="form.sourceUrl"
              :maxlength="2048"
              placeholder="募集要项或招生页面的官网链接，可选"
              :disabled="store.saving"
            />
          </div>
          <div class="field full">
            <label for="exam-history-notes">备注 / 当年特殊变更</label
            ><Input.TextArea
              id="exam-history-notes"
              v-model:value="form.notes"
              :rows="2"
              :maxlength="4000"
              placeholder="如当年出愿截止时间调整、追加材料或考试科目变化……"
              :disabled="store.saving"
            />
          </div>
        </div>
        <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
        <div class="form-footer">
          <span>仅考试年份必填，其余可稍后补充</span
          ><Button :disabled="store.saving" @click="open = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="store.saving"
            >保存考试记录</Button
          >
        </div>
      </form>
    </Modal>
    <Modal
      v-model:open="batchOpen"
      title="批量录入考试信息"
      :footer="null"
      :width="1180"
      :body-style="{ maxHeight: '78vh', overflowY: 'auto' }"
      :destroy-on-close="true"
      :mask-closable="!store.saving"
      :closable="!store.saving"
      :keyboard="!store.saving"
      class="exam-batch-modal"
    >
      <form class="explorer-form exam-batch-form" @submit.prevent="saveBatch">
        <p class="form-context">
          每行一条记录，可一次填写多个年份；仅考试年份必填。每批最多
          {{ MAX_EXAM_BATCH_ROWS }} 行。
        </p>
        <fieldset class="exam-batch-controls" :disabled="store.saving">
          <label for="exam-range-start">生成年份</label
          ><Input
            id="exam-range-start"
            v-model:value="rangeStart"
            inputmode="numeric"
            :maxlength="4"
            aria-label="开始年份"
          /><span>至</span
          ><Input
            id="exam-range-end"
            v-model:value="rangeEnd"
            inputmode="numeric"
            :maxlength="4"
            aria-label="结束年份"
          /><Button :disabled="store.saving" @click="generateYears"
            >生成年份</Button
          ><span class="exam-batch-controls-hint"
            >已有相同年份且未分批次的记录会跳过。</span
          >
        </fieldset>
        <details class="exam-batch-paste">
          <summary>粘贴多行数据（可从表格复制）</summary>
          <p>
            可带表头粘贴，备注列会自动识别。无表头时依次为：考试年份、考试科目、笔试时间、面试时间、结果发布时间、批次、备注。列之间使用制表符。
          </p>
          <Input.TextArea
            id="exam-batch-paste"
            v-model:value="pasteText"
            :rows="3"
            placeholder="2024&#9;数学、英语&#9;2024-08-20&#9;2024-08-21&#9;2024-09-01"
            :disabled="store.saving"
          /><Button :disabled="store.saving" @click="appendPaste"
            >追加到表格</Button
          >
        </details>
        <p v-if="batchNotice" class="exam-batch-notice" role="status">
          {{ batchNotice }}
        </p>
        <div
          class="exam-batch-table-wrap"
          role="region"
          tabindex="0"
          aria-label="批量录入表格，可横向滚动"
        >
          <table class="exam-batch-table">
            <thead>
              <tr>
                <th scope="col">考试年份 / 批次</th>
                <th scope="col">考试科目</th>
                <th v-for="column in dateColumns" :key="column.key" scope="col">
                  {{ column.label }}
                </th>
                <th scope="col">备注</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in batchRows"
                :key="row.id"
                class="exam-batch-row"
              >
                <td>
                  <span class="exam-batch-row-number"
                    >第 {{ index + 1 }} 行</span
                  ><Input
                    v-model:value="row.year"
                    inputmode="numeric"
                    :maxlength="4"
                    placeholder="年份 *"
                    :aria-label="`第${index + 1}行考试年份`"
                    :disabled="store.saving"
                  /><Input
                    v-model:value="row.session"
                    :maxlength="120"
                    placeholder="批次，可选"
                    :aria-label="`第${index + 1}行入试批次`"
                    :disabled="store.saving"
                  />
                </td>
                <td>
                  <Input.TextArea
                    v-model:value="row.subjects"
                    :rows="3"
                    :maxlength="2000"
                    placeholder="数学、专业课、英语……"
                    :aria-label="`第${index + 1}行考试科目`"
                    :disabled="store.saving"
                  />
                </td>
                <td v-for="column in dateColumns" :key="column.key">
                  <Input.TextArea
                    v-model:value="row[column.key]"
                    :rows="3"
                    :maxlength="240"
                    placeholder="日期或时间，待定可留空"
                    :aria-label="`第${index + 1}行${column.label}`"
                    :disabled="store.saving"
                  />
                </td>
                <td>
                  <Input.TextArea
                    v-model:value="row.notes"
                    :rows="3"
                    :maxlength="4000"
                    placeholder="当年出愿时间、材料等特殊变更"
                    :aria-label="`第${index + 1}行备注`"
                    :disabled="store.saving"
                  />
                </td>
                <td>
                  <Button
                    type="text"
                    danger
                    :aria-label="`移除第${index + 1}行`"
                    :disabled="store.saving"
                    @click="batchRows.splice(index, 1)"
                    ><ExplorerIcon name="close"
                  /></Button>
                </td>
              </tr>
              <tr v-if="!batchRows.length">
                <td colspan="7" class="exam-batch-empty">
                  点击「添加一行」继续录入。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Button
          class="icon-button exam-batch-add"
          :disabled="store.saving || batchRows.length >= MAX_EXAM_BATCH_ROWS"
          @click="addRow"
          ><ExplorerIcon name="plus" />添加一行</Button
        >
        <p v-if="batchFeedback" class="form-error" role="alert">
          {{ batchFeedback }}
        </p>
        <div class="form-footer">
          <span>已填写 {{ batchCount }} 行 · 空白行会自动忽略</span
          ><Button :disabled="store.saving" @click="batchOpen = false"
            >取消</Button
          ><Button
            type="primary"
            html-type="submit"
            :loading="store.saving"
            :disabled="!batchCount"
            >保存 {{ batchCount }} 条记录</Button
          >
        </div>
      </form>
    </Modal>
  </section>
</template>
