<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Tabs } from 'ant-design-vue';

import { useExplorerStore, websiteUrl } from '../explorer';
import ExplorerIcon from './explorer-icon.vue';
import DocumentArchive from './document-archive.vue';
import ProfessorMail from './professor-mail.vue';
import ProfessorContact from './professor-contact.vue';

const props = defineProps<{ professorId: string }>();
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const tab = computed({
  get: () =>
    ['profile', 'contact', 'papers', 'mail'].includes(String(route.query.tab))
      ? String(route.query.tab)
      : 'profile',
  set: (value: string) => {
    void router.replace({ query: { ...route.query, tab: value } });
  },
});
const professor = computed(() =>
  store.professors.find((item) => item.id === props.professorId),
);
const lab = computed(() =>
  store.labs.find((item) => item.id === professor.value?.labId),
);
const major = computed(() =>
  store.majors.find((item) => item.id === professor.value?.majorId),
);
const school = computed(() =>
  store.schools.find((item) => item.id === major.value?.schoolId),
);
const university = computed(() =>
  store.universities.find((item) => item.id === school.value?.universityId),
);
</script>

<template>
  <div v-if="professor" class="professor-details professor-page-content">
    <p class="detail-affiliation">
      {{ university?.name }} / {{ school?.name }} / {{ major?.name }}
    </p>
    <Tabs v-model:active-key="tab" class="professor-workspace-tabs">
      <Tabs.TabPane key="profile" tab="老师资料">
        <dl class="professor-fields">
          <div>
            <dt>研究方向</dt>
            <dd>{{ professor.research || '尚未填写' }}</dd>
          </div>
          <div>
            <dt>研究室</dt>
            <dd>{{ lab?.name || professor.laboratory || '尚未填写' }}</dd>
          </div>
          <div>
            <dt>联系邮箱</dt>
            <dd>
              <a v-if="professor.email" :href="`mailto:${professor.email}`">{{
                professor.email
              }}</a
              ><span v-else>尚未填写</span>
            </dd>
          </div>
          <div>
            <dt>老师个人主页</dt>
            <dd>
              <a
                v-if="websiteUrl(professor.personalWebsite)"
                :href="websiteUrl(professor.personalWebsite)"
                target="_blank"
                rel="noopener noreferrer"
                class="icon-link"
                >访问个人主页<ExplorerIcon name="link" /></a
              ><span v-else>尚未填写</span>
            </dd>
          </div>
          <div>
            <dt>研究室主页</dt>
            <dd>
              <a
                v-if="websiteUrl(lab?.website ?? '')"
                :href="websiteUrl(lab?.website ?? '')"
                target="_blank"
                rel="noopener noreferrer"
                class="icon-link"
                >访问研究室主页<ExplorerIcon name="link" /></a
              ><span v-else>尚未填写</span>
            </dd>
          </div>
          <div>
            <dt>关注理由 / 个人备注</dt>
            <dd class="notes-value">
              {{ professor.notes || '记下这位老师吸引你的地方。' }}
            </dd>
          </div>
        </dl>
      </Tabs.TabPane>
      <Tabs.TabPane key="contact" tab="考学经历"
        ><ProfessorContact
          v-if="tab === 'contact'"
          :key="professor.id"
          :professor-id="professor.id"
      /></Tabs.TabPane>
      <Tabs.TabPane key="papers" tab="论文库"
        ><DocumentArchive
          v-if="tab === 'papers'"
          :key="professor.id"
          owner-type="professor"
          :owner-id="professor.id"
      /></Tabs.TabPane>
      <Tabs.TabPane key="mail" tab="邮件往来"
        ><ProfessorMail
          v-if="tab === 'mail'"
          :key="professor.id"
          :professor-id="professor.id"
          :email="professor.email"
      /></Tabs.TabPane>
    </Tabs>
  </div>
</template>
