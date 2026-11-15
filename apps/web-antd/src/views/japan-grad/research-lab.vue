<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App } from 'ant-design-vue';

import LabProfile from './components/lab-profile.vue';
import { useExplorerStore } from './explorer';
import { labContext, majorPath } from './lab-targets';
const route = useRoute();
const router = useRouter();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const target = computed(() => {
  const value = labContext(store, String(route.params.labId));
  return value &&
    value.major.id === route.params.majorId &&
    value.school.id === route.params.schoolId &&
    value.university.id === route.params.universityId
    ? value
    : undefined;
});
function remove() {
  const value = target.value;
  if (!value) return;
  modal.confirm({
    title: `删除「${value.lab.name}」？`,
    content: `研究室与 ${value.professors.length} 位老师的资料、联络草稿、材料待办、论文索引和邮件将一并删除，也会移出修考之路；原文件保留在工作区。删除后无法在界面撤销，可先到「设置 → 本地工作区」备份。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('lab', value.lab.id);
      message.success('研究室已删除');
      return router.replace(majorPath(value));
    },
  });
}
</script>
<template>
  <LabProfile v-if="target" :key="target.lab.id" @remove="remove" />
  <section v-else class="search-empty">
    <h1>这个研究室已不存在</h1>
    <RouterLink to="/japan-grad/universities">返回大学清单 →</RouterLink>
  </section>
</template>
