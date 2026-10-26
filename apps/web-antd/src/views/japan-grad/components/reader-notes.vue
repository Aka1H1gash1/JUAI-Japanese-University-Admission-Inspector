<script setup lang="ts">
import type {
  DocumentAnchor,
  NoteColor,
  ReaderAnnotation,
} from '../reader-types';

import { computed, nextTick, ref, watch } from 'vue';

import { App, Button, Input } from 'ant-design-vue';

import { jsonOptions, localApi } from '../local-api';
import { NOTE_COLORS } from '../reader-types';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{
  documentId: string;
  sha256: string;
  annotations: ReaderAnnotation[];
  activeId: string;
  legacyNotes?: string;
}>();
const emit = defineEmits<{
  saved: [note: ReaderAnnotation];
  removed: [id: string];
  locate: [note: ReaderAnnotation];
  refresh: [];
}>();
const { message, modal } = App.useApp();
interface Draft {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  anchor: DocumentAnchor | null;
  sha256: string;
  expectedRevision?: number;
}
const draft = ref<Draft | null>(null);
const composer = ref<HTMLFormElement | null>(null);
const filter = ref('all');
const order = ref('page');
const query = ref('');
const draftWarning = ref('');
const errorMessage = ref('');
const saving = ref(false);
const draftKey = computed(() => `juai-reader-draft-${props.documentId}`);
try {
  const stored = JSON.parse(localStorage.getItem(draftKey.value) || 'null');
  if (
    stored &&
    typeof stored.body === 'string' &&
    typeof stored.title === 'string' &&
    typeof stored.sha256 === 'string'
  )
    draft.value = stored;
} catch {
  /* A draft is a convenience; local database notes remain authoritative. */
}
watch(
  draft,
  (value) => {
    try {
      if (value) localStorage.setItem(draftKey.value, JSON.stringify(value));
      else localStorage.removeItem(draftKey.value);
      draftWarning.value = '';
    } catch {
      draftWarning.value = '浏览器暂存不可用，请及时点击保存。';
    }
  },
  { deep: true, flush: 'sync' },
);
const visible = computed(() =>
  props.annotations
    .filter(
      (note) =>
        (filter.value === 'all' || note.kind === filter.value) &&
        `${note.title} ${note.body} ${note.anchor?.quote || ''}`
          .toLocaleLowerCase()
          .includes(query.value.trim().toLocaleLowerCase()),
    )
    .toSorted((a, b) =>
      order.value === 'recent'
        ? b.updatedAt.localeCompare(a.updatedAt)
        : (a.anchor?.page ?? 0) - (b.anchor?.page ?? 0) ||
          a.createdAt.localeCompare(b.createdAt),
    ),
);
function start(anchor: DocumentAnchor | null = null, note?: ReaderAnnotation) {
  if (
    draft.value &&
    (draft.value.body.trim() ||
      draft.value.title.trim() ||
      draft.value.anchor) &&
    draft.value.id !== note?.id
  ) {
    message.info('当前草稿已暂存，请先保存或放弃，再新增笔记。');
    return false;
  }
  errorMessage.value = '';
  draft.value = note
    ? {
        id: note.id,
        title: note.title,
        body: note.body,
        color: note.color,
        anchor: note.anchor,
        sha256: note.sha256,
        expectedRevision: note.revision,
      }
    : {
        id: '',
        title: '',
        body: '',
        color: 'yellow',
        anchor,
        sha256: props.sha256,
      };
  void nextTick(() => {
    const scroll = composer.value?.closest('.reader-notes-scroll');
    if (scroll) scroll.scrollTop = 0;
    composer.value?.querySelector('textarea')?.focus({ preventScroll: true });
  });
  return true;
}
function startWithContent(
  body: string,
  title: string,
  anchor: DocumentAnchor | null = null,
) {
  if (body.length > 20_000) {
    message.info('回答超过笔记的 20,000 字限制，请先复制需要的部分。');
    return;
  }
  if (start(anchor) && draft.value) {
    draft.value.body = body;
    draft.value.title = title.slice(0, 200);
  }
}
function cancel() {
  if (!draft.value?.body.trim() && !draft.value?.title.trim()) {
    draft.value = null;
    return;
  }
  modal.confirm({
    title: '放弃这份未保存草稿？',
    content: '已经保存到工作区的笔记不会受影响。',
    okText: '放弃草稿',
    cancelText: '继续编辑',
    onOk: () => {
      draft.value = null;
      errorMessage.value = '';
    },
  });
}
async function save() {
  if (!draft.value || saving.value) return;
  const value = { ...draft.value };
  if (!value.body.trim() && !value.anchor) {
    errorMessage.value = '先写下你的想法。';
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    const payload = {
      ...value,
      id: value.id || crypto.randomUUID(),
      kind: value.body.trim() ? 'note' : 'highlight',
    };
    // Keep the request ID in the draft so a retry cannot create a duplicate note.
    if (!value.id) draft.value.id = payload.id;
    const editing = value.expectedRevision !== undefined;
    const note = await localApi<ReaderAnnotation>(
      `/documents/${props.documentId}/reader/annotations${editing ? `/${value.id}` : ''}`,
      jsonOptions(editing ? 'PATCH' : 'POST', payload),
    );
    emit('saved', note);
    draft.value = null;
    message.success('笔记已保存到本地工作区');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存失败，草稿已保留。';
  } finally {
    saving.value = false;
  }
}
function remove(note: ReaderAnnotation) {
  modal.confirm({
    title: '删除这条笔记？',
    content:
      note.title || note.body.slice(0, 80) || note.anchor?.quote.slice(0, 80),
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await localApi(
        `/documents/${props.documentId}/reader/annotations/${note.id}`,
        jsonOptions('DELETE', {
          expectedRevision: note.revision,
          sha256: note.sha256,
        }),
      );
      emit('removed', note.id);
      if (draft.value?.id === note.id) draft.value = null;
    },
  });
}
function recoverOldDraft() {
  if (!draft.value) return;
  draft.value = {
    ...draft.value,
    id: '',
    expectedRevision: undefined,
    sha256: props.sha256,
    anchor: null,
    body: [
      draft.value.anchor?.quote
        ? `原文摘录：\n${draft.value.anchor.quote}`
        : '',
      draft.value.body,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}
defineExpose({ start, startWithContent });
</script>

<template>
  <aside class="reader-notes" aria-label="阅读笔记">
    <header class="reader-notes-heading">
      <div>
        <h2>
          阅读笔记 <span>{{ annotations.length }}</span>
        </h2>
        <p>摘录与想法，留在原文旁边</p>
      </div>
      <Button
        size="small"
        class="icon-button"
        :disabled="saving"
        @click="start()"
      >
        <ExplorerIcon name="plus" />笔记
      </Button>
    </header>
    <div class="reader-notes-scroll">
      <form
        v-if="draft"
        ref="composer"
        class="reader-note-composer"
        @submit.prevent="save"
      >
        <div class="reader-composer-label">
          <strong>{{ draft.expectedRevision ? '编辑笔记' : '新笔记' }}</strong><span>草稿自动暂存本机</span>
        </div>
        <blockquote v-if="draft.anchor">
          <span>{{
              draft.anchor.type === 'pdf'
                ? `第 ${draft.anchor.page} 页`
                : `文字块 ${draft.anchor.page}`
            }}
            · 原文摘录</span>{{ draft.anchor.quote }}
        </blockquote>
        <Input
          v-model:value="draft.title"
          :maxlength="200"
          placeholder="标题（选填）"
          aria-label="笔记标题"
          :disabled="saving"
        />
        <Input.TextArea
          v-model:value="draft.body"
          :auto-size="{ minRows: 5, maxRows: 16 }"
          :maxlength="20000"
          placeholder="写下理解、问题或与你研究方向的联系…"
          aria-label="笔记内容"
          :disabled="saving"
          @keydown.ctrl.enter.prevent="save"
          @keydown.meta.enter.prevent="save"
        />
        <div class="reader-color-options" role="group" aria-label="高亮颜色">
          <button
            v-for="color in NOTE_COLORS"
            :key="color.value"
            type="button"
            :class="[
              `color-${color.value}`,
              { 'is-selected': draft.color === color.value },
            ]"
            :aria-label="color.label"
            :aria-pressed="draft.color === color.value"
            :disabled="saving"
            @click="draft.color = color.value"
          >
            <ExplorerIcon v-if="draft.color === color.value" name="check" />
          </button>
        </div>
        <p v-if="draft.sha256 !== sha256" class="reader-warning">
          这份草稿属于旧文件版本。<button
            type="button"
            class="text-button"
            @click="recoverOldDraft"
          >
            转存为当前资料的普通笔记
          </button>
        </p>
        <p v-if="errorMessage" class="form-error" role="alert">
          {{ errorMessage }}
          <button type="button" class="text-button" @click="emit('refresh')">
            重新读取已存笔记
          </button>
        </p>
        <p v-if="draftWarning" class="reader-warning">{{ draftWarning }}</p>
        <div class="reader-composer-actions">
          <Button size="small" :disabled="saving" @click="cancel">取消</Button><Button size="small" type="primary" :loading="saving" @click="save">
            保存笔记
          </Button>
        </div>
      </form>
      <div class="reader-note-tools">
        <Input
          v-model:value="query"
          allow-clear
          placeholder="搜索笔记或摘录"
          aria-label="搜索阅读笔记"
        >
          <template #prefix><ExplorerIcon name="search" /></template>
        </Input>
        <div>
          <select v-model="filter" aria-label="笔记类型">
            <option value="all">全部记录</option>
            <option value="note">笔记</option>
            <option value="highlight">高亮</option>
</select><select v-model="order" aria-label="笔记排序">
            <option value="page">按原文顺序</option>
            <option value="recent">最近编辑</option>
          </select>
        </div>
      </div>
      <div v-if="visible.length" class="reader-note-list">
        <article
          v-for="note in visible"
          :key="note.id"
          class="reader-note-card"
          :class="[
            `note-${note.color}`,
            {
              'is-active': activeId === note.id,
              'is-stale': note.sha256 !== sha256,
            },
          ]"
        >
          <header>
            <button
              class="reader-note-locator"
              :disabled="!note.anchor || note.sha256 !== sha256"
              @click="emit('locate', note)"
            >
              <ExplorerIcon name="book" />{{
                note.anchor
                  ? note.anchor.type === 'pdf'
                    ? `第 ${note.anchor.page} 页`
                    : `文字块 ${note.anchor.page}`
                  : '全文笔记'
              }}
