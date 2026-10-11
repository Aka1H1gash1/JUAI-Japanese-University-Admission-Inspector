<script setup lang="ts">
import { vAccessibleSelect } from '../select-accessibility';
import type { DocumentKind, StoredDocument } from '../documents';

import { computed, ref, watch } from 'vue';
import { useWindowSize } from '@vueuse/core';
import {
  App,
  Button,
  Drawer,
  Input,
  Modal,
  Select,
  Spin,
} from 'ant-design-vue';

import {
  fileFormat,
  fileSize,
  fileUrl,
  isWord,
  kindLabels,
  readerLabel,
  requiresDownload,
  supportedFileAccept,
} from '../documents';
import { jsonOptions, localApi } from '../local-api';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{
  ownerType: 'major' | 'professor';
  ownerId: string;
}>();
const { message, modal } = App.useApp();
const documents = ref<StoredDocument[]>([]);
const loading = ref(false);
const feedback = ref('');
const filterYear = ref<number | undefined>();
const query = ref('');
const uploadOpen = ref(false);
const uploading = ref(false);
const uploadError = ref('');
const kind = ref<DocumentKind>('guidelines');
const title = ref('');
const year = ref(new Date().getFullYear() + 1);
const questionId = ref('');
const selectedFile = ref<File | null>(null);
const fileInputKey = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);
const suggestedTitle = ref('');
const dragDepth = ref(0);
const dragging = computed(() => dragDepth.value > 0);
const detailOpen = ref(false);
const selectedId = ref('');
const { width: viewportWidth } = useWindowSize();
const selected = computed(() =>
  documents.value.find((item) => item.id === selectedId.value),
);
const editOpen = ref(false);
const editing = ref<StoredDocument | null>(null);
const editBusy = ref(false);
const editError = ref('');
let generation = 0;
const isPaper = computed(() => props.ownerType === 'professor');
const visible = computed(() =>
  documents.value
    .filter(
      (item) =>
        (!filterYear.value || item.year === filterYear.value) &&
        [item.title, item.filename, item.authors, item.venue, item.notes]
          .join(' ')
          .toLowerCase()
          .includes(query.value.trim().toLowerCase()),
    )
    .filter((item) => item.kind !== 'answer')
    .toSorted(
      (a, b) => b.year - a.year || b.createdAt.localeCompare(a.createdAt),
    ),
);
const years = computed(() =>
  [...new Set(documents.value.map((item) => item.year))]
    .toSorted((a, b) => b - a)
    .map((value) => ({ label: `${value} 年`, value })),
);
const answersFor = (id: string) =>
  documents.value.filter((item) => item.questionId === id);
const groups = computed(() =>
  isPaper.value
    ? [
        {
          kind: 'paper' as const,
          title: '论文',
          description: '把感兴趣的研究放进自己的阅读清单。',
        },
      ]
    : [
        {
          kind: 'guidelines' as const,
          title: '募集要项',
          description: '选择招生年度，查看保存的原始募集要项。',
        },
        {
          kind: 'question' as const,
          title: '过去问',
          description: '按考试年份选择试题，再查看对应答案。',
        },
      ],
);
const recordsFor = (kind: DocumentKind) =>
  visible.value.filter((item) => item.kind === kind);
function yearLabel(kind: DocumentKind) {
  if (kind === 'guidelines') return '招生年度';
  if (kind === 'paper') return '发表年份';
  return '考试年份';
}
function select(record: StoredDocument) {
  selectedId.value = record.id;
  detailOpen.value = true;
}

