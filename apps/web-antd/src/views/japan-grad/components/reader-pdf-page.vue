<script setup lang="ts">
import type {
  PageViewport,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from '../pdf-engine';
import type { ReaderAnnotation, ReaderSelection } from '../reader-types';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

import { loadPdfEngine, matchingRects } from '../pdf-engine';
import { requireValue } from '../required-value';

const props = defineProps<{
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  height: number;
  zoom: string;
  rotation: number;
  baseWidth: number;
  baseHeight: number;
  scrollRoot: HTMLElement | null;
  annotations: ReaderAnnotation[];
  activeId?: string;
  search?: string;
  searchIndex?: number;
  quote?: string;
}>();
const emit = defineEmits<{
  selection: [value: ReaderSelection];
  rendered: [page: number, readable: boolean];
  activate: [id: string];
  quoteLocated: [page: number, matched: boolean];
}>();
const canvas = ref<HTMLCanvasElement | null>(null);
const figure = ref<HTMLElement | null>(null);
const sheet = ref<HTMLElement | null>(null);
const textLayer = ref<HTMLElement | null>(null);
const errorMessage = ref('');
const near = ref(false);
const ready = ref(false);
const page = shallowRef<PDFPageProxy>();
const viewport = shallowRef<PageViewport>();
const size = ref({ width: props.baseWidth, height: props.baseHeight });
const scale = computed(() => {
  const rotated = props.rotation % 180 !== 0;
  const h = rotated ? size.value.width : size.value.height;
  const w = rotated ? size.value.height : size.value.width;
  if (props.zoom === 'width') {
    return Math.max(0.15, (props.width - 48) / w);
  }
  if (props.zoom === 'page') {
    return Math.max(
      0.15,
      Math.min((props.width - 48) / w, (props.height - 52) / h),
    );
  }
  return Number(props.zoom);
});
const dimensions = computed(() => ({
  width:
    (props.rotation % 180 ? size.value.height : size.value.width) * scale.value,
  height:
    (props.rotation % 180 ? size.value.width : size.value.height) * scale.value,
}));
let generation = 0;
let observer: IntersectionObserver | undefined;
let task: RenderTask | undefined;
let layerTask:
  | InstanceType<Awaited<ReturnType<typeof loadPdfEngine>>['TextLayer']>
  | undefined;
const searchRects = ref<
  { x: number; y: number; width: number; height: number; selected: boolean }[]
>([]);
const quoteRects = ref<
  { x: number; y: number; width: number; height: number }[]
>([]);
const highlighted = computed(() =>
  props.annotations
    .flatMap((note) =>
      (note.anchor?.rects ?? []).map((rect, i) => {
        if (!viewport.value) return undefined;
        const points = [
          ...viewport.value.convertToViewportPoint(
            requireValue(rect[0]),
            requireValue(rect[1]),
          ),
          ...viewport.value.convertToViewportPoint(
            requireValue(rect[2]),
            requireValue(rect[3]),
          ),
        ];
        return {
          id: `${note.id}-${i}`,
          noteId: note.id,
          color: note.color,
          active: props.activeId === note.id,
          x: Math.min(requireValue(points[0]), requireValue(points[2])),
          y: Math.min(requireValue(points[1]), requireValue(points[3])),
          width: Math.abs(requireValue(points[2]) - requireValue(points[0])),
          height: Math.abs(requireValue(points[3]) - requireValue(points[1])),
        };
      }),
    )
    .filter((item) => item !== undefined),
);

function updateSearch() {
  searchRects.value = [];
  quoteRects.value = [];
  if (!textLayer.value || !sheet.value || !ready.value) return;
  const origin = textLayer.value.getBoundingClientRect();
  if (props.search)
    searchRects.value = matchingRects(textLayer.value, props.search).flatMap(
      (rects, index) =>
        rects.map((rect) => ({
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
          selected: index === props.searchIndex,
        })),
    );
  if (props.quote) {
    quoteRects.value = (
      matchingRects(textLayer.value, props.quote)[0] || []
    ).map((rect) => ({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    }));
    emit('quoteLocated', props.number, quoteRects.value.length > 0);
  }
}
async function render() {
  const token = ++generation;
  task?.cancel();
  layerTask?.cancel();
  ready.value = false;
  searchRects.value = [];
  quoteRects.value = [];
  if (!near.value) {
    if (canvas.value) {
      canvas.value.width = 0;
      canvas.value.height = 0;
    }
    textLayer.value?.replaceChildren();
    return;
  }
  errorMessage.value = '';
  try {
    page.value ??= await props.pdf.getPage(props.number);
    if (token !== generation) return;
    const base = page.value.getViewport({ scale: 1 });
    if (size.value.width !== base.width || size.value.height !== base.height)
      size.value = { width: base.width, height: base.height };
    viewport.value = page.value.getViewport({
      scale: scale.value,
      rotation: (page.value.rotate + props.rotation) % 360,
    });
    await nextTick();
    if (token !== generation || !canvas.value || !textLayer.value) return;
    const view = viewport.value;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(12_000_000 / (view.width * view.height)),
    );
    canvas.value.width = Math.ceil(view.width * pixelRatio);
    canvas.value.height = Math.ceil(view.height * pixelRatio);
    const context = canvas.value.getContext('2d');
    if (!context) throw new Error('浏览器无法绘制这一页。');
    const engine = await loadPdfEngine();
    if (token !== generation) return;
    task = page.value.render({
      canvas: canvas.value,
      canvasContext: context,
      viewport: view,
      transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
      annotationMode: engine.AnnotationMode.DISABLE,
    });
    void task.promise.catch(() => {});
    const content = await page.value.getTextContent();
    if (token !== generation) return;
    textLayer.value.replaceChildren();
    textLayer.value.style.setProperty('--scale-factor', String(view.scale));
    textLayer.value.style.setProperty(
      '--user-unit',
      String(page.value.userUnit),
    );
    layerTask = new engine.TextLayer({
      textContentSource: content,
      container: textLayer.value,
      viewport: view,
    });
    await Promise.all([task.promise, layerTask.render()]);
    if (token !== generation) return;
    ready.value = true;
    updateSearch();
    emit(
      'rendered',
      props.number,
      content.items.some((item) => 'str' in item && item.str.trim()),
    );
  } catch (error) {
    if (
      token === generation &&
      !(
        error instanceof Error &&
        ['AbortException', 'RenderingCancelledException'].includes(error.name)
      )
    )
      errorMessage.value =
        error instanceof Error ? error.message : '这一页暂时无法显示。';
  }
}
function selectText() {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !selection.rangeCount ||
    !textLayer.value ||
    !viewport.value
  )
    return;
  const range = selection.getRangeAt(0);
  if (
    !textLayer.value.contains(range.startContainer) ||
    !textLayer.value.contains(range.endContainer)
  )
    return;
  const quote = selection.toString().trim();
  if (!quote || quote.length > 16_000) return;
  const origin = textLayer.value.getBoundingClientRect();
  const rects = [...range.getClientRects()].filter(
    (r) => r.width > 1 && r.height > 1,
  );
  if (rects.length === 0 || rects.length > 300) return;
  const after = range.cloneRange();
  const before = range.cloneRange();
  before.selectNodeContents(textLayer.value);
  before.setEnd(range.startContainer, range.startOffset);
  after.selectNodeContents(textLayer.value);
  after.setStart(range.endContainer, range.endOffset);
  const bound = range.getBoundingClientRect();
  emit('selection', {
    anchor: {
      version: 1,
      type: 'pdf',
      page: props.number,
      quote,
      prefix: before.toString().slice(-300),
      suffix: after.toString().slice(0, 300),
      rects: rects.map((rect) => {
        const a = requireValue(viewport.value).convertToPdfPoint(
          rect.left - origin.left,
          rect.top - origin.top,
        );
        const b = requireValue(viewport.value).convertToPdfPoint(
          rect.right - origin.left,
          rect.bottom - origin.top,
        );
        return [
          requireValue(a[0]),
          requireValue(a[1]),
          requireValue(b[0]),
          requireValue(b[1]),
        ];
      }),
    },
    x: bound.left + bound.width / 2,
    y: bound.bottom + 10,
  });
}
watch([near, scale, () => props.rotation], () => void render(), {
  flush: 'post',
});
watch(
  [() => props.search, () => props.searchIndex, () => props.quote],
  updateSearch,
  {
    flush: 'post',
  },
);
onMounted(() => {
  observer = new IntersectionObserver(
    ([entry]) => {
      near.value = !!entry?.isIntersecting;
    },
    { root: props.scrollRoot, rootMargin: '900px 400px' },
  );
  if (figure.value) observer.observe(figure.value);
});
onBeforeUnmount(() => {
  generation++;
  observer?.disconnect();
  task?.cancel();
  layerTask?.cancel();
});
</script>

