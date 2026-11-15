<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Drawer, Switch } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import ContextTrail from '../design-system/context-trail.vue';
import EmptyState from '../design-system/empty-state.vue';
import PageHeading from '../design-system/page-heading.vue';
import { useExplorerStore, websiteUrl } from '../explorer';
import { labContext, majorPath } from '../lab-targets';
import EntityEditor from './entity-editor.vue';
import LabMembers from './lab-members.vue';
import LabTasks from './lab-tasks.vue';
import ResearchLabTeachers from './research-lab-teachers.vue';
defineEmits<{ remove: [] }>();
const route = useRoute();
const router = useRouter();
const tools = computed(() =>
  ['admissions', 'materials', 'tasks', 'todos'].includes(
    String(route.query.tab),
  ),
);
const toolKind = computed(() =>
  route.query.tab === 'todos' ? 'todo' : 'material',
);
function closeTools() {
  void router.replace({ query: { ...route.query, tab: undefined } });
}
function openTools(tab: string) {
  void router.replace({ query: { ...route.query, tab } });
}
const store = useExplorerStore();
const { message } = App.useApp();
const target = computed(() => labContext(store, String(route.params.labId)));
const editing = ref(false);
const busy = ref(false);
async function syncTimeline(value: boolean | number | string) {
  if (!target.value) return;
  try {
    await store.setTimelineAutoSync(target.value.lab.id, Boolean(value));
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  }
}
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
      <PageHeading
        :title="target.lab.name"
        :description="target.lab.japaneseName"
      >
        <template #context>
          <ContextTrail
            :items="[
              { label: '大学清单', to: '/japan-grad/universities' },
              {
                label: target.university.name,
                to: `/japan-grad/universities/${target.university.id}`,
              },
              {
                label: target.school.name,
                to: `/japan-grad/universities/${target.university.id}/schools/${target.school.id}`,
              },
              { label: target.major.name, to: majorPath(target) },
            ]"
          />
        </template>
        <template #actions>
          <Button @click="editing = true">编辑研究室</Button><Button
            :type="target.lab.wantApply ? 'default' : 'primary'"
            :loading="busy"
            :aria-pressed="target.lab.wantApply"
            @click="toggle"
          >
            {{ target.lab.wantApply ? '已加入想考' : '加入想考' }}
          </Button>
          <Button type="text" danger @click="$emit('remove')">删除</Button>
        </template>
        <template #meta>
          <a
            v-if="websiteUrl(target.lab.website)"
            :href="websiteUrl(target.lab.website)"
            target="_blank"
            rel="noopener noreferrer"
            >研究室官网 ↗</a><RouterLink :to="majorPath(target)">
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
        <p v-if="target.lab.description" class="juai-prose">
          {{ target.lab.description }}
        </p>
        <p v-if="target.lab.location" class="juai-link-row">
          位置 · {{ target.lab.location }}
        </p>
        <div v-if="target.lab.notes" class="juai-subsection">
          <h3>个人备注与原有说明</h3>
          <p class="juai-prose">{{ target.lab.notes }}</p>
        </div>
        <EmptyState
          v-if="!target.lab.description && !target.lab.notes"
          title="研究室介绍尚未补充"
          description="可以记录研究主题、位置和其他关注信息。"
        />
      </ContentSection>
      <LabMembers :key="target.lab.id" :lab-id="target.lab.id">
        <template #legacy>
          <details
            v-if="
              target.lab.foreignStudentNotes ||
              target.lab.foreignStudentStatus === 'yes' ||
              target.lab.foreignStudentStatus === 'no'
            "
            class="juai-history juai-subsection"
          >
            <summary>原有成员说明</summary>
            <p class="juai-prose">
              {{
                target.lab.foreignStudentNotes ||
                (target.lab.foreignStudentStatus === 'yes'
                  ? '已记录有外国学生，人数未确认'
                  : '已记录无外国学生，仍以核实日期为准')
              }}
            </p>
            <a
              v-if="websiteUrl(target.lab.foreignStudentSource || '')"
              :href="websiteUrl(target.lab.foreignStudentSource || '')"
              target="_blank"
              rel="noopener noreferrer"
              >原信息来源 ↗</a>
          </details>
        </template>
      </LabMembers>
    </div>
    <div class="juai-teachers-panel">
      <ResearchLabTeachers
        :key="target.lab.id"
        :lab-id="target.lab.id"
        compact
      />
    </div>
    <div class="juai-link-row">
      <RouterLink to="/japan-grad/journey">前往修考之路 →</RouterLink><Button type="text" @click="openTools('materials')">申请材料</Button><Button type="text" @click="openTools('todos')">日程与待办</Button>
    </div>
    <Drawer
      :open="tools"
      :title="
        route.query.tab === 'admissions'
          ? '研究室补充要求与日程设置'
          : '申请材料与日程'
      "
      width="min(1040px,100vw)"
      @close="closeTools"
    >
      <div class="juai-entity-toolbar">
        <Button @click="openTools('materials')">申请材料</Button><Button @click="openTools('todos')">日程与待办</Button><Button @click="openTools('admissions')">补充要求与设置</Button>
      </div>
      <section v-if="route.query.tab === 'admissions'" class="juai-design">
        <dl class="juai-facts">
          <div>
            <dt>研究室单独语言要求</dt>
            <dd>
              {{ target.lab.languageRequirements || '未记录；请查看所属专攻' }}
            </dd>
          </div>
          <div>
            <dt>考试补充说明</dt>
            <dd>{{ target.lab.examNotes || '尚未记录' }}</dd>
          </div>
          <div>
            <dt>出愿补充说明</dt>
            <dd>{{ target.lab.applicationNotes || '尚未记录' }}</dd>
          </div>
        </dl>
        <Button @click="editing = true">编辑补充说明</Button>
        <div class="juai-subsection">
          <Switch
            :checked="target.lab.timeline?.autoSyncExams ?? true"
            :loading="store.saving"
            aria-label="同步专攻考试时间到日程"
            @change="syncTimeline"
          />
          同步专攻考试时间到日程
        </div>
      </section>
      <LabTasks
        v-else
        :key="`${target.lab.id}-${toolKind}`"
        :lab-id="target.lab.id"
        :kind="toolKind"
      />
    </Drawer>
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
