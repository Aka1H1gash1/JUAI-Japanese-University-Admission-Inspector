<script setup lang="ts">
import { computed } from 'vue';
import { App, Button, Checkbox, Progress } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import { annualBudgetText, labContext, labPath } from '../lab-targets';
import { universityLocation } from '../japan-geography';
import ExplorerIcon from './explorer-icon.vue';
import ContactStatus from './contact-status.vue';
import { primaryProfessor, materialProgress } from '../application-planning';

const props = defineProps<{
  labId: string;
  showAffiliation?: boolean;
  selectable?: boolean;
  selected?: boolean;
}>();
const emit = defineEmits<{
  edit: [id: string];
  select: [id: string];
  contact: [id: string];
}>();
const store = useExplorerStore();
const { message } = App.useApp();
const target = computed(() => labContext(store, props.labId));
async function toggle() {
  try {
    await store.toggleWantApply(props.labId);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '保存失败，请重试。',
    );
  }
}
</script>

<template>
  <article
    v-if="target"
    class="research-lab-card"
    :class="{ 'is-selected': selected }"
  >
    <RouterLink
      :to="labPath(target)"
      class="research-lab-card-link"
      :aria-label="`查看${target.lab.name}研究室详情`"
    />
    <div class="research-lab-card-top">
      <span class="entity-symbol"><ExplorerIcon name="book" /></span>
      <Button
        class="icon-button lab-intent-button"
        :class="{ 'is-wanted': target.lab.wantApply }"
        :aria-pressed="target.lab.wantApply"
        :loading="store.saving"
        @click="toggle"
        ><ExplorerIcon :name="target.lab.wantApply ? 'check' : 'plus'" />{{
          target.lab.wantApply ? '已标记想考' : '想考'
        }}</Button
      >
    </div>
    <p v-if="showAffiliation" class="lab-affiliation">
      {{ target.university.name }} · {{ target.major.name }}
    </p>
    <h3>{{ target.lab.name }}</h3>
    <p v-if="target.lab.japaneseName" class="secondary-name">
      {{ target.lab.japaneseName }}
    </p>
    <div class="professor-research">
      <span>研究方向</span>
      <p>{{ target.lab.research || '研究方向待补充' }}</p>
    </div>
    <p class="lab-teachers">
      <ExplorerIcon name="user" />{{
        target.professors.map((item) => item.name).join('、') || '老师待添加'
      }}
    </p>
    <template v-if="showAffiliation">
      <p class="lab-affiliation">
        <ExplorerIcon name="pin" />{{
          universityLocation(target.university) || '所在地待补充'
        }}<span v-if="target.university.qsRank">
          · QS {{ target.university.qsRank }}</span
        >
      </p>
      <p class="lab-budget">{{ annualBudgetText(target.university) }}</p>
    </template>
    <div class="planner-card-status">
      <span class="planner-muted"
        >联系状态 · {{ primaryProfessor(target)?.name || '老师待添加' }}</span
      ><ContactStatus :contact="primaryProfessor(target)?.contact" />
    </div>
    <div
      v-if="showAffiliation || target.lab.tasks?.length"
      class="planner-card-material"
    >
      <span
        >材料准备
        <strong>{{
          materialProgress(target.lab.tasks).count
            ? `${materialProgress(target.lab.tasks).percent}%`
            : '未建清单'
        }}</strong></span
      ><Progress
        :percent="materialProgress(target.lab.tasks).percent"
        :show-info="false"
        size="small"
        :stroke-color="'var(--jg-accent)'"
      />
    </div>
    <div v-if="showAffiliation" class="planner-card-links">
      <Button
        type="text"
        :disabled="store.saving"
        @click="emit('contact', labId)"
        >考学经历</Button
      ><RouterLink :to="`${labPath(target)}?tab=tasks`"
        >材料与待办 →</RouterLink
      >
    </div>
    <p v-if="target.lab.notes" class="card-notes">{{ target.lab.notes }}</p>
    <div class="research-lab-card-bottom">
      <Checkbox
        v-if="selectable"
        :checked="selected"
        :aria-label="`加入对比：${target.lab.name}`"
        @change="emit('select', labId)"
        >加入对比</Checkbox
      >
      <span v-else>{{ target.professors.length }} 位老师</span>
      <Button
        v-if="!showAffiliation"
        type="text"
        :aria-label="`编辑研究室：${target.lab.name}`"
        @click="emit('edit', labId)"
        ><ExplorerIcon name="edit"
      /></Button>
      <span v-else class="lab-card-arrow"><ExplorerIcon name="arrow" /></span>
    </div>
  </article>
</template>
