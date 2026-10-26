<script setup lang="ts">
import type { PDFDocumentProxy } from './pdf-engine';
import type {
  AssistantNoteDraft,
  DocumentAnchor,
  ReaderAnnotation,
  ReaderContext,
  ReaderSelection,
  ReaderSource,
  TextDocument,
} from './reader-types';

import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import {
  useEventListener,
  useResizeObserver,
  useStorage,
  useWindowSize,
} from '@vueuse/core';
import { App, Button, Input, Spin } from 'ant-design-vue';

import AssistantChat from './components/assistant-chat.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ReaderNotes from './components/reader-notes.vue';
import ReaderPdfPage from './components/reader-pdf-page.vue';
import ReaderTextPage from './components/reader-text-page.vue';
import ReaderThumbnail from './components/reader-thumbnail.vue';
import {
  documentReaderPath,
  fileFormat,
  fileSize,
  fileUrl,
  kindLabels,
} from './documents';
import { jsonOptions, localApi } from './local-api';
import {
  loadPdfEngine,
  matchingRects,
  normalizeSearch,
  pdfAssetOptions,
} from './pdf-engine';
import { requireValue } from './required-value';

import './reader.css';

const route = useRoute();
const { message } = App.useApp();
const docId = computed(() => String(route.params.documentId));
const data = ref<ReaderContext>();
const pdf = shallowRef<PDFDocumentProxy>();
const text = ref<TextDocument>();
const errorMessage = ref('');
const formatWarning = ref('');
const loading = ref(true);
const progress = ref(0);
const notes = ref<InstanceType<typeof ReaderNotes> | null>(null);
const pdfScroll = ref<HTMLElement | null>(null);
const available = ref({ width: 800, height: 700 });
const { width: windowWidth } = useWindowSize();
const leftOpen = useStorage('juai-reader-navigation', true);
const notesOpen = useStorage('juai-reader-notes-open', true);
const focus = ref(false);
const leftTab = ref<'outline' | 'pages' | 'search'>('outline');
const rightTab = ref('notes');
const noteWidth = useStorage('juai-reader-notes-width', 350);
const constrainedNoteWidth = computed(() =>
  Math.min(
    520,
    Math.max(280, Number.isFinite(noteWidth.value) ? noteWidth.value : 350),
  ),
);
const currentPage = ref(1);
const pageInput = ref('1');
const offset = ref(0);
const zoom = ref('width');
const rotation = ref(0);
const baseSize = ref({ width: 595, height: 842 });
const totalPages = computed(
  () => pdf.value?.numPages || text.value?.pages.length || 1,
);
const selection = ref<ReaderSelection>();
const readerAssistant = ref<InstanceType<typeof AssistantChat> | null>(null);
const assistantContext = computed(() =>
  data.value
    ? {
        documentId: data.value.document.id,
        sha256: data.value.sha256,
        title: data.value.document.title,
        page: currentPage.value,
      }
    : undefined,
);
const aiOpen = computed({
  get: () => notesOpen.value && !focus.value && rightTab.value === 'ai',
  set: (value) => {
    if (!value && rightTab.value === 'ai') rightTab.value = 'notes';
  },
});
const sourceQuote = ref<{ page: number; quote: string }>();
const sourceStatus = ref('');
const highlightSaving = ref(false);
const activeId = ref('');
const stateError = ref('');
const stateSaving = ref(false);
const outline = ref<{ title: string; depth: number; dest: unknown }[]>([]);
const search = ref('');
const searchBusy = ref(false);
const searchScanned = ref(0);
const searchDone = ref(false);
interface SearchHit {
  page: number;
  occurrence: number;
  excerpt: string;
}
const hitIndex = ref(-1);
const hits = ref<SearchHit[]>([]);
const pageText = new Map<number, string>();
const unreadablePages = ref(new Set<number>());
const annotationsByPage = computed(() => {
  const map = new Map<number, ReaderAnnotation[]>();
  for (const note of data.value?.annotations ?? []) {
    if (note.sha256 !== data.value?.sha256 || note.anchor?.type !== 'pdf')
      continue;
    const group = map.get(note.anchor.page) ?? [];
    group.push(note);
    map.set(note.anchor.page, group);
  }
  return map;
});
const staleCount = computed(
  () =>
    data.value?.annotations.filter((n) => n.sha256 !== data.value?.sha256)
      .length || 0,
);
const textAnnotationsByPage = computed(() => {
  const map = new Map<number, ReaderAnnotation[]>();
  for (const note of data.value?.annotations ?? []) {
    if (note.sha256 !== data.value?.sha256 || note.anchor?.type !== 'text')
      continue;
    const group = map.get(note.anchor.page) ?? [];
    group.push(note);
    map.set(note.anchor.page, group);
  }
  return map;
});
const selectionStyle = computed(() =>
  selection.value
    ? {
        left: `${Math.max(12, Math.min(selection.value.x - 175, window.innerWidth - 370))}px`,
        top: `${Math.max(12, Math.min(selection.value.y, window.innerHeight - 80))}px`,
      }
    : {},
);
let generation = 0;
let searchGeneration = 0;
let positionTimer: ReturnType<typeof setTimeout> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let loadTask:
  | ReturnType<Awaited<ReturnType<typeof loadPdfEngine>>['getDocument']>
  | undefined;
