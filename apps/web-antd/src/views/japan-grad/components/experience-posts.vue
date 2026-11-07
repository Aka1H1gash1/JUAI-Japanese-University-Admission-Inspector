<script setup lang="ts">
import type { ExperiencePost, ExperienceSearch } from '../experience-posts';

import { computed, reactive, ref, watch } from 'vue';

import { App, Button, Input, Modal, Select } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import ListPagination from './list-pagination.vue';

const props = defineProps<{
  schoolId?: string;
  universityId?: string;
  candidates?: ExperienceSearch;
  candidatesOnly?: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const selectedSchool = ref(props.schoolId || '');
const majorId = ref('');
const query = ref('');
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const items = ref<ExperiencePost[]>([]);
const loading = ref(false);
const searching = ref(false);
const saving = ref(false);
const loadError = ref('');
const localCandidates = ref<ExperienceSearch>();
const candidates = computed(() => localCandidates.value || props.candidates);
const editorOpen = ref(false);
const draft = reactive({
  id: '',
  version: 0,
  schoolId: '',
  majorId: '',
  title: '',
  url: '',
  author: '',
  language: '',
  year: '',
  notes: '',
  origin: 'manual',
});
const schools = computed(() =>
  store.schools.filter(
    (s) => !props.universityId || s.universityId === props.universityId,
  ),
);
const majors = computed(() =>
  selectedSchool.value
    ? store.majorsFor(selectedSchool.value)
    : store.majors.filter((m) =>
        schools.value.some((s) => s.id === m.schoolId),
      ),
);
function platform(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '原帖';
  }
}
function schoolName(id: string) {
  return store.schools.find((s) => s.id === id)?.name || '';
}
function majorName(id: string) {
  return store.majors.find((m) => m.id === id)?.name || '研究科通用';
}

const editorMajors = computed(() => store.majorsFor(draft.schoolId));
const schoolOptions = computed(() =>
  schools.value.map((s) => ({
    value: s.id,
    label: `${store.universities.find((u) => u.id === s.universityId)?.name || ''} / ${s.name}`,
  })),
);
let generation = 0;
async function load() {
  const token = ++generation;
  if ((!selectedSchool.value && !props.universityId) || props.candidatesOnly)
    return;
  loading.value = true;
  loadError.value = '';
  try {
    const params = new URLSearchParams({
      schoolId: selectedSchool.value,
      universityId: props.universityId || '',
      majorId: majorId.value,
      q: query.value,
      page: String(page.value),
      pageSize: String(pageSize.value),
    });
    const result = await localApi<{
      items: ExperiencePost[];
      total: number;
      page: number;
    }>(`/experience-posts?${params}`);
    if (token !== generation) return;
    items.value = result.items;
    total.value = result.total;
    page.value = result.page;
  } catch (error) {
    if (token === generation)
      loadError.value = error instanceof Error ? error.message : '读取失败';
  } finally {
    if (token === generation) loading.value = false;
  }
}
watch(
  () => props.schoolId,
  (value) => {
    selectedSchool.value = value || '';
  },
);
watch(selectedSchool, () => {
  items.value = [];
  total.value = 0;
  majorId.value = '';
  query.value = '';
  localCandidates.value = undefined;
});
watch([selectedSchool, majorId, query, pageSize], () => {
  page.value = 1;
});
watch(
  [selectedSchool, majorId, query, page, pageSize],
  (_, __, cleanup) => {
    generation++;
    const timer = setTimeout(() => void load(), 200);
    cleanup(() => clearTimeout(timer));
  },
  { immediate: true },
);
function edit(
  post?: ExperiencePost,
  candidate?: { title: string; url: string; snippet: string },
) {
  const school = post?.schoolId || selectedSchool.value;
  if (!school) {
    message.info('请先选择经验帖所属研究科。');
    return;
  }
  Object.assign(
    draft,
    {
      id: '',
      version: 0,
      schoolId: school,
      majorId: majorId.value,
      title: '',
      url: '',
      author: '',
      language: '',
      year: '',
      notes: '',
      origin: 'manual',
    },
    post || {},
  );
  if (candidate)
    Object.assign(draft, {
      title: candidate.title,
      url: candidate.url,
      notes: `搜索摘要（尚未核对原文）：\n${candidate.snippet}`,
      origin: 'search',
    });
  editorOpen.value = true;
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const result = await localApi<ExperiencePost & { duplicate?: boolean }>(
      `/experience-posts${draft.id ? `/${draft.id}` : ''}`,
      jsonOptions(draft.id ? 'PUT' : 'POST', { ...draft }),
    );
    message.success(
      result.duplicate
        ? '该链接已收录，保留已有内容。'
        : '经验帖已保存到研究科。',
    );
    editorOpen.value = false;
    emit('changed');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}
