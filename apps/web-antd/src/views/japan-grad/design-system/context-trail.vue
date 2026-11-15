<script setup lang="ts">
defineProps<{ items: { label: string; to?: string }[] }>();
</script>
<template>
  <nav class="juai-context-trail" aria-label="所属路径">
    <template v-for="(item, index) in items" :key="index">
      <span v-if="index" aria-hidden="true">/</span><RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink><span v-else>{{ item.label }}</span>
    </template>
  </nav>
</template>
<style scoped>
.juai-context-trail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--jg-muted);
}

.juai-context-trail a:hover {
  color: var(--jg-accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
