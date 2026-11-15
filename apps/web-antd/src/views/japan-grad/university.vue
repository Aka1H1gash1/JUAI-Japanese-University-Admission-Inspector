<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input } from 'ant-design-vue';

import EntityCreateFlow from './components/entity-create-flow.vue';
import EntityEditor from './components/entity-editor.vue';
import ListPagination from './components/list-pagination.vue';
import UniversityLogo from './components/university-logo.vue';
import ContentSection from './design-system/content-section.vue';
import ContextTrail from './design-system/context-trail.vue';
import EmptyState from './design-system/empty-state.vue';
import EntityLinks from './design-system/entity-links.vue';
import PageHeading from './design-system/page-heading.vue';
import { useExplorerStore, websiteUrl } from './explorer';
import { universityAddress, universityGeography } from './japan-geography';
import {
  catalogUniversities,
  findCatalogUniversity,
  universityDisplayGeography,
} from './university-catalog';
import {
  dormitoryLabel,
  formatYen,
  universityBudgetTotals,
  universityFees,
} from './university-fees';
import { usePagination } from './use-pagination';
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { message, modal } = App.useApp();
const universityId = computed(() => String(route.params.universityId || ''));
const university = computed(() =>
  store.universities.find((u) => u.id === universityId.value),
);
const geography = computed(() =>
  universityGeography(
    university.value ? universityDisplayGeography(university.value) : {},
  ),
);
const fees = computed(() =>
  universityFees(university.value || { category: '' }),
);
const feeTotals = computed(() =>
  universityBudgetTotals(university.value || { category: '' }),
);
const directory = computed(() =>
  university.value?.catalogId
    ? catalogUniversities.value.find(
        (u) => u.id === university.value?.catalogId,
      )
    : findCatalogUniversity(university.value?.name || ''),
);
const query = ref('');
const universityEditorOpen = ref(false);
const schoolEditorOpen = ref(false);
const visibleSchools = computed(() =>
  store
    .schoolsFor(universityId.value)
    .filter((s) =>
      [s.name, s.japaneseName, s.research]
        .join(' ')
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
    )
    .toReversed(),
);
watch(universityId, () => (query.value = ''));
function deleteUniversity() {
  if (!university.value) return;
  const id = university.value.id;
  const name = university.value.name;
  modal.confirm({
    title: `删除「${name}」？`,
    content: `该大学下的 ${store.schoolsFor(id).length} 个研究科、${store.universityMajors(id).length} 个专攻、${store.universityLabs(id).length} 个研究室和 ${store.universityProfessors(id).length} 位老师的记录、文件索引和邮件也会一起删除；原文件保留在工作区。删除后无法在界面撤销，可先到「设置 → 本地工作区」备份。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('university', id);
      message.success('大学已删除');
      return router.replace('/japan-grad/universities');
    },
  });
}

const { page, pageSize, total, paged } = usePagination(visibleSchools, [
  query,
  universityId,
]);
const schoolLinks = computed(() =>
  paged.value.map((s) => ({
    id: s.id,
    title: s.name,
    to: `/japan-grad/universities/${universityId.value}/schools/${s.id}`,
    subtitle: s.research || s.japaneseName,
    meta: `${store.majorsFor(s.id).length} 个专攻 · ${store.schoolLabs(s.id).length} 个研究室`,
  })),
);
</script>
<template>
  <section v-if="university" class="juai-design juai-stack">
    <PageHeading
      :title="university.name"
      :description="
        university.japaneseName !== university.name
          ? university.japaneseName
          : undefined
      "
    >
      <template #identity>
        <UniversityLogo
          :catalog-id="university.catalogId"
          :logo-id="university.logoId"
          :name="university.name"
          large
        />
      </template>
      <template #context>
        <ContextTrail
          :items="[{ label: '大学清单', to: '/japan-grad/universities' }]"
        />
      </template>
      <template #meta>
        <a
          v-if="websiteUrl(university.website || directory?.website || '')"
          :href="websiteUrl(university.website || directory?.website || '')"
          target="_blank"
          rel="noopener noreferrer"
          >大学官网 ↗</a><span>{{ university.category || '类型未确认' }}</span><span>{{ geography.region || '地区未确认' }}</span>
      </template>
      <template #actions>
        <Button @click="universityEditorOpen = true">编辑大学</Button><Button type="text" danger @click="deleteUniversity"> 删除 </Button>
      </template>
    </PageHeading>
    <div class="juai-entity-hero">
      <ContentSection title="大学概况">
        <dl class="juai-entity-facts">
          <div>
            <dt>所在地</dt>
            <dd>
              {{
                universityAddress(universityDisplayGeography(university)) ||
                '未确认'
              }}
            </dd>
          </div>
          <div>
            <dt>
              QS 世界排名{{
                university.qsYear ? ` · ${university.qsYear}` : ''
              }}
            </dt>
            <dd>{{ university.qsRank || '未确认' }}</dd>
          </div>
          <div v-if="university.japanRank">
            <dt>
              日本排名{{
                university.japanRankYear ? ` · ${university.japanRankYear}` : ''
              }}
            </dt>
            <dd>
              {{ university.japanRank
              }}<small v-if="university.japanRankSource">
                · {{ university.japanRankSource }}</small>
            </dd>
          </div>
        </dl>
        <div class="juai-subsection">
          <h3>择校笔记</h3>
          <p class="juai-prose">
            {{ university.notes || '尚未记录关注理由。' }}
          </p>
        </div>
        <div v-if="directory?.logo" class="juai-link-row">
          <a
            :href="directory.logo.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            >校徽来源与许可 ↗</a><span class="juai-scope-note">{{ directory.logo.author }} · {{ directory.logo.license }}</span>
        </div>
      </ContentSection>
      <ContentSection title="费用与住宿">
        <p class="juai-scope-note">
          {{ feeTotals.complete ? '首年预算' : '首年已知费用' }}
        </p>
        <p class="juai-fee-value">
          {{
            feeTotals.firstYear !== ''
              ? `¥ ${formatYen(feeTotals.firstYear)}`
              : '尚未记录'
          }}
        </p>
        <details class="juai-history juai-subsection">
          <summary>费用明细与两年预算</summary>
          <dl class="juai-budget-list">
            <div>
              <dt>入学金</dt>
              <dd>{{ formatYen(fees.admissionFee) }}</dd>
            </div>
            <div>
              <dt>年度学费</dt>
              <dd>{{ formatYen(fees.annualTuition) }}</dd>
            </div>
            <div>
              <dt>每月房租 / 寮费</dt>
              <dd>{{ formatYen(university.monthlyRent) }}</dd>
            </div>
            <div>
              <dt>每月生活费</dt>
              <dd>{{ formatYen(university.monthlyLivingExpenses) }}</dd>
            </div>
            <div>
              <dt>{{ feeTotals.complete ? '两年预算' : '两年已知费用' }}</dt>
              <dd>{{ formatYen(feeTotals.twoYears) }}</dd>
            </div>
          </dl>
          <p v-if="!feeTotals.complete" class="juai-scope-note">
            尚缺：{{
              feeTotals.missingFields.join('、')
            }}；学费按年，房租与生活费按12个月计算。
          </p>
          <p v-if="university.feeNotes" class="juai-prose">
            {{ university.feeNotes }}
          </p>
        </details>
        <div class="juai-subsection">
          <h3>学生宿舍 · {{ dormitoryLabel(university.dormitoryStatus) }}</h3>
          <p v-if="university.dormitoryNotes" class="juai-prose">
            {{ university.dormitoryNotes }}
          </p>
          <a
            v-if="websiteUrl(university.dormitoryWebsite)"
            :href="websiteUrl(university.dormitoryWebsite)"
            target="_blank"
            rel="noopener noreferrer"
            >住宿信息 ↗</a>
        </div>
      </ContentSection>
    </div>
    <ContentSection
      :title="`研究科 · ${store.schoolsFor(university.id).length}`"
    >
      <template #actions>
        <Button type="primary" @click="schoolEditorOpen = true">
          新增研究科
        </Button>
      </template>
      <div
        v-if="store.schoolsFor(university.id).length"
        class="juai-entity-toolbar"
      >
        <Input
          v-model:value="query"
          allow-clear
          placeholder="搜索研究科或研究领域"
          aria-label="搜索研究科"
        />
      </div>
      <EntityLinks v-if="schoolLinks.length" :items="schoolLinks" /><EmptyState
        v-else
        :title="query ? '没有符合条件的研究科' : '尚未添加研究科'"
      /><ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
      />
    </ContentSection>
    <EntityEditor
      v-model:open="universityEditorOpen"
      kind="university"
      :entity-id="university.id"
    /><EntityCreateFlow
      v-model:open="schoolEditorOpen"
      kind="school"
      :parent-id="university.id"
      :parent-name="university.name"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这所大学已不存在</h1>
    <RouterLink to="/japan-grad/universities">返回大学清单 →</RouterLink>
  </section>
</template>
