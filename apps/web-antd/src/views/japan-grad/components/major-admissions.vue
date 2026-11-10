<script setup lang="ts">
import type { MajorAdmissionFields } from '../major-admissions';

import { computed, ref } from 'vue';

import { App, Button, Input, Modal } from 'ant-design-vue';

import { admissionItems } from '../admission-content';
import { dateFromText } from '../application-planning';
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
  admissionItems(major.value?.applicationMaterials ?? ''),
);
const open = ref(false);
const feedback = ref('');
// Only exact dates reach the timeline; describe that at the field instead of failing silently.
function dateHint(value: string) {
  const text = value.trim();
  if (!text) return '';
  return dateFromText(text)
    ? `会显示在时间线：${dateFromText(text)}`
    : '这不是具体日期，只作为文字记录，不会出现在时间线和提醒中。';
}
const startHint = computed(() => dateHint(form.value.applicationStart));
const endHint = computed(() => dateHint(form.value.applicationEnd));
const form = ref<MajorAdmissionFields>({
  applicationStart: '',
  applicationEnd: '',
  applicationMaterials: '',
  languageRequirements: '',
});
function edit() {
  if (!major.value) return;
  form.value = {
    applicationStart: major.value.applicationStart,
    applicationEnd: major.value.applicationEnd,
    applicationMaterials: major.value.applicationMaterials,
    languageRequirements: major.value.languageRequirements ?? '',
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
    languageRequirements: form.value.languageRequirements?.trim() ?? '',
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
  <section
    v-if="major"
    id="major-admissions"
    class="major-admissions"
    aria-label="出愿信息"
  >
    <header class="collection-heading">
      <div>
        <h2>出愿信息</h2>
        <p>
          记录通用时间与材料要求，各年份的特殊变更可在下方考试表备注中补充。
        </p>
      </div>
      <Button class="icon-button" @click="edit">
        <ExplorerIcon name="edit" />编辑出愿信息
      </Button>
    </header>
    <div class="admission-overview-grid">
      <div class="admission-period">
        <h3><ExplorerIcon name="calendar" />出愿时间</h3>
        <div class="admission-period-range">
          <div>
            <span>开始</span><strong :class="{ 'not-filled': !major.applicationStart }">{{
              major.applicationStart || '待填写'
            }}</strong>
          </div>
          <span class="admission-period-separator">至</span>
          <div>
            <span>截止</span><strong :class="{ 'not-filled': !major.applicationEnd }">{{
              major.applicationEnd || '待填写'
            }}</strong>
          </div>
        </div>
      </div>
      <div class="admission-materials">
        <h3>
          <ExplorerIcon name="book" />出愿所需材料<span v-if="materials.length">{{ materials.length }} 项</span>
        </h3>
        <ul v-if="materials.length">
          <li v-for="(item, index) in materials" :key="index">{{ item }}</li>
        </ul>
        <p v-else class="admission-materials-empty">
          待填写，可逐项记录愿书、研究计划书、成绩单等材料要求。
        </p>
      </div>
    </div>
    <div class="admission-language">
      <h3>语言要求</h3>
      <p>
        {{
          major.languageRequirements ||
          '待填写，可记录日语、英语成绩门槛、有效期与免除条件。'
        }}
      </p>
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
          <div class="field full">
            <label for="admission-language">语言要求</label>
            <Input.TextArea
              id="admission-language"
              v-model:value="form.languageRequirements"
              :rows="3"
              :maxlength="4000"
              placeholder="记录 JLPT、TOEFL / TOEIC 等成绩要求、有效期或免除条件，以募集要项为准。"
              :disabled="store.saving"
            />
          </div>
          <div class="field">
            <label for="admission-start">出愿开始时间</label><Input
              id="admission-start"
              v-model:value="form.applicationStart"
              :maxlength="120"
              placeholder="如 2027-06-01；也可写每年 6 月上旬"
              :disabled="store.saving"
              aria-describedby="admission-start-hint"
            />
            <small
              v-if="startHint"
              id="admission-start-hint"
              class="admission-date-hint"
              :class="{ 'is-text': !dateFromText(form.applicationStart) }"
              >{{ startHint }}</small>
          </div>
          <div class="field">
            <label for="admission-end">出愿截止时间</label><Input
              id="admission-end"
              v-model:value="form.applicationEnd"
              :maxlength="120"
              placeholder="如 2027-06-15；也可写每年 6 月中旬"
              :disabled="store.saving"
              aria-describedby="admission-end-hint"
            />
            <small
              v-if="endHint"
              id="admission-end-hint"
              class="admission-date-hint"
              :class="{ 'is-text': !dateFromText(form.applicationEnd) }"
              >{{ endHint }}</small>
          </div>
          <div class="field full">
            <label for="admission-materials">出愿所需材料</label><Input.TextArea
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
          <span>写成 2027-06-01
            这样的具体日期才会进入时间线和提醒，未知内容可留空</span><Button :disabled="store.saving" @click="open = false">取消</Button><Button type="primary" html-type="submit" :loading="store.saving">
            保存出愿信息
          </Button>
        </div>
      </form>
    </Modal>
  </section>
</template>
<style scoped>
.admission-date-hint {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: var(--jg-muted);
}

.admission-date-hint.is-text {
  color: var(--jg-warning, #a15c00);
}
</style>
