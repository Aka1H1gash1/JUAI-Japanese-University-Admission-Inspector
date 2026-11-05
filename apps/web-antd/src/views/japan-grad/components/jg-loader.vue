<script setup lang="ts">
// The single JUAI loading animation. Styles: apps/web-antd/public/juai-loader.css.
withDefaults(
  defineProps<{
    /** block: centred in its container; overlay: covers the nearest positioned parent */
    layout?: 'block' | 'inline' | 'overlay' | 'plain';
    size?: 'md' | 'sm';
    text?: string;
  }>(),
  { layout: 'block', size: 'md', text: '正在加载' },
);
</script>

<template>
  <div
    class="juai-loader"
    :class="[
      layout !== 'plain' && `juai-loader--${layout}`,
      size === 'sm' && 'juai-loader--sm',
    ]"
    role="status"
    aria-live="polite"
  >
    <span class="juai-loader__sheet" aria-hidden="true">
      <i class="juai-loader__line"></i><i class="juai-loader__line"></i><i class="juai-loader__line"></i><i class="juai-loader__line"></i><i class="juai-loader__seal"></i>
    </span>
    <span class="juai-loader__text">{{ text }}</span>
  </div>
</template>
