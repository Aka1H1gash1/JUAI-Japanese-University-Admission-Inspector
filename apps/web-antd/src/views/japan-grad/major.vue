<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import DocumentArchive from './components/document-archive.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ExamHistory from './components/exam-history.vue';
import MajorAdmissions from './components/major-admissions.vue';
import AdmissionCycleList from './components/admission-cycle-list.vue';
import ResearchLabCollection from './components/research-lab-collection.vue';
import { useExplorerStore, websiteUrl } from './explorer';

const store = useExplorerStore();
const { message, modal } = App.useApp();
const route = useRoute();
const router = useRouter();
const university = computed(() =>
  store.universities.find((item) => item.id === route.params.universityId),
);
const school = computed(() =>
  store.schools.find(
    (item) =>
      item.id === route.params.schoolId &&
      item.universityId === university.value?.id,
  ),
);
const major = computed(() =>
  store.majors.find(
    (item) =>
      item.id === route.params.majorId && item.schoolId === school.value?.id,
  ),
);
const majorEditorOpen = ref(false);
const allProfessors = computed(() =>
  store.professorsFor(major.value?.id ?? ''),
);
function deleteMajor() {
  if (!major.value || !school.value) return;
  const id = major.value.id;
  const parentId = school.value.id;
  const universityId = school.value.universityId;
  modal.confirm({
    title: `删除「${major.value.name}」？`,
    content: `该专攻中的 ${store.labsFor(id).length} 个研究室和 ${allProfessors.value.length} 位老师的记录、文件索引和邮件也会一起删除；原文件保留在工作区。`,
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
  <section v-if="major && school && university" class="explorer-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${university.id}`"
      >
        {{ university.name }} </RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${university.id}/schools/${school.id}`"
      >
        {{ school.name }} </RouterLink
      ><ExplorerIcon name="chevron" /><span>{{ major.name }}</span>
    </nav>
    <header class="page-heading detail-heading">
      <div>
        <h1>{{ major.name }}</h1>
        <p class="page-description">
          {{ [school.name, major.japaneseName].filter(Boolean).join(' / ') }}
        </p>
      </div>
      <div class="detail-actions">
        <Button class="icon-button" @click="majorEditorOpen = true">
          <ExplorerIcon name="edit" />编辑专攻 </Button
        ><Button class="icon-button" aria-label="删除专攻" @click="deleteMajor">
          <ExplorerIcon name="trash" />
        </Button>
      </div>
    </header>
    <section class="entity-overview" aria-label="专攻资料">
      <div class="overview-meta">
        <span
          ><ExplorerIcon name="book" />{{
            major.research || '研究领域尚未填写'
          }}</span
        ><a
          v-if="websiteUrl(major.website)"
          :href="websiteUrl(major.website)"
          target="_blank"
          rel="noopener noreferrer"
          ><ExplorerIcon name="globe" />访问专攻官网<ExplorerIcon name="link"
        /></a>
      </div>
      <p v-if="major.notes" class="overview-notes">{{ major.notes }}</p>
    </section>
    <AdmissionCycleList :key="`cycles-${major.id}`" :major-id="major.id" />
    <MajorAdmissions :key="`admissions-${major.id}`" :major-id="major.id" />
    <ExamHistory :key="`exams-${major.id}`" :major-id="major.id" />
    <DocumentArchive :key="major.id" owner-type="major" :owner-id="major.id" />
    <ResearchLabCollection :key="major.id" :major-id="major.id" />
    <EntityEditor
      v-model:open="majorEditorOpen"
      kind="major"
      :entity-id="major.id"
      :parent-id="school.id"
      :parent-name="`${university.name} / ${school.name}`"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这个专攻已不存在</h1>
    <p>返回大学清单重新选择。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
