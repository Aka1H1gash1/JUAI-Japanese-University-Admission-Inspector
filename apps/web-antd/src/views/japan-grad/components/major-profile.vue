<script setup lang="ts">
import type { StoredDocument } from '../documents';
import type { AdmissionBatch } from '../foundation-types';

import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { App, Button, Checkbox, Drawer, Select } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import ContextTrail from '../design-system/context-trail.vue';
import DateMarker from '../design-system/date-marker.vue';
import FileList from '../design-system/file-list.vue';
import PageHeading from '../design-system/page-heading.vue';
import { selectedExam } from '../design-system/presentation';
import { useExplorerStore, websiteUrl } from '../explorer';
import { localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import AdmissionBatches from './admission-batches.vue';
import AnalysisHistory from './analysis-history.vue';
import CollectedAdmissions from './collected-admissions.vue';
import DocumentArchive from './document-archive.vue';
import EntityEditor from './entity-editor.vue';
import ExamHistory from './exam-history.vue';
import MajorAdmissions from './major-admissions.vue';
import ResearchLabCollection from './research-lab-collection.vue';

defineEmits<{ remove: [] }>();
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
const batchPanel = ref<InstanceType<typeof AdmissionBatches>>();
const selectedBatch = ref<AdmissionBatch>();
const showAllFiles = ref(false);
const uploadBatchId = ref('');
const { message } = App.useApp();
async function uploaded(record: StoredDocument) {
  try {
    if (uploadBatchId.value)
      await batchPanel.value?.attachFile(record.id, uploadBatchId.value);
  } catch (error) {
    message.error(
      `文件已保存，批次关联失败：${error instanceof Error ? error.message : '请重试'}`,
    );
  }
  await loadFiles();
}
const manage = ref<'' | 'files' | 'legacy' | 'questions'>('');
watch(manage, (value, previous) => {
  if (value && !previous) uploadBatchId.value = selectedBatch.value?.id || '';
});
const focusFile = ref('');
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
const scopedFiles = computed(() =>
  selectedBatch.value && !showAllFiles.value
    ? files.value.filter((f) =>
        selectedBatch.value?.documentIds?.includes(f.id),
      )
    : files.value,
);
const generalFiles = computed(() =>
  scopedFiles.value.filter(
    (file) => !['answer', 'question'].includes(file.kind),
  ),
);
const questions = computed(() =>
  scopedFiles.value.filter((file) =>
    ['answer', 'question'].includes(file.kind),
  ),
);
</script>
<template>
  <div v-if="major && school && university" class="juai-design juai-stack">
    <div>
      <PageHeading
        :title="major.name"
        :description="major.research || major.japaneseName"
      >
        <template #context>
          <ContextTrail
            :items="[
              { label: '大学清单', to: '/japan-grad/universities' },
              {
                label: university.name,
                to: `/japan-grad/universities/${university.id}`,
              },
              {
                label: school.name,
                to: `/japan-grad/universities/${university.id}/schools/${school.id}`,
              },
            ]"
          />
        </template>
        <template #actions>
          <Button @click="editing = true">编辑专攻</Button><Button @click="manage = 'legacy'"> 历史资料与管理 </Button>
          <Button type="text" danger @click="$emit('remove')">删除</Button>
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
      ref="batchPanel"
      :key="major.id"
      :major-id="major.id"
      :files="files"
      @selected="
        (batch) => {
          selectedBatch = batch;
          showAllFiles = false;
        }
      "
    >
      <template #legacy>
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
      </template>
    </AdmissionBatches>
    <div v-if="selectedBatch" class="juai-entity-toolbar">
      <span class="juai-scope-note">{{
        showAllFiles ? '本专攻全部文件' : `当前批次：${selectedBatch.label}`
      }}</span><label><Checkbox v-model:checked="showAllFiles" /> 查看专攻全部文件</label>
    </div>
    <div class="juai-panel-grid">
      <ContentSection title="文件" subtitle="募集要项与相关资料">
        <template #actions>
          <Button
            size="small"
            @click="
              focusFile = '';
              manage = 'files';
            "
          >
            上传 / 管理
          </Button>
</template><FileList
          :files="generalFiles"
          :empty-title="
            selectedBatch && !showAllFiles ? '本批次尚未关联文件' : undefined
          "
          :loading="loading"
          :error="errorMessage"
          @retry="loadFiles"
        >
          <template #actions="{ file }">
            <Button
              type="text"
              size="small"
              :aria-label="`管理文件：${file.title}`"
              @click="
                focusFile = file.id;
                manage = 'files';
              "
            >
              管理
            </Button>
          </template>
        </FileList>
      </ContentSection>
      <ContentSection title="过去问" subtitle="历年试题与对应答案">
        <template #actions>
          <Button
            size="small"
            @click="
              focusFile = '';
              manage = 'questions';
            "
          >
            上传 / 管理
          </Button>
</template><FileList
          :files="questions"
          :empty-title="
            selectedBatch && !showAllFiles ? '本批次尚未关联文件' : undefined
          "
          :loading="loading"
          :error="errorMessage"
          @retry="loadFiles"
        >
          <template #actions="{ file }">
            <Button
              type="text"
              size="small"
              :aria-label="`管理文件：${file.title}`"
              @click="
                focusFile = file.id;
                manage = 'questions';
              "
            >
              管理
            </Button>
          </template>
        </FileList>
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
      <CollectedAdmissions kind="major" :id="major.id" /><CollectedAdmissions
        kind="school"
        :id="school.id"
        title="研究科历史资料 · 适用范围待核对"
      /><CollectedAdmissions
        kind="university"
        :id="university.id"
        title="大学历史资料 · 适用范围待核对"
      /><AnalysisHistory
        v-if="major.analysisHistory?.length"
        :history="major.analysisHistory"
        :major-id="major.id"
      />
    </details>
    <ResearchLabCollection :key="major.id" :major-id="major.id" compact />
    <EntityEditor
      v-model:open="editing"
      kind="major"
      :entity-id="major.id"
      :parent-id="school.id"
      :parent-name="school.name"
    />
    <Drawer
      :open="Boolean(manage)"
      :title="manage === 'legacy' ? '历史考试记录与通用要求' : '专攻文件管理'"
      width="min(1100px, 100vw)"
      @close="manage = ''"
    >
      <template v-if="manage === 'legacy'">
        <MajorAdmissions :major-id="major.id" /><ExamHistory
          :major-id="major.id"
        />
      </template>
      <DocumentArchive
        v-if="manage === 'files' || manage === 'questions'"
        owner-type="major"
        :owner-id="major.id"
        :section-kind="manage === 'questions' ? 'questions' : 'files'"
        :initial-id="focusFile"
        @uploaded="uploaded"
        @changed="loadFiles"
      />
    </Drawer>
  </div>
</template>
