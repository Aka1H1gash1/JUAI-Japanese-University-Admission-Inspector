<script setup lang="ts">
import type { StoredDocument } from '../documents';

import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Button, Drawer, Select } from 'ant-design-vue';

import AdmissionBatches from '../components/admission-batches.vue';
import AnalysisHistory from '../components/analysis-history.vue';
import CollectedAdmissions from '../components/collected-admissions.vue';
import DocumentArchive from '../components/document-archive.vue';
import EntityEditor from '../components/entity-editor.vue';
import ExamHistory from '../components/exam-history.vue';
import MajorAdmissions from '../components/major-admissions.vue';
import ResearchLabCollection from '../components/research-lab-collection.vue';
import { useExplorerStore, websiteUrl } from '../explorer';
import { localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import ContentSection from './content-section.vue';
import DateMarker from './date-marker.vue';
import FileList from './file-list.vue';
import PageHeading from './page-heading.vue';
import { selectedExam } from './presentation';

const route = useRoute();
const store = useExplorerStore();
const major = computed(() =>
  store.majors.find((item) => item.id === route.params.majorId),
);
const school = computed(() =>
  store.schools.find((item) => item.id === major.value?.schoolId),
);
const university = computed(() =>
  store.universities.find((item) => item.id === school.value?.universityId),
);
const recordId = ref('');
const hasBatches = ref(false);
const exam = computed(() =>
  selectedExam(major.value?.examHistory ?? [], recordId.value),
);
const options = computed(() =>
  (major.value?.examHistory ?? []).map((record) => ({
    value: record.id,
    label: `${record.year} 年 · ${record.session || '未注明批次'}`,
  })),
);
const editing = ref(false);
const manage = ref<'' | 'admissions' | 'files'>('');
const files = ref<StoredDocument[]>([]);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;
async function loadFiles() {
  const id = major.value?.id;
  const current = ++generation;
  files.value = [];
  errorMessage.value = '';
  if (!id) return;
  loading.value = true;
  try {
    const result = await localApi<StoredDocument[]>(
      `/documents?ownerType=major&ownerId=${encodeURIComponent(id)}`,
    );
    if (current === generation) files.value = result;
  } catch (error) {
    if (current === generation)
      errorMessage.value =
        error instanceof Error ? error.message : '文件读取失败';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => major.value?.id,
  () => {
    recordId.value = '';
    void loadFiles();
  },
  { immediate: true },
);
const generalFiles = computed(() =>
  files.value.filter((file) => !['answer', 'question'].includes(file.kind)),
);
const questions = computed(() =>
  files.value.filter((file) => ['answer', 'question'].includes(file.kind)),
);
</script>
<template>
  <div v-if="major && school && university" class="juai-design juai-stack">
    <div>
      <div class="juai-prototype-bar">
        <span>JUAI 1.0 · 设计预览</span><RouterLink
          :to="{
            path: route.path,
            query: { ...route.query, design: undefined },
          }"
        >
          返回现有页面 →
        </RouterLink>
      </div>
      <PageHeading
        :title="major.name"
        :context="`${university.name} / ${school.name}`"
        :description="major.research || major.japaneseName"
      >
        <template #actions>
          <Button @click="editing = true">编辑专攻</Button><Button type="primary" @click="manage = 'admissions'">
            编辑招生信息
          </Button>
        </template>
        <template #meta>
          <a
            v-if="websiteUrl(major.website)"
            :href="websiteUrl(major.website)"
            target="_blank"
            rel="noopener noreferrer"
            >专攻官网 ↗</a><RouterLink :to="`/japan-grad/analysis/${major.id}`">
            募集要项与来源 ↗
          </RouterLink>
        </template>
      </PageHeading>
    </div>
    <AdmissionBatches
      :key="major.id"
      :major-id="major.id"
      @count="(count) => (hasBatches = count > 0)"
    />
    <ContentSection v-if="!hasBatches" title="旧考试与通用招生资料">
      <template #actions>
        <RouterLink :to="`/japan-grad/analysis/${major.id}`">
          智能导入 ↗
        </RouterLink>
      </template>
      <div class="juai-section-selector">
        <label for="juai-exam-selector">现有考试记录</label><Select
          v-if="options.length"
          id="juai-exam-selector"
          aria-label="选择考试年份与批次"
          v-accessible-select
          :value="exam?.id"
          :options="options"
          @change="(value) => (recordId = String(value))"
        /><span v-else class="juai-scope-note">暂无考试记录</span>
      </div>
      <div class="juai-date-row">
        <DateMarker
          label="考试日期"
          :value="exam?.writtenDate || exam?.examDate"
        /><DateMarker label="面试日期" :value="exam?.interviewDate" />
      </div>
      <p class="juai-scope-note">
        {{
          exam ? '日期与科目来自所选考试记录。' : ''
        }}入学年度、考试类别与适用范围尚未确认；以下语言与材料为专攻通用资料。
      </p>
      <dl class="juai-facts">
        <div>
          <dt>考试科目</dt>
          <dd>{{ exam?.subjects || '未确认' }}</dd>
        </div>
        <div>
          <dt>内诺要求</dt>
          <dd>未确认</dd>
        </div>
        <div>
          <dt>所需材料 · 专攻通用</dt>
          <dd>{{ major.applicationMaterials || '未确认' }}</dd>
        </div>
        <div>
          <dt>语言要求 · 专攻通用</dt>
          <dd>{{ major.languageRequirements || '未确认' }}</dd>
        </div>
      </dl>
      <p v-if="exam?.notes" class="juai-prose" style="margin-top: 20px">
        {{ exam.notes }}
      </p>
      <a
        v-if="websiteUrl(exam?.sourceUrl || '')"
        :href="websiteUrl(exam?.sourceUrl || '')"
        target="_blank"
        rel="noopener noreferrer"
        class="juai-link-row"
        >查看本次考试来源 ↗</a>
    </ContentSection>
    <div class="juai-panel-grid">
      <ContentSection title="文件" subtitle="募集要项与相关资料">
        <template #actions>
          <Button size="small" @click="manage = 'files'">
            上传 / 管理
          </Button>
</template><FileList
          :files="generalFiles"
          :loading="loading"
          :error="errorMessage"
          @retry="loadFiles"
        />
      </ContentSection>
      <ContentSection title="过去问" subtitle="历年试题与对应答案">
        <template #actions>
          <Button size="small" @click="manage = 'files'">
            上传 / 管理
          </Button>
</template><FileList
          :files="questions"
          :loading="loading"
          :error="errorMessage"
          @retry="loadFiles"
        />
      </ContentSection>
    </div>
    <details class="juai-history">
      <summary>补充信息与解析历史</summary>
      <p v-if="major.notes" class="juai-prose">{{ major.notes }}</p>
      <p
        v-if="major.applicationStart || major.applicationEnd"
        class="juai-prose"
      >
        通用出愿时间：{{ major.applicationStart || '未确认' }} —
        {{ major.applicationEnd || '未确认' }}
      </p>
      <CollectedAdmissions kind="major" :id="major.id" /><AnalysisHistory
        v-if="major.analysisHistory?.length"
        :history="major.analysisHistory"
        :major-id="major.id"
      />
    </details>
    <ResearchLabCollection
      :key="major.id"
      :major-id="major.id"
      design-preview
    />
    <EntityEditor
      v-model:open="editing"
      kind="major"
      :entity-id="major.id"
      :parent-id="school.id"
      :parent-name="school.name"
    />
    <Drawer
      :open="Boolean(manage)"
      :title="manage === 'files' ? '文件与过去问管理' : '考试记录与通用要求'"
      width="min(1100px, 100vw)"
      @close="manage = ''"
    >
      <template v-if="manage === 'admissions'">
        <MajorAdmissions :major-id="major.id" /><ExamHistory
          :major-id="major.id"
        />
      </template>
      <DocumentArchive
        v-if="manage === 'files'"
        owner-type="major"
        :owner-id="major.id"
        @changed="loadFiles"
      />
    </Drawer>
  </div>
</template>
