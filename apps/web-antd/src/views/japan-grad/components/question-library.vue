<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import DocumentArchive from './document-archive.vue';
const store = useExplorerStore();
const universityId = ref<string>();
const schoolId = ref<string>();
const majorId = ref<string>();
const schools = computed(() =>
  store.schools.filter(
    (s) => !universityId.value || s.universityId === universityId.value,
  ),
);
const majors = computed(() =>
  store.majors.filter((m) =>
    schoolId.value
      ? m.schoolId === schoolId.value
      : schools.value.some((s) => s.id === m.schoolId),
  ),
);
watch(universityId, () => {
  schoolId.value = undefined;
  majorId.value = undefined;
});
watch(schoolId, () => {
  majorId.value = undefined;
});
</script>
<template>
  <section class="question-library">
    <div class="question-filters">
      <Select
        v-model:value="universityId"
        allow-clear
        placeholder="选择大学"
        aria-label="过去问大学"
        :options="
          store.universities.map((u) => ({ value: u.id, label: u.name }))
        "
      />
      <Select
        v-model:value="schoolId"
        allow-clear
        placeholder="选择研究科"
        aria-label="过去问研究科"
        :options="schools.map((s) => ({ value: s.id, label: s.name }))"
      />
      <Select
        v-model:value="majorId"
        allow-clear
        show-search
        option-filter-prop="label"
        placeholder="选择专攻"
        aria-label="过去问专攻"
        :options="
          majors.map((m) => ({
            value: m.id,
            label: schoolId
              ? m.name
              : `${store.schools.find((s) => s.id === m.schoolId)?.name} / ${m.name}`,
          }))
        "
      />
    </div>
    <DocumentArchive
      v-if="majorId"
      :key="majorId"
      owner-type="major"
      :owner-id="majorId"
      only-kind="question"
    />
    <div v-else class="collection-empty">
      <h3>过去问专区</h3>
      <p>选择大学、研究科与专攻后，按年份上传、阅读过去问及对应答案。</p>
    </div>
  </section>
</template>
<style scoped>
.question-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0;
}

@media (max-width: 640px) {
  .question-filters {
    grid-template-columns: 1fr;
  }
}
</style>
