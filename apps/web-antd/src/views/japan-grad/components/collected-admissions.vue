<script setup lang="ts">
import type {
  CollectedAdmissionRecord,
  CollectionKind,
} from '../collection-types';

import { onBeforeUnmount, ref, watch } from 'vue';

import { Button } from 'ant-design-vue';

import {
  ADMISSION_STATUS_NAMES,
  ADMISSION_SUMMARY_NAMES,
} from '../collection-types';
import { localApi } from '../local-api';
const props = defineProps<{
  kind: 'special_program' | CollectionKind;
  id: string;
}>();
const errorMessage = ref('');
const records = ref<CollectedAdmissionRecord[]>([]);
let generation = 0;
async function load() {
  const version = ++generation;
  errorMessage.value = '';
  records.value = [];
  try {
    const data = await localApi<CollectedAdmissionRecord[]>(
      `/collection/records/${props.kind}/${props.id}`,
    );
    if (version === generation) records.value = data;
  } catch (error) {
    if (version === generation)
      errorMessage.value =
        error instanceof Error ? error.message : '募集要项摘要暂未读取。';
  }
}
watch([() => props.kind, () => props.id], () => void load(), {
  immediate: true,
});
onBeforeUnmount(() => {
  generation++;
});
</script>
<template>
  <section v-if="records.length || errorMessage" class="collected-admissions">
    <header>
      <div>
        <span>ADMISSIONS / 官网收集</span>
        <h2>对应募集要项</h2>
      </div>
      <RouterLink
        :to="{
          path: '/japan-grad/collection',
          query: { job: records[0]?.jobId },
        }"
      >
        查看解析记录 ↗
      </RouterLink>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }} <Button size="small" @click="load">重试</Button>
    </p>
    <article v-for="(record, index) in records" :key="record.jobId">
      <details :open="index === 0">
        <summary>
          {{ ADMISSION_STATUS_NAMES[record.admissions.status] }} ·
          {{ new Date(record.appliedAt).toLocaleDateString() }}
        </summary>
        <p class="admissions-scope">
          {{ record.admissions.scope || '适用对象请结合原文核对。' }}
        </p>
        <p
          v-if="record.admissions.status === 'not_found'"
          class="admissions-warning"
        >
          本次尚未取得有效募集要项，申请信息仍需补充。
        </p>
        <p
          v-else-if="record.admissions.status === 'uncertain'"
          class="admissions-warning"
        >
          资料与目标的对应关系仍需核对，请留意研究科、学位、年度和选拔类别。
        </p>
        <p
          v-if="
            !record.admissions.fields.length &&
            record.admissions.status !== 'not_found'
          "
          class="admissions-scope"
        >
          尚未采纳摘要内容，可在原收集任务中查看资料。
        </p>
        <div class="admissions-summary-grid">
          <section v-for="field in record.admissions.fields" :key="field.field">
            <h3>
              {{ ADMISSION_SUMMARY_NAMES[field.field] || field.field
              }}<small v-if="field.requiresScopeConfirmation">已核对适用范围</small>
            </h3>
            <p>{{ field.value }}</p>
            <small v-if="field.scopeNote" class="admissions-scope">{{
              field.scopeNote
            }}</small>
            <div class="admissions-evidence">
              <a
                v-for="(e, i) in field.evidence"
                :key="i"
                :href="
                  record.pdfSourceIds.includes(e.sourceId)
                    ? `/api/japangrad/collection/jobs/${record.jobId}/sources/${e.sourceId}/file#page=${e.page}`
                    : e.url
                "
                :title="e.quote"
                target="_blank"
                rel="noopener noreferrer"
                >{{ e.title }} · 第 {{ e.page }} 页 ↗</a>
            </div>
          </section>
        </div>
        <div v-if="record.documents.length" class="admissions-originals">
          <strong>已取得的募集要项原件</strong><a
            v-for="doc in record.documents"
            :key="doc.sourceId"
            :href="`/api/japangrad/collection/jobs/${record.jobId}/sources/${doc.sourceId}/file`"
            target="_blank"
            rel="noopener noreferrer"
            >{{ doc.title }}{{ doc.year ? ` · ${doc.year}` : '' }} ↗</a>
        </div>
      </details>
    </article>
  </section>
</template>
<style scoped>
.collected-admissions {
  padding: 24px;
  margin: 28px 0;
  background: var(--jg-surface);
  border: 1px solid var(--jg-accent-line);
  border-top: 3px solid var(--jg-accent);
  border-radius: 12px;
}

.collected-admissions > header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.collected-admissions header span {
  font-size: 10px;
  color: var(--jg-accent-text);
  letter-spacing: 0.12em;
}

.collected-admissions h2 {
  margin: 9px 0 0;
  font-size: 23px;
}

.collected-admissions header > a,
.admissions-evidence a,
.admissions-originals a {
  font-size: 11px;
  color: var(--jg-accent-text);
  overflow-wrap: anywhere;
}

.collected-admissions details {
  padding-top: 15px;
  margin-top: 15px;
  border-top: 1px solid var(--jg-line);
}

.collected-admissions summary {
  font-size: 12px;
  color: var(--jg-secondary);
  cursor: pointer;
}

.admissions-scope {
  display: block;
  font-size: 12px;
  line-height: 1.9;
  color: var(--jg-muted);
  white-space: pre-wrap;
}

.admissions-warning {
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-warning);
  background: var(--jg-subtle);
  border-left: 3px solid var(--jg-warning);
}

.admissions-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 28px;
  margin-top: 20px;
}

.admissions-summary-grid > section {
  min-width: 0;
}

.admissions-summary-grid h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
}

.admissions-summary-grid h3 small {
  margin-left: 10px;
  font-size: 10px;
  font-weight: 400;
  color: var(--jg-success);
}

.admissions-summary-grid p {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.admissions-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 12px;
  margin-top: 8px;
}

.admissions-originals {
  display: grid;
  gap: 10px;
  padding-top: 18px;
  margin-top: 24px;
  border-top: 1px solid var(--jg-line);
}

.admissions-originals strong {
  font-size: 12px;
  font-weight: 500;
  color: var(--jg-secondary);
}

@media (max-width: 650px) {
  .collected-admissions {
    padding: 18px;
  }

  .admissions-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
