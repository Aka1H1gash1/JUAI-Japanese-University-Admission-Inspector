<script setup lang="ts">
import type { LabTarget } from '../lab-targets';

import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox } from 'ant-design-vue';

import { FLOW_STAGES } from '../application-flow-model';
import { useExplorerStore } from '../explorer';
import { universityLocation } from '../japan-geography';
import { annualBudgetText } from '../lab-targets';
import { localApi } from '../local-api';
import ExplorerIcon from './explorer-icon.vue';
import UniversityLogo from './university-logo.vue';

const props = defineProps<{
  target: LabTarget;
  selected: boolean;
  applications?: {
    id: string;
    lab_id: string;
    batch_id: null | string;
    workflow: { currentStage: null | string };
    materials: { complete: boolean }[];
  }[];
}>();
const emit = defineEmits<{ select: [id: string]; contact: [id: string] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const toggling = ref(false);
const applicationStages = computed(() =>
  (props.applications || []).filter(
    (row) => row.lab_id === props.target.lab.id,
  ),
);
const progress =
  ref<Array<{ id: string; material_count: number; completed_count: number }>>();
const progressError = ref(false);
watch(
  () => props.target.lab.id,
  async (id) => {
    progress.value = undefined;
    progressError.value = false;
    try {
      progress.value = await localApi(`/applications/labs/${id}`);
    } catch {
      progressError.value = true;
    }
  },
  { immediate: true },
);
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
          :catalog-id="target.university.catalogId"
          :logo-id="target.university.logoId"
          :name="target.university.name"
        />
        <div>
          <p>{{ target.university.name }} · {{ target.major.name }}</p>
          <h2>
            <RouterLink :to="`/japan-grad/applications/labs/${target.lab.id}`">
              {{ target.lab.name }}
            </RouterLink>
          </h2>
          <p class="journey-entry-research" :title="target.lab.research">
            {{ target.lab.research || '研究方向待补充' }}
          </p>
        </div>
      </div>
      <div class="journey-entry-stage">
        <span>申请阶段 · 按目标维护</span><template v-if="applicationStages.length">
          <RouterLink
            v-for="row in applicationStages"
            :key="row.id"
            :to="`/japan-grad/applications/labs/${target.lab.id}?target=${row.id}`"
          >
            <strong>{{
              FLOW_STAGES.find(
                (stage) => stage.id === row.workflow.currentStage,
              )?.label || '申请阶段未设置'
            }}</strong><small>{{ row.batch_id ? '独立招生批次' : '未指定批次' }} · 材料
              {{ row.materials.filter((m) => m.complete).length }} /
              {{ row.materials.length }} · 修改阶段 →</small>
          </RouterLink>
</template><RouterLink
          v-else
          :to="`/japan-grad/applications/labs/${target.lab.id}`"
        >
          建立 / 打开申请目标 →
        </RouterLink>
      </div>
      <RouterLink
        :to="`/japan-grad/applications/labs/${target.lab.id}`"
        class="journey-entry-materials"
      >
        <span>申请目标与材料</span><strong>{{
          progress
            ? `${progress.length} 个目标`
            : progressError
              ? '暂不可用'
              : '读取中'
        }}</strong><small v-if="progress">全部目标 {{ progress.reduce((n, t) => n + t.completed_count, 0) }}/{{
            progress.reduce((n, t) => n + t.material_count, 0)
          }}
          项完成 · 按批次查看 →</small>
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
          :to="`/japan-grad/applications/labs/${target.lab.id}`"
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
</Button><RouterLink :to="`/japan-grad/applications/labs/${target.lab.id}`">
          材料
</RouterLink><RouterLink :to="`/japan-grad/applications/labs/${target.lab.id}`">
          待办
        </RouterLink>
      </nav>
    </div>
  </article>
</template>
