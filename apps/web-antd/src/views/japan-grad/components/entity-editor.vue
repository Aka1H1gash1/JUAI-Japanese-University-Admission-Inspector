<script setup lang="ts">
import type { EditorFields, EntityKind } from '../explorer';

import { computed, ref, watch } from 'vue';

import { App, Button, Input, Modal, Select } from 'ant-design-vue';

import { titleOptions, useExplorerStore, websiteUrl } from '../explorer';

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
const error = ref('');
const kindLabel = computed(
  () =>
    ({
      university: '大学',
      school: '研究科',
      major: '专攻',
      professor: '老师',
    })[props.kind],
);
const dialogTitle = computed(
  () => `${props.entityId ? '编辑' : '新增'}${kindLabel.value}`,
);
const categoryOptions = [
  { label: '暂不填写', value: '' },
  { label: '国立', value: '国立' },
  { label: '公立', value: '公立' },
  { label: '私立', value: '私立' },
  { label: '其他', value: '其他' },
];

watch(open, (value) => {
  if (!value) return;
  error.value = '';
  form.value = {
    name: '',
    japaneseName: '',
    location: '',
    category: '',
    research: '',
    title: '',
    laboratory: '',
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
  }[props.kind];
  const existing = source.find((item) => item.id === props.entityId);
  if (existing) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === 'string') form.value[key] = value;
    }
  }
});

function save() {
  const name = form.value.name?.trim();
  if (!name) {
    error.value = `请填写${kindLabel.value}名称。`;
    return;
  }
  const websiteFields =
    props.kind === 'professor'
      ? ['personalWebsite', 'laboratoryWebsite']
      : ['website'];
  if (
    websiteFields.some(
      (field) =>
        form.value[field]?.trim() && !websiteUrl(form.value[field].trim()),
    )
  ) {
    error.value = '请填写有效的网站地址，例如 https://example.ac.jp。';
    return;
  }
  if (
    form.value.email?.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())
  ) {
    error.value = '请检查邮箱格式。';
    return;
  }
  if (props.kind !== 'university') {
    const parents = {
      school: store.universities,
      major: store.schools,
      professor: store.majors,
    }[props.kind];
    const parentExists = parents.some((item) => item.id === props.parentId);
    if (!parentExists) {
      error.value = '所属记录已不存在，请返回上一级。';
      return;
    }
  }
  const siblings = {
    university: store.universities,
    school: store.schoolsFor(props.parentId ?? ''),
    major: store.majorsFor(props.parentId ?? ''),
    professor: store.professorsFor(props.parentId ?? ''),
  }[props.kind];
  if (
    siblings.some(
      (item) =>
        item.id !== props.entityId &&
        item.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    error.value = `这里已经有同名的${kindLabel.value}，可以编辑已有记录。`;
    return;
  }
  const id = store.saveEntity(
    props.kind,
    form.value,
    props.parentId,
    props.entityId,
  );
  open.value = false;
  message.success(`${kindLabel.value}已${props.entityId ? '更新' : '添加'}`);
  emit('saved', id);
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="dialogTitle"
    :footer="null"
    :width="620"
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
        <div class="field full">
          <label for="entity-name">{{ kind === 'professor' ? '老师姓名' : `${kindLabel}名称` }}
            <span>*</span></label><Input
            id="entity-name"
            v-model:value="form.name"
            :maxlength="120"
            :status="error && !form.name?.trim() ? 'error' : undefined"
            :placeholder="`填写${kindLabel}的名称`"
            autofocus
          />
        </div>
        <div class="field" :class="{ full: kind === 'school' }">
          <label for="entity-japanese">日文名称</label><Input
            id="entity-japanese"
            v-model:value="form.japaneseName"
            :maxlength="120"
            placeholder="可选"
          />
        </div>
        <template v-if="kind === 'university'">
          <div class="field">
            <label for="entity-category">大学类型</label><Select
              id="entity-category"
              v-model:value="form.category"
              :options="categoryOptions"
            />
          </div>
          <div class="field full">
            <label for="entity-location">所在地</label><Input
              id="entity-location"
              v-model:value="form.location"
              :maxlength="120"
              placeholder="都道府县 / 城市，可选"
            />
          </div>
        </template>
        <template v-if="kind === 'professor'">
          <div class="field">
            <label for="entity-title">职称</label><Select
              id="entity-title"
              v-model:value="form.title"
              :options="titleOptions"
              allow-clear
              placeholder="请选择职称"
            />
          </div>
          <div class="field full">
            <label for="entity-laboratory">研究室名称</label><Input
              id="entity-laboratory"
              v-model:value="form.laboratory"
              :maxlength="120"
              placeholder="可选"
            />
          </div>
        </template>
        <div v-if="kind !== 'university'" class="field full">
          <label for="entity-research">{{
            kind === 'school' ? '学科 / 研究领域' : '研究方向'
          }}</label><Input
            id="entity-research"
            v-model:value="form.research"
            :maxlength="500"
            placeholder="填写感兴趣的领域或关键词，可选"
          />
        </div>
        <div v-if="kind === 'professor'" class="field full">
          <label for="entity-email">联系邮箱</label><Input
            id="entity-email"
            v-model:value="form.email"
            :maxlength="254"
            placeholder="可选"
          />
        </div>
        <div v-if="kind !== 'professor'" class="field full">
          <label for="entity-website">官网地址</label><Input
            id="entity-website"
            v-model:value="form.website"
            :maxlength="2048"
            placeholder="https://…，可选"
          />
        </div>
        <template v-if="kind === 'professor'">
          <div class="field full">
            <label for="entity-personal-website">老师个人主页</label><Input
              id="entity-personal-website"
              v-model:value="form.personalWebsite"
              :maxlength="2048"
              placeholder="https://…，可选"
            />
          </div>
          <div class="field full">
            <label for="entity-laboratory-website">研究室主页</label><Input
              id="entity-laboratory-website"
              v-model:value="form.laboratoryWebsite"
              :maxlength="2048"
              placeholder="https://…，可选"
            />
          </div>
        </template>
        <div class="field full">
          <label for="entity-notes">{{
            kind === 'professor' ? '关注理由 / 个人备注' : '个人备注'
          }}</label><Input.TextArea
            id="entity-notes"
            v-model:value="form.notes"
            :maxlength="4000"
            :rows="3"
            placeholder="记录你感兴趣的理由、需要确认的信息……"
          />
        </div>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-footer">
        <span>仅名称必填，其余可以稍后补充</span><Button @click="open = false">取消</Button><Button type="primary" html-type="submit">
          {{ props.entityId ? '保存修改' : `添加${kindLabel}` }}
        </Button>
      </div>
    </form>
  </Modal>
</template>
