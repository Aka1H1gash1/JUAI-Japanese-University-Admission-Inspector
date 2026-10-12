<script setup lang="ts">
import { vAccessibleSelect } from '../select-accessibility';
import type { EditorFields, EntityKind } from '../explorer';

import { computed, ref, watch } from 'vue';

import { App, Button, Input, Modal, Select } from 'ant-design-vue';

import { titleOptions, useExplorerStore, websiteUrl } from '../explorer';
import { localApi } from '../local-api';
import {
  geographyError,
  JAPAN_PREFECTURES,
  JAPAN_REGIONS,
  universityGeography,
} from '../japan-geography';
import UniversityLogo from './university-logo.vue';
import {
  DEFAULT_UNIVERSITY_FEES,
  DORMITORY_OPTIONS,
  formatYen,
  hasDefaultUniversityFees,
  UNIVERSITY_CATEGORIES,
  UNIVERSITY_BUDGET_FIELDS,
  universityBudgetTotals,
  validYenAmount,
} from '../university-fees';

const props = defineProps<{
  kind: EntityKind;
  parentId?: string;
  parentName?: string;
  entityId?: string;
}>();
const emit = defineEmits<{ saved: [id: string] }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const { message } = App.useApp();
const form = ref<EditorFields>({});
const feedback = ref('');
const uploadingLogo = ref(false);
let logoUploadToken = 0;
const kindLabel = computed(
  () =>
    ({
      university: '大学',
      school: '研究科',
      major: '专攻',
      professor: '老师',
      lab: '研究室',
    })[props.kind],
);
const dialogTitle = computed(
  () => `${props.entityId ? '编辑' : '新增'}${kindLabel.value}`,
);
const categoryOptions = UNIVERSITY_CATEGORIES.map((value) => ({
  label: value,
  value,
}));
const regionOptions = computed(() => {
  const options = JAPAN_REGIONS.map((value) => ({ label: value, value }));
  const current = form.value.region;
  if (current && !JAPAN_REGIONS.includes(current))
    options.push({ label: `${current}（原记录，请重新选择）`, value: current });
  return options;
});
const prefectureOptions = computed(() =>
  JAPAN_PREFECTURES.filter((item) => item.region === form.value.region).map(
    (item) => ({
      label: item.name,
      value: item.name,
      japaneseName: item.japaneseName,
    }),
  ),
);
const canChoosePrefecture = computed(() =>
  JAPAN_REGIONS.includes(form.value.region ?? ''),
);
const professorLabOptions = computed(() => {
  const parent = store.labs.find((item) => item.id === props.parentId);
  return store
    .labsFor(parent?.majorId ?? '')
    .map((item) => ({ label: item.name, value: item.id }));
});

function changeRegion(value: unknown) {
  form.value.region = typeof value === 'string' ? value : '';
  if (geographyError(form.value.region, form.value.prefecture ?? ''))
    form.value.prefecture = '';
}

function filterPrefecture(
  input: string,
  option?: { label?: unknown; japaneseName?: string },
) {
  return [option?.label, option?.japaneseName].some((value) =>
    String(value ?? '').includes(input.trim()),
  );
}
type FeeField = keyof typeof DEFAULT_UNIVERSITY_FEES;
const feeFields: FeeField[] = ['admissionFee', 'annualTuition'];
const automaticFees = new Set<FeeField>();
const hasDefaultFees = computed(() =>
  hasDefaultUniversityFees(form.value.category ?? ''),
);
const feeTotals = computed(() =>
  universityBudgetTotals({
    category: form.value.category ?? '',
    admissionFee: form.value.admissionFee ?? '',
    annualTuition: form.value.annualTuition ?? '',
    monthlyRent: form.value.monthlyRent ?? '',
    monthlyLivingExpenses: form.value.monthlyLivingExpenses ?? '',
  }),
);

async function uploadLogo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const token = ++logoUploadToken;
  uploadingLogo.value = true;
  feedback.value = '';
  try {
    if (file.size > 3 * 1024 * 1024) throw new Error('校徽图片不能超过 3 MB。');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new Error('校徽请使用 PNG、JPG 或 WebP 图片。');
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('图片无法读取，请换一张 PNG、JPG 或 WebP 图片。');
    }
    const tooLarge = bitmap.width * bitmap.height > 16_000_000;
    bitmap.close();
    if (tooLarge)
      throw new Error('图片尺寸过大，请使用不超过 1600 万像素的校徽。');
    const uploaded = await localApi<{ id: string }>('/university-logos', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (token === logoUploadToken && open.value)
      form.value.logoId = uploaded.id;
  } catch (error) {
    if (token === logoUploadToken && open.value)
      feedback.value =
        error instanceof Error ? error.message : '校徽上传失败，请重试。';
  } finally {
    input.value = '';
    if (token === logoUploadToken) uploadingLogo.value = false;
  }
}