function remove(post: ExperiencePost) {
  modal.confirm({
    title: `移除「${post.title}」？`,
    content: '只移除本工作区收藏，不影响原网站。',
    okText: '移除',
    cancelText: '取消',
    async onOk() {
      try {
        await localApi(
          `/experience-posts/${post.id}`,
          jsonOptions('DELETE', { version: post.version }),
        );
        emit('changed');
        await load();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '移除失败');
      }
    },
  });
}
async function search() {
  if (searching.value || !selectedSchool.value) return;
  const major = majorId.value;
  const school = selectedSchool.value;
  searching.value = true;
  try {
    const result = await localApi<ExperienceSearch>(
      '/experience-posts/search',
      jsonOptions('POST', { schoolId: school, majorId: major }),
    );
    if (school === selectedSchool.value && major === majorId.value)
      localCandidates.value = { ...result, status: 'complete' };
  } catch (error) {
    message.error(error instanceof Error ? error.message : '搜索失败');
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <section class="experience-posts" aria-label="经验帖汇集">
    <header class="collection-heading">
      <div>
        <h2>
          经验帖汇集<span v-if="!candidatesOnly">{{ total }}</span>
        </h2>
        <p v-if="!universityId">
          按研究科汇集出愿、笔试与面试经历，语言和平台不限。
        </p>
      </div>
      <div v-if="!candidatesOnly" class="experience-actions">
        <Button
          :loading="searching"
          :disabled="!selectedSchool"
          @click="search"
        >
          AI 搜索经验帖
        </Button>
        <Button type="primary" :disabled="!selectedSchool" @click="edit()">
          添加经验帖
        </Button>
      </div>
    </header>
    <p class="experience-note">
      经验帖反映作者当时的个人经历；请核对适用专攻与年份，当前招生要求以官方募集要项为准。
    </p>
    <div class="experience-filters">
      <Select
        v-if="!schoolId"
        v-model:value="selectedSchool"
        :options="
          universityId
            ? [{ value: '', label: '全部研究科' }, ...schoolOptions]
            : schoolOptions
        "
        placeholder="选择保存到哪个研究科"
        aria-label="经验帖所属研究科"
        show-search
        :filter-option="
          (input, option) =>
            String(option?.label).toLowerCase().includes(input.toLowerCase())
        "
      />
      <Select
        v-model:value="majorId"
        :options="[
          {
            value: '',
            label: candidatesOnly ? '研究科通用／待核对专攻' : '全部专攻',
          },
          ...majors.map((m) => ({ value: m.id, label: m.name })),
        ]"
        aria-label="经验帖专攻"
      />
      <Input
        v-if="!candidatesOnly"
        v-model:value="query"
        allow-clear
        placeholder="搜索标题、作者、语言或备注"
        aria-label="搜索经验帖"
      />
    </div>
    <p v-if="universityId && !selectedSchool" class="experience-note">
      正在汇总全校经验帖。选择研究科后，可以新增或搜索该研究科的帖子。
    </p>
    <section
      v-if="candidates"
      class="experience-candidates"
      aria-label="经验帖搜索候选"
    >
      <h3>搜索候选 · {{ candidates.results.length }}</h3>
      <p v-if="candidates.query">{{ candidates.query }}</p>
      <p v-if="candidates.error" role="alert">{{ candidates.error }}</p>
      <p v-else-if="!candidates.results.length">
        暂未找到候选。可以手动添加链接，或稍后再试。
      </p>
      <p v-else>
        仅为搜索结果，尚未核对原文与所属关系。打开核对后，选择研究科和专攻收录。
      </p>
      <div class="experience-card-grid">
        <article
          v-for="item in candidates.results"
          :key="item.url"
          class="experience-card is-candidate"
        >
          <div class="experience-card-top">
            <span class="experience-platform">{{ platform(item.url) }}</span><span class="experience-status">待核对</span>
          </div>
          <h3>
            <a
              :href="item.url"
              :title="item.title"
              target="_blank"
              rel="noopener noreferrer"
              >{{ item.title }}</a>
          </h3>
          <p class="experience-excerpt">
            {{
              item.snippet || '打开原帖查看完整经历，再核对所属研究科和专攻。'
            }}
          </p>
          <footer>
            <a :href="item.url" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a><Button :disabled="!selectedSchool" @click="edit(undefined, item)">
              核对并收录
            </Button>
          </footer>
        </article>
      </div>
    </section>
    <template v-if="!candidatesOnly">
      <p v-if="loadError" role="alert">
        {{ loadError }} <Button @click="load">重试</Button>
      </p>
      <p v-if="loading" role="status">正在读取经验帖…</p>
      <div class="experience-card-grid">
        <article
          v-for="item in items"
          :key="item.id"
          class="experience-card experience-entry"
        >
          <div class="experience-card-top">
            <span class="experience-platform">{{ platform(item.url) }}</span><span class="experience-year">{{
              item.year ? `${item.year} 年` : '年份未标注'
            }}</span>
          </div>
          <h3>
            <a
              :href="item.url"
              :title="item.title"
              target="_blank"
              rel="noopener noreferrer"
              >{{ item.title }}</a>
          </h3>
          <div class="experience-tags">
            <span>{{ schoolName(item.schoolId) }}</span><span>{{ majorName(item.majorId) }}</span><span v-if="item.language">{{ item.language }}</span>
          </div>
          <p class="experience-excerpt">
            {{
              item.notes || '还没有阅读备注，可以打开原帖后记下对你有用的信息。'
            }}
          </p>
          <details v-if="item.notes" class="experience-full-notes">
            <summary>展开完整备注</summary>
            <p>{{ item.notes }}</p>
          </details>
          <p class="experience-byline">
            {{
              [item.author, item.origin === 'search' ? '搜索收录' : '手动添加']
                .filter(Boolean)
                .join(' · ')
            }}
          </p>
          <footer>
            <a :href="item.url" target="_blank" rel="noopener noreferrer">阅读原帖 ↗</a>
            <div>
              <Button type="text" @click="edit(item)">编辑</Button><Button type="text" danger @click="remove(item)">移除</Button>
            </div>
          </footer>
        </article>
      </div>
      <p v-if="!loading && !loadError && !items.length" class="search-empty">
        还没有符合条件的经验帖。添加你读过的帖子，或搜索并核对收录。
      </p>
      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
      />
    </template>
    <Modal
      v-model:open="editorOpen"
      :title="draft.id ? '编辑经验帖' : '添加经验帖'"
      :confirm-loading="saving"
      ok-text="保存到研究科"
      cancel-text="取消"
      @ok="save"
    >
      <form class="experience-form" @submit.prevent="save">
        <label>标题<Input v-model:value="draft.title" :maxlength="500" /></label>
        <label>原帖链接<Input
            v-model:value="draft.url"
            placeholder="https://…"
            :maxlength="4096"
        /></label>
        <label>所属专攻<Select
            v-model:value="draft.majorId"
            :options="[
              { value: '', label: '研究科通用／待核对专攻' },
              ...editorMajors.map((m) => ({ value: m.id, label: m.name })),
            ]"
        /></label>
        <label>经历年份（可留空）<Input
            v-model:value="draft.year"
            placeholder="如 2027，未知不填"
            :maxlength="4"
        /></label>
        <label>作者（可留空）<Input v-model:value="draft.author" :maxlength="240" /></label>
        <label>语言（可留空）<Input
            v-model:value="draft.language"
            placeholder="中文、日本語、English…"
            :maxlength="120"
        /></label>
        <label>备注／要点<Input.TextArea
            v-model:value="draft.notes"
            :rows="4"
            :maxlength="8000"
        /></label>
      </form>
    </Modal>
  </section>
</template>

<style scoped src="../experience-posts.css" />
