<script setup lang="ts">
import type { AnalysisRecord } from '../explorer';

import { computed } from 'vue';

import { Timeline } from 'ant-design-vue';

import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{
  history: AnalysisRecord[];
  majorId: string;
}>();

const sortedHistory = computed(() =>
  [...props.history].sort(
    (a, b) => new Date(b.adoptedAt).getTime() - new Date(a.adoptedAt).getTime(),
  ),
);

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPages(pages: number[]) {
  if (!pages || pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  if (sorted.length === 1) return `p.${sorted[0]}`;
  if (sorted.length <= 3) return `p.${sorted.join(', ')}`;
  return `p.${sorted[0]}-${sorted[sorted.length - 1]}`;
}

function getFieldLabel(key: string) {
  const labels: Record<string, string> = {
    applicationStart: '出愿开始',
    applicationEnd: '出愿截止',
    applicationMaterials: '出愿材料',
    languageRequirements: '语言要求',
    examRecords: '考试信息',
  };
  return labels[key] || key;
}
</script>

<template>
  <section class="analysis-history">
    <header class="section-header">
      <h3><ExplorerIcon name="clock" />数据来源</h3>
    </header>

    <div v-if="sortedHistory.length === 0" class="empty-state">
      <p>暂无数据来源记录</p>
    </div>

    <Timeline v-else class="history-timeline">
      <Timeline.Item v-for="record in sortedHistory" :key="record.id">
        <div class="history-item">
          <div class="history-header">
            <strong>{{ record.documentTitle }}</strong>
            <span class="history-date">{{ formatDate(record.adoptedAt) }}</span>
          </div>

          <div class="history-fields">
            <span
              v-for="(field, key) in record.fields"
              :key="key"
              class="field-badge"
            >
              {{ getFieldLabel(String(key)) }}
              <small
                v-if="
                  field &&
                  !Array.isArray(field) &&
                  field.pages &&
                  field.pages.length
                "
              >
                {{ formatPages(field.pages) }}
              </small>
            </span>

            <template v-if="Array.isArray(record.fields.examRecords)">
              <span
                v-for="exam in record.fields.examRecords"
                :key="exam.recordId"
                class="field-badge"
              >
                {{ exam.year }} 年
                <small v-if="exam.pages && exam.pages.length">
                  {{ formatPages(exam.pages) }}
                </small>
              </span>
            </template>
          </div>
        </div>
      </Timeline.Item>
    </Timeline>
  </section>
</template>

<style scoped>
.analysis-history {
  padding: 20px;
  margin-top: 24px;
  background: var(--color-bg-container);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.section-header h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.empty-state {
  padding: 32px 20px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.history-timeline {
  margin-top: 16px;
}

.history-item {
  padding-bottom: 8px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.history-header strong {
  font-size: 14px;
  color: var(--color-text);
}

.history-date {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.history-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-badge {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-layout);
  border-radius: 4px;
}

.field-badge small {
  color: var(--color-text-tertiary);
}
</style>