let restoring = true;
let dragWidth = 0;
let dragX = 0;
let pendingCitation = false;
let pendingHit = false;
let pendingNote = '';
let resizing = false;
const endpoints = (id = docId.value) =>
  `/documents/${encodeURIComponent(id)}/reader`;

useResizeObserver(pdfScroll, () => {
  if (pdfScroll.value)
    available.value = {
      width: pdfScroll.value.clientWidth,
      height: pdfScroll.value.clientHeight,
    };
});
function flattenOutline(
  items: { title: string; dest: unknown; items?: unknown[] }[],
  depth = 0,
) {
  for (const item of items) {
    if (outline.value.length >= 500) return;
    outline.value.push({ title: item.title, dest: item.dest, depth });
    if (item.items?.length)
      flattenOutline(item.items as typeof items, depth + 1);
  }
}
async function load() {
  flushPosition();
  const token = ++generation;
  if (windowWidth.value <= 900) {
    leftOpen.value = false;
    notesOpen.value = false;
  }
  searchGeneration++;
  restoring = true;
  loading.value = true;
  errorMessage.value = '';
  formatWarning.value = '';
  progress.value = 0;
  const previousPdf = pdf.value;
  pdf.value = undefined;
  if (previousPdf) void previousPdf.loadingTask.destroy();
  if (loadTask) {
    void loadTask.destroy();
    loadTask = undefined;
  }
  data.value = undefined;
  text.value = undefined;
  outline.value = [];
  pageText.clear();
  unreadablePages.value.clear();
  selection.value = undefined;
  activeId.value = '';
  sourceQuote.value = undefined;
  pendingCitation = false;
  pendingNote = '';
  pendingHit = false;
  search.value = '';
  hits.value = [];
  hitIndex.value = -1;
  searchDone.value = false;
  stateError.value = '';
  try {
    const result = await localApi<ReaderContext>(endpoints());
    if (token !== generation) return;
    data.value = result;
    const state =
      result.state?.sha256 === result.sha256 ? result.state : undefined;
    const sourceChanged =
      typeof route.query.sha256 === 'string' &&
      route.query.sha256 !== result.sha256;
    if (sourceChanged)
      formatWarning.value =
        '这条引用来自另一文件版本，已打开当前原文，请重新核对出处。';
    const requestedPage = sourceChanged ? 0 : Number(route.query.page);
    currentPage.value =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : state?.page || 1;
    offset.value = requestedPage > 0 ? 0 : state?.offset || 0;
    zoom.value = state?.zoom || 'width';
    rotation.value = state?.rotation || 0;
    const format = fileFormat(result.document.filename);
    if (format === 'PDF') {
      const engine = await loadPdfEngine();
      if (token !== generation) return;
      loadTask = engine.getDocument({
        url: fileUrl(result.document.id),
        ...pdfAssetOptions,
      });
      loadTask.onProgress = ({
        loaded,
        total,
      }: {
        loaded: number;
        total: number;
      }) => {
        if (token === generation && total)
          progress.value = Math.min(99, Math.round((loaded * 100) / total));
      };
      loadTask.onPassword = (_update: unknown, reason: number) => {
        if (token !== generation) return;
        errorMessage.value =
          reason === 1
            ? '这份 PDF 需要密码，请先解密后重新上传。原文件仍可下载。'
            : 'PDF 密码不正确，请先解密后重新上传。';
        void loadTask?.destroy();
      };
      const document = await loadTask.promise;
      if (token !== generation) {
        void document.loadingTask.destroy();
        return;
      }
      if (document.numPages > 2000) {
        void document.loadingTask.destroy();
        throw new Error('资料超过 2,000 页，请拆分后阅读，或下载原文件。');
      }
      const first = await document.getPage(1);
      const viewport = first.getViewport({ scale: 1 });
      if (token !== generation) {
        void document.loadingTask.destroy();
        return;
      }
      baseSize.value = { width: viewport.width, height: viewport.height };
      pdf.value = markRaw(document);
      const tree = await document.getOutline().catch(() => null);
      if (token !== generation) return;
      if (tree) flattenOutline(tree);
      if (outline.value.length === 0) leftTab.value = 'pages';
    } else if (
      ['DOCX', 'MD', 'TXT'].includes(format) &&
      result.document.charset !== 'unknown'
    ) {
      const parsed = await localApi<TextDocument>(`${endpoints()}/text`);
      if (token !== generation) return;
      if (parsed.sha256 !== result.sha256)
        throw new Error('原文件已变化，请重新打开资料。');
      text.value = parsed;
      for (const page of parsed.pages) pageText.set(page.page, page.text);
      if (format === 'DOCX')
        formatWarning.value =
          '当前显示 Word 提取文字，分块页码不代表 Word 排版页码；原始排版请下载查看。';
      leftTab.value = 'pages';
    } else
      formatWarning.value =
        '当前格式暂不支持工作台内预览。可以下载原文件，并在右侧记录笔记。';
    if (token !== generation) return;
    currentPage.value = Math.min(currentPage.value, totalPages.value);
    pageInput.value = String(currentPage.value);
    loading.value = false;
    await nextTick();
    if (pdfScroll.value)
      available.value = {
        width: pdfScroll.value.clientWidth,
        height: pdfScroll.value.clientHeight,
      };
    await nextTick();
    goToPage(currentPage.value, offset.value);
    restoring = false;
    if (
      typeof route.query.quote === 'string' &&
      route.query.quote.length <= 16_000 &&
      (!route.query.sha256 || route.query.sha256 === result.sha256)
    ) {
      search.value = route.query.quote;
      leftOpen.value = true;
      leftTab.value = 'search';
    }
  } catch (error) {
    if (token === generation) {
      if (!errorMessage.value)
        errorMessage.value =
          error instanceof Error ? error.message : '资料打开失败。';
      loading.value = false;
      restoring = false;
    }
  }
}
function goToPage(number: number, fraction = 0) {
  const root = pdfScroll.value;
  if (!root) return;
  const numberSafe = Math.max(
    1,
    Math.min(totalPages.value, Math.round(number)),
  );
  const element = root.querySelector<HTMLElement>(
    `[data-page="${numberSafe}"]`,
  );
  if (!element) return;
  root.scrollTo({
    top: Math.max(
      0,
      root.scrollTop +
        element.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        element.clientHeight * fraction -
        20,
    ),
    behavior: 'instant',
  });
  currentPage.value = numberSafe;
  pageInput.value = String(numberSafe);
  selection.value = undefined;
}
function submitPage() {
  const value = Number(pageInput.value);
  if (Number.isFinite(value)) goToPage(value);
  else pageInput.value = String(currentPage.value);
}
function onScroll() {
  selection.value = undefined;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const root = pdfScroll.value;
    if (!root || restoring) return;
    const pages = root.querySelectorAll<HTMLElement>('[data-page]');
    if (pages.length === 0) return;
    const top = root.getBoundingClientRect().top + 20;
    let high = pages.length - 1;
    let low = 0;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (requireValue(pages[mid]).getBoundingClientRect().top <= top)
        low = mid;
      else high = mid - 1;
    }
    const element = requireValue(pages[low]);
    currentPage.value = Number(element.dataset.page);
    pageInput.value = String(currentPage.value);
    offset.value = Math.max(
      0,
      Math.min(
        1,
        (top - element.getBoundingClientRect().top) / element.clientHeight,
      ),
    );
    queuePosition();
  });
}
function positionPayload() {
  if (!data.value || restoring || loading.value) return;
  return {
    id: data.value.document.id,
    body: {
      sha256: data.value.sha256,
      page: currentPage.value,
      offset: offset.value,
      zoom: zoom.value,
      rotation: rotation.value,
    },
  };
}
function queuePosition() {
  clearTimeout(positionTimer);
  positionTimer = setTimeout(() => void savePosition(), 800);
}
async function savePosition() {
  const payload = positionPayload();
  if (!payload) return;
  stateSaving.value = true;
  try {
    await localApi(
      `${endpoints(payload.id)}/state`,
      jsonOptions('PUT', payload.body),
    );
    stateError.value = '';
  } catch {
    stateError.value = '阅读位置暂未保存';
  } finally {
    stateSaving.value = false;
  }
}
function flushPosition() {
  clearTimeout(positionTimer);
  const payload = positionPayload();
  if (payload)
    void fetch(`/api/japangrad${endpoints(payload.id)}/state`, {
      ...jsonOptions('PUT', payload.body),
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
    }).catch(() => {});
}
async function outlineClick(dest: unknown) {
  if (!pdf.value || !dest) return;
  try {
    const explicit =
      typeof dest === 'string' ? await pdf.value.getDestination(dest) : dest;
    if (
      !Array.isArray(explicit) ||
      explicit[0] === undefined ||
      explicit[0] === null
    )
      return;
    const index =
      typeof explicit[0] === 'number'
        ? explicit[0]
        : await pdf.value.getPageIndex(explicit[0]);
    goToPage(index + 1);
  } catch {
    message.info('这个目录项暂时无法定位，请使用页码。');
  }
}
async function runSearch() {
  const token = ++searchGeneration;
  hits.value = [];
  hitIndex.value = -1;
  searchDone.value = false;
  searchScanned.value = 0;
  const needle = normalizeSearch(search.value);
  if (!needle || (!pdf.value && !text.value)) {
    searchBusy.value = false;
    return;
  }
  searchBusy.value = true;
  try {
    for (let page = 1; page <= totalPages.value; page++) {
      if (token !== searchGeneration) return;
      let content = pageText.get(page);
      if (content === undefined && pdf.value) {
        const source = await pdf.value.getPage(page);
        const items = await source.getTextContent();
        content = items.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        pageText.set(page, content);
      }
      if (token !== searchGeneration) return;
      content ||= '';
      const normalized = normalizeSearch(content);
      let from = 0;
      let occurrence = 0;
      while (hits.value.length < 200) {
        const index = normalized.indexOf(needle, from);
        if (index === -1) break;
        // Snippets are a preview; actual highlights are matched against PDF.js text nodes.
        hits.value.push({
          page,
          occurrence: occurrence++,
          excerpt: content.length < 150 ? content : `${content.slice(0, 70)}…`,
        });
        from = index + needle.length;
      }
      searchScanned.value = page;
      if (hits.value.length >= 200) break;
      if (page % 5 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (token === searchGeneration) searchDone.value = true;
  } catch {
    if (token === searchGeneration)
      message.info('部分页面暂时无法搜索，仍可继续阅读。');
  } finally {
    if (token === searchGeneration) searchBusy.value = false;
  }
}
function goToHit(index: number) {
  if (hits.value.length === 0) return;
  hitIndex.value = (index + hits.value.length) % hits.value.length;
  pendingHit = true;
  goToPage(requireValue(hits.value[hitIndex.value]).page);
  void nextTick(scrollToActiveMark);
}
function scrollToActiveMark() {
  const root = pdfScroll.value;
  if (!root || (!pendingNote && !pendingHit && !pendingCitation)) return;
  const selector = (() => {
    if (pendingCitation) {
      return '.reader-citation-mark.is-active, .reader-text-citation';
    }
    if (pendingNote) {
      return '.reader-mark.is-active, .reader-text-mark.is-active';
    }
    return '.reader-search-mark.is-active, .reader-text-search-active';
  })();
  const mark = root.querySelector<HTMLElement>(selector);
  if (mark) {
    root.scrollTop +=
      mark.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      root.clientHeight * 0.3;
    pendingNote = '';
    pendingHit = false;
    pendingCitation = false;
  }
}
function rendered(page: number, readable: boolean) {
  if (readable) {
    unreadablePages.value.delete(page);
  } else {
    unreadablePages.value.add(page);
  }
  if (pendingNote || pendingHit || pendingCitation)
    void nextTick(scrollToActiveMark);
}
function chooseSelection(value: ReaderSelection) {
  selection.value = value;
}
async function highlight() {
  const source = data.value;
  const value = selection.value;
  if (!value || !source || highlightSaving.value) return;
  highlightSaving.value = true;
  try {
    const note = await localApi<ReaderAnnotation>(
      `${endpoints()}/annotations`,
      jsonOptions('POST', {
        id: crypto.randomUUID(),
        sha256: source.sha256,
        kind: 'highlight',
        color: 'yellow',
        title: '',
        body: '',
        anchor: value.anchor,
      }),
    );
    upsert(note);
    selection.value = undefined;
    window.getSelection()?.removeAllRanges();
    message.success('高亮已保存');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '保存失败，请重试。',
    );
  } finally {
    highlightSaving.value = false;
  }
}
function writeNote(anchor: DocumentAnchor | null = null) {
  notesOpen.value = true;
  focus.value = false;
  rightTab.value = 'notes';
  void nextTick(() => {
    notes.value?.start(anchor);
  });
  selection.value = undefined;
  window.getSelection()?.removeAllRanges();
}
function upsert(note: ReaderAnnotation) {
  if (!data.value || note.documentId !== data.value.document.id) return;
  const index = data.value.annotations.findIndex((item) => item.id === note.id);
  if (index === -1) data.value.annotations.push(note);
  else data.value.annotations[index] = note;
  activeId.value = note.id;
}
async function refreshNotes() {
  try {
    const result = await localApi<ReaderContext>(endpoints());
    if (data.value?.document.id === result.document.id)
      data.value.annotations = result.annotations;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取失败。');
  }
}
function locateNote(note: ReaderAnnotation) {
  if (!note.anchor || note.sha256 !== data.value?.sha256) return;
  activeId.value = note.id;
  if (note.anchor.type === 'pdf' && note.anchor.rects.length === 0) {
    locateSource({
      documentId: note.documentId,
      sha256: note.sha256,
      page: note.anchor.page,
      quote: note.anchor.quote,
    });
    return;
  }
  pendingNote = note.id;
  if (windowWidth.value <= 900) notesOpen.value = false;
  goToPage(note.anchor.page);
  if (note.anchor.type === 'text')
    void nextTick(() => {
      const page = pdfScroll.value?.querySelector<HTMLElement>(
        `[data-page="${requireValue(note.anchor).page}"] .reader-text-content`,
      );
      if (!page) return;
      const rect = matchingRects(page, requireValue(note.anchor).quote)[0]?.[0];
      if (rect && pdfScroll.value)
        pdfScroll.value.scrollTop +=
          rect.top - pdfScroll.value.getBoundingClientRect().top - 80;
      pendingNote = '';
    });
  else void nextTick(scrollToActiveMark);
}
function openAi() {
  notesOpen.value = true;
  focus.value = false;
  rightTab.value = 'ai';
  if (windowWidth.value <= 900) leftOpen.value = false;
}
function askSelection() {
  const value = selection.value;
  if (!value) return;
  if (value.anchor.quote.length > 8000) {
    message.info('请选择最多 8,000 字的原文提问。');
    return;
  }
  openAi();
  void nextTick(() =>
    readerAssistant.value?.attachSelection({
      page: value.anchor.page,
      quote: value.anchor.quote,
    }),
  );
  selection.value = undefined;
  window.getSelection()?.removeAllRanges();
}
function locateSource(
  source: Pick<ReaderSource, 'documentId' | 'page' | 'quote' | 'sha256'>,
) {
  if (
    !data.value ||
    source.documentId !== data.value.document.id ||
    source.sha256 !== data.value.sha256
  ) {
    message.info('引用来自另一文件版本，请重新打开对应资料核对。');
    return;
  }
  if (source.page < 1 || source.page > totalPages.value) {
    message.info('引用页码超出当前资料范围。');
    return;
  }
  pendingNote = '';
  pendingHit = false;
  pendingCitation = true;
  sourceStatus.value = '正在定位原文…';
  sourceQuote.value = { page: source.page, quote: source.quote };
  if (windowWidth.value <= 900) notesOpen.value = false;
  goToPage(source.page);
  void nextTick(scrollToActiveMark);
}
function quoteLocated(page: number, matched: boolean) {
  if (sourceQuote.value?.page !== page) return;
  sourceStatus.value = matched
    ? '已定位匹配片段'
    : '已打开对应页，未找到匹配文字';
  if (matched) void nextTick(scrollToActiveMark);
  else pendingCitation = false;
}
function saveAssistantNote(draft: AssistantNoteDraft) {
  if (!data.value) return;
  const sources = draft.sources.filter(
    (s) =>
      s.documentId === requireValue(data.value).document.id &&
      s.sha256 === requireValue(data.value).sha256,
  );
  const references = sources
    .map(
      (s) =>
        `[${s.id}] ${s.locator}\n${s.quote.slice(0, 160)}${s.quote.length > 160 ? '…（节录）' : ''}`,
    )
    .join('\n\n');
  const body = draft.body + (references ? `\n\n原文依据：\n${references}` : '');
  if (body.length > 20_000) {
    message.info('这条回答连同摘录超过 20,000 字，请复制需要的部分再记笔记。');
    return;
  }
  const first = sources[0];
  const anchor: DocumentAnchor | null = first
    ? {
        type:
          fileFormat(data.value.document.filename) === 'PDF' ? 'pdf' : 'text',
        page: first.page,
        quote: first.quote,
        prefix: '',
        suffix: '',
        rects: [],
        version: 1,
      }
    : null;
  notesOpen.value = true;
  rightTab.value = 'notes';
  focus.value = false;
  void nextTick(() => notes.value?.startWithContent(body, draft.title, anchor));
}
async function copySelection() {
  try {
    if (selection.value)
      await navigator.clipboard.writeText(selection.value.anchor.quote);
    message.success('已复制原文');
  } catch {
    message.info('无法自动复制，请使用系统复制快捷键。');
  }
}
function resizeStart(event: PointerEvent) {
  resizing = true;
  dragX = event.clientX;
  dragWidth = constrainedNoteWidth.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}
function resizeMove(event: PointerEvent) {
  if (resizing)
    noteWidth.value = Math.min(
      520,
      Math.max(280, dragWidth + dragX - event.clientX),
    );
}
watch(search, () => {
  pendingHit = false;
  clearTimeout(searchTimer);
  searchGeneration++;
  searchTimer = setTimeout(() => void runSearch(), 350);
});
watch([zoom, rotation], () => {
  const fraction = offset.value;
  const page = currentPage.value;
  void nextTick(() => {
    if (!restoring) {
      goToPage(page, fraction);
      queuePosition();
    }
  });
});
watch(docId, () => void load(), { immediate: true });
useEventListener(window, 'pagehide', flushPosition);
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPosition();
});
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    selection.value = undefined;
    focus.value = false;
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLocaleLowerCase() === 'f'
  ) {
    event.preventDefault();
    leftOpen.value = true;
    focus.value = false;
    leftTab.value = 'search';
    void nextTick(() =>
      document.querySelector<HTMLInputElement>('#reader-search-input')?.focus(),
    );
  }
});
onBeforeUnmount(() => {
  flushPosition();
  generation++;
  searchGeneration++;
  clearTimeout(searchTimer);
  cancelAnimationFrame(frame);
  void loadTask?.destroy();
});
</script>

