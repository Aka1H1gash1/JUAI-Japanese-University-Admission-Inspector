<script setup lang="ts">
import type {
  CollectionDetail,
  CollectionJob,
  CollectionStatus,
} from './collection-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Button, Select } from 'ant-design-vue';

import {
  COLLECTION_KINDS,
  COLLECTION_NAMES,
  COLLECTION_STATUS,
} from './collection-types';
import CollectionReview from './components/collection-review.vue';
import CollectionStageProgress from './components/collection-stage-progress.vue';
import EntityCreateFlow from './components/entity-create-flow.vue';
import SpecialProgramReview from './components/special-program-review.vue';
import { useExplorerStore } from './explorer';
import { jsonOptions, localApi } from './local-api';
import { requireValue } from './required-value';
import { vAccessibleSelect } from './select-accessibility';
const route = useRoute();
const router = useRouter();
const createOpen = ref(false);
function created(id: string) {
  void router.replace({ path: route.path, query: { ...route.query, job: id } });
}
const store = useExplorerStore();
const config = ref<CollectionStatus>();
const jobs = ref<CollectionJob[]>([]);
function jobLabel(job: CollectionJob) {
  if (job.resultProgramName) return job.resultProgramName;
  const ids = job.resultIds || job.target?.ids || {};
  const lists = {
    university: store.universities,
    school: store.schools,
    major: store.majors,
    lab: store.labs,
    professor: store.professors,
  };
  const names = COLLECTION_KINDS.map(
    (kind) =>
      lists[kind].find((e) => e.id === ids[kind])?.name ||
      job.resultEntities?.find((e) => e.kind === kind)?.name ||
      job.draft?.[kind]?.find((f) => f.field === 'name')?.value,
  ).filter(Boolean);
  return names.join(' / ') || job.requestedProgram || '正在识别档案内容';
}
const detail = ref<CollectionDetail>();
const busy = ref(false);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const running = computed(
  () =>
    !!detail.value &&
    ['analyzing', 'collecting', 'preparing'].includes(detail.value.job.status),
);
const pendingJob = computed<CollectionJob | undefined>(() =>
  loading.value && !detail.value && typeof route.query.job === 'string'
    ? {
        id: route.query.job,
        createdAt: '',
        status: 'preparing',
        message: '等待AI启动',
        error: '',
        urls: [],
        model: '',
      }
    : undefined,
);
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [state, list] = await Promise.all([
      localApi<CollectionStatus>('/collection/status'),
      localApi<CollectionJob[]>('/collection/jobs'),
    ]);
    config.value = state;
    jobs.value = list;
    const requestedJob =
      typeof route.query.job === 'string' ? route.query.job : '';
    if (requestedJob) await view(requestedJob);
    else if (!detail.value && list[0]) await view(list[0].id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '网址解析配置读取失败。';
  } finally {
    loading.value = false;
  }
}
void load();
watch(
  () => route.query.job,
  () => {
    generation++;
    clearTimeout(timer);
    detail.value = undefined;
    void load();
  },
);
async function view(id: string) {
  const version = ++generation;
  clearTimeout(timer);
  try {
    const result = await localApi<CollectionDetail>(`/collection/jobs/${id}`);
    if (version !== generation) return;
    detail.value = result;
    const i = jobs.value.findIndex((j) => j.id === id);
    if (i !== -1)
      jobs.value[i] = { ...requireValue(jobs.value[i]), ...result.job };
    if (['analyzing', 'collecting', 'preparing'].includes(result.job.status))
      timer = setTimeout(() => void view(id), 2000);
  } catch (error) {
    if (version === generation) {
      errorMessage.value =
        error instanceof Error ? error.message : '解析任务读取失败。';
      timer = setTimeout(() => void view(id), 5000);
    }
  }
}
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
async function stop() {
  if (!detail.value) return;
  busy.value = true;
  try {
    await localApi(
      `/collection/jobs/${detail.value.job.id}/stop`,
      jsonOptions('POST', {}),
    );
    await view(detail.value.job.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '停止失败。';
  } finally {
    busy.value = false;
  }
}
async function retry(savedOnly = false) {
  if (!detail.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await localApi(
      `/collection/jobs/${detail.value.job.id}/retry`,
      jsonOptions('POST', { savedOnly }),
    );
    await view(detail.value.job.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重试失败。';
  } finally {
    busy.value = false;
  }
}
async function refreshReview() {
  if (!detail.value) return;
  await store.refresh();
  await view(detail.value.job.id);
}
const resultLink = computed(() => {
  if (detail.value?.job.resultProgramId)
    return `/japan-grad/special-programs/${detail.value.job.resultProgramId}`;
  const ids = detail.value?.job.resultIds;
  if (!ids?.university) return '/japan-grad/universities';
  let path = `/japan-grad/universities/${ids.university}`;
  if (ids.school) path += `/schools/${ids.school}`;
  if (ids.major) path += `/majors/${ids.major}`;
  if (ids.lab) path += `/labs/${ids.lab}`;
  if (ids.professor) path += `/professors/${ids.professor}`;
  return path;
});
const generatedProfiles = computed(() => {
  const job = detail.value?.job;
  const ids = job?.resultIds;
  if (!ids?.university) return [];
  const paths = {
    university: `/japan-grad/universities/${ids.university}`,
    school: `/japan-grad/universities/${ids.university}/schools/${ids.school}`,
    major: `/japan-grad/universities/${ids.university}/schools/${ids.school}/majors/${ids.major}`,
    lab: `/japan-grad/universities/${ids.university}/schools/${ids.school}/majors/${ids.major}/labs/${ids.lab}`,
    professor: `/japan-grad/universities/${ids.university}/schools/${ids.school}/majors/${ids.major}/labs/${ids.lab}/professors/${ids.professor}`,
  };
  const records = {
    university: store.universities,
    school: store.schools,
    major: store.majors,
    lab: store.labs,
    professor: store.professors,
  };
  return COLLECTION_KINDS.filter((kind) => ids[kind]).map((kind) => {
    const saved = job?.resultEntities?.find((e) => e.kind === kind);
    return {
      kind,
      path: paths[kind],
      name:
        records[kind].find((e) => e.id === ids[kind])?.name ||
        saved?.name ||
        COLLECTION_NAMES[kind],
      action: (() => {
        if (saved?.action === 'created') {
          return '已新建';
        }
        if (saved?.action === 'updated') {
          return '已更新';
        }
        return '已关联';
      })(),
    };
  });
});
</script>
<template>
  <section class="information-collection">
    <header class="collection-page-heading">
      <div>
        <h1>网址解析<span>。</span></h1>
      </div>
      <div class="collection-settings-actions">
        <Button type="primary" @click="createOpen = true">新建解析</Button>
        <RouterLink
          to="/japan-grad/ai?advanced=1&returnTo=/japan-grad/collection"
        >
          AI 接入设置 ↗
        </RouterLink>
        <RouterLink to="/japan-grad/settings?tab=browser">
          浏览器设置 ↗
        </RouterLink>
      </div>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
      <Button :loading="loading" @click="load">重试</Button>
    </p>
    <CollectionStageProgress v-if="pendingJob" :job="pendingJob" />
    <section
      v-if="!loading && !errorMessage && !jobs.length"
      class="collection-empty"
      aria-label="尚无解析任务"
    >
      <h2>还没有解析任务</h2>
      <p>粘贴大学、研究科、专攻或研究室链接，开始解析。</p>
      <Button type="primary" @click="createOpen = true">
        输入网址开始解析
      </Button>
    </section>
    <p v-else-if="loading && !jobs.length && !pendingJob" role="status">
      正在读取解析任务…
    </p>
    <section v-if="jobs.length" class="collection-jobs">
      <header>
        <div>
          <h2>解析任务</h2>
        </div>
        <Button :disabled="busy" :loading="loading" @click="load">
          刷新列表
        </Button>
      </header>
      <Select
        v-accessible-select
        :value="detail?.job.id"
        :options="
          jobs.map((j) => ({
            value: j.id,
            label: jobLabel(j),
          }))
        "
        aria-label="选择解析任务"
        @change="(value) => typeof value === 'string' && view(value)"
      />
      <template v-if="detail">
        <CollectionStageProgress :job="detail.job" />
        <section
          v-if="detail.job.status === 'applied'"
          class="collection-generated"
          aria-label="已生成的档案"
        >
          <header>
            <RouterLink :to="resultLink">点击生成的档案</RouterLink>
          </header>
          <div class="collection-generated-grid">
            <RouterLink
              v-for="profile in generatedProfiles"
              :key="profile.kind"
              :to="profile.path"
            >
              <span>{{ COLLECTION_NAMES[profile.kind] }}
                <small>{{ profile.action }}</small></span><strong>{{ profile.name }}</strong><em>查看档案 →</em>
            </RouterLink>
          </div>
        </section>
        <div class="collection-progress">
          <div>
            <span class="collection-job-status">{{
              COLLECTION_STATUS[detail.job.status]
            }}</span><strong v-if="detail.job.status !== 'applied'">{{
              detail.job.message
            }}</strong><small>{{ detail.job.model || '尚未调用模型' }} ·
              {{ detail.job.sources?.length || 0 }} 个已保存来源{{
                detail.job.phase === 'finalizing' && running
                  ? ' · 正在生成草稿'
                  : ''
              }}</small>
          </div>
          <Button v-if="running" :loading="busy" @click="stop">停止解析</Button><Button
            v-else-if="['failed', 'cancelled'].includes(detail.job.status)"
            :loading="busy"
            @click="retry(false)"
          >
            继续解析
</Button><Button
            v-if="
              ['failed', 'cancelled'].includes(detail.job.status) &&
              detail.job.sources?.some((s) => s.readPages.length)
            "
            :loading="busy"
            @click="retry(true)"
          >
            用已读资料生成草稿
</Button><RouterLink
            v-else-if="detail.job.status === 'applied'"
            :to="resultLink"
          >
            查看生成的档案 ↗
          </RouterLink>
        </div>
        <p v-if="detail.job.error" class="form-error">
          {{ detail.job.error }}
        </p>
        <p
          v-if="
            ['failed', 'cancelled'].includes(detail.job.status) &&
            detail.job.sources?.length
          "
          class="collection-help"
        >
          已保存来源不会丢失。“用已读资料生成草稿”只整理现有内容，仍会调用当前配置的
          AI；未读信息保持为空。
        </p>
        <ul v-if="detail.job.warnings?.length" class="collection-warning-list">
          <li v-for="(warning, i) in detail.job.warnings" :key="i">
            {{ warning }}
          </li>
        </ul>
        <details
          v-if="detail.job.log?.length"
          class="collection-activity"
          :open="running"
        >
          <summary>访问记录</summary>
          <ol>
            <li v-for="(item, i) in detail.job.log" :key="i">
              <time>{{ new Date(item.at).toLocaleTimeString() }}</time>{{ item.message }}
            </li>
          </ol>
        </details>
        <div v-if="detail.job.sources?.length" class="collection-sources">
          <article v-for="source in detail.job.sources" :key="source.id">
            <span>{{ source.kind === 'pdf' ? 'PDF' : '网页'
              }}{{ source.via === 'browser' ? ' · 用户浏览器' : '' }}</span><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a><small>{{
                source.kind === 'pdf'
                  ? `已阅读 ${source.readPages.length} / ${source.totalPages} 页`
                  : '已保存网页正文快照'
              }}
              · {{ new Date(source.fetchedAt).toLocaleString() }}</small><a
              v-if="source.kind === 'pdf'"
              :href="`/api/japangrad/collection/jobs/${detail.job.id}/sources/${source.id}/file`"
              target="_blank"
              rel="noopener noreferrer"
              >查看下载的原文件</a>
          </article>
        </div>
        <CollectionReview
          v-if="
            detail.job.status === 'review' &&
            detail.job.draft &&
            config &&
            detail.job.purpose !== 'special_program'
          "
          :key="detail.job.id"
          :detail="detail"
          :config="config"
          @refresh="refreshReview"
          @applied="view(detail.job.id)"
        />
        <SpecialProgramReview
          v-if="
            detail.job.status === 'review' &&
            detail.job.draft &&
            config &&
            detail.job.purpose === 'special_program'
          "
          :key="detail.job.id"
          :detail="detail"
          :config="config"
          @applied="view(detail.job.id)"
        />
        <p v-if="detail.job.status === 'applied'" class="collection-help">
          已入库记录保留原始草稿与来源，后续可在学校、专攻、研究室和资料库中继续维护。
        </p>
      </template>
    </section>
    <EntityCreateFlow
      v-model:open="createOpen"
      kind="university"
      url-only
      @created="created"
    />
  </section>
</template>
<style scoped src="./collection.css"></style>
