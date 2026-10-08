<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input, Switch } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ProfessorDetails from './components/professor-details.vue';
import { useExplorerStore, websiteUrl } from './explorer';

const store = useExplorerStore();
const { message, modal } = App.useApp();
const route = useRoute();
const router = useRouter();
const university = computed(() =>
  store.universities.find((item) => item.id === route.params.universityId),
);
const school = computed(() =>
  store.schools.find(
    (item) =>
      item.id === route.params.schoolId &&
      item.universityId === university.value?.id,
  ),
);
const major = computed(() =>
  store.majors.find(
    (item) =>
      item.id === route.params.majorId && item.schoolId === school.value?.id,
  ),
);
const query = ref('');
const favoritesOnly = ref(false);
const majorEditorOpen = ref(false);
const professorEditorOpen = ref(false);
const editingProfessorId = ref('');
const detailOpen = ref(false);
const detailProfessorId = ref('');
const allProfessors = computed(() =>
  store.professorsFor(major.value?.id ?? ''),
);
const favoriteCount = computed(
  () => allProfessors.value.filter((item) => item.favorite).length,
);
const visibleProfessors = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return allProfessors.value
    .filter(
      (item) =>
        (!favoritesOnly.value || item.favorite) &&
        [
          item.name,
          item.japaneseName,
          item.title,
          item.research,
          item.laboratory,
          item.notes,
        ].some((value) => value.toLowerCase().includes(keyword)),
    )
    .toReversed();
});
watch(
  () => route.params.majorId,
  () => {
    query.value = '';
    favoritesOnly.value = false;
    detailOpen.value = false;
  },
);