<template>
  <section
    class="document-reader"
    :class="{ 'is-focused': focus, 'is-resizing': resizing }"
  >
    <header class="reader-heading">
      <RouterLink
        :to="data?.context.parentPath || '/japan-grad/universities'"
        class="reader-back"
        :title="data?.context.parentLabel || '返回资料'"
        aria-label="返回资料所属页面"
      >
        <ExplorerIcon name="back" />
      </RouterLink>
      <div class="reader-document-title">
        <span>{{ data ? kindLabels[data.document.kind] : '资料阅读'
          }}<template v-if="data">
            · {{ data.context.university }} · {{ data.context.owner }}</template></span>
        <h1>{{ data?.document.title || '正在打开资料…' }}</h1>
      </div>
      <div class="reader-heading-actions">
        <span v-if="data" class="reader-file-badge">{{
          fileFormat(data.document.filename)
        }}</span><a
          v-if="data"
          class="reader-tool-button"
          :href="`${fileUrl(data.document.id)}?download=1`"
          aria-label="下载原文件"
          title="下载原文件"
          ><ExplorerIcon name="export" /></a><button
          class="reader-tool-button"
          :aria-pressed="focus"
          :title="focus ? '退出专注阅读' : '专注阅读'"
          @click="focus = !focus"
        >
          <ExplorerIcon :name="focus ? 'minimize' : 'maximize'" /><span>{{
            focus ? '退出专注' : '专注阅读'
          }}</span>
