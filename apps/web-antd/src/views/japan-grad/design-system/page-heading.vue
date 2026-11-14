<script setup lang="ts">
defineProps<{ title: string; context?: string; description?: string }>();
</script>
<template>
  <header class="juai-page-heading">
    <div class="juai-heading-content">
      <p v-if="context" class="juai-context">{{ context }}</p>
      <h1>{{ title }}</h1>
      <p v-if="description" class="juai-description">{{ description }}</p>
      <div v-if="$slots.meta" class="juai-heading-meta">
        <slot name="meta"></slot>
      </div>
    </div>
    <div v-if="$slots.actions" class="juai-heading-actions">
      <slot name="actions"></slot>
    </div>
  </header>
</template>
<style scoped>
.juai-page-heading {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px 0 24px;
}

.juai-heading-content {
  flex: 1;
  min-width: 0;
}

.juai-context {
  margin-bottom: 8px !important;
  font-size: 12px;
  color: var(--jg-muted);
}

.juai-page-heading h1 {
  margin: 0;
  font-family: var(--jg-font);
  font-size: var(--juai-font-heading);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.035em;
}

.juai-description {
  margin-top: 10px !important;
  font-size: 13px;
  color: var(--jg-secondary);
}

.juai-heading-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 24px;
}

.juai-heading-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--jg-accent-text);
}

@media (max-width: 720px) {
  .juai-page-heading {
    flex-direction: column;
    gap: 16px;
  }

  .juai-heading-actions {
    padding-top: 0;
  }

  .juai-page-heading h1 {
    font-size: 24px;
  }
}
</style>
