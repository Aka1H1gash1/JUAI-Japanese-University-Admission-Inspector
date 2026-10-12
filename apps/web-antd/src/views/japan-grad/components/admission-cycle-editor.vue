<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import {
  ADMISSION_FIELDS,
  blankCycle,
  CYCLE_STATUS_LABELS,
  DEGREE_LABELS,
  RESULT_LABELS,
  useAdmissionsStore,
} from '../admissions';
import type { AdmissionCycle } from '../admissions';
import { useExplorerStore } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{ cycle?: AdmissionCycle; majorId?: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [cycle: AdmissionCycle] }>();
const store = useExplorerStore(),
  admissions = useAdmissionsStore();
const { message } = App.useApp();
const form = ref(blankCycle()),
  feedback = ref('');
const majors = computed(() =>
  store.majors.map((m) => {
    const school = store.schools.find((s) => s.id === m.schoolId);
    const university = store.universities.find(
      (u) => u.id === school?.universityId,
    );
    return { value: m.id, label: `${university?.name ?? ''} / ${m.name}` };
  }),
);
const labs = computed(() =>
  store.labs.filter((l) => l.majorId === form.value.majorId),
);
watch(open, (value) => {
  if (!value) return;
  form.value = props.cycle
    ? structuredClone(JSON.parse(JSON.stringify(props.cycle)))
    : blankCycle(props.majorId);
  feedback.value = '';
});
watch(
  () => form.value.majorId,
  (value) => {
    form.value.labIds = form.value.labIds.filter((id) =>
      store.labs.some((l) => l.id === id && l.majorId === value),
    );
  },
);
function copyCommon() {
  const major = store.majors.find((m) => m.id === form.value.majorId);
  if (!major) return;
  for (const key of [
    'applicationStart',
    'applicationEnd',
    'applicationMaterials',
    'languageRequirements',
  ] as const)
    if (!form.value.fields[key]) form.value.fields[key] = major[key] ?? '';
}
async function save() {
  feedback.value = '';
  try {
    const result = await admissions.save(form.value);
    open.value = false;
    emit('saved', result);
    message.success('申请轮次已保存');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '保存失败。';
  }
}
</script>
<template>
  <Modal
    v-model:open="open"
    :title="cycle ? '编辑申请轮次' : '新增申请轮次'"
    :width="880"
    :footer="null"
    :closable="!admissions.saving"
    :mask-closable="!admissions.saving"
    :keyboard="!admissions.saving"
  >
    <form class="explorer-form" @submit.prevent="save">
      <p class="form-context">
        按入学年度、学位、选拔类别和批次独立保存要求与申请进度。
      </p>
      <fieldset class="cycle-editor-body" :disabled="admissions.saving">
        <div class="form-fields">
          <div class="field full">
            <label for="cycle-major">所属专攻</label
            ><Select
              id="cycle-major"
              v-accessible-select
              v-model:value="form.majorId"
              :options="majors"
              :disabled="!!cycle || !!majorId || admissions.saving"
              placeholder="选择专攻"
            />
          </div>
          <div class="field">
            <label for="cycle-year">入学年份</label
            ><InputNumber
              id="cycle-year"
              v-model:value="form.intakeYear"
              :min="1900"
              :max="2200"
              :precision="0"
            />
          </div>
          <div class="field">
            <label for="cycle-month">入学月份</label
            ><Select
              id="cycle-month"
              v-accessible-select
              v-model:value="form.intakeMonth"
              :options="
                Array.from({ length: 12 }, (_, i) => ({
                  value: i + 1,
                  label: `${i + 1} 月`,
                }))
              "
            />
          </div>
          <div class="field">
            <label for="cycle-degree">学位 / 身份</label
            ><Select
              id="cycle-degree"
              v-accessible-select
              v-model:value="form.degree"
              :options="
                Object.entries(DEGREE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
            />
          </div>
          <div class="field">
            <label for="cycle-selection">选拔类别</label
            ><Input
              id="cycle-selection"
              v-model:value="form.selectionType"
              :maxlength="100"
              placeholder="如一般选拔、外国人特别选拔"
            />
          </div>
          <div class="field">
            <label for="cycle-batch">批次</label
            ><Input
              id="cycle-batch"
              v-model:value="form.batch"
              :maxlength="100"
              placeholder="如夏季、第一批次；可留空"
            />
          </div>
          <div class="field">
            <label for="cycle-status">申请状态</label
            ><Select
              id="cycle-status"
              v-accessible-select
              v-model:value="form.status"
              :options="
                Object.entries(CYCLE_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
            />
          </div>
          <div class="field full">
            <label>关联研究室（同一专攻可多选）</label
            ><Checkbox.Group
              v-model:value="form.labIds"
              :options="labs.map((l) => ({ value: l.id, label: l.name }))"
            /><small v-if="!labs.length"
              >请先在该专攻新增研究室，也可稍后关联。</small
            >
          </div>
          <div class="field full cycle-editor-divider">
            <h3>本轮申请要求</h3>
            <Button
              size="small"
              type="text"
              :disabled="!form.majorId || admissions.saving"
              @click="copyCommon"
              >填入尚为空的专攻通用要求</Button
            ><small
              >复制后请确认是否适用于本年度；日期可填写明确年月日或原文时段。</small
            >
          </div>
          <div
            v-for="field in ADMISSION_FIELDS"
            :key="field.id"
            class="field"
            :class="{ full: !field.date && !field.money }"
          >
            <label :for="`cycle-field-${field.id}`">{{ field.label }}</label
            ><Input
              v-if="field.date || field.money"
              :id="`cycle-field-${field.id}`"
              v-model:value="form.fields[field.id]"
              :maxlength="field.max"
              :placeholder="
                field.money ? '整数日元，可留空' : '如 2027-06-01；未知可留空'
              "
            /><Input.TextArea
              v-else
              :id="`cycle-field-${field.id}`"
              v-model:value="form.fields[field.id]"
              :maxlength="field.max"
              :rows="field.id === 'applicationMaterials' ? 5 : 2"
            />
          </div>
          <div class="field full cycle-editor-divider"><h3>提交与结果</h3></div>
          <div class="field">
            <label for="cycle-submitted">提交日期</label
            ><Input
              id="cycle-submitted"
              v-model:value="form.submittedAt"
              type="date"
            />
          </div>
          <div class="field">
            <label for="cycle-result">申请结果</label
            ><Select
              id="cycle-result"
              v-accessible-select
              v-model:value="form.result"
              :options="
                Object.entries(RESULT_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
            />
          </div>
          <div class="field">
            <label for="cycle-number">受验番号 / 提交编号</label
            ><Input
              id="cycle-number"
              v-model:value="form.examNumber"
              :maxlength="160"
            />
          </div>
          <div class="field">
            <label for="cycle-tracking">邮寄单号</label
            ><Input
              id="cycle-tracking"
              v-model:value="form.trackingNumber"
              :maxlength="160"
            />
          </div>
          <div class="field">
            <label for="cycle-enrollment">入学手续截止</label
            ><Input
              id="cycle-enrollment"
              v-model:value="form.enrollmentDeadline"
              type="date"
            />
          </div>
        </div>
      </fieldset>
      <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
      <footer class="form-footer">
        <span>本轮要求可手动填写，也可从募集要项草稿逐项采纳。</span
        ><Button :disabled="admissions.saving" @click="open = false"
          >取消</Button
        ><Button html-type="submit" type="primary" :loading="admissions.saving"
          >保存申请轮次</Button
        >
      </footer>
    </form>
  </Modal>
</template>
<style scoped>
.cycle-editor-body {
  border: 0;
  margin: 0;
  padding: 0 8px 0 0;
  min-width: 0;
  max-height: 64vh;
  overflow: auto;
}
.cycle-editor-divider {
  border-top: 1px solid var(--jg-line);
  padding-top: 16px;
}
.cycle-editor-divider h3 {
  margin: 0;
  font-size: 15px;
}
.field small {
  color: var(--jg-muted);
}
.field .ant-input-number {
  width: 100%;
}
</style>