</button><RouterLink
          to="/japan-grad/overview"
          class="reader-tool-button"
          aria-label="返回申请总览"
          title="申请总览"
        >
          <ExplorerIcon name="home" />
        </RouterLink>
      </div>
    </header>
    <div class="reader-toolbar" aria-label="阅读工具">
      <div class="reader-toolbar-group">
        <button
          class="reader-tool-button"
          :aria-pressed="leftOpen && !focus"
          title="目录、页码与搜索"
          aria-label="切换阅读导航"
          @click="
            leftOpen = !leftOpen;
            focus = false;
            if (windowWidth <= 900) notesOpen = false;
          "
        >
          <ExplorerIcon name="panel-left" />
</button><span class="reader-toolbar-divider"></span><button
          class="reader-tool-button"
          :disabled="currentPage <= 1 || loading"
          aria-label="上一页"
          title="上一页"
          @click="goToPage(currentPage - 1)"
        >
          <ExplorerIcon name="up" />
</button><label class="reader-page-input"><input
            v-model="pageInput"
            inputmode="numeric"
            aria-label="跳转到页码"
            :disabled="loading"
            @keydown.enter.prevent="submitPage"
            @blur="submitPage"
          /><span>/ {{ totalPages }}</span></label><button
          class="reader-tool-button"
          :disabled="currentPage >= totalPages || loading"
          aria-label="下一页"
          title="下一页"
          @click="goToPage(currentPage + 1)"
        >
          <ExplorerIcon name="down" />
        </button>
      </div>
      <div v-if="pdf" class="reader-toolbar-group reader-zoom-tools">
        <button
          class="reader-tool-button"
          title="缩小"
          aria-label="缩小页面"
          @click="zoom = String(Math.max(0.5, (Number(zoom) || 1) - 0.25))"
        >
          <ExplorerIcon name="minus" />
