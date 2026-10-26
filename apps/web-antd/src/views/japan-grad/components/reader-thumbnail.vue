<script setup lang="ts">
import type { PDFDocumentProxy, RenderTask } from '../pdf-engine';

import { onBeforeUnmount, onMounted, ref } from 'vue';
const props = defineProps<{ pdf: PDFDocumentProxy; page: number }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const container = ref<HTMLElement | null>(null);
const ready = ref(false);
let generation = 0;
let observer: IntersectionObserver | undefined;
let task: RenderTask | undefined;
async function show(visible: boolean) {
  const token = ++generation;
  task?.cancel();
  ready.value = false;
  if (!visible) {
    if (canvas.value) {
      canvas.value.width = 0;
      canvas.value.height = 0;
    }
    return;
  }
  try {
    const page = await props.pdf.getPage(props.page);
    if (token !== generation || !canvas.value) return;
    const initial = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 112 / initial.width });
    canvas.value.width = Math.ceil(viewport.width);
    canvas.value.height = Math.ceil(viewport.height);
    const context = canvas.value.getContext('2d');
    if (!context) return;
    task = page.render({
      canvas: canvas.value,
      canvasContext: context,
      viewport,
    });
    await task.promise;
    if (token === generation) ready.value = true;
  } catch {
    /* The full-page reader offers retry; a thumbnail remains optional. */
  }
}
onMounted(() => {
  observer = new IntersectionObserver(
    ([entry]) => void show(!!entry?.isIntersecting),
    {
      root: container.value?.closest('.reader-pages-list'),
      rootMargin: '250px',
    },
  );
  if (container.value) observer.observe(container.value);
});
onBeforeUnmount(() => {
  generation++;
  observer?.disconnect();
  task?.cancel();
});
</script>
<template>
  <span ref="container" class="reader-thumbnail" aria-hidden="true"><canvas ref="canvas" :class="{ 'is-ready': ready }"></canvas><span v-if="!ready">{{ page }}</span></span>
</template>
