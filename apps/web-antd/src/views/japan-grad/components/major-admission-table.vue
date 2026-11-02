<script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '../explorer';
const props = defineProps<{ majorId: string }>();
const store = useExplorerStore();
const major = computed(() => store.majors.find((m) => m.id === props.majorId));
const labs = computed(() =>
  store.labs.filter((l) => l.majorId === props.majorId),
);
</script>
<template>
  <section v-if="major" class="admission-table-panel">
    <header>
      <h2>专攻招生信息</h2>
      <RouterLink :to="`/japan-grad/analysis/${majorId}`"
        >智能导入募集要项 ↗</RouterLink
      >
    </header>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>考试年份 / 批次</th>
            <th>考试科目</th>
            <th>笔试</th>
            <th>面试</th>
            <th>放榜</th>
            <th>特殊要求 / 备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="exam in major.examHistory" :key="exam.id">
            <td>{{ exam.year }} {{ exam.session }}</td>
            <td>{{ exam.subjects || '待补充' }}</td>
            <td>{{ exam.writtenDate || exam.examDate || '待补充' }}</td>
            <td>{{ exam.interviewDate || '待补充' }}</td>
            <td>{{ exam.resultDate || '待补充' }}</td>
            <td>{{ exam.notes || '—' }}</td>
          </tr>
          <tr v-if="!major.examHistory.length">
            <td colspan="6">
              暂无考试记录，可通过募集要项分析或下方手动录入补充。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <dl>
      <div>
        <dt>出愿时间</dt>
        <dd>
          {{ major.applicationStart || '待补充' }} —
          {{ major.applicationEnd || '待补充' }}
        </dd>
      </div>
      <div>
        <dt>语言要求</dt>
        <dd>{{ major.languageRequirements || '待补充' }}</dd>
      </div>
      <div>
        <dt>出愿材料</dt>
        <dd>{{ major.applicationMaterials || '待补充' }}</dd>
      </div>
    </dl>
    <div
      v-for="lab in labs.filter((l) => l.examNotes || l.applicationNotes)"
      :key="lab.id"
      class="lab-requirement"
    >
      <strong>{{ lab.name }}</strong>
      <p>{{ lab.examNotes }}</p>
      <p>{{ lab.applicationNotes }}</p>
    </div>
  </section>
</template>
<style scoped>
.admission-table-panel {
  padding: 22px;
  margin: 28px 0;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}

header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

h2 {
  font-size: 21px;
}

a {
  font-size: 13px;
  color: var(--jg-accent-text);
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  margin-top: 16px;
  font-size: 13px;
  border-collapse: collapse;
}

th,
td {
  min-width: 100px;
  padding: 14px;
  vertical-align: top;
  text-align: left;
  white-space: pre-wrap;
  border-bottom: 1px solid var(--jg-line);
}

th {
  background: var(--jg-subtle);
}

dl > div {
  display: grid;
  grid-template-columns: 100px 1fr;
  padding: 12px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--jg-line);
}

dd {
  margin: 0;
  white-space: pre-wrap;
}

.lab-requirement {
  padding: 12px 0;
  font-size: 13px;
}
</style>
