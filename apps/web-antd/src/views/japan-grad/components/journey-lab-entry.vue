<script setup lang="ts">
import type { LabTarget } from '../lab-targets';

import { computed, ref } from 'vue';

import { App, Button, Checkbox } from 'ant-design-vue';

import { materialProgress, primaryProfessor } from '../application-planning';
import { useExplorerStore } from '../explorer';
import { universityLocation } from '../japan-geography';
import { annualBudgetText, labPath } from '../lab-targets';
import { APPLICATION_STAGES, applicationStage } from '../overview-progress';
import ExplorerIcon from './explorer-icon.vue';
import UniversityLogo from './university-logo.vue';

const props = defineProps<{ target: LabTarget; selected: boolean }>();
const emit = defineEmits<{ select: [id: string]; contact: [id: string] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const toggling = ref(false);
const stage = computed(() => applicationStage(props.target));
const materials = computed(() => materialProgress(props.target.lab.tasks));
const professor = computed(() => primaryProfessor(props.target));
async function removeTarget() {
  if (toggling.value) return;
  toggling.value = true;
  try {
    await store.toggleWantApply(props.target.lab.id);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '更新失败，请重试。',
    );
  } finally {
    toggling.value = false;
  }
}
</script>

<template>
  <article class="journey-directory-entry" :class="{ 'is-selected': selected }">
    <div class="journey-entry-main">
      <Checkbox
        class="directory-compare"
        :checked="selected"
        :aria-label="`加入对比：${target.lab.name}`"
        @change="emit('select', target.lab.id)"
      />
      <div class="directory-identity">
        <UniversityLogo
          :logo-id="target.university.logoId"
          :name="target.university.name"
        />
        <div>
          <p>{{ target.university.name }} · {{ target.major.name }}</p>
          <h2>
            <RouterLink :to="labPath(target)">{{ target.lab.name }}</RouterLink>
          </h2>
          <p class="journey-entry-research" :title="target.lab.research">
            {{ target.lab.research || '研究方向待补充' }}
          </p>
        </div>
      </div>
      <div class="journey-entry-stage">
        <span>当前阶段</span><strong>{{ APPLICATION_STAGES[stage.index] }}</strong>
        <div
          class="journey-stage-track"
          :aria-label="`${target.lab.name}：${stage.label}`"
        >
          <i
            v-for="(label, index) in APPLICATION_STAGES"
            :key="label"
            :class="{
              'is-reached': stage.reached[index],
              'is-current': stage.index === index,
            }"
            :title="label"
          ></i>
        </div>
        <small>{{ stage.label }}{{ professor ? ` · ${professor.name}` : '' }}</small>
      </div>
      <RouterLink
        :to="`${labPath(target)}?tab=materials`"
        class="journey-entry-materials"
        >
<span>材料准备</span><strong>{{
          materials.count ? `${materials.percent}%` : '未建清单'
        }}</strong><meter
          min="0"
          max="100"
          :value="materials.percent"
          :aria-label="`${target.lab.name}材料准备进度`"
        ></meter><small>{{ materials.done }}/{{ materials.count }} 项</small>
</RouterLink>
      <div class="journey-entry-intent">
        <Button
          type="text"
          :loading="toggling"
          :aria-label="`移出想考：${target.lab.name}`"
          @click="removeTarget"
          >
<ExplorerIcon name="heart" />
</Button><RouterLink
          :to="labPath(target)"
          :aria-label="`查看${target.lab.name}研究室详情`"
          >
<ExplorerIcon name="chevron" />
</RouterLink>
      </div>
    </div>
    <div class="journey-entry-bottom">
      <div>
        <span>{{
          universityLocation(target.university) || '所在地待补充'
        }}</span><span>{{ annualBudgetText(target.university) }}</span>
      </div>
      <nav :aria-label="`${target.lab.name}快捷操作`">
        <Button type="text" @click="emit('contact', target.lab.id)">
考学经历
</Button><RouterLink :to="`${labPath(target)}?tab=materials`">材料</RouterLink><RouterLink :to="`${labPath(target)}?tab=todos`">待办</RouterLink>
      </nav>
    </div>
  </article>
</template>