</button><select v-model="zoom" aria-label="页面缩放">
          <option value="width">适合宽度</option>
          <option value="page">整页显示</option>
          <option
            v-for="value in ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2']"
            :key="value"
            :value="value"
          >
            {{ Number(value) * 100 }}%
          </option>
</select><button
          class="reader-tool-button"
          title="放大"
          aria-label="放大页面"
          @click="zoom = String(Math.min(2, (Number(zoom) || 1) + 0.25))"
        >
          <ExplorerIcon name="plus" />
</button><span class="reader-toolbar-divider"></span><button
          class="reader-tool-button"
          aria-label="顺时针旋转页面"
          title="旋转页面"
          @click="rotation = (rotation + 90) % 360"
        >
          <ExplorerIcon name="rotate" />
        </button>
      </div>
      <div class="reader-toolbar-group reader-toolbar-right">
        <button
          v-if="data && data.document.kind !== 'consent'"
          class="reader-tool-button"
          :aria-pressed="aiOpen"
          title="当前文档 AI 问答"
          @click="openAi"
        >
          <ExplorerIcon name="chat" /><span>AI</span>
        </button>
        <span
          class="reader-position-status"
          :class="{ 'has-error': stateError }"
          >{{
            stateError ||
            (stateSaving
              ? '保存位置…'
              : data?.state
                ? '继续上次阅读'
                : '本地阅读')
          }}</span><button
          class="reader-tool-button"
          :aria-pressed="notesOpen && !focus"
          title="阅读笔记"
          @click="
            notesOpen = !(notesOpen && rightTab === 'notes');
            rightTab = 'notes';
            focus = false;
            if (windowWidth <= 900) leftOpen = false;
          "
        >
          <ExplorerIcon name="notebook" /><span>笔记 {{ data?.annotations.length || '' }}</span>
        </button>
      </div>
    </div>
    <p v-if="staleCount" class="reader-version-banner">
      {{ staleCount }} 条笔记属于旧文件版本，原文摘录已保留，暂不显示到当前 PDF
      上。
    </p>
    <div class="reader-body">
      <button
        v-if="windowWidth <= 900 && !focus && (leftOpen || notesOpen)"
        class="reader-mobile-backdrop"
        aria-label="返回原文"
        @click="
          leftOpen = false;
          notesOpen = false;
        "
      ></button>
      <nav
        v-show="leftOpen && !focus"
        class="reader-navigation"
        aria-label="文档导航"
      >
        <div class="reader-nav-tabs">
          <button
            :class="{ 'is-active': leftTab === 'outline' }"
            @click="leftTab = 'outline'"
          >
            目录
