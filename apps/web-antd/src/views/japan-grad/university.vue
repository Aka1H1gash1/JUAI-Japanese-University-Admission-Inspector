<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore, websiteUrl } from './explorer';
import { universityAddress, universityGeography } from './japan-geography';
import {
  formatYen,
  dormitoryLabel,
  universityFees,
  universityBudgetTotals,
} from './university-fees';

const store = useExplorerStore();
const { message, modal } = App.useApp();
const route = useRoute();
const router = useRouter();
const universityId = computed(() => String(route.params.universityId ?? ''));
const university = computed(() =>
  store.universities.find((item) => item.id === universityId.value),
);
const geography = computed(() => universityGeography(university.value ?? {}));
const query = ref('');
const universityEditorOpen = ref(false);
const schoolEditorOpen = ref(false);
const universitySchools = computed(() => store.schoolsFor(universityId.value));
const universityMajors = computed(() =>
  store.universityMajors(universityId.value),
);
const universityProfessors = computed(() =>
  store.universityProfessors(universityId.value),
);
const universityLabs = computed(() => store.universityLabs(universityId.value));
const wantedLabs = computed(() =>
  universityLabs.value.filter((item) => item.wantApply),
);
const researchAreas = computed(() => [
  ...new Set(
    [
      ...universitySchools.value,
      ...universityMajors.value,
      ...universityProfessors.value,
      ...universityLabs.value,
    ]
      .flatMap((item) => item.research.split(/[、,，;；\n]/))
      .map((value) => value.trim())
      .filter(Boolean),
  ),
]);
const fees = computed(() =>
  university.value
    ? universityFees(university.value)
    : { admissionFee: '', annualTuition: '' },
);
const feeTotals = computed(() =>
  universityBudgetTotals(university.value ?? { category: '' }),
);
const visibleSchools = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return store
    .schoolsFor(universityId.value)
    .filter((item) =>
      [item.name, item.japaneseName, item.research, item.notes].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    )
    .toReversed();
});
watch(universityId, () => {
  query.value = '';
});