async function load() {
  const current = ++generation;
  const owner = { type: props.ownerType, id: props.ownerId };
  loading.value = true;
  feedback.value = '';
  documents.value = [];
  try {
    const rows = await localApi<StoredDocument[]>(
      `/documents?ownerType=${owner.type}&ownerId=${encodeURIComponent(owner.id)}`,
    );
    if (current === generation) documents.value = rows;
  } catch (error) {
    if (current === generation)
      feedback.value =
        error instanceof Error ? error.message : '文件列表读取失败。';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => [props.ownerType, props.ownerId],
  () => {
    query.value = '';
    filterYear.value = undefined;
    detailOpen.value = false;
    selectedId.value = '';
    editOpen.value = false;
    uploadOpen.value = false;
    void load();
  },
  { immediate: true },
);

function upload(which: DocumentKind, question?: StoredDocument) {
  kind.value = which;
  questionId.value = question?.id || '';
  year.value =
    question?.year ||
    new Date().getFullYear() + (which === 'guidelines' ? 1 : 0);
  title.value = '';
  selectedFile.value = null;
  suggestedTitle.value = '';
  dragDepth.value = 0;
  uploadError.value = '';
  fileInputKey.value++;
  uploadOpen.value = true;
}
function clearFile() {
  if (title.value === suggestedTitle.value) title.value = '';
  selectedFile.value = null;
  suggestedTitle.value = '';
  uploadError.value = '';
  if (fileInput.value) fileInput.value.value = '';
}
function acceptFiles(files: File[]) {
  if (uploading.value) return;
  uploadError.value = '';
  if (files.length !== 1) {
    clearFile();
    uploadError.value = '每次只能上传一个文件，请选择或拖入单个文件。';
    return;
  }
  const file = files[0]!;
  if (!/\.(?:pdf|docx?|md|txt)$/i.test(file.name)) {
    clearFile();
    uploadError.value = '请选择 PDF、DOC、DOCX、MD 或 TXT 文件。';
    return;
  }
  if (file.size === 0 || file.size > 50 * 1024 * 1024) {
    clearFile();
    uploadError.value = '请选择非空且不超过 50 MB 的文件。';
    return;
  }
  const nextTitle = file.name
    .replace(/\.(?:pdf|docx?|md|txt)$/i, '')
    .slice(0, 240);
  if (!title.value.trim() || title.value === suggestedTitle.value)
    title.value = nextTitle;
  suggestedTitle.value = nextTitle;
  selectedFile.value = file;
}
function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) acceptFiles(files);
}
function dragEnter(event: DragEvent) {
  if (!uploading.value && event.dataTransfer?.types.includes('Files'))
    dragDepth.value++;
}
function dragOver(event: DragEvent) {
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = uploading.value ? 'none' : 'copy';
}
function dropFile(event: DragEvent) {
  dragDepth.value = 0;
  if (!uploading.value && event.dataTransfer?.types.includes('Files'))
    acceptFiles(Array.from(event.dataTransfer.files));
}
watch(uploadOpen, () => {
  dragDepth.value = 0;
});
function replace(record: StoredDocument) {
  if (record.ownerId !== props.ownerId || record.ownerType !== props.ownerType)
    return;
  const index = documents.value.findIndex((item) => item.id === record.id);
  if (index !== -1) documents.value[index] = record;
}
async function saveUpload() {
  if (uploading.value) return;
  uploadError.value = '';
  const file = selectedFile.value;
  if (!file || !/\.(?:pdf|docx?|md|txt)$/i.test(file.name)) {
    uploadError.value = '请选择 PDF、DOC、DOCX、MD 或 TXT 文件。';
    return;
  }
  if (file.size === 0 || file.size > 50 * 1024 * 1024) {
    uploadError.value = '请选择非空且不超过 50 MB 的文件。';
    return;
  }
  if (
    !title.value.trim() ||
    !Number.isInteger(year.value) ||
    year.value < 1900 ||
    year.value > 2200
  ) {
    uploadError.value = '请填写标题并选择 1900-2200 之间的年份。';
    return;
  }
  uploading.value = true;
  const meta = {
    ownerType: props.ownerType,
    ownerId: props.ownerId,
    kind: kind.value,
    year: year.value,
    title: title.value,
    filename: file.name,
    questionId: questionId.value,
  };
  try {
    const record = await localApi<StoredDocument>('/documents', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-JapanGrad-Metadata': encodeURIComponent(JSON.stringify(meta)),
      },
      body: file,
    });
    if (
      record.ownerId === props.ownerId &&
      record.ownerType === props.ownerType
    )
      documents.value.push(record);
    uploadOpen.value = false;
    message.success('文件已保存到本地工作区。');
  } catch (error) {
    uploadError.value =
      error instanceof Error ? error.message : '文件保存失败，请重试。';
  } finally {
    uploading.value = false;
  }
}
function edit(record: StoredDocument) {
  editing.value = JSON.parse(JSON.stringify(record)) as StoredDocument;
  editError.value = '';
  editOpen.value = true;
}
async function saveEdit() {
  if (!editing.value || editBusy.value) return;
  editBusy.value = true;
  editError.value = '';
  const item = editing.value;
  try {
    const updated = await localApi<StoredDocument>(
      `/documents/${item.id}`,
      jsonOptions('PATCH', {
        title: item.title,
        authors: item.authors,
        venue: item.venue,
        notes: item.notes,
      }),
    );
    replace(updated);
    editOpen.value = false;
    message.success('资料已保存。');
  } catch (error) {
    editError.value = error instanceof Error ? error.message : '资料保存失败。';
  } finally {
    editBusy.value = false;
  }
}
function remove(record: StoredDocument) {
  modal.confirm({
    zIndex: 1300,
    title: `移除「${record.title}」？`,
    content:
      record.kind === 'question'
        ? '过去问及其对应答案将一起移入工作区 .trash 文件夹。'
        : '文件将移入工作区 .trash 文件夹，可从本地恢复原文件。',
    okText: '确认移除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      try {
        const result = await localApi<{ removed: string[] }>(
          `/documents/${record.id}`,
          { method: 'DELETE' },
        );
        documents.value = documents.value.filter(
          (item) => !result.removed.includes(item.id),
        );
        if (result.removed.includes(selectedId.value)) detailOpen.value = false;
        message.success('已移入本地回收目录。');
      } catch (error) {
        feedback.value =
          error instanceof Error ? error.message : '文件移除失败。';
        throw error;
      }
    },
  });
}
</script>