</button><button
            :class="{ 'is-active': leftTab === 'pages' }"
            @click="leftTab = 'pages'"
          >
            页码
</button><button
            :class="{ 'is-active': leftTab === 'search' }"
            aria-label="搜索文档"
            @click="leftTab = 'search'"
          >
            <ExplorerIcon name="search" />
</button><button
            class="reader-mobile-close"
            aria-label="关闭导航"
            @click="leftOpen = false"
          >
            <ExplorerIcon name="close" />
          </button>
        </div>
        <div v-if="leftTab === 'outline'" class="reader-outline">
          <template v-if="outline.length">
            <button
              v-for="(item, index) in outline"
              :key="index"
              :disabled="!item.dest"
              :style="{ paddingLeft: `${16 + Math.min(item.depth, 5) * 12}px` }"
              @click="outlineClick(item.dest)"
            >
              {{ item.title }}
            </button>
          </template>
          <div v-else class="reader-nav-empty">
            <ExplorerIcon name="book" />
            <p>这份资料没有内置目录</p>
            <button class="text-button" @click="leftTab = 'pages'">
              按页码浏览 →
            </button>
          </div>
        </div>
        <div v-if="leftTab === 'pages'" class="reader-pages-list">
          <button
            v-for="number in totalPages"
            :key="number"
            :class="{ 'is-active': currentPage === number }"
            @click="goToPage(number)"
          >
            <ReaderThumbnail v-if="pdf" :pdf="pdf" :page="number" /><span
              v-else
              >{{ String(number).padStart(2, '0') }}</span><strong>{{ text ? `文字块 ${number}` : `第 ${number} 页` }}</strong><small v-if="annotationsByPage.get(number)?.length">{{
              annotationsByPage.get(number)!.length
            }}</small>
          </button>
        </div>
        <div v-if="leftTab === 'search'" class="reader-search-panel">
          <Input
            id="reader-search-input"
            v-model:value="search"
            allow-clear
            placeholder="在原文中搜索"
            aria-label="搜索文档原文"
            @keydown.enter.prevent="goToHit(hitIndex + 1)"
          />
          <div class="reader-search-summary">
            <span>{{
              searchBusy
                ? `读取 ${searchScanned}/${totalPages} 页…`
                : searchDone
                  ? `找到 ${hits.length}${hits.length >= 200 ? '+' : ''} 处`
                  : '支持中、日、英文搜索'
            }}</span><button
              :disabled="!hits.length"
              class="reader-tool-button"
              aria-label="上一个搜索结果"
              @click="goToHit(hitIndex - 1)"
            >
              <ExplorerIcon name="up" />
