<script setup lang="ts">
import type { LabMembers } from '../foundation-types';

import { computed, ref, watch } from 'vue';

import { Button, Input, InputNumber, Modal } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import EmptyState from '../design-system/empty-state.vue';
import { websiteUrl } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
const props = defineProps<{ labId: string }>();
const empty = (): LabMembers => ({
  version: 0,
  japanese: null,
  foreign: null,
  chinese: null,
  total: null,
  otherForeign: null,
  sourceUrl: '',
  notes: '',
});
const busy = ref(false);
const draft = ref(empty());
const errorMessage = ref('');
const open = ref(false);
const value = ref(empty());
const api = () => `/foundation/labs/${encodeURIComponent(props.labId)}/members`;
async function load() {
  try {
    value.value = await localApi<LabMembers>(api());
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '成员人数读取失败';
  }
}
watch(
  () => props.labId,
  () => {
    value.value = empty();
    void load();
  },
  { immediate: true },
);
function edit() {
  draft.value = { ...value.value };
  open.value = true;
  errorMessage.value = '';
}
async function save() {
  busy.value = true;
  try {
    value.value = await localApi<LabMembers>(
      api(),
      jsonOptions('PUT', draft.value),
    );
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    busy.value = false;
  }
}
const segments = computed(() => [
  {
    label: '日本学生',
    value: value.value.japanese,
    color: 'var(--jg-accent-text)',
  },
  {
    label: '中国学生',
    value: value.value.chinese,
    color: 'var(--jg-mint-text)',
  },
  {
    label: '其他外国学生',
    value: value.value.otherForeign,
    color: 'var(--jg-muted)',
  },
]);
const chartReady = computed(
  () =>
    value.value.total !== null &&
    value.value.total > 0 &&
    value.value.chinese !== null,
);
</script>
<template>
  <ContentSection title="成员构成">
    <template #actions>
      <Button size="small" @click="edit">编辑人数</Button>
    </template>
    <p v-if="errorMessage && !open" class="form-error" role="alert">
      {{ errorMessage }}<Button size="small" @click="load">重试</Button>
    </p>
    <EmptyState
      v-if="
        value.japanese === null &&
        value.foreign === null &&
        value.chinese === null
      "
      title="暂无可靠的成员人数"
      icon="user"
      description="未知人数留空，仅记录已核实的信息。"
    />
    <template v-else>
      <div
        v-if="chartReady"
        class="member-bar"
        role="img"
        :aria-label="segments.map((s) => `${s.label}${s.value}人`).join('，')"
      >
        <span
          v-for="segment in segments"
          :key="segment.label"
          :style="{
            width: `${((segment.value || 0) / (value.total || 1)) * 100}%`,
            background: segment.color,
          }"
        ></span>
      </div>
      <dl class="member-counts">
        <div>
          <dt>日本学生</dt>
          <dd>{{ value.japanese ?? '未确认' }}</dd>
        </div>
        <div>
          <dt>外国学生</dt>
          <dd>{{ value.foreign ?? '未确认' }}</dd>
        </div>
        <div>
          <dt>其中中国学生</dt>
          <dd>{{ value.chinese ?? '未确认' }}</dd>
        </div>
        <div>
          <dt>总人数</dt>
          <dd>{{ value.total ?? '未确认' }}</dd>
        </div>
      </dl>
    </template>
    <p v-if="value.notes" class="juai-prose">{{ value.notes }}</p>
    <a
      v-if="websiteUrl(value.sourceUrl)"
      class="juai-link-row"
      :href="websiteUrl(value.sourceUrl)"
      target="_blank"
      rel="noopener noreferrer"
      >成员信息来源 ↗</a>
    <Modal
      v-model:open="open"
      title="编辑成员人数"
      :footer="null"
      :closable="!busy"
      :mask-closable="!busy"
    >
      <form class="member-editor" @submit.prevent="save">
        <p>中国学生包含在外国学生中。未确认的数据请留空。</p>
        <label>日本学生<InputNumber
            :value="draft.japanese ?? undefined"
            @change="(v) => (draft.japanese = typeof v === 'number' ? v : null)"
            :min="0"
            :max="1000000"
            :precision="0"
            :disabled="busy"
            placeholder="未知"
/></label><label>外国学生<InputNumber
            :value="draft.foreign ?? undefined"
            @change="(v) => (draft.foreign = typeof v === 'number' ? v : null)"
            :min="0"
            :max="1000000"
            :precision="0"
            :disabled="busy"
            placeholder="未知"
/></label><label>其中中国学生<InputNumber
            :value="draft.chinese ?? undefined"
            @change="(v) => (draft.chinese = typeof v === 'number' ? v : null)"
            :min="0"
            :max="1000000"
            :precision="0"
            :disabled="busy"
            placeholder="未知"
/></label><label>来源网址<Input
            v-model:value="draft.sourceUrl"
            :maxlength="2048"
            :disabled="busy"
/></label><label>备注<Input.TextArea
            v-model:value="draft.notes"
            :maxlength="4000"
            :disabled="busy"
        /></label>
        <p v-if="errorMessage" class="form-error" role="alert">
          {{ errorMessage }}
        </p>
        <footer>
          <Button :disabled="busy" @click="open = false">取消</Button><Button type="primary" html-type="submit" :loading="busy">
            保存人数
          </Button>
        </footer>
      </form>
    </Modal>
  </ContentSection>
</template>
<style scoped>
.member-bar {
  display: flex;
  height: 10px;
  margin-bottom: 20px;
  overflow: hidden;
  border-radius: 5px;
}

.member-counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 0 0 16px;
}

.member-counts dt {
  font-size: 11px;
  color: var(--jg-muted);
}

.member-counts dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 500;
}

.member-editor {
  display: grid;
  gap: 16px;
  padding-top: 16px;
}

.member-editor p {
  font-size: 12px;
  color: var(--jg-muted);
}

.member-editor label {
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.member-editor footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
