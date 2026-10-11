<script setup lang="ts">
import type { MajorAdmissionFields } from '../major-admissions';
import { computed, ref } from 'vue';
import { App, Button, Input, Modal } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import { admissionRangeError } from '../major-admissions';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{ majorId: string }>();
const store = useExplorerStore();
const { message } = App.useApp();
const major = computed(() =>
  store.majors.find((item) => item.id === props.majorId),
);
const materials = computed(() =>
  (major.value?.applicationMaterials ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);
const open = ref(false);
const feedback = ref('');
const form = ref<MajorAdmissionFields>({
  applicationStart: '',
  applicationEnd: '',
  applicationMaterials: '',
});
function edit() {
  if (!major.value) return;
  form.value = {
    applicationStart: major.value.applicationStart,
    applicationEnd: major.value.applicationEnd,
    applicationMaterials: major.value.applicationMaterials,
  };
  feedback.value = '';
  open.value = true;
}
async function save() {
  if (store.saving) return;
  const input = {
    applicationStart: form.value.applicationStart.trim(),
    applicationEnd: form.value.applicationEnd.trim(),
    applicationMaterials: form.value.applicationMaterials.trim(),
  };
  feedback.value = admissionRangeError(input);
  if (feedback.value) return;
  try {
    await store.saveMajorAdmission(props.majorId, input);
    open.value = false;
    message.success('出愿信息已保存');
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '保存失败，请重试。';
  }
}
</script>

<template>
  <section v-if="major" class="major-admissions" aria-label="出愿信息">
    <header class="collection-heading">
      <div>
        <h2>出愿信息</h2>
        <p>
          记录通用时间与材料要求，各年份的特殊变更可在下方考试表备注中补充。
        </p>
      </div>
      <Button class="icon-button" @click="edit"
        ><ExplorerIcon name="edit" />编辑出愿信息</Button
      >
    </header>
    <div class="admission-overview-grid">
      <div class="admission-period">
        <h3><ExplorerIcon name="calendar" />出愿时间</h3>
        <div class="admission-period-range">
          <div>
            <span>开始</span
            ><strong :class="{ 'not-filled': !major.applicationStart }">{{
              major.applicationStart || '待填写'
            }}</strong>
          </div>
          <span class="admission-period-separator">至</span>
          <div>
            <span>截止</span
            ><strong :class="{ 'not-filled': !major.applicationEnd }">{{
              major.applicationEnd || '待填写'
            }}</strong>
          </div>
        </div>
      </div>
      <div class="admission-materials">
        <h3>
          <ExplorerIcon name="book" />出愿所需材料<span v-if="materials.length"
            >{{ materials.length }} 项</span
          >
        </h3>
        <ul v-if="materials.length">
          <li v-for="(item, index) in materials" :key="index">{{ item }}</li>
        </ul>
        <p v-else class="admission-materials-empty">
          待填写，可逐项记录愿书、研究计划书、成绩单等材料要求。
        </p>
      </div>
    </div>
    <Modal
      v-model:open="open"
      title="编辑出愿信息"
      :footer="null"
      :width="680"
      :body-style="{ maxHeight: '75vh', overflowY: 'auto' }"
      :destroy-on-close="true"
      :closable="!store.saving"
      :mask-closable="!store.saving"
      :keyboard="!store.saving"
    >
      <form class="explorer-form" @submit.prevent="save">
        <p class="form-context">
          填写专攻的通用出愿安排；个别年份的日期、材料变化填写在考试表备注中。
        </p>
        <div class="form-fields">
          <div class="field">
            <label for="admission-start">出愿开始时间</label
            ><Input
              id="admission-start"
              v-model:value="form.applicationStart"
              :maxlength="120"
              placeholder="如每年 6 月 1 日，或 2026-06-01"
              :disabled="store.saving"
            />
          </div>
          <div class="field">
            <label for="admission-end">出愿截止时间</label
            ><Input
              id="admission-end"
              v-model:value="form.applicationEnd"
              :maxlength="120"
              placeholder="如每年 6 月 15 日，或 2026-06-15"
              :disabled="store.saving"
            />
          </div>
          <div class="field full">
            <label for="admission-materials">出愿所需材料</label
            ><Input.TextArea
              id="admission-materials"
              v-model:value="form.applicationMaterials"
              :rows="7"
              :maxlength="8000"
              placeholder="一行填写一项材料，可补充份数、格式与提交要求。"
              :disabled="store.saving"
            />
          </div>
        </div>
        <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
        <div class="form-footer">
          <span>支持具体日期或每年的时间段，未知内容可留空</span
          ><Button :disabled="store.saving" @click="open = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="store.saving"
            >保存出愿信息</Button
          >
        </div>
      </form>
    </Modal>
  </section>
</template>