</button><button
              :disabled="!hits.length"
              class="reader-tool-button"
              aria-label="下一个搜索结果"
              @click="goToHit(hitIndex + 1)"
            >
              <ExplorerIcon name="down" />
            </button>
          </div>
          <button
            v-for="(hit, index) in hits"
            :key="`${hit.page}-${hit.occurrence}`"
            class="reader-search-result"
            :class="{ 'is-active': hitIndex === index }"
            @click="goToHit(index)"
          >
            <strong>第 {{ hit.page }} 页</strong><span>{{ hit.excerpt }}</span>
          </button>
          <p v-if="searchDone && !hits.length" class="reader-search-empty">
            没有找到匹配文字。扫描件可能没有可搜索的文字层。
          </p>
        </div>
      </nav>

      <div class="reader-main">
        <div v-if="loading" class="reader-loading" aria-busy="true">
          <Spin size="large" />
          <h2>正在打开原文</h2>
          <p>{{ progress ? `已加载 ${progress}%` : '准备阅读页面与笔记…' }}</p>
        </div>
        <div v-else-if="errorMessage" class="reader-error" role="alert">
          <ExplorerIcon name="book" />
          <h2>资料暂时无法打开</h2>
          <p>{{ errorMessage }}</p>
          <Button @click="load">重新打开</Button><a v-if="data" :href="`${fileUrl(data.document.id)}?download=1`">下载原文件</a>
        </div>
        <template v-else>
          <div v-if="sourceQuote" class="reader-citation-banner">
            <span>引用 · 第 {{ sourceQuote.page }} 页 · {{ sourceStatus }}</span><button
              class="reader-tool-button"
              aria-label="清除引用高亮"
              @click="
                sourceQuote = undefined;
                pendingCitation = false;
              "
            >
              <ExplorerIcon name="close" />
            </button>
          </div>
          <p v-if="formatWarning" class="reader-format-notice">
            {{ formatWarning }}
          </p>
          <div
            v-if="unreadablePages.has(currentPage)"
            class="reader-scan-notice"
          >
            这一页没有可选择的文字，可能是扫描件或图片。你仍可在右侧记录笔记。
          </div>
          <div
            ref="pdfScroll"
            class="reader-scroll"
            tabindex="0"
            aria-label="资料原文阅读区"
            @scroll.passive="onScroll"
            @pointerdown="selection = undefined"
          >
            <template v-if="pdf">
              <ReaderPdfPage
                v-for="number in pdf.numPages"
                :key="`${data?.document.id}-${number}`"
                :pdf="pdf"
                :number="number"
                :width="available.width"
                :height="available.height"
                :zoom="zoom"
                :rotation="rotation"
                :base-width="baseSize.width"
                :base-height="baseSize.height"
                :scroll-root="pdfScroll"
                :annotations="annotationsByPage.get(number) || []"
                :active-id="activeId"
                :search="search"
                :quote="sourceQuote?.page === number ? sourceQuote.quote : ''"
                :search-index="
                  hits[hitIndex]?.page === number
                    ? hits[hitIndex]!.occurrence
                    : -1
                "
                @selection="chooseSelection"
                @rendered="rendered"
                @quote-located="quoteLocated"
              />
            </template>
            <div v-else-if="text" class="reader-text-document">
              <article
                v-for="part in text.pages"
                :key="part.page"
                :data-page="part.page"
              >
                <header>{{ part.locator }}</header>
                <ReaderTextPage
                  :text="part.text || '这一部分没有可读取的文字。'"
                  :page="part.page"
                  :annotations="textAnnotationsByPage.get(part.page) || []"
                  :active-id="activeId"
                  :search="search"
                  :quote="
                    sourceQuote?.page === part.page ? sourceQuote.quote : ''
                  "
                  :search-index="
                    hits[hitIndex]?.page === part.page
                      ? hits[hitIndex]!.occurrence
                      : -1
                  "
                  @selection="chooseSelection"
                  @quote-located="quoteLocated"
                />
              </article>
            </div>
            <div v-else class="reader-download-preview">
              <ExplorerIcon name="book" />
              <h2>{{ data?.document.title }}</h2>
              <p>{{ data?.document.filename }}</p>
              <a
                v-if="data"
                :href="`${fileUrl(data.document.id)}?download=1`"
                class="reader-download-button"
                >下载原文件</a><Button @click="writeNote()">添加阅读笔记</Button>
            </div>
          </div>
        </template>
      </div>

      <div
        v-if="data"
        v-show="notesOpen && !focus"
        class="reader-notes-pane"
        :style="{ width: `${constrainedNoteWidth}px` }"
      >
        <div
          class="reader-notes-resizer"
          role="separator"
          aria-label="调整笔记面板宽度"
          aria-orientation="vertical"
          :aria-valuenow="constrainedNoteWidth"
          :aria-valuemin="280"
          :aria-valuemax="520"
          tabindex="0"
          @pointerdown="resizeStart"
          @pointermove="resizeMove"
          @pointerup="resizing = false"
          @pointercancel="resizing = false"
          @keydown.left.prevent="
            noteWidth = Math.min(520, constrainedNoteWidth + 24)
          "
          @keydown.right.prevent="
            noteWidth = Math.max(280, constrainedNoteWidth - 24)
          "
        ></div>
        <div class="reader-side-tabs">
          <button
            v-if="data.document.kind !== 'consent'"
            :class="{ 'is-active': rightTab === 'ai' }"
            @click="rightTab = 'ai'"
          >
            <ExplorerIcon name="chat" />AI
          </button>
          <button
            :class="{ 'is-active': rightTab === 'notes' }"
            @click="rightTab = 'notes'"
          >
            <ExplorerIcon name="notebook" />笔记
