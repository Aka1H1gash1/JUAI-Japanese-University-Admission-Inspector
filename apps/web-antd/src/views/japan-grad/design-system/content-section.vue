<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>
<template>
  <section class="juai-section" :aria-label="title">
    <header class="juai-section-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="juai-section-actions">
        <slot name="actions"></slot>
      </div>
    </header>
    <slot></slot>
  </section>
</template>
<style scoped>
.juai-section {
  min-width: 0;
  padding: var(--juai-space-6);
  background: var(--juai-color-surface);
  border: 1px solid var(--juai-color-line);
  border-radius: var(--juai-radius);
}

.juai-section-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.juai-section h2 {
  margin: 0;
  font-family: var(--jg-font);
  font-size: var(--juai-font-section);
  font-weight: 600;
  line-height: 1.5;
}

.juai-section-header p {
  margin-top: 6px;
  font-size: 11px;
  color: var(--jg-muted);
}

.juai-section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 720px) {
  .juai-section {
    padding: 20px;
  }

  .juai-section-header {
    flex-wrap: wrap;
  }
}
</style>
