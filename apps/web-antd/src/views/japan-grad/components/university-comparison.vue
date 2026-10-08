<script setup lang="ts">
import { computed } from 'vue';

import { Button, Modal } from 'ant-design-vue';

import { useExplorerStore, websiteUrl } from '../explorer';

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
  { label: '所在地', values: universities.value.map((item) => item.location) },
  {
    label: '大学类型',
    values: universities.value.map((item) => item.category),
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
                >访问官网 ↗</a><span v-else class="not-filled">尚未填写</span>
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
