<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useExplorerStore } from './explorer';
import DocumentAnalysis from './components/document-analysis.vue';
const route = useRoute(),
  store = useExplorerStore();
const id = computed(() => String(route.params.analysisMajorId));
const major = computed(() => store.majors.find((m) => m.id === id.value));
const school = computed(() =>
  store.schools.find((s) => s.id === major.value?.schoolId),
);
const university = computed(() =>
  store.universities.find((u) => u.id === school.value?.universityId),
);
</script>
<template>
  <section class="explorer-page">
    <header class="page-heading">
      <div>
        <h1>募集要项分析</h1>
        <p class="page-description">
          {{ university?.name }} / {{ school?.name }} / {{ major?.name }}
        </p>
      </div>
    </header>
    <DocumentAnalysis :key="id" :major-id="id" />
  </section>
</template>
