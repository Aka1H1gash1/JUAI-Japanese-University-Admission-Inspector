<script setup lang="ts">
import { ref, watch } from 'vue';

import ExplorerIcon from './explorer-icon.vue';

const props = withDefaults(
  defineProps<{ logoId?: string; name?: string; large?: boolean }>(),
  { logoId: '', name: '', large: false },
);
const failed = ref(false);
watch(
  () => props.logoId,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <span
    class="university-logo"
    :class="{ 'university-logo-large': large, 'has-logo': logoId && !failed }"
  >
    <img
      v-if="logoId && !failed"
      :src="`/api/japangrad/university-logos/${encodeURIComponent(logoId)}`"
      :alt="name ? `${name}校徽` : '校徽预览'"
      @error="failed = true"
    />
    <ExplorerIcon v-else name="building" />
  </span>
</template>
