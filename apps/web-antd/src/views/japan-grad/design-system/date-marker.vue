<script setup lang="ts">
import { computed } from 'vue';

import { exactDate } from './presentation';
const props = defineProps<{ label: string; value?: string }>();
const date = computed(() => exactDate(props.value ?? ''));
</script>
<template>
  <div class="juai-date">
    <span>{{ label }}</span><time v-if="date" :datetime="date">{{ value }}</time><strong v-else :class="{ 'is-empty': !value }">{{
      value || '未确认'
    }}</strong>
  </div>
</template>
<style scoped>
.juai-date {
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
}

.juai-date > span {
  font-size: 11px;
  color: var(--jg-muted);
}

.juai-date time,
.juai-date strong {
  font-size: 22px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  color: var(--jg-accent-text);
  overflow-wrap: anywhere;
}

.juai-date .is-empty {
  font-size: 16px;
  color: var(--jg-muted);
}

@media (max-width: 720px) {
  .juai-date time,
  .juai-date strong {
    font-size: 17px;
  }
}
</style>