<template>
  <section
    class="document-archive"
    :aria-label="isPaper ? '老师论文库' : '专攻考试资料库'"
  >
    <header class="archive-heading">
      <div>
        <h2>
          {{ isPaper ? '论文库' : '募集要项与过去问'
          }}<span>{{
            documents.filter((item) => item.kind !== 'answer').length
          }}</span>
        </h2>
        <p>
          {{
            isPaper
              ? '选择一篇论文，查看原文和阅读笔记。'
              : '选择一份资料，查看原文或整理个人笔记。'
          }}
        </p>
      </div>
    </header>
    <p v-if="feedback" role="alert" class="form-error">
      {{ feedback }}
      <button class="text-button" @click="load()">重新加载</button>
    </p>
    <div v-if="documents.length" class="archive-toolbar">
      <Input
        v-model:value="query"
        :aria-label="isPaper ? '搜索论文' : '搜索考试资料'"
        placeholder="搜索标题、作者或笔记"
        allow-clear
      />
      <Select
        v-accessible-select
        v-model:value="filterYear"
        :options="years"
        allow-clear
        placeholder="全部年份"
        aria-label="资料年份筛选"
      />
    </div>
    <Spin :spinning="loading">
      <section
        v-for="group in groups"
        :key="group.kind"
        class="archive-collection"
        :aria-label="`${group.title}清单`"
      >
        <header class="collection-heading archive-collection-heading">
          <div>
            <h3>
              {{ group.title
              }}<span>{{
                documents.filter((item) => item.kind === group.kind).length
              }}</span>
            </h3>
            <p>{{ group.description }}</p>
          </div>
          <Button
            type="primary"
            class="icon-button"
            :disabled="loading"
            @click="upload(group.kind)"
            ><ExplorerIcon name="plus" />新增{{ group.title }}</Button
          >
        </header>
        <div
          v-if="recordsFor(group.kind).length"
          class="archive-selection-grid"
        >
          <button
            v-for="item in recordsFor(group.kind)"
            :key="item.id"
            class="archive-selection-card"
            :data-kind="item.kind"
            :aria-label="`查看${kindLabels[item.kind]}：${item.title}`"
            @click="select(item)"
          >
            <div class="archive-selection-top">
              <span class="entity-symbol"><ExplorerIcon name="book" /></span
              ><span class="archive-selection-year"
                >{{ item.year }}<small>{{ yearLabel(item.kind) }}</small></span
              >
            </div>
            <h3>{{ item.title }}</h3>
            <p class="archive-selection-file">
              {{ item.filename }} · {{ fileSize(item.size) }}
            </p>
            <p class="archive-selection-notes">
              {{
                item.notes ||
                (item.kind === 'paper'
                  ? [item.authors, item.venue].filter(Boolean).join(' / ') ||
                    '记录作者、发表信息和阅读笔记。'
                  : '保存原始文件，随时打开查看。')
              }}
            </p>
            <div class="archive-selection-footer">
              <span>{{
                item.kind === 'question'
                  ? `${answersFor(item.id).length} 份对应答案`
                  : `${fileFormat(item.filename)} · 本地保存`
              }}</span
              ><span>查看资料<ExplorerIcon name="arrow" /></span>
            </div>
          </button>
        </div>
        <div v-else-if="!loading" class="archive-empty">
          <ExplorerIcon name="book" />
          <h3>
            {{
              filterYear || query ? '没有找到相关资料' : `还没有${group.title}`
            }}
          </h3>
          <p>
            {{
              filterYear || query
                ? '试试其他关键词或年份。'
                : '点击新增，拖入文件或选择文件，再填写年份保存。'
            }}
          </p>
        </div>
      </section>
    </Spin>
    <Drawer
      v-model:open="detailOpen"
      :z-index="1100"
      :title="selected ? kindLabels[selected.kind] : '资料详情'"
      :width="Math.min(720, viewportWidth)"
      :destroy-on-close="true"
      class="archive-detail-drawer"
    >
      <div v-if="selected" class="archive-document-details">
        <div class="archive-detail-heading">
          <span class="entity-symbol"><ExplorerIcon name="book" /></span
          ><span class="archive-kind">{{ kindLabels[selected.kind] }}</span>
          <h2>{{ selected.title }}</h2>
          <p>{{ yearLabel(selected.kind) }} · {{ selected.year }}</p>
        </div>
        <div class="archive-native-reader">
          <p>
            {{
              isWord(selected)
                ? '下载后用本机 Word / WPS 打开'
                : selected.charset === 'unknown'
                  ? '文本编码未识别，请下载后用本机编辑器打开'
                  : '阅读原始文件'
            }}
          </p>
          <a
            class="archive-reader-link"
            :href="fileUrl(selected.id)"
            :target="requiresDownload(selected) ? undefined : '_blank'"
            rel="noopener noreferrer"
            >{{ readerLabel(selected) }} <ExplorerIcon name="link"
          /></a>
        </div>
        <dl class="archive-detail-fields">
          <div>
            <dt>文件名</dt>
            <dd>{{ selected.filename }}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{{ fileSize(selected.size) }}</dd>
          </div>
          <template v-if="selected.kind === 'paper'"
            ><div>
              <dt>作者</dt>
              <dd>{{ selected.authors || '尚未填写' }}</dd>
            </div>
            <div>
              <dt>期刊 / 会议</dt>
              <dd>{{ selected.venue || '尚未填写' }}</dd>
            </div></template
          >
          <div>
            <dt>{{ selected.kind === 'paper' ? '阅读笔记' : '个人备注' }}</dt>
            <dd class="archive-detail-notes">
              {{ selected.notes || '尚未填写' }}
            </dd>
          </div>
        </dl>
        <section
          v-if="selected.kind === 'question'"
          class="archive-answer-details"
          aria-label="对应答案"
        >
          <header class="archive-answer-heading">
            <div>
              <h3>
                对应答案<span>{{ answersFor(selected.id).length }}</span>
              </h3>
              <p>与这份 {{ selected.year }} 年试题关联的答案。</p>
            </div>
            <Button @click="upload('answer', selected)">上传答案</Button>
          </header>
          <div v-if="answersFor(selected.id).length" class="answer-list">
            <article
              v-for="answer in answersFor(selected.id)"
              :key="answer.id"
              class="answer-detail-card"
            >
              <h4>{{ answer.title }}</h4>
              <p>{{ answer.filename }} · {{ fileSize(answer.size) }}</p>
              <p v-if="answer.notes" class="archive-notes">
                {{ answer.notes }}
              </p>
              <div class="answer-actions">
                <a
                  class="archive-link"
                  :href="fileUrl(answer.id)"
                  :target="requiresDownload(answer) ? undefined : '_blank'"
                  rel="noopener noreferrer"
                  >{{
                    requiresDownload(answer)
                      ? '下载答案原文件'
                      : '用浏览器阅读答案 ↗'
                  }}</a
                ><Button size="small" @click="edit(answer)">编辑</Button
                ><a
                  class="archive-link"
                  :href="`${fileUrl(answer.id)}?download=1`"
                  >下载</a
                ><Button
                  size="small"
                  type="text"
                  danger
                  :aria-label="`移除文件：${answer.title}`"
                  @click="remove(answer)"
                  >移除</Button
                >
              </div>
            </article>
          </div>
          <p v-else class="archive-answer-empty">尚未上传对应答案。</p>
        </section>
        <div class="archive-card-actions">
          <Button @click="edit(selected)">编辑资料</Button
          ><a class="archive-link" :href="`${fileUrl(selected.id)}?download=1`"
            >下载原文件</a
          ><Button
            type="text"
            danger
            :aria-label="`移除文件：${selected.title}`"
            @click="remove(selected)"
            >移除</Button
          >
        </div>
      </div>
    </Drawer>
    <Modal
      v-model:open="uploadOpen"
      :z-index="1200"
      :title="kind === 'answer' ? '上传对应答案' : `新增${kindLabels[kind]}`"
      :width="620"
      :footer="null"
      :mask-closable="!uploading"
      :closable="!uploading"
      :keyboard="!uploading"
      :body-style="{ maxHeight: '75vh', overflowY: 'auto' }"
    >
      <form
        class="explorer-form archive-upload-form"
        @submit.prevent="saveUpload"
      >
        <p class="form-context">选择一个文件，补充年份和标题后保存。</p>
        <div class="form-fields archive-upload-fields">
          <div class="field full">
            <label for="archive-file">资料文件 <span>*</span></label>
            <div
              class="archive-drop-area"
              @dragenter.prevent="dragEnter"
              @dragover.prevent="dragOver"
              @dragleave.prevent="dragDepth = Math.max(0, dragDepth - 1)"
              @drop.prevent.stop="dropFile"
            >
              <button
                type="button"
                class="archive-dropzone"
                :class="{ 'is-dragging': dragging, 'has-file': selectedFile }"
                :disabled="uploading"
                aria-label="拖拽或选择资料文件"
                @click="fileInput?.click()"
              >
                <span class="archive-dropzone-icon"
                  ><ExplorerIcon name="upload"
                /></span>
                <strong
                  >{{ dragging ? '松开即可选择文件' : '拖拽文件到这里，或'
                  }}<span v-if="!dragging">点击选择</span></strong
                >
                <span class="archive-dropzone-hint"
                  >每次 1 个文件 · PDF / DOC / DOCX / MD / TXT</span
                >
                <small>单个文件最大 50 MB</small>
              </button>
              <input
                id="archive-file"
                ref="fileInput"
                :key="fileInputKey"
                type="file"
                class="archive-file-input"
                :accept="supportedFileAccept"
                :disabled="uploading"
                tabindex="-1"
                @change="selectFile"
              />
            </div>
            <div v-if="selectedFile" class="archive-selected-file">
              <span class="archive-selected-format">{{
                fileFormat(selectedFile.name)
              }}</span>
              <div>
                <strong>{{ selectedFile.name }}</strong
                ><span
                  >{{ fileSize(selectedFile.size) }} · 1 个文件{{
                    uploading ? ' · 正在保存…' : ' · 待保存'
                  }}</span
                >
              </div>
              <Button
                type="text"
                size="small"
                :disabled="uploading"
                @click="fileInput?.click()"
                >更换</Button
              >
              <Button
                type="text"
                size="small"
                :disabled="uploading"
                aria-label="移除已选文件"
                @click="clearFile"
                ><ExplorerIcon name="close"
              /></Button>
            </div>
          </div>
          <div class="field">
            <label for="archive-year"
              >{{
                kind === 'guidelines'
                  ? '招生年度'
                  : kind === 'paper'
                    ? '发表年份'
                    : '考试年份'
              }}
              *</label
            ><input
              id="archive-year"
              v-model.number="year"
              type="number"
              min="1900"
              max="2200"
              required
              :disabled="kind === 'answer' || uploading"
            />
          </div>
          <div class="field">
            <label for="archive-title">资料标题 *</label
            ><Input
              id="archive-title"
              v-model:value="title"
              :maxlength="240"
              :disabled="uploading"
            />
          </div>
        </div>
        <p v-if="kind === 'answer'" class="archive-form-note">
          答案会关联到所选过去问，年份与试题保持一致。
        </p>
        <p v-if="uploadError" role="alert" class="form-error">
          {{ uploadError }}
        </p>
        <div class="form-footer">
          <span>{{
            selectedFile ? '1 个文件待保存' : '每次上传一个文件'
          }}</span>
          <Button :disabled="uploading" @click="uploadOpen = false">取消</Button
          ><Button
            type="primary"
            html-type="submit"
            :loading="uploading"
            :disabled="!selectedFile"
            >保存到本地</Button
          >
        </div>
      </form>
    </Modal>
    <Modal
      v-model:open="editOpen"
      :z-index="1200"
      title="编辑资料"
      :width="760"
      :footer="null"
      :mask-closable="!editBusy"
      :closable="!editBusy"
      :keyboard="!editBusy"
    >
      <form
        v-if="editing"
        class="explorer-form archive-edit-form"
        @submit.prevent="saveEdit"
      >
        <div class="form-fields">
          <div class="field full">
            <label for="archive-edit-title">标题 *</label
            ><Input
              id="archive-edit-title"
              v-model:value="editing.title"
              :maxlength="240"
            />
          </div>
          <template v-if="editing.kind === 'paper'"
            ><div class="field">
              <label for="paper-authors">作者</label
              ><Input
                id="paper-authors"
                v-model:value="editing.authors"
                :maxlength="500"
              />
            </div>
            <div class="field">
              <label for="paper-venue">期刊 / 会议</label
              ><Input
                id="paper-venue"
                v-model:value="editing.venue"
                :maxlength="500"
              /></div
          ></template>
          <div class="field full">
            <label for="archive-notes">{{
              editing.kind === 'paper' ? '阅读笔记' : '资料备注'
            }}</label
            ><Input.TextArea
              id="archive-notes"
              v-model:value="editing.notes"
              :rows="4"
              :maxlength="8000"
            />
          </div>
        </div>
        <p v-if="editError" role="alert" class="form-error">{{ editError }}</p>
        <div class="form-footer">
          <Button :disabled="editBusy" @click="editOpen = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="editBusy"
            >保存资料</Button
          >
        </div>
      </form>
    </Modal>
  </section>
</template>
