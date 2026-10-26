<script setup lang="ts">
import type {
  SpecialProgram,
  SpecialProgramSummary,
} from './special-program-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import CollectedAdmissions from './components/collected-admissions.vue';
import EntityCreateFlow from './components/entity-create-flow.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import { useExplorerStore } from './explorer';
import { jsonOptions, localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';
import {
  emptyProgram,
  PROGRAM_CATEGORIES,
  PROGRAM_DEGREES,
  PROGRAM_STATUSES,
} from './special-program-types';

const route = useRoute();
const router = useRouter();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const detail = ref<SpecialProgram>();
const records = ref<SpecialProgramSummary[]>([]);
const category = ref('');
const errorMessage = ref('');
const favoritesOnly = ref(false);
const loading = ref(false);
const query = ref('');
const status = ref('');
const createOpen = ref(false);
const editorError = ref('');
const editorOpen = ref(false);
const form = ref(emptyProgram());
const opening = ref(false);
const saving = ref(false);
const programId = computed(() =>
  typeof route.params.programId === 'string' ? route.params.programId : '',
);
const base = '/japan-grad/special-programs';
let generation = 0;
const schoolName = (p: SpecialProgramSummary) =>
  store.universities.find((u) => u.id === p.universityId)?.name ||
  p.universityName ||
  p.institutionName ||
  '院校待补充';
const affiliation = (p: SpecialProgramSummary) =>
  [
    schoolName(p),
    store.schools.find((s) => s.id === p.schoolId)?.name || p.schoolName,
    store.majors.find((m) => m.id === p.majorId)?.name || p.majorName,
  ]
    .filter(Boolean)
    .join(' / ');
const categories = computed(() => [
  ...new Set([...PROGRAM_CATEGORIES, ...records.value.map((p) => p.category)]),
]);
const shown = computed(() =>
  records.value
    .filter((p) => {
      const search = query.value.trim().toLocaleLowerCase();
      return (
        (!search ||
          [p.name, affiliation(p), p.summary, p.category, p.language, p.intake]
            .join(' ')
            .toLocaleLowerCase()
            .includes(search)) &&
        (!category.value || p.category === category.value) &&
        (!status.value || p.status === status.value) &&
        (!favoritesOnly.value || p.favorite)
      );
    })
    .toSorted(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        b.updatedAt.localeCompare(a.updatedAt),
    ),
);
const universityOptions = computed(() => [
  { value: '', label: '暂不关联大学' },
  ...store.universities.map((u) => ({ value: u.id, label: u.name })),
]);
const schoolOptions = computed(() => [
  { value: '', label: '暂不关联研究科' },
  ...store.schools
    .filter((s) => s.universityId === form.value.universityId)
    .map((s) => ({ value: s.id, label: s.name })),
]);
const majorOptions = computed(() => [
  { value: '', label: '暂不关联专攻' },
  ...store.majors
    .filter((m) => m.schoolId === form.value.schoolId)
    .map((m) => ({ value: m.id, label: m.name })),
]);
const detailSections = computed(() =>
  detail.value
    ? [
        { label: '申请资格', text: detail.value.eligibility },
        { label: '语言要求', text: detail.value.languageRequirements },
        { label: '出愿材料', text: detail.value.applicationMaterials },
        { label: '选拔方式与考核', text: detail.value.assessment },
        { label: '项目费用', text: detail.value.fees },
        { label: '奖学金与资助', text: detail.value.scholarships },
        { label: '备注', text: detail.value.notes },
      ]
    : [],
);
const linkedProfiles = computed(() => {
  const p = detail.value;
  if (!p) return [];
  const m = store.majors.find((e) => e.id === p.majorId);
  const s = store.schools.find((e) => e.id === p.schoolId);
  const u = store.universities.find((e) => e.id === p.universityId);
  const entries = [];
  if (u)
    entries.push({ label: u.name, path: `/japan-grad/universities/${u.id}` });
  if (u && s && s.universityId === u.id)
    entries.push({
      label: s.name,
      path: `/japan-grad/universities/${u.id}/schools/${s.id}`,
    });
  if (u && s && m && m.schoolId === s.id && s.universityId === u.id)
    entries.push({
      label: m.name,
      path: `/japan-grad/universities/${u.id}/schools/${s.id}/majors/${m.id}`,
    });
  return entries;
});
async function load() {
  const id = programId.value;
  const version = ++generation;
  loading.value = true;
  errorMessage.value = '';
  detail.value = undefined;
  try {
    const [list, selected] = await Promise.all([
      localApi<SpecialProgramSummary[]>('/special-programs'),
      id
        ? localApi<SpecialProgram>(`/special-programs/${id}`)
        : Promise.resolve(undefined),
    ]);
    if (version !== generation) return;
    records.value = list;
    detail.value = selected;
  } catch (error) {
    if (version === generation)
      errorMessage.value =
        error instanceof Error ? error.message : '项目读取失败。';
  } finally {
    if (version === generation) loading.value = false;
  }
}
watch(
  programId,
  () => {
    editorOpen.value = false;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
async function edit(id = '') {
  opening.value = true;
  editorError.value = '';
  const version = generation;
  try {
    const value = id
      ? await localApi<SpecialProgram>(`/special-programs/${id}`)
      : emptyProgram();
    if (version !== generation) return;
    form.value = { ...value };
    editorOpen.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '项目读取失败。');
  } finally {
    opening.value = false;
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  editorError.value = '';
  try {
    const id = form.value.id;
    const result = await localApi<SpecialProgram>(
      id ? `/special-programs/${id}` : '/special-programs',
      jsonOptions(id ? 'PUT' : 'POST', form.value),
    );
    editorOpen.value = false;
    message.success(id ? '特殊入学项目已更新。' : '特殊入学项目已创建。');
    await (programId.value === result.id
      ? load()
      : router.push(`${base}/${result.id}`));
  } catch (error) {
    editorError.value =
      error instanceof Error ? error.message : '保存失败，填写内容已保留。';
  } finally {
    saving.value = false;
  }
}
function remove(p: SpecialProgramSummary) {
  modal.confirm({
    title: '删除这个特殊入学项目？',
    content: `将删除「${p.name}」。关联的大学、研究科和专攻会保留。`,
    okText: '删除项目',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      try {
        await localApi(
          `/special-programs/${p.id}`,
          jsonOptions('DELETE', { version: p.version }),
        );
        message.success('项目已删除。');
        await (programId.value === p.id ? router.push(base) : load());
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败。');
        throw error;
      }
    },
  });
}
function changeUniversity() {
  form.value.schoolId = '';
  form.value.majorId = '';
}
function changeSchool() {
  form.value.majorId = '';
}
function clearFilters() {
  query.value = category.value = status.value = '';
  favoritesOnly.value = false;
}
</script>

<template>
  <section class="special-programs">
    <header class="program-heading">
      <div>
        <p class="program-eyebrow">SPECIAL ADMISSIONS / 特殊入学项目</p>
        <h1>
          {{ programId ? detail?.name || '项目详情' : '特殊入学项目' }}
        </h1>
        <p v-if="programId">把项目要求、申请材料与时间，放在同一份档案里。</p>
      </div>
      <div class="program-heading-actions">
        <Button
          v-if="detail"
          :disabled="opening || saving"
          @click="edit(detail.id)"
        >
          <ExplorerIcon name="edit" />编辑项目
</Button><Button
          v-else
          type="primary"
          :disabled="opening || loading"
          @click="createOpen = true"
        >
          <ExplorerIcon name="plus" />新增项目
        </Button>
      </div>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
      <RouterLink v-if="programId" :to="base">返回项目列表</RouterLink>
    </p>
    <p v-if="loading" class="program-loading" role="status">
      正在读取特殊入学项目…
    </p>

    <template v-if="!programId">
      <div class="program-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          placeholder="搜索项目、院校或授课语言"
          aria-label="搜索特殊入学项目"
        >
          <template #prefix><ExplorerIcon name="search" /></template>
        </Input>
        <Select
          v-accessible-select
          v-model:value="category"
          :options="[
            { value: '', label: '全部项目类型' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]"
          aria-label="筛选项目类型"
        />
        <Select
          v-accessible-select
          v-model:value="status"
          :options="[
            { value: '', label: '全部申请状态' },
            ...Object.entries(PROGRAM_STATUSES).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
          aria-label="筛选申请状态"
        />
        <Checkbox v-model:checked="favoritesOnly">只看关注</Checkbox><Button :loading="loading" @click="load">刷新</Button>
      </div>
      <p v-if="records.length" class="program-list-count">
        {{ shown.length }} 个项目
      </p>
      <div v-if="shown.length" class="program-grid">
        <article v-for="p in shown" :key="p.id" class="program-card">
          <RouterLink :to="`${base}/${p.id}`" class="program-card-main">
            <div class="program-card-top">
              <span class="program-category">{{ p.category }}</span><span class="program-status" :data-status="p.status">{{
                PROGRAM_STATUSES[p.status]
              }}</span>
            </div>
            <h2><ExplorerIcon v-if="p.favorite" name="heart" />{{ p.name }}</h2>
            <p class="program-affiliation">{{ affiliation(p) }}</p>
            <p class="program-card-summary">
              {{
                p.summary ||
                '项目简介待补充，可在详情中记录申请特点与关注原因。'
              }}
            </p>
            <div class="program-tags">
              <span v-if="p.degree">{{ PROGRAM_DEGREES[p.degree] }}</span><span v-if="p.language">{{ p.language }}</span><span v-if="p.intake">{{ p.intake }}</span>
            </div>
            <div class="program-deadline">
              <ExplorerIcon name="calendar" /><span>出愿截止<strong>{{
                  p.applicationEnd || '待补充'
                }}</strong></span><span class="program-enter">查看项目 →</span>
            </div>
          </RouterLink>
          <footer>
            <button :disabled="opening || saving" @click="edit(p.id)">
              <ExplorerIcon name="edit" />编辑
</button><button :disabled="saving" @click="remove(p)">
              <ExplorerIcon name="trash" />删除
            </button>
          </footer>
        </article>
      </div>
      <div v-else-if="!loading && !errorMessage" class="program-empty">
        <ExplorerIcon name="globe" />
        <h2>
          {{ records.length ? '没有符合条件的项目' : '从一个感兴趣的项目开始' }}
        </h2>
        <p>
          {{
            records.length
              ? '试试其他关键词或清除筛选条件。'
              : '记下项目名称与官网，再逐步补充要求、材料和出愿时间。'
          }}
        </p>
        <Button v-if="records.length" @click="clearFilters">清除筛选</Button><Button v-else type="primary" @click="createOpen = true">
          新增特殊入学项目
        </Button>
      </div>
    </template>

    <template v-else-if="detail && !loading">
      <section class="program-detail-banner">
        <div>
          <span class="program-category">{{ detail.category }}</span><span class="program-status" :data-status="detail.status">{{
            PROGRAM_STATUSES[detail.status]
          }}</span>
          <p>{{ affiliation(detail) }}</p>
          <h2>{{ detail.summary || '项目简介待补充' }}</h2>
          <div class="program-tags">
            <span v-if="detail.degree">{{
              PROGRAM_DEGREES[detail.degree]
            }}</span><span v-if="detail.language">{{ detail.language }}</span><span v-if="detail.intake">{{ detail.intake }}</span><span v-if="detail.favorite">已关注</span>
          </div>
        </div>
        <a
          v-if="detail.website"
          :href="detail.website"
          target="_blank"
          rel="noopener noreferrer"
          >项目官网 <ExplorerIcon name="link" /></a>
      </section>
      <section class="program-schedule" aria-label="项目时间">
        <div>
          <span>出愿开始</span><strong>{{ detail.applicationStart || '待补充' }}</strong>
        </div>
        <div>
          <span>出愿截止</span><strong>{{ detail.applicationEnd || '待补充' }}</strong>
        </div>
        <div>
          <span>考核日期</span><strong>{{ detail.assessmentDate || '待补充' }}</strong>
        </div>
        <div>
          <span>结果公布</span><strong>{{ detail.resultDate || '待补充' }}</strong>
        </div>
      </section>
      <nav
        v-if="linkedProfiles.length"
        class="program-related"
        aria-label="关联学校档案"
      >
        <span>关联档案</span><RouterLink v-for="p in linkedProfiles" :key="p.path" :to="p.path">
          {{ p.label }} ↗
        </RouterLink>
      </nav>
      <CollectedAdmissions kind="special_program" :id="detail.id" />
      <div class="program-detail-sections">
        <section
          v-for="(section, i) in detailSections"
          :key="section.label"
          :class="{
            'program-detail-wide': ['出愿材料', '备注'].includes(section.label),
          }"
        >
          <header>
            <span>{{ String(i + 1).padStart(2, '0') }}</span>
            <h2>{{ section.label }}</h2>
          </header>
          <p :class="{ 'program-unfilled': !section.text }">
            {{ section.text || '尚未填写，可通过“编辑项目”补充。' }}
          </p>
        </section>
      </div>
      <footer class="program-detail-footer">
        <small>更新于 {{ new Date(detail.updatedAt).toLocaleString() }}</small><Button danger @click="remove(detail)">删除项目</Button>
      </footer>
    </template>

    <EntityCreateFlow
      v-model:open="createOpen"
      kind="special_program"
      @manual="edit()"
    />
    <Modal
      v-model:open="editorOpen"
      :title="form.id ? '编辑特殊入学项目' : '新增特殊入学项目'"
      :width="860"
      :footer="null"
      :mask-closable="!saving"
      :closable="!saving"
      :keyboard="!saving"
    >
      <form class="program-editor" @submit.prevent="save">
        <p v-if="editorError" class="form-error" role="alert">
          {{ editorError }}
        </p>
        <fieldset>
          <legend>基本信息</legend>
          <div class="program-form-grid">
            <label class="program-form-wide">项目名称
              <Input
                v-model:value="form.name"
                required
                :maxlength="240"
                :disabled="saving"
                placeholder="例如：某大学 International Graduate Program"
            /></label>
            <label>项目类型<Select
                v-accessible-select
                v-model:value="form.category"
                :disabled="saving"
                :options="categories.map((c) => ({ value: c, label: c }))"
            /></label>
            <label>申请状态<Select
                v-accessible-select
                v-model:value="form.status"
                :disabled="saving"
                :options="
                  Object.entries(PROGRAM_STATUSES).map(([value, label]) => ({
                    value,
                    label,
                  }))
                "
            /></label>
            <label>申请学位<Select
                v-accessible-select
                v-model:value="form.degree"
                :disabled="saving"
                :options="[
                  { value: '', label: '待确定' },
                  ...Object.entries(PROGRAM_DEGREES).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]"
            /></label>
            <label>授课语言<Input
                v-model:value="form.language"
                :maxlength="240"
                :disabled="saving"
                placeholder="例如：英语 / 日语"
            /></label>
            <label>入学时间<Input
                v-model:value="form.intake"
                :maxlength="160"
                :disabled="saving"
                placeholder="例如：2027 年 9 月"
            /></label>
            <label>项目官网<Input
                v-model:value="form.website"
                type="url"
                :maxlength="2048"
                :disabled="saving"
                placeholder="https://…"
            /></label>
            <label class="program-form-wide">项目简介<Input.TextArea
                v-model:value="form.summary"
                :rows="2"
                :maxlength="2000"
                :disabled="saving"
                placeholder="这个项目有什么特点，为什么感兴趣？"
            /></label>
          </div>
          <Checkbox v-model:checked="form.favorite" :disabled="saving">
            关注这个项目
          </Checkbox>
        </fieldset>
        <fieldset>
          <legend>所属院校</legend>
          <p class="program-form-help">
            可关联大学清单中的档案；尚未整理学校时，也可以先填写院校名称。
          </p>
          <div class="program-form-grid">
            <label>关联大学<Select
                v-accessible-select
                v-model:value="form.universityId"
                :options="universityOptions"
                :disabled="saving"
                @change="changeUniversity"
            /></label>
            <label v-if="!form.universityId">院校名称<Input
                v-model:value="form.institutionName"
                :maxlength="240"
                :disabled="saving"
                placeholder="可稍后关联大学档案"
            /></label>
            <label>关联研究科<Select
                v-accessible-select
                v-model:value="form.schoolId"
                :options="schoolOptions"
                :disabled="saving || !form.universityId"
                @change="changeSchool"
            /></label>
            <label>关联专攻<Select
                v-accessible-select
                v-model:value="form.majorId"
                :options="majorOptions"
                :disabled="saving || !form.schoolId"
            /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>申请时间</legend>
          <div class="program-form-grid">
            <label>出愿开始<Input
                v-model:value="form.applicationStart"
                type="date"
                min="1900-01-01"
                max="2200-12-31"
                :disabled="saving"
