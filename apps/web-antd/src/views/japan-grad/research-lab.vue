<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { App, Button, Tabs } from 'ant-design-vue';
import { useExplorerStore, websiteUrl } from './explorer';
import {
  annualBudgetText,
  labContext,
  labLanguageRequirements,
  majorPath,
} from './lab-targets';
import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import MajorAdmissions from './components/major-admissions.vue';
import ExamHistory from './components/exam-history.vue';
import ResearchLabTeachers from './components/research-lab-teachers.vue';
import LabTasks from './components/lab-tasks.vue';
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { message, modal } = App.useApp();
const editorOpen = ref(false);
const target = computed(() => {
  const value = labContext(store, String(route.params.labId));
  return value &&
    value.major.id === route.params.majorId &&
    value.school.id === route.params.schoolId &&
    value.university.id === route.params.universityId
    ? value
    : undefined;
});
const tab = computed({
  get: () =>
    ['admissions', 'tasks'].includes(String(route.query.tab))
      ? String(route.query.tab)
      : 'teachers',
  set: (value: string) => {
    void router.replace({ query: { ...route.query, tab: value } });
  },
});
async function toggle() {
  if (!target.value) return;
  try {
    await store.toggleWantApply(target.value.lab.id);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败。');
  }
}
function remove() {
  const value = target.value;
  if (!value) return;
  modal.confirm({
    title: `删除「${value.lab.name}」？`,
    content: `研究室与 ${value.professors.length} 位老师的资料、联络草稿、材料待办、论文索引和邮件将一并删除，也会移出修考之路；原文件保留在工作区。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('lab', value.lab.id);
      message.success('研究室已删除');
      return router.replace(majorPath(value));
    },
  });
}
</script>
<template>
  <section v-if="target" class="explorer-page research-lab-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${target.university.id}`"
        >{{ target.university.name }}</RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${target.university.id}/schools/${target.school.id}`"
        >{{ target.school.name }}</RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink :to="majorPath(target)">{{
        target.major.name
      }}</RouterLink
      ><ExplorerIcon name="chevron" /><span>{{ target.lab.name }}</span>
    </nav>
    <header class="page-heading detail-heading">
      <div>
        <h1>{{ target.lab.name }}</h1>
        <p class="page-description">
          {{
            [target.lab.japaneseName, target.major.name]
              .filter(Boolean)
              .join(' / ')
          }}
        </p>
      </div>
      <div class="detail-actions">
        <Button
          class="icon-button lab-intent-button"
          :class="{ 'is-wanted': target.lab.wantApply }"
          :aria-pressed="target.lab.wantApply"
          :loading="store.saving"
          @click="toggle"
          ><ExplorerIcon :name="target.lab.wantApply ? 'check' : 'plus'" />{{
            target.lab.wantApply ? '已标记想考' : '标记为想考'
          }}</Button
        ><Button class="icon-button" @click="editorOpen = true"
          ><ExplorerIcon name="edit" />编辑研究室</Button
        ><Button aria-label="删除研究室" @click="remove"
          ><ExplorerIcon name="trash"
        /></Button>
      </div>
    </header>
    <section class="entity-overview" aria-label="研究室资料">
      <div class="overview-meta">
        <span
          ><ExplorerIcon name="book" />{{
            target.lab.research || '研究方向待补充'
          }}</span
        ><a
          v-if="websiteUrl(target.lab.website)"
          :href="websiteUrl(target.lab.website)"
          target="_blank"
          rel="noopener noreferrer"
          ><ExplorerIcon name="globe" />研究室官网<ExplorerIcon name="link"
        /></a>
      </div>
      <p v-if="target.lab.notes" class="overview-notes">
        {{ target.lab.notes }}
      </p>
      <div class="lab-overview-footer">
        <span>年度开销：{{ annualBudgetText(target.university) }}</span
        ><RouterLink to="/japan-grad/journey">前往修考之路 →</RouterLink>
      </div>
    </section>
    <Tabs v-model:active-key="tab" class="professor-workspace-tabs">
      <Tabs.TabPane key="teachers" :tab="`老师（${target.professors.length}）`"
        ><ResearchLabTeachers
          v-if="tab === 'teachers'"
          :key="target.lab.id"
          :lab-id="target.lab.id"
      /></Tabs.TabPane>
      <Tabs.TabPane key="admissions" tab="报考信息"
        ><template v-if="tab === 'admissions'"
          ><section class="lab-admission-notes">
            <h2>研究室报考说明</h2>
            <p>
              下方时间与科目来自所属专攻「{{
                target.major.name
              }}」，请结合研究室的特殊要求确认。
            </p>
            <dl>
              <div>
                <dt>
                  语言要求
                  <small
                    >（{{
                      target.lab.languageRequirements?.trim()
                        ? '研究室单独要求'
                        : '参考所属专攻'
                    }}）</small
                  >
                </dt>
                <dd>
                  {{ labLanguageRequirements(target) || '尚未填写语言要求' }}
                </dd>
              </div>
              <div>
                <dt>考试特殊说明</dt>
                <dd>{{ target.lab.examNotes || '尚未记录额外考核要求' }}</dd>
              </div>
              <div>
                <dt>出愿特殊说明</dt>
                <dd>
                  {{ target.lab.applicationNotes || '尚未记录额外出愿要求' }}
                </dd>
              </div>
            </dl>
            <Button @click="editorOpen = true">编辑特殊说明</Button>
          </section>
          <MajorAdmissions
            :key="`admissions-${target.major.id}`"
            :major-id="target.major.id" /><ExamHistory
            :key="`exams-${target.major.id}`"
            :major-id="target.major.id" /></template
      ></Tabs.TabPane>
      <Tabs.TabPane key="tasks" tab="材料与待办"
        ><LabTasks
          v-if="tab === 'tasks'"
          :key="target.lab.id"
          :lab-id="target.lab.id"
      /></Tabs.TabPane>
    </Tabs>
    <EntityEditor
      v-model:open="editorOpen"
      kind="lab"
      :entity-id="target.lab.id"
      :parent-id="target.major.id"
      :parent-name="target.major.name"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这个研究室已不存在</h1>
    <p>请返回大学清单重新选择。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
