<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import { geographySearchTerms } from '../japan-geography';
import { labContext } from '../lab-targets';
import { vAccessibleSelect } from '../select-accessibility';
import ExplorerIcon from './explorer-icon.vue';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ added: [count: number] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const query = ref('');
const universityId = ref('');
const selected = ref<string[]>([]);
const saving = ref(false);
const feedback = ref('');
const targets = computed(() =>
  store.labs.flatMap((lab) => {
    const target = labContext(store, lab.id);
    return target ? [target] : [];
  }),
);
const universityOptions = computed(() =>
  store.universities
    .filter((item) =>
      targets.value.some((target) => target.university.id === item.id),
    )
    .map((item) => ({ label: item.name, value: item.id })),
);
const visible = computed(() =>
  targets.value
    .filter(
      (target) =>
        (!universityId.value || target.university.id === universityId.value) &&
        [
          target.lab.name,
          target.lab.japaneseName,
          target.lab.research,
          target.university.name,
          target.school.name,
          target.major.name,
          ...geographySearchTerms(target.university),
          ...target.professors.flatMap((person) => [
            person.name,
            person.japaneseName,
          ]),
        ].some((value) =>
          value.toLowerCase().includes(query.value.trim().toLowerCase()),
        ),
    )
    .toSorted(
      (a, b) =>
        Number(a.lab.wantApply) - Number(b.lab.wantApply) ||
        a.university.name.localeCompare(b.university.name, 'zh-CN') ||
        a.lab.name.localeCompare(b.lab.name, 'zh-CN'),
    ),
);
const available = computed(() =>
  visible.value.filter((item) => !item.lab.wantApply),
);
const selectedVisible = computed(
  () =>
    available.value.filter((item) => selected.value.includes(item.lab.id))
      .length,
);
const allSelected = computed(
  () =>
    available.value.length > 0 &&
    selectedVisible.value === available.value.length,
);

watch(open, (value) => {
  if (!value) return;
  query.value = '';
  universityId.value = '';
  selected.value = [];
  feedback.value = '';
});
watch(
  () =>
    targets.value
      .filter((item) => !item.lab.wantApply)
      .map((item) => item.lab.id),
  (ids) => {
    selected.value = selected.value.filter((id) => ids.includes(id));
  },
);
function toggle(id: string) {
  if (saving.value) return;
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}
function toggleAll() {
  if (saving.value) return;
  const ids = new Set(available.value.map((item) => item.lab.id));
  selected.value = allSelected.value
    ? selected.value.filter((id) => !ids.has(id))
    : [...new Set([...selected.value, ...ids])];
}
async function add() {
  if (saving.value || !selected.value.length) return;
  saving.value = true;
  feedback.value = '';
  try {
    const count = await store.addJourneyLabs([...selected.value]);
    open.value = false;
    emit('added', count);
    message.success(
      count ? `已将 ${count} 个研究室加入修考之路` : '所选研究室已在修考之路中',
    );
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '加入失败，请重试。';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    title="新增研究室到修考之路"
    :width="820"
    :footer="null"
    :mask-closable="!saving"
    :keyboard="!saving"
    :closable="!saving"
    class="journey-lab-picker"
  >
    <p class="comparison-intro">
      从已整理的研究室中直接选择，支持一次加入多个。已加入的研究室不会重复添加。
    </p>
    <div class="journey-picker-toolbar">
      <Input
        v-model:value="query"
        allow-clear
        :disabled="saving"
        placeholder="搜索研究室、研究方向、专攻或老师"
        aria-label="搜索可添加的研究室"
        ><template #prefix><ExplorerIcon name="search" /></template
      ></Input>
      <Select
        v-accessible-select
        :value="universityId || undefined"
        :disabled="saving"
        :options="universityOptions"
        allow-clear
        placeholder="全部大学"
        aria-label="按大学筛选研究室"
        @change="universityId = typeof $event === 'string' ? $event : ''"
      />
    </div>
    <div class="journey-picker-caption">
      <Checkbox
        :checked="allSelected"
        :indeterminate="selectedVisible > 0 && !allSelected"
        :disabled="saving || !available.length"
        @change="toggleAll"
        >全选当前结果</Checkbox
      ><span
        >{{ visible.length }} 个研究室 · {{ available.length }} 个可新增</span
      >
    </div>
    <div
      v-if="visible.length"
      class="journey-picker-list"
      aria-label="研究室选择列表"
    >
      <Checkbox
        v-for="target in visible"
        :key="target.lab.id"
        class="journey-picker-option"
        :class="{
          'is-picked': selected.includes(target.lab.id),
          'is-added': target.lab.wantApply,
        }"
        :checked="target.lab.wantApply || selected.includes(target.lab.id)"
        :disabled="saving || target.lab.wantApply"
        :aria-label="`${target.lab.name}，${target.university.name}，${target.major.name}${target.lab.wantApply ? '，已在修考之路' : ''}`"
        @change="toggle(target.lab.id)"
      >
        <span class="journey-picker-identity"
          ><span class="journey-picker-name"
            ><strong>{{ target.lab.name }}</strong
            ><span v-if="target.lab.wantApply" class="journey-picker-added"
              >已在修考之路</span
            ></span
          ><span class="journey-picker-affiliation"
            >{{ target.university.name }} / {{ target.school.name }} /
            {{ target.major.name }}</span
          ><span class="journey-picker-research">{{
            target.lab.research || '研究方向待补充'
          }}</span
          ><span
            v-if="target.professors.length"
            class="journey-picker-affiliation"
            >老师：{{
              target.professors.map((item) => item.name).join('、')
            }}</span
          ></span
        >
      </Checkbox>
    </div>
    <div v-else class="journey-picker-empty">
      <ExplorerIcon name="search" />
      <h3>
        {{ targets.length ? '没有找到相关研究室' : '还没有可选的研究室' }}
      </h3>
      <p>
        {{
          targets.length
            ? '试试其他关键词，或切换大学筛选。'
            : '先建立研究室资料，之后就能在这里统一选择。'
        }}
      </p>
      <Button
        v-if="targets.length"
        @click="
          query = '';
          universityId = '';
        "
        >清除筛选</Button
      >
    </div>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <div class="journey-picker-footer">
      <span aria-live="polite">已选 {{ selected.length }} 个研究室</span
      ><Button :disabled="saving" @click="open = false">取消</Button
      ><Button
        type="primary"
        :disabled="!selected.length"
        :loading="saving"
        @click="add"
        >加入修考之路{{
          selected.length ? `（${selected.length}）` : ''
        }}</Button
      >
    </div>
  </Modal>
</template>
