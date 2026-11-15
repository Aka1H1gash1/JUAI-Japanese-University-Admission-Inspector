<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App } from 'ant-design-vue';

import MajorProfile from './components/major-profile.vue';
import { useExplorerStore } from './explorer';
const route = useRoute();
const router = useRouter();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const university = computed(() =>
  store.universities.find((u) => u.id === route.params.universityId),
);
const school = computed(() =>
  store.schools.find(
    (s) =>
      s.id === route.params.schoolId && s.universityId === university.value?.id,
  ),
);
const major = computed(() =>
  store.majors.find(
    (m) => m.id === route.params.majorId && m.schoolId === school.value?.id,
  ),
);
const allProfessors = computed(() =>
  store.professorsFor(major.value?.id || ''),
);
function deleteMajor() {
  if (!major.value || !school.value) return;
  const id = major.value.id;
  const parentId = school.value.id;
  const universityId = school.value.universityId;
  modal.confirm({
    title: `删除「${major.value.name}」？`,
    content: `该专攻中的 ${store.labsFor(id).length} 个研究室和 ${allProfessors.value.length} 位老师的记录、文件索引和邮件也会一起删除；原文件保留在工作区。删除后无法在界面撤销，可先到「设置 → 本地工作区」备份。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('major', id);
      message.success('专攻已删除');
      return router.replace(
        `/japan-grad/universities/${universityId}/schools/${parentId}`,
      );
    },
  });
}
</script>
<template>
  <MajorProfile
    v-if="major && school && university"
    :key="major.id"
    @remove="deleteMajor"
  />
  <section v-else class="search-empty">
    <h1>这个专攻已不存在</h1>
    <RouterLink to="/japan-grad/universities">返回大学清单 →</RouterLink>
  </section>
</template>