<template>
  <figure
    ref="figure"
    class="reader-pdf-page"
    :data-page="number"
    :style="{ width: `${dimensions.width}px` }"
  >
    <div
      ref="sheet"
      class="reader-pdf-sheet"
      :style="{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
      }"
      @mouseup="selectText"
      @keyup.shift="selectText"
      @touchend="selectText"
    >
      <canvas ref="canvas" aria-hidden="true"></canvas>
      <div
        ref="textLayer"
        class="textLayer"
        :aria-label="`第 ${number} 页原文，可选择文字`"
      ></div>
      <div class="reader-overlay" aria-hidden="true">
        <span
          v-for="rect in highlighted"
          :key="rect.id"
          class="reader-mark"
          :class="[`mark-${rect.color}`, { 'is-active': rect.active }]"
          :style="{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }"
        ></span>
        <span
          v-for="(rect, i) in searchRects"
          :key="`search-${i}`"
          class="reader-search-mark"
          :class="{ 'is-active': rect.selected }"
          :style="{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }"
        ></span>
        <span
          v-for="(rect, i) in quoteRects"
          :key="`quote-${i}`"
          class="reader-citation-mark is-active"
          :style="{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }"
        ></span>
      </div>
      <div v-if="!ready && !errorMessage" class="reader-page-placeholder">
        <span>第 {{ number }} 页</span><small>{{ near ? '正在呈现…' : '' }}</small>
      </div>
      <div v-if="errorMessage" class="reader-page-error" role="alert">
        <p>{{ errorMessage }}</p>
        <button @click="render">重新加载这一页</button>
      </div>
    </div>
    <figcaption>第 {{ number }} 页</figcaption>
  </figure>
</template>