function deleteUniversity() {
  if (!university.value) return;
  const id = university.value.id;
  const name = university.value.name;
  modal.confirm({
    title: `删除「${name}」？`,
    content: `该大学下的 ${store.schoolsFor(id).length} 个研究科、${store.universityMajors(id).length} 个专攻、${store.universityLabs(id).length} 个研究室和 ${store.universityProfessors(id).length} 位老师的记录、文件索引和邮件也会一起删除；原文件保留在工作区。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('university', id);
      message.success('大学已删除');
      return router.replace('/japan-grad');
    },
  });
}
</script>

<template>
  <section v-if="university" class="explorer-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink
      ><ExplorerIcon name="chevron" /><span>{{ university.name }}</span>
    </nav>
    <header class="page-heading detail-heading university-heading">
      <div>
        <div class="university-identity">
          <UniversityLogo
            :logo-id="university.logoId"
            :name="university.name"
            large
          />
          <div>
            <div class="university-heading-title">
              <h1>{{ university.name }}</h1>
              <span v-if="university.category" class="category-label">{{
                university.category
              }}</span>
            </div>
            <p v-if="university.japaneseName" class="page-description">
              {{ university.japaneseName }}
            </p>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <a
          v-if="websiteUrl(university.website)"
          :href="websiteUrl(university.website)"
          target="_blank"
          rel="noopener noreferrer"
          class="university-website-link"
          ><ExplorerIcon name="globe" />大学官网<ExplorerIcon name="link"
        /></a>
        <Button class="icon-button" @click="universityEditorOpen = true">
          <ExplorerIcon name="edit" />编辑大学 </Button
        ><Button
          class="icon-button"
          aria-label="删除大学"
          @click="deleteUniversity"
        >
          <ExplorerIcon name="trash" />
        </Button>
      </div>
    </header>
    <section class="university-dashboard" aria-label="大学概况与费用">
      <div class="university-profile-panel">
        <div class="university-panel-heading">
          <h2><ExplorerIcon name="building" />大学概况</h2>
          <span>择校信息</span>
        </div>
        <dl class="university-facts">
          <div>
            <dt>大学类型</dt>
            <dd :class="{ 'is-missing': !university.category }">
              {{ university.category || '待填写' }}
            </dd>
          </div>
          <div>
            <dt>
              QS 排名<span v-if="university.qsYear">
                · {{ university.qsYear }}</span
              >
            </dt>
            <dd :class="{ 'is-missing': !university.qsRank }">
              {{ university.qsRank || '待填写' }}
            </dd>
          </div>
          <div>
            <dt>所在地域</dt>
            <dd :class="{ 'is-missing': !geography.region }">
              {{ geography.region || '待填写' }}
            </dd>
          </div>
          <div>
            <dt>都道府县</dt>
            <dd :class="{ 'is-missing': !geography.prefecture }">
              <ExplorerIcon name="pin" />{{ geography.prefecture || '待填写' }}
            </dd>
          </div>
          <div v-if="university.location">
            <dt>具体所在地</dt>
            <dd>{{ universityAddress(university) }}</dd>
          </div>
        </dl>
        <div class="university-dormitory-info">
          <div class="university-dormitory-heading">
            <h3><ExplorerIcon name="home" />寮 / 学生宿舍</h3>
            <span
              class="dormitory-status"
              :class="`dormitory-${university.dormitoryStatus}`"
              >{{ dormitoryLabel(university.dormitoryStatus) }}</span
            >
          </div>
          <p v-if="university.dormitoryNotes">
            {{ university.dormitoryNotes }}
          </p>
          <a
            v-if="websiteUrl(university.dormitoryWebsite)"
            :href="websiteUrl(university.dormitoryWebsite)"
            target="_blank"
            rel="noopener noreferrer"
            >查看寮申请信息<ExplorerIcon name="link"
          /></a>
          <button
            v-else-if="university.dormitoryStatus === 'unknown'"
            class="text-button"
            @click="universityEditorOpen = true"
          >
            补充寮申请信息<ExplorerIcon name="edit" />
          </button>
        </div>
        <div class="university-preparation">
          <h3>已整理的申请方向</h3>
          <div class="university-progress-counts">
            <div>
              <strong>{{ universitySchools.length }}</strong
              ><span>研究科</span>
            </div>
            <div>
              <strong>{{ universityMajors.length }}</strong
              ><span>专攻</span>
            </div>
            <div>
              <strong>{{ universityLabs.length }}</strong
              ><span>研究室</span>
            </div>
            <div class="university-favorite-stat">
              <strong>{{ wantedLabs.length }}</strong
              ><span><ExplorerIcon name="heart" />想考研究室</span>
            </div>
          </div>
          <div
            v-if="researchAreas.length"
            class="university-research-areas"
            aria-label="已关注的研究领域"
          >
            <span v-for="area in researchAreas.slice(0, 6)" :key="area">{{
              area
            }}</span>
            <small v-if="researchAreas.length > 6"
              >另有 {{ researchAreas.length - 6 }} 个领域</small
            >
          </div>
        </div>
        <div class="university-notebook">
          <h3>择校笔记</h3>
          <p v-if="university.notes">{{ university.notes }}</p>
          <button
            v-else
            class="text-button"
            @click="universityEditorOpen = true"
          >
            记下关注理由、学校特点与待确认事项<ExplorerIcon name="edit" />
          </button>
        </div>
      </div>
      <aside class="university-fee-panel" aria-label="总费用预算">
        <div class="university-panel-heading">
          <h2>总费用<span>JPY / 日元</span></h2>
          <button class="text-button" @click="universityEditorOpen = true">
            <ExplorerIcon name="edit" />编辑费用
          </button>
        </div>
        <dl class="university-fee-items">
          <div>
            <dt>入学金<small>仅第一年入学时缴交一次</small></dt>
            <dd :class="{ 'is-missing': fees.admissionFee === '' }">
              <span v-if="fees.admissionFee !== ''">¥</span
              >{{ formatYen(fees.admissionFee) }}
            </dd>
          </div>
          <div>
            <dt>年度学费<small>每年缴交</small></dt>
            <dd :class="{ 'is-missing': fees.annualTuition === '' }">
              <span v-if="fees.annualTuition !== ''">¥</span
              >{{ formatYen(fees.annualTuition) }}
            </dd>
          </div>
          <div class="university-living-divider">
            <dt>房租 / 寮费<small>每月金额 · 按 12 个月计算</small></dt>
            <dd :class="{ 'is-missing': university.monthlyRent === '' }">
              <span v-if="university.monthlyRent !== ''">¥</span
              >{{ formatYen(university.monthlyRent)
              }}<small v-if="university.monthlyRent !== ''">/ 月</small>
            </dd>
          </div>
          <div>
            <dt>生活费<small>每月金额 · 不含房租</small></dt>
            <dd
              :class="{ 'is-missing': university.monthlyLivingExpenses === '' }"
            >
              <span v-if="university.monthlyLivingExpenses !== ''">¥</span
              >{{ formatYen(university.monthlyLivingExpenses)
              }}<small v-if="university.monthlyLivingExpenses !== ''"
                >/ 月</small
              >
            </dd>
          </div>
        </dl>
        <div class="university-fee-totals">
          <div>
            <span>{{ feeTotals.complete ? '首年总费用' : '首年已知费用' }}</span
            ><strong :class="{ 'is-missing': feeTotals.firstYear === '' }">{{
              feeTotals.firstYear !== ''
                ? `¥ ${formatYen(feeTotals.firstYear)}`
                : '待补充预算'
            }}</strong>
          </div>
          <div>
            <span>{{ feeTotals.complete ? '两年总费用' : '两年已知费用' }}</span
            ><strong :class="{ 'is-missing': feeTotals.twoYears === '' }">{{
              feeTotals.twoYears !== ''
                ? `¥ ${formatYen(feeTotals.twoYears)}`
                : '待补充预算'
            }}</strong>
          </div>
        </div>
        <p v-if="!feeTotals.complete" class="university-budget-incomplete">
          <ExplorerIcon name="edit" />待补充{{
            feeTotals.missingFields.join('、')
          }}，当前为已填写项目小计。
        </p>
        <p class="university-fee-caption">
          入学金仅一次；学费按年、房租和生活费按每年 12
          个月估算。金额不变，其他支出可记录在备注。
        </p>
        <p v-if="university.feeNotes" class="university-fee-notes">
          {{ university.feeNotes }}
        </p>
        <button
          v-if="!feeTotals.complete"
          class="university-fee-fill"
          @click="universityEditorOpen = true"
        >
          补充大学费用<ExplorerIcon name="arrow" />
        </button>
      </aside>
    </section>

    <header class="collection-heading">
      <div>
        <h2>
          研究科<span>{{ store.schoolsFor(university.id).length }}</span>
        </h2>
        <p>整理这所大学中你感兴趣的研究科，再查看下属专攻、研究室和老师。</p>
      </div>
      <Button
        type="primary"
        class="icon-button"
        @click="schoolEditorOpen = true"
      >
        <ExplorerIcon name="plus" />新增研究科
      </Button>
    </header>
    <template v-if="store.schoolsFor(university.id).length">
      <Input
        v-model:value="query"
        allow-clear
        class="explorer-search section-search"
        placeholder="搜索研究科或研究领域"
        aria-label="搜索研究科"
      >
        <template #prefix><ExplorerIcon name="search" /></template>
      </Input>
      <div v-if="visibleSchools.length" class="school-grid">
        <RouterLink
          v-for="school in visibleSchools"
          :key="school.id"
          :to="`/japan-grad/universities/${university.id}/schools/${school.id}`"
          class="school-card"
        >
          <div class="school-card-top">
            <span class="entity-symbol"><ExplorerIcon name="book" /></span
            ><ExplorerIcon name="arrow" />
          </div>
          <h3>{{ school.name }}</h3>
          <p v-if="school.japaneseName" class="secondary-name">
            {{ school.japaneseName }}
          </p>
          <p class="school-research">
            {{ school.research || '研究领域待补充' }}
          </p>
          <p v-if="school.notes" class="card-notes">{{ school.notes }}</p>
          <div class="school-card-bottom">
            <span>{{ store.majorsFor(school.id).length }} 个专攻</span>
            <span>{{ store.schoolLabs(school.id).length }} 个研究室</span
            ><span
              v-if="
                store.schoolProfessors(school.id).some((item) => item.favorite)
              "
              class="favorite-count"
              ><ExplorerIcon name="heart" />{{
                store
                  .schoolProfessors(school.id)
                  .filter((item) => item.favorite).length
              }}
              位心仪</span
            ><span class="open-label">查看专攻 →</span>
          </div>
        </RouterLink>
      </div>
      <div v-else class="search-empty">
        <h2>没有找到相关研究科</h2>
        <Button @click="query = ''">清除搜索</Button>
      </div>
    </template>
    <section v-else class="collection-empty">
      <span class="empty-symbol"><ExplorerIcon name="book" /></span>
      <h3>添加第一个研究科</h3>
      <p>先填写名称，就可以开始整理下属专攻。</p>
      <Button class="icon-button" @click="schoolEditorOpen = true">
        <ExplorerIcon name="plus" />添加研究科
      </Button>
    </section>
    <EntityEditor
      v-model:open="universityEditorOpen"
      kind="university"
      :entity-id="university.id"
    />
    <EntityEditor
      v-model:open="schoolEditorOpen"
      kind="school"
      :parent-id="university.id"
      :parent-name="university.name"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这所大学已不存在</h1>
    <p>返回清单查看其他大学。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
