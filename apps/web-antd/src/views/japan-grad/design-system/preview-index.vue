<script setup lang="ts">
import { computed } from 'vue';

import { useExplorerStore } from '../explorer';
import { labContext, majorPath } from '../lab-targets';
import ContentSection from './content-section.vue';
import EmptyState from './empty-state.vue';
import PageHeading from './page-heading.vue';
const store = useExplorerStore();
const majors = computed(() =>
  store.majors.flatMap((major) => {
    const school = store.schools.find((item) => item.id === major.schoolId);
    const university = store.universities.find(
      (item) => item.id === school?.universityId,
    );
    return school && university
      ? [
          {
            id: major.id,
            title: major.name,
            context: `${university.name} / ${school.name}`,
            path: `/japan-grad/universities/${university.id}/schools/${school.id}/majors/${major.id}`,
          },
        ]
      : [];
  }),
);
const labs = computed(() =>
  store.labs.flatMap((lab) => {
    const target = labContext(store, lab.id);
    return target
      ? [
          {
            id: lab.id,
            title: lab.name,
            context: target.major.name,
            path: `${majorPath(target)}/labs/${lab.id}`,
          },
        ]
      : [];
  }),
);
</script>
<template>
  <div class="juai-design juai-stack">
    <PageHeading
      title="JUAI 1.0 · 页面验收入口"
      context="阶段 4 / 正式实体页面"
      description="个人档案、招生信息与研究室三种信息结构，使用当前工作区真实资料。"
    />
    <ContentSection title="个人档案" subtitle="身份优先，阅读与编辑分离">
      <RouterLink class="preview-profile-link" to="/japan-grad/settings">
        查看个人档案 <span>→</span>
      </RouterLink>
    </ContentSection>
    <div class="juai-panel-grid">
      <ContentSection title="专攻 · 招生阅读页">
        <ul v-if="majors.length" class="preview-links">
          <li v-for="item in majors" :key="item.id">
            <RouterLink :to="{ path: item.path, query: { design: '1' } }">
              <strong>{{ item.title }}</strong>
              <p>{{ item.context }}</p>
              <span>查看页面 →</span>
            </RouterLink>
          </li>
        </ul>
        <EmptyState
          v-else
          title="工作区尚无专攻"
          description="添加真实资料后可在此查看原型。"
        />
</ContentSection><ContentSection title="研究室 · 学术资料页">
        <ul v-if="labs.length" class="preview-links">
          <li v-for="item in labs" :key="item.id">
            <RouterLink :to="{ path: item.path, query: { design: '1' } }">
              <strong>{{ item.title }}</strong>
              <p>{{ item.context }}</p>
              <span>查看页面 →</span>
            </RouterLink>
          </li>
        </ul>
        <EmptyState v-else title="工作区尚无研究室" />
      </ContentSection>
    </div>
    <p class="juai-scope-note">
      大学清单、大学、研究科、专攻、研究室与教师页面已使用正式阅读布局；申请工作台与全局剩余页面将在后续阶段继续重构。尚未部署至服务器。
    </p>
  </div>
</template>
<style scoped>
.preview-profile-link {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
}

.preview-links {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.preview-links a {
  display: block;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--jg-line);
}

.preview-links li:last-child a {
  padding-bottom: 0;
  border-bottom: 0;
}

.preview-links strong {
  font-size: 15px;
  font-weight: 500;
}

.preview-links p {
  margin: 6px 0;
  font-size: 11px;
  color: var(--jg-muted);
}

.preview-links span {
  font-size: 12px;
  color: var(--jg-accent-text);
}
</style>