function editProfessor(id = '') {
  editingProfessorId.value = id;
  professorEditorOpen.value = true;
}
function showProfessor(id: string) {
  detailProfessorId.value = id;
  detailOpen.value = true;
}
function deleteMajor() {
  if (!major.value || !school.value) return;
  const id = major.value.id;
  const parentId = school.value.id;
  const universityId = school.value.universityId;
  modal.confirm({
    title: `删除「${major.value.name}」？`,
    content: `该专攻中的 ${allProfessors.value.length} 位老师也会一起删除。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk() {
      store.removeEntity('major', id);
      message.success('专攻已删除');
      return router.replace(
        `/japan-grad/universities/${universityId}/schools/${parentId}`,
      );
    },
  });
}
function deleteProfessor(id: string) {
  const professor = store.professors.find((item) => item.id === id);
  if (!professor) return;
  modal.confirm({
    title: `删除「${professor.name}」？`,
    content: '老师资料、个人备注和心仪标记会一并删除。',
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk() {
      store.removeEntity('professor', id);
      detailOpen.value = false;
      message.success('老师已删除');
    },
  });
}
</script>

<template>
  <section v-if="major && school && university" class="explorer-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${university.id}`"
      >
        {{ university.name }}
</RouterLink><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${university.id}/schools/${school.id}`"
      >
        {{ school.name }}
</RouterLink><ExplorerIcon name="chevron" /><span>{{ major.name }}</span>
    </nav>
    <header class="page-heading detail-heading">
      <div>
        <p class="page-eyebrow">MAJOR / 专攻</p>
        <h1>{{ major.name }}</h1>
        <p class="page-description">
          {{ [school.name, major.japaneseName].filter(Boolean).join(' · ') }}
        </p>
      </div>
      <div class="detail-actions">
        <Button class="icon-button" @click="majorEditorOpen = true">
          <ExplorerIcon name="edit" />编辑专攻
</Button><Button class="icon-button" aria-label="删除专攻" @click="deleteMajor">
          <ExplorerIcon name="trash" />
        </Button>
      </div>
    </header>
    <section class="entity-overview" aria-label="专攻资料">
      <div class="overview-meta">
        <span><ExplorerIcon name="book" />{{
            major.research || '研究领域尚未填写'
          }}</span><a
          v-if="websiteUrl(major.website)"
          :href="websiteUrl(major.website)"
          target="_blank"
          rel="noopener noreferrer"
          ><ExplorerIcon name="globe" />访问专攻官网<ExplorerIcon name="link" /></a>
      </div>
      <p v-if="major.notes" class="overview-notes">{{ major.notes }}</p>
    </section>
    <header class="collection-heading">
      <div>
        <h2>
          老师<span>{{ allProfessors.length }}</span>
        </h2>
        <p>记录研究方向和关注理由，找到与你的兴趣相合的老师。</p>
      </div>
      <Button type="primary" class="icon-button" @click="editProfessor()">
        <ExplorerIcon name="plus" />新增老师
      </Button>
    </header>
    <template v-if="allProfessors.length">
      <div class="teacher-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          class="explorer-search"
          placeholder="搜索老师、研究方向或研究室"
          aria-label="搜索老师"
        >
          <template #prefix><ExplorerIcon name="search" /></template>
</Input><label class="favorite-filter"><Switch
            v-model:checked="favoritesOnly"
            size="small"
            aria-label="只看心仪老师"
          />只看心仪<span>{{ favoriteCount }}</span></label>
      </div>
      <div v-if="visibleProfessors.length" class="professor-grid">
        <article
          v-for="professor in visibleProfessors"
          :key="professor.id"
          class="professor-card"
          :class="{ 'is-favorite': professor.favorite }"
        >
          <div class="professor-card-top">
            <span class="entity-symbol teacher-symbol"><ExplorerIcon name="user" /></span><button
              class="heart-toggle"
              :class="{ 'is-favorite': professor.favorite }"
              :aria-label="`${professor.favorite ? '取消心仪' : '标记心仪'}：${professor.name}`"
              :aria-pressed="professor.favorite"
              @click="store.toggleFavorite(professor.id)"
            >
              <ExplorerIcon name="heart" /><span>{{
                professor.favorite ? '心仪' : '标记心仪'
              }}</span>
            </button>
          </div>
          <button
            class="professor-name-button"
            @click="showProfessor(professor.id)"
          >
            <h3>{{ professor.name }}</h3>
          </button>
          <p class="secondary-name">
            {{
              [professor.japaneseName, professor.title]
                .filter(Boolean)
                .join(' · ') || '职称待补充'
            }}
          </p>
          <div class="professor-research">
            <span>研究方向</span>
            <p>{{ professor.research || '研究方向待补充' }}</p>
          </div>
          <p v-if="professor.laboratory" class="professor-lab">
            <ExplorerIcon name="book" />{{ professor.laboratory }}
          </p>
          <p class="card-notes">
            {{ professor.notes || '记下这位老师吸引你的地方。' }}
          </p>
          <div class="professor-card-bottom">
            <button class="text-button" @click="showProfessor(professor.id)">
              查看资料<ExplorerIcon name="arrow" />
</button><Button
              type="text"
              class="icon-button edit-teacher-button"
              :aria-label="`编辑老师：${professor.name}`"
              @click="editProfessor(professor.id)"
            >
              <ExplorerIcon name="edit" />
            </Button>
          </div>
        </article>
      </div>
      <div v-else class="search-empty">
        <ExplorerIcon :name="favoritesOnly ? 'heart' : 'search'" />
        <h2>
          {{ favoritesOnly ? '还没有符合条件的心仪老师' : '没有找到相关老师' }}
        </h2>
        <p>
          {{
            favoritesOnly
              ? '点击老师卡片上的心形按钮，将他加入你的心仪目标。'
              : '试试其他姓名或研究关键词。'
          }}
        </p>
        <Button
          @click="
            query = '';
            favoritesOnly = false;
          "
        >
          查看全部老师
        </Button>
      </div>
    </template>
    <section v-else class="collection-empty">
      <span class="empty-symbol"><ExplorerIcon name="user" /></span>
      <h3>这里还没有老师</h3>
      <p>添加姓名、研究方向和主页，慢慢建立自己的导师资料库。</p>
      <Button class="icon-button" @click="editProfessor()">
        <ExplorerIcon name="plus" />添加第一位老师
      </Button>
    </section>
    <EntityEditor
      v-model:open="majorEditorOpen"
      kind="major"
      :entity-id="major.id"
      :parent-id="school.id"
      :parent-name="`${university.name} / ${school.name}`"
    />
    <EntityEditor
      v-model:open="professorEditorOpen"
      kind="professor"
      :entity-id="editingProfessorId"
      :parent-id="major.id"
      :parent-name="`${university.name} / ${school.name} / ${major.name}`"
    />
    <ProfessorDetails
      v-model:open="detailOpen"
      :professor-id="detailProfessorId"
      @edit="editProfessor"
      @remove="deleteProfessor"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这个专攻已不存在</h1>
    <p>返回大学清单重新选择。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