</button><button
            :class="{ 'is-active': rightTab === 'details' }"
            @click="rightTab = 'details'"
          >
            <ExplorerIcon name="info" />资料
</button><button
            class="reader-close-notes"
            aria-label="收起笔记面板"
            @click="notesOpen = false"
          >
            <ExplorerIcon name="close" />
          </button>
        </div>
        <AssistantChat
          v-if="assistantContext && data.document.kind !== 'consent'"
          ref="readerAssistant"
          :key="`ai-${data.document.id}-${data.sha256}`"
          v-model:open="aiOpen"
          :reader="assistantContext"
          @locate-source="locateSource"
          @save-note="saveAssistantNote"
        />
        <ReaderNotes
          v-show="rightTab === 'notes'"
          ref="notes"
          :key="data.document.id"
          :document-id="data.document.id"
          :sha256="data.sha256"
          :annotations="data.annotations"
          :active-id="activeId"
          :legacy-notes="data.document.notes"
          @saved="upsert"
          @removed="
            (id) =>
              (data!.annotations = data!.annotations.filter(
                (note) => note.id !== id,
              ))
          "
          @locate="locateNote"
          @refresh="refreshNotes"
        />
        <section v-if="rightTab === 'details'" class="reader-document-details">
          <h2>资料信息</h2>
          <dl>
            <div>
              <dt>所属</dt>
              <dd>
                {{ data.context.university }}<br />{{ data.context.owner }}
              </dd>
            </div>
            <div>
              <dt>标题</dt>
              <dd>{{ data.document.title }}</dd>
            </div>
            <div>
              <dt>
                {{ data.document.kind === 'paper' ? '发表年份' : '资料年度' }}
              </dt>
              <dd>{{ data.document.year }}</dd>
            </div>
            <div v-if="data.document.authors">
              <dt>作者</dt>
              <dd>{{ data.document.authors }}</dd>
            </div>
            <div v-if="data.document.venue">
              <dt>期刊 / 会议</dt>
              <dd>{{ data.document.venue }}</dd>
            </div>
            <div>
              <dt>原文件</dt>
              <dd>
                {{ data.document.filename
                }}<small>{{ fileSize(data.document.size) }}</small>
              </dd>
            </div>
          </dl>
          <section v-if="data.related?.length" class="reader-related-documents">
            <h3>
              {{ data.document.kind === 'question' ? '对应答案' : '相关资料' }}
            </h3>
            <RouterLink
              v-for="related in data.related"
              :key="related.id"
              :to="documentReaderPath(related.id)"
            >
              <span>{{ kindLabels[related.kind] }} · {{ related.year }}</span><strong>{{ related.title }}</strong><ExplorerIcon name="arrow" />
            </RouterLink>
          </section>
          <a
            :href="`${fileUrl(data.document.id)}?download=1`"
            class="reader-inline-link"
            ><ExplorerIcon name="export" />下载原文件</a><RouterLink :to="data.context.parentPath" class="reader-inline-link">
            <ExplorerIcon name="back" />返回所属资料页
          </RouterLink>
        </section>
      </div>
    </div>
    <div
      v-if="selection"
      class="reader-selection-menu"
      :style="selectionStyle"
      role="toolbar"
      aria-label="选中文字操作"
      @pointerdown.prevent
    >
      <button v-if="data?.document.kind !== 'consent'" @click="askSelection">
        <ExplorerIcon name="chat" />问 AI
      </button>
      <button :disabled="highlightSaving" @click="highlight">
        <ExplorerIcon name="highlight" />{{
          highlightSaving ? '保存中' : '高亮'
        }}
</button><button @click="writeNote(selection!.anchor)">
        <ExplorerIcon name="edit" />笔记
</button><button @click="copySelection"><ExplorerIcon name="copy" />复制</button><button aria-label="关闭选区菜单" @click="selection = undefined">
        <ExplorerIcon name="close" />
      </button>
    </div>
  </section>
</template>
