<script setup lang="ts">
import { computed } from 'vue';

import { Modal } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import { labContext, labPath } from '../lab-targets';

const props = defineProps<{ labId: string; professorId?: string }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const target = computed(() => labContext(store, props.labId));
</script>
<template>
  <Modal
    v-model:open="open"
    :title="target ? `${target.lab.name} · 考学经历` : '考学经历'"
    :width="1160"
    :footer="null"
    :destroy-on-close="true"
    :body-style="{ maxHeight: '72vh', overflowY: 'auto' }"
    :mask-closable="!store.saving"
    :closable="!store.saving"
    :keyboard="!store.saving"
  >
    <template v-if="target">
      <RouterLink
        :to="`/japan-grad/applications/labs/${labId}`"
        @click="open = false"
      >
        打开联络与邮件工作区 →
</RouterLink><RouterLink
        v-if="!target.professors.length"
        :to="labPath(target)"
        class="back-link"
        @click="open = false"
      >
        进入研究室添加老师 →
      </RouterLink>
    </template>
  </Modal>
</template>
