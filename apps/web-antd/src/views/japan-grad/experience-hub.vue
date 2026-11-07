<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Button, Input, Switch } from 'ant-design-vue';

import ExperiencePosts from './components/experience-posts.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ListPagination from './components/list-pagination.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore } from './explorer';
import { localApi } from './local-api';
import { usePagination } from './use-pagination';

const store = useExplorerStore();
const route = useRoute();
const query = ref('');
const collectedOnly = ref(false);
const loadError = ref('');
const counts = ref<Record<string, { total: number; schoolCount: number }>>({});
const universityId = computed(() => String(route.params.universityId || ''));
const university = computed(() =>
  store.universities.find((u) => u.id === universityId.value),
);
let generation = 0;
async function load() {
  const token = ++generation;
  try {
    const result = await localApi<{
      items: { universityId: string; total: number; schoolCount: number }[];
    }>('/experience-posts/summary');
    if (token !== generation) return;
    counts.value = Object.fromEntries(
      result.items.map((row) => [row.universityId, row]),
    );
    loadError.value = '';
  } catch (error) {
    if (token === generation)
      loadError.value =
        error instanceof Error ? error.message : '读取经验帖数量失败';
  }
}
watch(universityId, () => void load(), { immediate: true });
const total = computed(() =>
  Object.values(counts.value).reduce((sum, row) => sum + row.total, 0),
);
const visible = computed(() =>
  store.universities
    .filter(
      (u) =>
        (!collectedOnly.value || counts.value[u.id]?.total) &&
        `${u.name} ${u.japaneseName} ${u.location}`
          .toLowerCase()
          .includes(query.value.trim().toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        (counts.value[b.id]?.total || 0) - (counts.value[a.id]?.total || 0) ||
        a.name.localeCompare(b.name, 'zh-CN'),
    ),
);
const {
  page,
  pageSize,
  paged,
  total: universityCount,
} = usePagination(visible, [query, collectedOnly]);
</script>

<template>
  <section class="explorer-page experience-hub">
    <template v-if="!universityId">
      <header class="experience-hub-heading">
        <div>
          <span class="experience-eyebrow">出愿 · 笔试 · 面试</span>
          <h1>经验帖</h1>
          <p>选一所大学，读读走过这条路的人留下的经验。</p>
        </div>
        <div class="experience-hub-stat">
          <strong>{{ total }}</strong><span>篇已收录经验</span>
        </div>
      </header>
      <div class="experience-hub-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          placeholder="搜索大学名称或所在地"
          aria-label="搜索经验帖大学"
        >
          <template #prefix><ExplorerIcon name="search" /></template>
</Input><label><Switch
            v-model:checked="collectedOnly"
            aria-label="只看已有经验帖的大学"
            size="small"
          />只看已收录</label>
      </div>
      <p v-if="loadError" role="alert">
        {{ loadError }} <Button @click="load">重试</Button>
      </p>
      <div class="experience-university-grid">
        <RouterLink
          v-for="u in paged"
          :key="u.id"
          :to="`/japan-grad/experiences/${u.id}`"
          class="experience-university-card"
        >
          <div class="experience-university-top">
            <UniversityLogo :logo-id="u.logoId" :name="u.name" /><span
              class="experience-university-count"
              >{{ counts[u.id]?.total || 0 }} 篇</span>
          </div>
          <h2>{{ u.name }}</h2>
          <p v-if="u.japaneseName && u.japaneseName !== u.name">
            {{ u.japaneseName }}
          </p>
          <div class="experience-university-meta">
            <span>{{ u.location || '所在地未填写' }}</span><span>{{ store.schoolsFor(u.id).length }} 个研究科</span>
          </div>
          <footer>
            <span>{{
              counts[u.id]?.total
                ? `${counts[u.id]?.schoolCount} 个研究科已有经验`
                : '从第一篇经验开始积累'
            }}</span><ExplorerIcon name="arrow" />
          </footer>
        </RouterLink>
      </div>
      <section v-if="!visible.length" class="search-empty">
        <ExplorerIcon name="book" />
        <h2>
          {{
            store.universities.length
              ? '没有符合条件的大学'
              : '先添加一所感兴趣的大学'
          }}
        </h2>
        <p>经验帖会与大学、研究科和专攻关联，保存在你的工作区。</p>
        <RouterLink
          v-if="!store.universities.length"
          to="/japan-grad/universities"
        >
          前往大学清单 →
</RouterLink><Button
          v-else
          @click="
            query = '';
            collectedOnly = false;
          "
        >
          查看全部大学
        </Button>
      </section>
      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="universityCount"
      />
    </template>
    <template v-else-if="university">
      <nav class="explorer-breadcrumb" aria-label="当前位置">
        <RouterLink to="/japan-grad/experiences">经验帖</RouterLink><ExplorerIcon name="chevron" /><span>{{ university.name }}</span>
      </nav>
      <header class="experience-hub-heading is-university">
        <div class="experience-selected-university">
          <UniversityLogo
            :logo-id="university.logoId"
            :name="university.name"
            large
          />
          <div>
            <span class="experience-eyebrow">校内经验合集</span>
            <h1>{{ university.name }}</h1>
            <p>汇集各研究科的出愿、笔试与面试经验。</p>
          </div>
        </div>
        <RouterLink to="/japan-grad/experiences" class="experience-back">
          切换大学 ↗
        </RouterLink>
      </header>
      <ExperiencePosts
        :key="university.id"
        :university-id="university.id"
        @changed="load"
      />
    </template>
    <section v-else class="search-empty">
      <h1>这所大学已不存在</h1>
      <RouterLink to="/japan-grad/experiences">返回经验帖专栏 →</RouterLink>
    </section>
  </section>
</template>

<style scoped>
.experience-hub-heading {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 28px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--jg-line);
}

