<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Input, Switch } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import EntityEditor from './entity-editor.vue';
import ExplorerIcon from './explorer-icon.vue';
import ResearchLabCard from './research-lab-card.vue';
const props = defineProps<{ majorId: string }>();
const store = useExplorerStore();
const query = ref('');
const wantedOnly = ref(false);
const editorOpen = ref(false);
const editingId = ref('');
const labs = computed(() => store.labsFor(props.majorId));
const wanted = computed(
  () => labs.value.filter((item) => item.wantApply).length,
);
const visible = computed(() =>
  labs.value
    .filter(
      (item) =>
        (!wantedOnly.value || item.wantApply) &&
        [
          item.name,
          item.japaneseName,
          item.research,
          item.notes,
          ...store.professorsForLab(item.id).map((person) => person.name),
        ].some((value) =>
          value.toLowerCase().includes(query.value.trim().toLowerCase()),
        ),
    )
    .toReversed(),
);
function edit(id = '') {
  editingId.value = id;
  editorOpen.value = true;
}
watch(
  () => props.majorId,
  () => {
    query.value = '';
    wantedOnly.value = false;
  },
);
</script>
<template>
  <section class="lab-collection">
    <header class="collection-heading">
      <div>
        <h2>
          研究室<span>{{ labs.length }}</span>
        </h2>
        <p>以研究室整理方向与老师，标记「想考」后加入修考之路。</p>
      </div>
      <Button type="primary" class="icon-button" @click="edit()"
        ><ExplorerIcon name="plus" />新增研究室</Button
      >
    </header>
    <template v-if="labs.length">
      <div class="teacher-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          class="explorer-search"
          placeholder="搜索研究室、研究方向或老师"
          aria-label="搜索研究室"
          ><template #prefix><ExplorerIcon name="search" /></template></Input
        ><label class="favorite-filter"
          ><Switch
            v-model:checked="wantedOnly"
            size="small"
            aria-label="只看想考的研究室"
          />只看想考<span>{{ wanted }}</span></label
        >
      </div>
      <div v-if="visible.length" class="research-lab-grid">
        <ResearchLabCard
          v-for="lab in visible"
          :key="lab.id"
          :lab-id="lab.id"
          @edit="edit"
        />
      </div>
      <div v-else class="search-empty">
        <h3>没有符合条件的研究室</h3>
        <Button
          @click="
            query = '';
            wantedOnly = false;
          "
          >查看全部研究室</Button
        >
      </div>
    </template>
    <div v-else class="collection-empty">
      <span class="empty-symbol"><ExplorerIcon name="book" /></span>
      <h3>添加第一个研究室</h3>
      <p>记录研究室名称、研究方向和官网，再添加其中的老师。</p>
      <Button @click="edit()">新增研究室</Button>
    </div>
    <EntityEditor
      v-model:open="editorOpen"
      kind="lab"
      :entity-id="editingId"
      :parent-id="majorId"
      :parent-name="store.majors.find((item) => item.id === majorId)?.name"
    />
  </section>
</template>