/></label><label>出愿截止<Input
                v-model:value="form.applicationEnd"
                type="date"
                :min="form.applicationStart || '1900-01-01'"
                max="2200-12-31"
                :disabled="saving"
/></label><label>考核日期<Input
                v-model:value="form.assessmentDate"
                type="date"
                min="1900-01-01"
                max="2200-12-31"
                :disabled="saving"
/></label><label>结果公布<Input
                v-model:value="form.resultDate"
                type="date"
                min="1900-01-01"
                max="2200-12-31"
                :disabled="saving"
            /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>要求与材料</legend>
          <div class="program-form-grid">
            <label class="program-form-wide">申请资格<Input.TextArea
                v-model:value="form.eligibility"
                :rows="3"
                :maxlength="8000"
                :disabled="saving"
                placeholder="学历、专业背景、事前联络等要求"
/></label><label class="program-form-wide">语言要求<Input.TextArea
                v-model:value="form.languageRequirements"
                :rows="2"
                :maxlength="4000"
                :disabled="saving"
                placeholder="按该项目的官方要求记录"
/></label><label class="program-form-wide">出愿材料<Input.TextArea
                v-model:value="form.applicationMaterials"
                :rows="3"
                :maxlength="8000"
                :disabled="saving"
/></label><label class="program-form-wide">选拔方式与考核<Input.TextArea
                v-model:value="form.assessment"
                :rows="2"
                :maxlength="4000"
                :disabled="saving"
                placeholder="例如：材料审查、笔试、面试及具体说明"
            /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>费用与补充</legend>
          <div class="program-form-grid">
            <label>项目费用<Input.TextArea
                v-model:value="form.fees"
                :rows="3"
                :maxlength="4000"
                :disabled="saving"
/></label><label>奖学金与资助<Input.TextArea
                v-model:value="form.scholarships"
                :rows="3"
                :maxlength="4000"
                :disabled="saving"
/></label><label class="program-form-wide">备注<Input.TextArea
                v-model:value="form.notes"
                :rows="3"
                :maxlength="8000"
                :disabled="saving"
            /></label>
          </div>
        </fieldset>
        <footer>
          <Button :disabled="saving" @click="editorOpen = false">取消</Button><Button type="primary" html-type="submit" :loading="saving">
            {{ form.id ? '保存修改' : '创建项目' }}
          </Button>
        </footer>
      </form>
    </Modal>
  </section>
</template>
<style scoped src="./special-programs.css"></style>