.experience-eyebrow {
  display: block;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--jg-accent-text);
  letter-spacing: 0.12em;
}

.experience-hub-heading h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.3;
}

.experience-hub-heading p {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.experience-hub-stat {
  display: grid;
  flex-shrink: 0;
  gap: 6px;
  text-align: right;
}

.experience-hub-stat strong {
  font-size: 44px;
  font-weight: 600;
  line-height: 1;
  color: var(--jg-accent-text);
}

.experience-hub-stat span {
  font-size: 12px;
  color: var(--jg-muted);
}

.experience-hub-toolbar {
  display: flex;
  gap: 24px;
  align-items: center;
  margin-bottom: 24px;
}

.experience-hub-toolbar > .ant-input-affix-wrapper {
  max-width: 420px;
}

.experience-hub-toolbar label {
  display: flex;
  flex-shrink: 0;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: var(--jg-secondary);
}

.experience-university-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.experience-university-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 24px;
  color: var(--jg-text);
  text-decoration: none;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 18px;
  transition:
    border-color 0.2s,
    transform 0.2s;
}

.experience-university-card:hover {
  border-color: var(--jg-accent);
  transform: translateY(-3px);
}

.experience-university-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.experience-university-count {
  padding: 5px 10px;
  font-size: 12px;
  color: var(--jg-accent-text);
  background: var(--jg-accent-soft);
  border-radius: 8px;
}

.experience-university-card h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.experience-university-card > p {
  margin: 0;
  font-size: 12px;
  color: var(--jg-muted);
}

.experience-university-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--jg-secondary);
}

.experience-university-card footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  margin-top: auto;
  font-size: 12px;
  color: var(--jg-muted);
  border-top: 1px solid var(--jg-line);
}

.experience-university-card footer svg {
  width: 18px;
  height: 18px;
  color: var(--jg-accent-text);
}

.experience-selected-university {
  display: flex;
  gap: 20px;
  align-items: center;
  min-width: 0;
}

.experience-selected-university h1 {
  font-size: 28px;
  overflow-wrap: anywhere;
}

.experience-hub-heading.is-university {
  padding-bottom: 20px;
  margin-bottom: 8px;
}

.experience-back {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--jg-accent-text);
}

@media (max-width: 1100px) {
  .experience-university-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .experience-university-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .experience-hub-toolbar {
    flex-wrap: wrap;
    gap: 14px;
  }

  .experience-hub-heading {
    gap: 16px;
    align-items: flex-start;
  }

  .experience-hub-heading h1 {
    font-size: 28px;
  }

  .experience-hub-stat strong {
    font-size: 32px;
  }

  .is-university {
    flex-direction: column;
  }

  .experience-selected-university {
    gap: 14px;
    align-items: flex-start;
  }

  .experience-selected-university h1 {
    font-size: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .experience-university-card {
    transition: none;
  }
}
</style>
