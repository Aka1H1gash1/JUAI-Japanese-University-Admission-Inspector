<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import BrandMark from './components/brand-mark.vue';
import ExplorerIcon from './components/explorer-icon.vue';

const router = useRouter();
const imagePreload = document.createElement('link');
imagePreload.rel = 'preload';
imagePreload.as = 'image';
imagePreload.href = '/images/welcome/campus-passage.jpg';
imagePreload.setAttribute('fetchpriority', 'high');
document.head.append(imagePreload);
const paused = ref(false);
const reduced = ref(false);
const scene = ref<HTMLElement>();
const visible = ref(true);
const detailFailed = ref(false);
const detailReady = ref(false);
const mainFailed = ref(false);
const mainReady = ref(false);
const entering = ref(false);
const errorMessage = ref('');
const motion = computed(() => !paused.value && !reduced.value && visible.value);
let frame = 0;
let media: MediaQueryList | undefined;
let nextX = 0;
let nextY = 0;
function resetDepth() {
  cancelAnimationFrame(frame);
  frame = 0;
  scene.value?.style.setProperty('--scene-x', '0px');
  scene.value?.style.setProperty('--scene-y', '0px');
}
function move(event: PointerEvent) {
  if (!motion.value || event.pointerType === 'touch' || !scene.value) return;
  const rect = scene.value.getBoundingClientRect();
  nextX = ((event.clientX - rect.left) / rect.width - 0.5) * 14;
  nextY = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
  if (!frame)
    frame = requestAnimationFrame(() => {
      scene.value?.style.setProperty('--scene-x', `${nextX.toFixed(2)}px`);
      scene.value?.style.setProperty('--scene-y', `${nextY.toFixed(2)}px`);
      frame = 0;
    });
}
function syncMotion() {
  reduced.value = media?.matches || false;
  if (reduced.value) resetDepth();
}
function syncVisibility() {
  visible.value = document.visibilityState !== 'hidden';
  if (!visible.value) resetDepth();
}
function toggleMotion() {
  paused.value = !paused.value;
  resetDepth();
}
onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncMotion();
  syncVisibility();
  media.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncVisibility);
});
onBeforeUnmount(() => {
  resetDepth();
  imagePreload.remove();
  media?.removeEventListener('change', syncMotion);
  document.removeEventListener('visibilitychange', syncVisibility);
});
async function enter(event: MouseEvent) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  event.preventDefault();
  if (entering.value) return;
  entering.value = true;
  errorMessage.value = '';
  try {
    await router.push('/japan-grad/overview');
  } catch {
    entering.value = false;
    errorMessage.value = '暂时无法打开工作区，请稍后重试。';
  }
}
</script>

<template>
  <div class="welcome-page" :class="{ 'is-still': !motion }">
    <header class="welcome-nav">
      <div class="welcome-brand" aria-label="JapanGrad 择校笔记">
        <span class="welcome-brand-mark"><BrandMark /></span><span>JapanGrad</span>
      </div>
      <button
        class="welcome-motion-control"
        type="button"
        :disabled="reduced"
        :aria-pressed="paused || reduced"
        :aria-label="
          reduced
            ? '已遵循系统的减少动态效果设置'
            : paused
              ? '开启画面动态'
              : '暂停画面动态'
        "
        @click="toggleMotion"
      >
        {{ reduced ? '静态模式' : paused ? '开启动态' : '暂停动态' }}
      </button>
    </header>
    <main class="welcome-main">
      <section class="welcome-copy" aria-labelledby="welcome-title">
        <h1 id="welcome-title" class="welcome-reveal">
          下一站，<span>你的理想大学。</span>
        </h1>
        <p class="welcome-description welcome-reveal">
          把大学、研究室与申请日程，整理在一起。
        </p>
        <div class="welcome-action welcome-reveal">
          <a
            class="welcome-enter"
            href="/japan-grad/overview"
            :aria-busy="entering"
            @click="enter"
            ><span>{{ entering ? '正在进入' : '进入工作区' }}</span><ExplorerIcon name="arrow" /></a>
        </div>
        <p v-if="errorMessage" class="welcome-error" role="alert">
          {{ errorMessage }}
        </p>
      </section>
      <div
        ref="scene"
        class="welcome-scene"
        aria-label="校园光影"
        @pointermove="move"
        @pointerleave="resetDepth"
      >
        <figure
          class="welcome-photo welcome-photo-main"
          :class="{ ready: mainReady, failed: mainFailed }"
        >
          <img
            v-if="!mainFailed"
            src="/images/welcome/campus-passage.jpg"
            width="1122"
            height="1402"
            alt="静谧校园意象，步道沿着水面延伸，树影与建筑相映。"
            fetchpriority="high"
            decoding="async"
            @load="mainReady = true"
            @error="mainFailed = true"
          />
          <div v-else class="welcome-image-error">
            <span>画面暂未加载</span><button
              type="button"
              @click="
                mainFailed = false;
                mainReady = false;
              "
            >
              重新加载
            </button>
          </div>
        </figure>
        <figure
          class="welcome-photo welcome-photo-detail"
          :class="{ ready: detailReady, failed: detailFailed }"
        >
          <img
            v-if="!detailFailed"
            src="/images/welcome/campus-light.jpg"
            width="1000"
            height="667"
            alt="透过校园窗景，水面光影轻落在建筑墙面。"
            decoding="async"
            @load="detailReady = true"
            @error="detailFailed = true"
          />
          <div v-else class="welcome-image-error">
            <span>画面暂未加载</span><button
              type="button"
              @click="
                detailFailed = false;
                detailReady = false;
              "
            >
              重新加载
            </button>
          </div>
        </figure>
      </div>
    </main>
  </div>
</template>
<style scoped src="./welcome.css"></style>
