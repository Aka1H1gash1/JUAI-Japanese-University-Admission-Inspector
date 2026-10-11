<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Input, Switch } from 'ant-design-vue';
import { professorInitials, useExplorerStore } from '../explorer';
import { labContext } from '../lab-targets';
import EntityEditor from './entity-editor.vue';
import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{ labId: string }>();
const store = useExplorerStore();
const ctx = computed(() => labContext(store, props.labId));
const query = ref('');
const favoritesOnly = ref(false);
const professorEditorOpen = ref(false);
const editingProfessorId = ref('');
const allProfessors = computed(() => store.professorsForLab(props.labId));
const favoriteCount = computed(
  () => allProfessors.value.filter((item) => item.favorite).length,
);
const visibleProfessors = computed(() =>
  allProfessors.value
    .filter(
      (item) =>
        (!favoritesOnly.value || item.favorite) &&
        [
          item.name,
          item.japaneseName,
          item.title,
          item.research,
          item.notes,
        ].some((value) =>
          value.toLowerCase().includes(query.value.trim().toLowerCase()),
        ),
    )
    .toReversed(),
);
function editProfessor(id = '') {
  editingProfessorId.value = id;
  professorEditorOpen.value = true;
}
</script>
<template>
  <section v-if="ctx" class="lab-teacher-section">
    <header class="collection-heading">
      <div>
        <h2>
          老师<span>{{ allProfessors.length }}</span>
        </h2>
        <p>研究室成员的个人资料、论文和邮件分别保存在老师详情中。</p>
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
          <template #prefix><ExplorerIcon name="search" /></template> </Input
        ><label class="favorite-filter"
          ><Switch
            v-model:checked="favoritesOnly"
            size="small"
            aria-label="只看心仪老师"
          />只看心仪<span>{{ favoriteCount }}</span></label
        >
      </div>
      <div v-if="visibleProfessors.length" class="professor-grid">
        <article
          v-for="professor in visibleProfessors"
          :key="professor.id"
          class="professor-card"
          :class="{ 'is-favorite': professor.favorite }"
        >
          <RouterLink
            class="professor-card-link"
            :to="`/japan-grad/universities/${ctx.university.id}/schools/${ctx.school.id}/majors/${ctx.major.id}/labs/${labId}/professors/${professor.id}`"
            :aria-label="`查看${professor.name}详情`"
          />
          <div class="professor-card-top">
            <span
              class="entity-symbol teacher-symbol professor-avatar"
              aria-hidden="true"
              >{{ professorInitials(professor.name) }}</span
            ><button
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
          <div class="professor-name-button">
            <h3>{{ professor.name }}</h3>
          </div>
          <p class="secondary-name">
            {{
              [professor.japaneseName, professor.title]
                .filter(Boolean)
                .join(' / ') || '职称待补充'
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
            <span class="professor-card-summary"
              >资料 · 论文 · 邮件<ExplorerIcon name="arrow"
            /></span>
            <Button
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
      v-model:open="professorEditorOpen"
      kind="professor"
      :entity-id="editingProfessorId"
      :parent-id="labId"
      :parent-name="ctx.lab.name"
    />
  </section>
</template>