function changeUniversityCategory() {
  for (const field of feeFields) {
    if (hasDefaultFees.value && !form.value[field]?.trim()) {
      form.value[field] = DEFAULT_UNIVERSITY_FEES[field];
      automaticFees.add(field);
    } else if (!hasDefaultFees.value && automaticFees.has(field)) {
      if (form.value[field] === DEFAULT_UNIVERSITY_FEES[field])
        form.value[field] = '';
      automaticFees.delete(field);
    }
  }
}

function restoreDefaultFees() {
  for (const field of feeFields) {
    form.value[field] = DEFAULT_UNIVERSITY_FEES[field];
    automaticFees.add(field);
  }
}

watch(open, (value) => {
  logoUploadToken++;
  uploadingLogo.value = false;
  if (!value) return;
  feedback.value = '';
  automaticFees.clear();
  form.value = {
    name: '',
    japaneseName: '',
    location: '',
    category: '',
    region: '',
    prefecture: '',
    qsRank: '',
    qsYear: '',
    admissionFee: '',
    annualTuition: '',
    feeNotes: '',
    monthlyRent: '',
    monthlyLivingExpenses: '',
    dormitoryStatus: 'unknown',
    dormitoryNotes: '',
    dormitoryWebsite: '',
    logoId: '',
    research: '',
    title: '',
    laboratory: '',
    labId: props.kind === 'professor' ? (props.parentId ?? '') : '',
    examNotes: '',
    applicationNotes: '',
    languageRequirements: '',
    email: '',
    website: '',
    personalWebsite: '',
    laboratoryWebsite: '',
    notes: '',
  };
  const source = {
    university: store.universities,
    school: store.schools,
    major: store.majors,
    professor: store.professors,
    lab: store.labs,
  }[props.kind];
  const existing = source.find((item) => item.id === props.entityId);
  if (existing) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === 'string') form.value[key] = value;
    }
    if (props.kind === 'university') {
      const university = store.universities.find(
        (item) => item.id === props.entityId,
      );
      if (university)
        Object.assign(form.value, universityGeography(university));
    }
  }
});

