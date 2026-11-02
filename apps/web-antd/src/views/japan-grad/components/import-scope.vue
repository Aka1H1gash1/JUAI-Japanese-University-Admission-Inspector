<script setup lang="ts">
import { computed } from 'vue';
import { Radio, Select } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
const props = defineProps<{ schoolId?: string }>();
const scope = defineModel<string>('scope', { default: 'current' });
const selections = defineModel<string[]>('selections', { default: () => [] });
const store = useExplorerStore();
const options = computed(() =>
  store.majors
    .filter((m) => !props.schoolId || m.schoolId === props.schoolId)
    .map((m) => {
      const school = store.schools.find((s) => s.id === m.schoolId);
      const value = `${school?.name || ''} / ${m.name}`;
      return { value, label: value };
    }),
);
</script>
<template>
  <fieldset class="import-scope">
    <legend>导入哪些专攻？</legend>
    <Radio.Group v-model:value="scope"
      ><Radio value="current">仅本专攻</Radio
      ><Radio value="selected">同时导入其他专攻</Radio></Radio.Group
    >
    <template v-if="scope === 'selected'"
      ><Select
        v-model:value="selections"
        mode="tags"
        :options="options"
        :max-tag-count="3"
        placeholder="选择专攻，或输入 研究科 / 专攻 后按回车"
        aria-label="选择导入的研究科与专攻"
      /><small
        >最多另选 3 个。新名称请按“研究科 /
        专攻”填写；系统分别分析、建档，信息需核对后采纳。</small
      ></template
    >
  </fieldset>
</template>
<style scoped>
.import-scope {
  display: grid;
  gap: 12px;
  padding: 16px;
  margin: 18px 0;
  border: 1px solid var(--jg-line);
  border-radius: 10px;
}

.import-scope legend {
  width: auto;
  padding: 0 6px;
  font-size: 13px;
}

.import-scope :deep(.ant-select) {
  width: 100%;
}

.import-scope small {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}
</style>
