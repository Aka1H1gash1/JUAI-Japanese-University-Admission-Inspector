<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { App, Button } from 'ant-design-vue';

import EntityEditor from '../components/entity-editor.vue';
import ResearchLabTeachers from '../components/research-lab-teachers.vue';
import { useExplorerStore, websiteUrl } from '../explorer';
import { labContext, majorPath } from '../lab-targets';
import ContentSection from './content-section.vue';
import EmptyState from './empty-state.vue';
import PageHeading from './page-heading.vue';
const route = useRoute();
const store = useExplorerStore();
const { message } = App.useApp();
const target = computed(() => labContext(store, String(route.params.labId)));
const editing = ref(false);
const busy = ref(false);
async function toggle() {
  if (!target.value || busy.value) return;
  busy.value = true;
  try {
    await store.toggleWantApply(target.value.lab.id);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div v-if="target" class="juai-design juai-stack">
    <div>
      <div class="juai-prototype-bar">
        <span>JUAI 1.0 · 设计预览</span><RouterLink
          :to="{
            path: route.path,
            query: { ...route.query, design: undefined },
          }"
        >
          原版与申请工具 →
        </RouterLink>
      </div>
      <PageHeading
        :title="target.lab.name"
        :context="`${target.university.name} / ${target.school.name} / ${target.major.name}`"
        :description="target.lab.japaneseName"
      >
        <template #actions>
          <Button @click="editing = true">编辑研究室</Button><Button
            :type="target.lab.wantApply ? 'default' : 'primary'"
            :loading="busy"
            :aria-pressed="target.lab.wantApply"
            @click="toggle"
          >
            {{ target.lab.wantApply ? '已加入想考' : '加入想考' }}
          </Button>
        </template>
        <template #meta>
          <a
            v-if="websiteUrl(target.lab.website)"
            :href="websiteUrl(target.lab.website)"
            target="_blank"
            rel="noopener noreferrer"
            >研究室官网 ↗</a><RouterLink
            :to="{ path: majorPath(target), query: { design: '1' } }"
          >
            所属专攻与招生信息 ↗
          </RouterLink>
        </template>
      </PageHeading>
    </div>
    <div class="juai-split">
      <ContentSection title="研究方向与介绍">
        <p class="juai-research-topic">
          {{ target.lab.research || '研究方向尚未填写' }}
        </p>
        <p v-if="target.lab.notes" class="juai-prose">{{ target.lab.notes }}</p>
        <EmptyState
          v-else
          title="研究室介绍尚未补充"
          description="可以记录研究主题、位置和其他关注信息。"
        />
      </ContentSection>
      <ContentSection title="成员构成">
        <EmptyState
          title="暂无可靠的成员人数"
          icon="user"
          description="日本学生、外国学生及中国学生人数尚未记录。"
        />
        <p
          v-if="
            target.lab.foreignStudentStatus === 'yes' ||
            target.lab.foreignStudentStatus === 'no'
          "
          class="juai-prose"
        >
          {{
            target.lab.foreignStudentStatus === 'yes'
              ? '已记录有外国学生'
              : '已记录无外国学生'
          }}
        </p>
        <p v-if="target.lab.foreignStudentNotes" class="juai-prose">
          {{ target.lab.foreignStudentNotes }}
        </p>
        <a
          v-if="websiteUrl(target.lab.foreignStudentSource || '')"
          class="juai-link-row"
          :href="websiteUrl(target.lab.foreignStudentSource || '')"
          target="_blank"
          rel="noopener noreferrer"
          >查看成员信息来源 ↗</a>
      </ContentSection>
    </div>
    <div class="juai-teachers-panel">
      <ResearchLabTeachers
        :key="target.lab.id"
        :lab-id="target.lab.id"
        compact
      />
    </div>
    <EntityEditor
      v-model:open="editing"
      kind="lab"
      :entity-id="target.lab.id"
      :parent-id="target.major.id"
      :parent-name="target.major.name"
    />
  </div>
</template>
<style scoped>
.juai-teachers-panel {
  padding: 24px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: var(--juai-radius);
}

@media (max-width: 720px) {
  .juai-teachers-panel {
    padding: 20px;
  }
}
</style>
