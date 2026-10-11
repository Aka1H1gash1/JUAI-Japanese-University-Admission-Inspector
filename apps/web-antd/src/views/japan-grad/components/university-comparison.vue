<script setup lang="ts">
import { computed } from 'vue';

import { Button, Modal } from 'ant-design-vue';

import { useExplorerStore, websiteUrl } from '../explorer';
import { universityGeography } from '../japan-geography';
import UniversityLogo from './university-logo.vue';
import {
  formatYen,
  dormitoryLabel,
  universityFees,
  universityBudgetTotals,
} from '../university-fees';

const props = defineProps<{ ids: string[] }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const universities = computed(() =>
  props.ids.flatMap((id) => {
    const item = store.universities.find((university) => university.id === id);
    return item ? [item] : [];
  }),
);
const rows = computed(() => [
  {
    label: '日文名称',
    values: universities.value.map((item) => item.japaneseName),
  },
  {
    label: 'QS 排名',
    values: universities.value.map((item) =>
      [item.qsRank, item.qsYear && `${item.qsYear} 年榜单`]
        .filter(Boolean)
        .join(' / '),
    ),
  },
  {
    label: '所在地域',
    values: universities.value.map((item) => universityGeography(item).region),
  },
  {
    label: '都道府县',
    values: universities.value.map(
      (item) => universityGeography(item).prefecture,
    ),
  },
  {
    label: '具体所在地',
    values: universities.value.map((item) => item.location),
  },
  {
    label: '大学类型',
    values: universities.value.map((item) => item.category),
  },
  {
    label: '入学金（仅第一年）',
    values: universities.value.map((item) => {
      const value = universityFees(item).admissionFee;
      return value !== '' ? `¥ ${formatYen(value)}` : '';
    }),
  },
  {
    label: '年度学费',
    values: universities.value.map((item) => {
      const value = universityFees(item).annualTuition;
      return value !== '' ? `¥ ${formatYen(value)} / 年` : '';
    }),
  },
  {
    label: '房租 / 寮费（月）',
    values: universities.value.map((item) =>
      item.monthlyRent !== '' ? `¥ ${formatYen(item.monthlyRent)} / 月` : '',
    ),
  },
  {
    label: '生活费（月，不含房租）',
    values: universities.value.map((item) =>
      item.monthlyLivingExpenses !== ''
        ? `¥ ${formatYen(item.monthlyLivingExpenses)} / 月`
        : '',
    ),
  },
  {
    label: '寮申请',
    values: universities.value.map((item) =>
      dormitoryLabel(item.dormitoryStatus),
    ),
  },
  {
    label: '寮申请条件 / 备注',
    values: universities.value.map((item) => item.dormitoryNotes),
  },
  {
    label: '首年总费用',
    values: universities.value.map((item) => {
      const budget = universityBudgetTotals(item);
      return budget.firstYear !== ''
        ? `¥ ${formatYen(budget.firstYear)}${budget.complete ? '' : `\n已知费用，待补${budget.missingFields.join('、')}`}`
        : '';
    }),
  },
  {
    label: '两年总费用',
    values: universities.value.map((item) => {
      const budget = universityBudgetTotals(item);
      return budget.twoYears !== ''
        ? `¥ ${formatYen(budget.twoYears)}${budget.complete ? '' : `\n已知费用，待补${budget.missingFields.join('、')}`}`
        : '';
    }),
  },
  {
    label: '费用备注',
    values: universities.value.map((item) => item.feeNotes),
  },
  {
    label: '已整理研究科',
    values: universities.value.map((item) =>
      store
        .schoolsFor(item.id)
        .map((school) => school.name)
        .join('\n'),
    ),
  },
  {
    label: '已整理研究室',
    values: universities.value.map((item) =>
      store
        .universityLabs(item.id)
        .map((lab) => `${lab.name}${lab.wantApply ? '（想考）' : ''}`)
        .join('\n'),
    ),
  },
  {
    label: '已整理专攻',
    values: universities.value.map((item) =>
      store
        .universityMajors(item.id)
        .map((major) => {
          const school = store.schools.find(
            (school) => school.id === major.schoolId,
          );
          return `${school?.name ?? ''} / ${major.name}`;
        })
        .join('\n'),
    ),
  },
  {
    label: '研究领域',
    values: universities.value.map((item) =>
      [
        ...store
          .schoolsFor(item.id)
          .map((school) => school.research)
          .filter(Boolean),
        ...store
          .universityMajors(item.id)
          .map((major) => major.research)
          .filter(Boolean),
      ].join('\n'),
    ),
  },
  {
    label: '已记录老师',
    values: universities.value.map(
      (item) => `${store.universityProfessors(item.id).length} 位`,
    ),
  },
  {
    label: '心仪老师',
    values: universities.value.map((item) =>
      store
        .universityProfessors(item.id)
        .filter((professor) => professor.favorite)
        .map((professor) => professor.name)
        .join('\n'),
    ),
  },
  { label: '个人备注', values: universities.value.map((item) => item.notes) },
]);
</script>

<template>
  <Modal
    v-model:open="open"
    title="大学横向对比"
    :width="1100"
    :footer="null"
    class="explorer-comparison-modal"
  >
    <p class="comparison-intro">
      把你整理的信息放在一起，比较学校环境与感兴趣的研究方向。
    </p>
    <div class="comparison-scroll">
      <table class="comparison-table">
        <thead>
          <tr>
            <th>比较项</th>
            <th v-for="item in universities" :key="item.id">
              <RouterLink
                :to="`/japan-grad/universities/${item.id}`"
                @click="open = false"
              >
                <UniversityLogo :logo-id="item.logoId" :name="item.name" />
                {{ item.name }}
              </RouterLink>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <th>{{ row.label }}</th>
            <td v-for="(value, index) in row.values" :key="index">
              <span :class="{ 'not-filled': !value }">{{
                value || '尚未填写'
              }}</span>
            </td>
          </tr>
          <tr>
            <th>官网</th>
            <td v-for="item in universities" :key="item.id">
              <a
                v-if="websiteUrl(item.website)"
                :href="websiteUrl(item.website)"
                target="_blank"
                rel="noopener noreferrer"
                >访问官网 ↗</a
              ><span v-else class="not-filled">尚未填写</span>
            </td>
          </tr>
          <tr>
            <th></th>
            <td v-for="item in universities" :key="item.id">
              <RouterLink
                :to="`/japan-grad/universities/${item.id}`"
                @click="open = false"
              >
                查看研究科 →
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="comparison-footer">
      <Button @click="open = false">完成对比</Button>
    </div>
  </Modal>
</template>
