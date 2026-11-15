<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Tabs } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import { useExplorerStore, websiteUrl } from '../explorer';
import DocumentArchive from './document-archive.vue';
import ProfessorContact from './professor-contact.vue';
import ProfessorMail from './professor-mail.vue';

const props = defineProps<{ professorId: string }>();
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const tab = computed({
  get: () =>
    ['contact', 'mail', 'papers', 'profile'].includes(String(route.query.tab))
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
</script>

<template>
  <div v-if="professor" class="professor-details professor-page-content">
    <Tabs v-model:active-key="tab" class="professor-workspace-tabs">
      <Tabs.TabPane key="profile" tab="老师资料">
        <div class="juai-split">
          <ContentSection title="研究方向">
            <p class="juai-research-topic">
              {{ professor.research || '研究方向尚未填写' }}
            </p>
            <div class="juai-subsection">
              <h3>关注理由与备注</h3>
              <p class="juai-prose">
                {{ professor.notes || '尚未记录关注理由。' }}
              </p>
            </div>
          </ContentSection>
          <ContentSection title="联系与主页">
            <dl class="juai-contact-list">
              <div>
                <dt>联系邮箱</dt>
                <dd>
                  <a
                    v-if="professor.email"
                    :href="`mailto:${professor.email}`"
                    >{{ professor.email }}</a><span v-else>未确认</span>
                </dd>
              </div>
              <div>
                <dt>个人主页</dt>
                <dd>
                  <a
                    v-if="websiteUrl(professor.personalWebsite)"
                    :href="websiteUrl(professor.personalWebsite)"
                    target="_blank"
                    rel="noopener noreferrer"
                    >访问老师个人主页 ↗</a><span v-else>未记录</span>
                </dd>
              </div>
              <div>
                <dt>研究室主页</dt>
                <dd>
                  <a
                    v-if="websiteUrl(lab?.website || '')"
                    :href="websiteUrl(lab?.website || '')"
                    target="_blank"
                    rel="noopener noreferrer"
                    >访问研究室主页 ↗</a><span v-else>未记录</span>
                </dd>
              </div>
            </dl>
          </ContentSection>
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane key="contact" tab="考学经历">
        <ProfessorContact
          v-if="tab === 'contact'"
          :key="professor.id"
          :professor-id="professor.id"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="papers" tab="论文库">
        <DocumentArchive
          v-if="tab === 'papers'"
          :key="professor.id"
          owner-type="professor"
          :owner-id="professor.id"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="mail" tab="邮件往来">
        <ProfessorMail
          v-if="tab === 'mail'"
          :key="professor.id"
          :professor-id="professor.id"
          :email="professor.email"
        />
      </Tabs.TabPane>
    </Tabs>
  </div>
</template>

<style scoped>
.juai-contact-list {
  display: grid;
  gap: 20px;
  margin: 0;
}

.juai-contact-list dt {
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--jg-muted);
}

.juai-contact-list dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
</style>
