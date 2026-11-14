<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import {
  catalogLogoUrl,
  findCatalogUniversity,
  loadUniversityCatalog,
} from '../university-catalog';
import ExplorerIcon from './explorer-icon.vue';

const props = withDefaults(
  defineProps<{ logoId?: string; name?: string; large?: boolean }>(),
  { logoId: '', name: '', large: false },
);
const failed = ref(false);
onMounted(() => {
  void loadUniversityCatalog();
});
const catalogEntry = computed(() => findCatalogUniversity(props.name));
const source = computed(() =>
  props.logoId
    ? `/api/japangrad/university-logos/${encodeURIComponent(props.logoId)}`
    : catalogLogoUrl(catalogEntry.value?.logo ?? null),
);
const attribution = computed(() =>
  !props.logoId && catalogEntry.value?.logo
    ? `${catalogEntry.value.logo.author} · ${catalogEntry.value.logo.license}`
    : undefined,
);
watch(
  () => source.value,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <span
    :title="attribution"
    class="university-logo"
    :class="{ 'university-logo-large': large, 'has-logo': source && !failed }"
  >
    <img
      v-if="source && !failed"
      :src="source"
      :alt="name ? `${name}校徽` : '校徽预览'"
      @error="failed = true"
    />
    <ExplorerIcon v-else name="building" />
  </span>
</template>
