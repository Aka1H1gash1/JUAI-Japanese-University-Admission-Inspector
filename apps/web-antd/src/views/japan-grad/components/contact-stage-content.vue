<script setup lang="ts">
import { computed } from 'vue';
import type { LabTarget } from '../lab-targets';
import {
  primaryProfessor,
  normalizedContact,
  CONTACT_RESULT_LABELS,
} from '../application-planning';
import { useCommunicationsStore } from '../communications';
import { fileUrl } from '../documents';
const props = defineProps<{ target: LabTarget; professorId?: string }>();
const sources = useCommunicationsStore();
const person = computed(
  () =>
    props.target.professors.find((p) => p.id === props.professorId) ||
    primaryProfessor(props.target),
);
const contact = computed(() => normalizedContact(person.value?.contact));
const mails = computed(() =>
  person.value
    ? sources.forExperience(person.value.id, contact.value.experienceId)
    : [],
);
const first = computed(() => mails.value.find((m) => m.direction === 'sent'));
const replies = computed(() =>
  mails.value.filter((m) => m.direction === 'received'),
);
const latestReply = computed(() => replies.value.at(-1));
const consent = computed(() =>
  replies.value.find((m) => m.id === contact.value.consentEmailId),
);
const papers = computed(() =>
  person.value
    ? sources
        .papers(person.value.id)
        .toSorted((a, b) => b.year - a.year)
        .slice(0, 3)
    : [],
);
const files = computed(() =>
  person.value
    ? sources.consentFiles(person.value.id, contact.value.experienceId)
    : [],
);
const requirements = computed(() =>
  [
    contact.value.requirements,
    props.target.lab.languageRequirements ||
      props.target.major.languageRequirements,
    props.target.lab.applicationNotes,
    sources.requirements[props.target.major.id]?.professorContactRequirement,
    props.target.major.applicationMaterials,
  ]
    .filter(Boolean)
    .join('\n'),
);
</script>
<template>
  <div class="contact-stage-content">
    <template v-if="contact.status === 'not_contacted'"
      ><section>
        <h4>研究方向</h4>
        <p>{{ person?.research || target.lab.research || '研究方向待补充' }}</p>
      </section>
      <section>
        <h4>论文</h4>
        <ul v-if="papers.length">
          <li v-for="paper in papers" :key="paper.id">
            <a
              :href="fileUrl(paper.id)"
              target="_blank"
              rel="noopener noreferrer"
              >{{ paper.title }}</a
            >
          </li>
        </ul>
        <p v-else class="stage-empty">尚未归档老师论文</p>
      </section>
      <section>
        <h4>联络 / 报考要求</h4>
        <p>{{ requirements || '要求待整理' }}</p>
      </section></template
    >
    <template v-else-if="contact.status === 'first_sent'"
      ><section>
        <h4>{{ first ? '第一封邮件' : '邮件草稿（未归档已发原文）' }}</h4>
        <strong>{{
          first?.subject || contact.draftSubject || '主题待记录'
        }}</strong
        ><time v-if="first">{{ first.date.replace('T', ' ') }}</time>
        <p class="stage-mail-body">
          {{
            first?.body ||
            contact.draftBody ||
            '在老师邮件往来中保存已发送邮件，原文会自动显示。'
          }}
        </p>
      </section></template
    >
    <template v-else-if="contact.status === 'replied'"
      ><section>
        <h4>
          来往信件 <span>{{ mails.length }} 封</span>
        </h4>
        <p class="stage-empty">
          已发 {{ mails.filter((m) => m.direction === 'sent').length }} · 收到
          {{ replies.length }}
        </p>
        <template v-if="latestReply"
          ><strong>{{ latestReply.subject }}</strong
          ><time>{{ latestReply.date.replace('T', ' ') }}</time>
          <p class="stage-mail-body">{{ latestReply.body }}</p></template
        >
        <p v-else>{{ contact.replySummary || '尚未归档来信原文' }}</p>
      </section>
      <section v-if="contact.followUpDate">
        <h4>下次跟进</h4>
        <p>{{ contact.followUpDate }}</p>
      </section></template
    >
    <template
      v-else-if="
        contact.status === 'interview_scheduled' ||
        contact.status === 'interview_completed'
      "
      ><section>
        <h4>
          {{
            contact.status === 'interview_completed'
              ? '实际面试时间'
              : '预约面试时间'
          }}
        </h4>
        <p>
          {{
            contact.status === 'interview_completed'
              ? (
                  contact.actualInterviewAt ||
                  contact.actualInterviewDate ||
                  '实际时间待记录'
                ).replace('T', ' ')
              : (
                  contact.interviewAt ||
                  contact.interviewDate ||
                  '时间待安排'
                ).replace('T', ' ')
          }}<small v-if="contact.interviewAt || contact.actualInterviewAt">
            JST</small
          >
        </p>
      </section>
      <section>
        <h4>面试准备</h4>
        <p>{{ contact.interviewPreparation || '准备内容待整理' }}</p>
      </section>
      <section v-if="contact.status === 'interview_completed'">
        <h4>
          问题与回答 <span>{{ contact.interviewQA.length }} 条</span>
        </h4>
        <template v-if="contact.interviewQA.length"
          ><strong>{{ contact.interviewQA[0]!.question }}</strong>
          <p>{{ contact.interviewQA[0]!.answer || '回答待补充' }}</p></template
        >
        <p v-else class="stage-empty">待记录面试问答与复盘</p>
      </section></template
    >
    <template v-else-if="contact.status === 'consent'"
      ><section>
        <h4>内诺邮件原文</h4>
        <strong v-if="consent">{{ consent.subject }}</strong
        ><time v-if="contact.consentDate">{{ contact.consentDate }}</time>
        <p class="stage-mail-body">
          {{
            consent?.body ||
            contact.consentOriginal ||
            '待关联内诺邮件或保存原文'
          }}
        </p>
      </section>
      <section>
        <h4>
          内诺文件 <span>{{ files.length }}</span>
        </h4>
        <ul v-if="files.length">
          <li v-for="doc in files.slice(0, 3)" :key="doc.id">
            <a
              :href="fileUrl(doc.id)"
              target="_blank"
              rel="noopener noreferrer"
              >{{ doc.title }}</a
            ><small>{{ doc.signed ? '已标记签署' : '待签署 / 未标记' }}</small>
          </li>
        </ul>
        <p v-else class="stage-empty">尚未上传文件</p>
      </section></template
    >
    <template v-else
      ><section>
        <h4>考学结果</h4>
        <strong class="stage-result">{{
          CONTACT_RESULT_LABELS[contact.finalResult]
        }}</strong
        ><time v-if="contact.resultDate">{{ contact.resultDate }}</time>
        <p>{{ contact.resultNotes || '结果说明待记录' }}</p>
      </section></template
    >
  </div>
</template>
<style scoped>
.contact-stage-content {
  display: grid;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--jg-line);
  margin-top: 10px;
}
.contact-stage-content section {
  min-width: 0;
}
.contact-stage-content h4 {
  margin: 0 0 7px;
  color: var(--jg-muted);
  font-size: 11px;
  font-weight: 500;
}
.contact-stage-content h4 span {
  margin-left: 5px;
}
.contact-stage-content p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  color: var(--jg-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.contact-stage-content .stage-mail-body {
  -webkit-line-clamp: 5;
}
.contact-stage-content strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--jg-text);
}
.contact-stage-content time {
  display: block;
  color: var(--jg-muted);
  margin: 6px 0;
  font-size: 11px;
}
.contact-stage-content ul {
  padding-left: 14px;
  margin: 0;
  display: grid;
  gap: 7px;
  font-size: 12px;
}
.contact-stage-content a {
  color: var(--jg-accent-text);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.contact-stage-content li small {
  display: block;
  font-size: 10px;
  color: var(--jg-muted);
}
.contact-stage-content .stage-empty {
  color: var(--jg-muted);
}
.contact-stage-content strong.stage-result {
  font-size: 16px;
}
</style>
