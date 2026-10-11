<script setup lang="ts">
import { computed } from 'vue';
import { Modal } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import { labContext, labPath } from '../lab-targets';
import ProfessorContact from './professor-contact.vue';
const props = defineProps<{ labId: string }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const target = computed(() => labContext(store, props.labId));
</script>
<template>
  <Modal
    v-model:open="open"
    :title="target ? `${target.lab.name} · 教授联络` : '教授联络'"
    :width="840"
    :footer="null"
    :destroy-on-close="true"
    :body-style="{ maxHeight: '72vh', overflowY: 'auto' }"
    :mask-closable="!store.saving"
    :closable="!store.saving"
    :keyboard="!store.saving"
    ><template v-if="target"
      ><ProfessorContact :lab-id="labId" @saved="open = false" /><RouterLink
        v-if="!target.professors.length"
        :to="labPath(target)"
        class="back-link"
        @click="open = false"
        >进入研究室添加老师 →</RouterLink
      ></template
    ></Modal
  >
</template>
