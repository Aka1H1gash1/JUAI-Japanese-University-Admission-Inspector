<script setup lang="ts">
import ExplorerIcon from '../components/explorer-icon.vue';
defineProps<{ title: string; description?: string; icon?: string }>();
</script>
<template>
  <div class="juai-empty">
    <ExplorerIcon :name="icon || 'book'" />
    <div>
      <strong>{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
      <slot></slot>
    </div>
  </div>
</template>
<style scoped>
.juai-empty {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 0;
  font-size: 12px;
  color: var(--jg-muted);
}

.juai-empty > svg {
  width: 20px;
  height: 20px;
  margin-top: 2px;
}

.juai-empty strong {
  font-size: 13px;
  font-weight: 500;
  color: var(--jg-secondary);
}

.juai-empty p {
  margin-top: 6px;
  line-height: 1.8;
}
</style>