</button><span>{{
              note.sha256 !== sha256
                ? '旧文件版本'
                : note.kind === 'highlight'
                  ? '高亮'
                  : '笔记'
            }}</span>
          </header>
          <h3 v-if="note.title">{{ note.title }}</h3>
          <button
            v-if="note.anchor"
            class="reader-note-quote"
            :disabled="note.sha256 !== sha256"
            :title="
              note.sha256 !== sha256
                ? '原文件已变化，保留原摘录'
                : '点击回到原文'
            "
            @click="emit('locate', note)"
          >
            {{ note.anchor.quote }}
          </button>
          <p v-if="note.body" class="reader-note-body">{{ note.body }}</p>
          <footer>
            <time :datetime="note.updatedAt">{{
              new Date(note.updatedAt).toLocaleDateString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
              })
            }}</time><button
              class="reader-quiet-button"
              :disabled="saving"
              @click="start(null, note)"
            >
              编辑
</button><button
              class="reader-quiet-button"
              :disabled="saving"
              @click="remove(note)"
            >
              删除
            </button>
          </footer>
        </article>
      </div>
      <div v-else class="reader-notes-empty">
        <ExplorerIcon :name="annotations.length ? 'search' : 'edit'" />
        <h3>
          {{ annotations.length ? '没有匹配的记录' : '从一段原文，开始记录' }}
        </h3>
        <p>
          {{
            annotations.length
              ? '换个关键词或筛选条件。'
              : '在原文中选中文字，即可高亮或写笔记。也可以直接记录整篇资料的想法。'
          }}
        </p>
        <Button v-if="!annotations.length && !draft" @click="start()">
          写第一条笔记
        </Button>
      </div>
      <section v-if="legacyNotes" class="reader-legacy-note">
        <h3>原资料备注</h3>
        <p>{{ legacyNotes }}</p>
      </section>
    </div>
    <footer class="reader-notes-footer">
      <span><ExplorerIcon name="drive" />本地保存</span><a
        :href="`/api/japangrad/documents/${documentId}/reader/export`"
        class="icon-button"
        ><ExplorerIcon name="export" />导出笔记</a>
    </footer>
  </aside>
</template>