async function save() {
  if (store.saving || uploadingLogo.value) return;
  const name = form.value.name?.trim();
  if (!name) {
    feedback.value = `请填写${kindLabel.value}名称。`;
    return;
  }
  if (props.kind === 'university') {
    const error = geographyError(
      form.value.region ?? '',
      form.value.prefecture ?? '',
    );
    if (error) {
      feedback.value = error;
      return;
    }
  }
  if (
    props.kind === 'university' &&
    UNIVERSITY_BUDGET_FIELDS.some(
      (field) => !validYenAmount(form.value[field]?.trim() ?? ''),
    )
  ) {
    feedback.value =
      '费用请填写 0-999,999,999 之间的整数日元，或留空；无需输入逗号。';
    return;
  }
  const websiteFields =
    props.kind === 'professor'
      ? ['personalWebsite']
      : props.kind === 'university'
        ? ['website', 'dormitoryWebsite']
        : ['website'];
  if (
    websiteFields.some(
      (field) =>
        form.value[field]?.trim() && !websiteUrl(form.value[field].trim()),
    )
  ) {
    feedback.value = '请填写有效的网站地址，例如 https://example.ac.jp。';
    return;
  }
  if (
    form.value.email?.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())
  ) {
    feedback.value = '请检查邮箱格式。';
    return;
  }
  if (props.kind !== 'university') {
    const parents = {
      school: store.universities,
      major: store.schools,
      professor: store.labs,
      lab: store.majors,
    }[props.kind];
    const parentExists = parents.some((item) => item.id === props.parentId);
    if (!parentExists) {
      feedback.value = '所属记录已不存在，请返回上一级。';
      return;
    }
  }
  const siblings = {
    university: store.universities,
    school: store.schoolsFor(props.parentId ?? ''),
    major: store.majorsFor(props.parentId ?? ''),
    professor: store.professorsForLab(form.value.labId || props.parentId || ''),
    lab: store.labsFor(props.parentId ?? ''),
  }[props.kind];
  if (
    siblings.some(
      (item) =>
        item.id !== props.entityId &&
        item.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    feedback.value = `这里已经有同名的${kindLabel.value}，可以编辑已有记录。`;
    return;
  }
  try {
    const id = await store.saveEntity(
      props.kind,
      form.value,
      props.parentId,
      props.entityId,
    );
    open.value = false;
    message.success(`${kindLabel.value}已${props.entityId ? '更新' : '添加'}`);
    emit('saved', id);
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '保存失败，请重试。';
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="dialogTitle"
    :footer="null"
    :width="kind === 'university' ? 720 : 620"
    :body-style="{ maxHeight: '75vh', overflowY: 'auto' }"
    :destroy-on-close="true"
  >
    <form class="explorer-form" @submit.prevent="save">
      <p class="form-context">
        {{
          parentName
            ? `所属：${parentName}`
            : '填写你想了解的大学，之后再逐步添加研究科和老师。'
        }}
      </p>
      <div class="form-fields">
        <div
          v-if="kind === 'university'"
          class="field full university-logo-editor"
        >
          <UniversityLogo :logo-id="form.logoId" :name="form.name" large />
          <div>
            <label
              for="entity-logo-file"
              class="university-logo-picker"
              :class="{ 'is-uploading': uploadingLogo }"
            >
              {{
                uploadingLogo
                  ? '正在上传校徽…'
                  : form.logoId
                    ? '更换校徽'
                    : '上传校徽'
              }}
              <input
                id="entity-logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :disabled="uploadingLogo || store.saving"
                @change="uploadLogo"
              />
            </label>
            <button
              v-if="form.logoId"
              type="button"
              class="text-button"
              :disabled="uploadingLogo"
              @click="form.logoId = ''"
            >
              移除校徽
            </button>
            <p>PNG、JPG、WebP，最大 3 MB；保存大学后生效。</p>
          </div>
        </div>
        <div class="field full">
          <label for="entity-name"
            >{{ kind === 'professor' ? '老师姓名' : `${kindLabel}名称` }}
            <span>*</span></label
          ><Input
            id="entity-name"
            v-model:value="form.name"
            :maxlength="120"
            :status="feedback && !form.name?.trim() ? 'error' : undefined"
            :placeholder="`填写${kindLabel}的名称`"
            autofocus
          />
        </div>
        <div class="field" :class="{ full: kind === 'school' }">
          <label for="entity-japanese">日文名称</label
          ><Input
            id="entity-japanese"
            v-model:value="form.japaneseName"
            :maxlength="120"
            placeholder="可选"
          />
        </div>
        <template v-if="kind === 'university'">
          <div class="field">
            <label for="entity-category">大学类型</label
            ><Select
              v-accessible-select
              id="entity-category"
              v-model:value="form.category"
              :options="categoryOptions"
              allow-clear
              placeholder="选择大学类型"
              @change="changeUniversityCategory"
            />
          </div>
          <div class="field">
            <label for="entity-region">所在地域</label>
            <Select
              v-accessible-select
              id="entity-region"
              :value="form.region || undefined"
              allow-clear
              placeholder="先选择地域"
              :options="regionOptions"
              @change="changeRegion"
            />
          </div>
          <div class="field">
            <label for="entity-prefecture">都道府县</label>
            <Select
              v-accessible-select
              id="entity-prefecture"
              :value="form.prefecture || undefined"
              :disabled="!canChoosePrefecture"
              :placeholder="
                canChoosePrefecture ? '选择都道府县' : '请先选择地域'
              "
              :options="prefectureOptions"
              :filter-option="filterPrefecture"
              show-search
              allow-clear
              @change="
                form.prefecture = typeof $event === 'string' ? $event : ''
              "
            />
          </div>
          <div class="field full">
            <label for="entity-location">城市 / 详细所在地</label>
            <Input
              id="entity-location"
              v-model:value="form.location"
              :maxlength="120"
              placeholder="如文京区、校区或详细地址，可选"
            />
          </div>
          <div class="field">
            <label for="entity-qs-rank">QS 排名</label>
            <Input
              id="entity-qs-rank"
              v-model:value="form.qsRank"
              :maxlength="120"
              placeholder="如 100、401-450、未上榜"
            />
          </div>
          <div class="field">
            <label for="entity-qs-year">QS 榜单年份</label>
            <Input
              id="entity-qs-year"
              v-model:value="form.qsYear"
              :maxlength="120"
              placeholder="如 2027，可选"
            />
          </div>
          <section
            class="university-fee-editor field full"
            aria-label="大学费用设置"
          >
            <div class="fee-editor-heading">
              <div>
                <h3>总费用预算</h3>
                <p>学费按年、房租与生活费按月填写，统一以日元计算。</p>
              </div>
              <Button
                v-if="hasDefaultFees"
                size="small"
                @click="restoreDefaultFees"
              >
                恢复默认学费
              </Button>
            </div>
            <div class="form-fields">
              <div class="field">
                <label for="entity-admission-fee">入学金（日元）</label>
                <Input
                  id="entity-admission-fee"
                  v-model:value="form.admissionFee"
                  prefix="¥"
                  inputmode="numeric"
                  :maxlength="9"
                  placeholder="填写金额，可选"
                  @update:value="automaticFees.delete('admissionFee')"
                />
                <small>仅第一年入学时缴交一次</small>
              </div>
              <div class="field">
                <label for="entity-annual-tuition">年度学费（日元 / 年）</label>
                <Input
                  id="entity-annual-tuition"
                  v-model:value="form.annualTuition"
                  prefix="¥"
                  inputmode="numeric"
                  :maxlength="9"
                  placeholder="填写金额，可选"
                  @update:value="automaticFees.delete('annualTuition')"
                />
                <small>每年缴交的学费</small>
              </div>
              <div class="field full">
                <span class="fee-editor-section-label">住宿与生活 / 每月</span>
              </div>
              <div class="field">
                <label for="entity-monthly-rent">房租（日元 / 月）</label>
                <Input
                  id="entity-monthly-rent"
                  v-model:value="form.monthlyRent"
                  prefix="¥"
                  inputmode="numeric"
                  :maxlength="9"
                  placeholder="按实际住宿方案填写"
                />
                <small>住寮时可填写寮费，无此支出填 0</small>
              </div>
              <div class="field">
                <label for="entity-monthly-living">生活费（日元 / 月）</label>
                <Input
                  id="entity-monthly-living"
                  v-model:value="form.monthlyLivingExpenses"
                  prefix="¥"
                  inputmode="numeric"
                  :maxlength="9"
                  placeholder="餐饮、交通、水电等，不含房租"
                />
                <small>不重复计入房租，无此支出填 0</small>
              </div>
              <div class="field full">
                <label for="entity-fee-notes">费用备注</label>
                <Input.TextArea
                  id="entity-fee-notes"
                  v-model:value="form.feeNotes"
                  :maxlength="4000"
                  :rows="2"
                  placeholder="记录学费减免、住宿方案、生活费范围和额外支出……"
                />
              </div>
            </div>
            <p class="fee-editor-hint">
              {{
                hasDefaultFees
                  ? '国立、公立、国公立默认入学金 282,000 日元，年度学费 535,800 日元；可自行修改。'
                  : '私立大学的费用请自行填写；切换大学类型时会保留已手动填写的金额。'
              }}
            </p>
            <p v-if="feeTotals.firstYear" class="fee-editor-total">
              {{ feeTotals.complete ? '首年总费用' : '首年已知费用' }}
              <strong>¥ {{ formatYen(feeTotals.firstYear) }}</strong>
              <span
                >{{ feeTotals.complete ? '两年总费用' : '两年已知费用' }} ¥
                {{ formatYen(feeTotals.twoYears) }}</span
              >
            </p>
            <p v-if="!feeTotals.complete" class="fee-editor-hint">
              待补充：{{
                feeTotals.missingFields.join('、')
              }}。未填写的费用不会视为零。
            </p>
          </section>
          <section
            class="university-dormitory-editor field full"
            aria-label="寮申请信息"
          >
            <div class="fee-editor-heading">
              <div>
                <h3>寮 / 学生宿舍</h3>
                <p>记录能否申请，以及申请资格、时间和住宿条件。</p>
              </div>
            </div>
            <div class="form-fields">
              <div class="field full">
                <label for="entity-dormitory-status">是否可以申请寮</label
                ><Select
                  v-accessible-select
                  id="entity-dormitory-status"
                  v-model:value="form.dormitoryStatus"
                  :options="DORMITORY_OPTIONS"
                />
              </div>
              <div class="field full">
                <label for="entity-dormitory-website">寮申请官网</label
                ><Input
                  id="entity-dormitory-website"
                  v-model:value="form.dormitoryWebsite"
                  :maxlength="2048"
                  placeholder="https://…，可选"
                />
              </div>
              <div class="field full">
                <label for="entity-dormitory-notes">申请条件 / 住宿备注</label
                ><Input.TextArea
                  id="entity-dormitory-notes"
                  v-model:value="form.dormitoryNotes"
                  :rows="2"
                  :maxlength="4000"
                  placeholder="留学生申请资格、申请时间、入住年限、寮费或通勤距离……"
                />
              </div>
            </div>
          </section>
        </template>
        <template v-if="kind === 'professor'">
          <div class="field full">
            <label for="entity-lab-id">所属研究室</label>
            <Select
              v-accessible-select
              id="entity-lab-id"
              v-model:value="form.labId"
              :options="professorLabOptions"
              placeholder="选择所属研究室"
            />
          </div>
          <div class="field">
            <label for="entity-title">职称</label
            ><Select
              v-accessible-select
              id="entity-title"
              v-model:value="form.title"
              :options="titleOptions"
              allow-clear
              placeholder="请选择职称"
            />
          </div>
        </template>
        <template v-if="kind === 'lab'">
          <div class="field full">
            <label for="entity-lab-language">研究室语言要求</label>
            <Input.TextArea
              id="entity-lab-language"
              v-model:value="form.languageRequirements"
              :maxlength="4000"
              :rows="3"
              placeholder="留空则参考所属专攻；如有单独要求，在此填写。"
            />
          </div>
          <div class="field full">
            <label for="entity-lab-exams">考试特殊说明</label
            ><Input.TextArea
              id="entity-lab-exams"
              v-model:value="form.examNotes"
              :maxlength="4000"
              :rows="2"
              placeholder="默认参考所属专攻的历年考试；在此记录研究室的额外考核或差异。"
            />
          </div>
          <div class="field full">
            <label for="entity-lab-admissions">出愿特殊说明</label
            ><Input.TextArea
              id="entity-lab-admissions"
              v-model:value="form.applicationNotes"
              :maxlength="4000"
              :rows="2"
              placeholder="如需提前联系、内诺或额外材料，可在此记录。"
            />
          </div>
        </template>
        <div v-if="kind !== 'university'" class="field full">
          <label for="entity-research">{{
            kind === 'school' ? '学科 / 研究领域' : '研究方向'
          }}</label
          ><Input
            id="entity-research"
            v-model:value="form.research"
            :maxlength="500"
            placeholder="填写感兴趣的领域或关键词，可选"
          />
        </div>
        <div v-if="kind === 'professor'" class="field full">
          <label for="entity-email">联系邮箱</label
          ><Input
            id="entity-email"
            v-model:value="form.email"
            :maxlength="254"
            placeholder="可选"
          />
        </div>
        <div v-if="kind !== 'professor'" class="field full">
          <label for="entity-website">官网地址</label
          ><Input
            id="entity-website"
            v-model:value="form.website"
            :maxlength="2048"
            placeholder="https://…，可选"
          />
        </div>
        <template v-if="kind === 'professor'">
          <div class="field full">
            <label for="entity-personal-website">老师个人主页</label
            ><Input
              id="entity-personal-website"
              v-model:value="form.personalWebsite"
              :maxlength="2048"
              placeholder="https://…，可选"
            />
          </div>
        </template>
        <div class="field full">
          <label for="entity-notes">{{
            kind === 'professor' ? '关注理由 / 个人备注' : '个人备注'
          }}</label
          ><Input.TextArea
            id="entity-notes"
            v-model:value="form.notes"
            :maxlength="4000"
            :rows="3"
            placeholder="记录你感兴趣的理由、需要确认的信息……"
          />
        </div>
      </div>
      <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
      <div class="form-footer">
        <span>仅名称必填，其余可以稍后补充</span
        ><Button @click="open = false">取消</Button
        ><Button
          type="primary"
          html-type="submit"
          :loading="store.saving"
          :disabled="uploadingLogo"
        >
          {{ props.entityId ? '保存修改' : `添加${kindLabel}` }}
        </Button>
      </div>
    </form>
  </Modal>
</template>
