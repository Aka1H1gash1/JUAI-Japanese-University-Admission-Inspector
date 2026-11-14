<script setup lang="ts">
import type { Profile } from '../profile-types';

import { computed, ref, watch } from 'vue';

import { Button, Input, InputNumber, Modal } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';

const props = defineProps<{
  profile: Profile;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ save: [profile: Profile] }>();
const editing = ref(false);
const draft = ref<Profile>({ ...props.profile });
const submitted = ref(false);
const initials = computed(() =>
  [...props.profile.displayName.trim()].slice(0, 2).join(''),
);
const interests = computed(() =>
  props.profile.interests
    .split(/[\n,，;；、]+/u)
    .map((text) => text.trim())
    .filter(Boolean),
);
const languages = computed(() =>
  props.profile.language
    .split(/[\n;；]+/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const match =
        /^(JLPT|TOEFL(?:\s+iBT)?|TOEIC|IELTS|CET(?:-?[46])?|日本語能力試験)\s*[:：·]?\s+(.+)$/iu.exec(
          text,
        );
      return match
        ? { name: match[1], score: match[2] }
        : { name: text, score: '' };
    }),
);
watch(
  () => props.busy,
  (busy, previous) => {
    if (previous && !busy && submitted.value) {
      if (!props.error) editing.value = false;
      submitted.value = false;
    }
  },
);
function edit() {
  draft.value = { ...props.profile };
  submitted.value = false;
  editing.value = true;
}
function submit() {
  if (props.busy) return;
  submitted.value = true;
  emit('save', { ...draft.value });
}
</script>

<template>
  <article class="profile-dossier juai-design" aria-label="个人档案">
    <section class="profile-card profile-hero">
      <header class="profile-identity">
        <div class="profile-avatar" aria-hidden="true">
          <span v-if="initials">{{ initials }}</span>
          <svg
            v-else
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
          </svg>
        </div>
        <div class="profile-person">
          <h2>{{ profile.displayName || '完善你的个人档案' }}</h2>
          <p v-if="profile.school || profile.major">
            {{ [profile.school, profile.major].filter(Boolean).join(' · ') }}
          </p>
          <p v-else class="profile-muted">添加院校与专业，记录你的学术起点</p>
          <span v-if="profile.email" class="profile-email">{{
            profile.email
          }}</span>
        </div>
        <Button class="profile-edit" @click="edit">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path d="m16 3 5 5-12 12-6 1 1-6Z" />
            <path d="m13 6 5 5" />
          </svg>
          编辑档案
        </Button>
      </header>

      <dl class="profile-targets">
        <div>
          <dt>目标入学年份</dt>
          <dd>
            {{
              profile.admissionYear ? `${profile.admissionYear}年` : '尚未设置'
            }}
          </dd>
        </div>
        <div>
          <dt>申请类型</dt>
          <dd>{{ profile.identity || '尚未设置' }}</dd>
        </div>
      </dl>
    </section>

    <div class="profile-details">
      <ContentSection title="教育背景" class="profile-education">
        <div
          v-if="profile.school || profile.major || profile.education"
          class="profile-academic"
        >
          <strong>{{ profile.education || '学历尚未填写' }}</strong>
          <p>当前学历</p>
        </div>
        <div v-else class="profile-empty">
          <strong>记录你的学术起点</strong>
          <p>填写院校、专业与当前学历</p>
        </div>
      </ContentSection>
      <ContentSection title="语言能力" class="profile-language">
        <ul v-if="languages.length" class="profile-scores">
          <li v-for="(language, index) in languages" :key="index">
            <span>{{ language.name }}</span><strong v-if="language.score">{{ language.score }}</strong>
          </li>
        </ul>
        <div v-else class="profile-empty">
          <strong>还没有记录语言成绩</strong>
          <p>JLPT / TOEFL / TOEIC / IELTS</p>
        </div>
      </ContentSection>
    </div>
    <ContentSection title="研究兴趣" class="profile-research">
      <ul v-if="interests.length" class="profile-interests">
        <li v-for="(interest, index) in interests" :key="index">
          {{ interest }}
        </li>
      </ul>
      <p v-else class="profile-empty">添加你关注的领域，让研究方向逐渐清晰。</p>
      <div v-if="profile.notes" class="profile-notes">
        <h4>个人备注</h4>
        <p>{{ profile.notes }}</p>
      </div>
    </ContentSection>
  </article>

  <Modal
    v-model:open="editing"
    title="编辑个人档案"
    :width="680"
    :footer="null"
    :closable="!busy"
    :mask-closable="!busy"
    :keyboard="!busy"
  >
    <form class="profile-editor" @submit.prevent="submit">
      <fieldset :disabled="busy">
        <legend>个人与教育信息</legend>
        <div class="profile-editor-grid">
          <label>称呼<Input
              v-model:value="draft.displayName"
              :maxlength="160"
              :disabled="busy"
          /></label>
          <label>邮箱<Input
              v-model:value="draft.email"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>毕业 / 在读院校<Input
              v-model:value="draft.school"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>专业<Input
              v-model:value="draft.major"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>当前学历<Input
              v-model:value="draft.education"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>语言成绩<Input.TextArea
              v-model:value="draft.language"
              :rows="2"
              :maxlength="1000"
              :disabled="busy"
              placeholder="如 JLPT N1 150；TOEFL 100"
          /></label>
        </div>
      </fieldset>
      <fieldset :disabled="busy">
        <legend>申请与研究</legend>
        <div class="profile-editor-grid">
          <label>默认入学年份<InputNumber
              v-model:value="draft.admissionYear"
              :min="1900"
              :max="2200"
              :precision="0"
              :disabled="busy"
          /></label>
          <label>默认申请身份<Input
              v-model:value="draft.identity"
              :maxlength="240"
              :disabled="busy"
              placeholder="如：修士・外国人留学生"
          /></label>
          <label class="profile-editor-wide">研究兴趣<Input.TextArea
              v-model:value="draft.interests"
              :rows="2"
              :maxlength="2000"
              :disabled="busy"
              placeholder="研究方向可用逗号或换行分隔"
          /></label>
          <label class="profile-editor-wide">个人备注<Input.TextArea
              v-model:value="draft.notes"
              :rows="3"
              :maxlength="4000"
              :disabled="busy"
          /></label>
        </div>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer>
        <Button :disabled="busy" @click="editing = false">取消</Button><Button type="primary" html-type="submit" :loading="busy">
          保存档案
        </Button>
      </footer>
    </form>
  </Modal>
</template>

<style scoped>
.profile-dossier {
  --profile-radius: var(--juai-radius);
  --profile-padding: var(--juai-space-6);

  display: grid;
  gap: var(--juai-space-4);
  font-family: var(--jg-font);
}

.profile-card {
  min-width: 0;
  padding: var(--profile-padding);
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: var(--profile-radius);
}

.profile-hero {
  padding: 0 28px;
}

.profile-identity {
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 28px 0 24px;
}

.profile-avatar {
  display: grid;
  flex: 0 0 72px;
  place-items: center;
  width: 72px;
  height: 72px;
  font-size: 26px;
  font-weight: 600;
  color: var(--jg-accent-text);
  background: var(--jg-subtle);
  border-radius: 50%;
}

.profile-person {
  flex: 1;
  min-width: 0;
}

.profile-person h2 {
  margin: 0 0 6px;
  font-family: var(--jg-font);
  font-size: 28px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
}

.profile-person p {
  font-size: 14px;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
}

.profile-person .profile-degree {
  margin-top: 4px;
  font-size: 12px;
  color: var(--jg-muted);
}

.profile-email {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}

.profile-edit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.profile-targets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 20px 0 24px;
  margin: 0;
  border-top: 1px solid var(--jg-line);
}

.profile-targets dt {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--jg-muted);
}

.profile-targets dd {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--jg-text);
  overflow-wrap: anywhere;
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.profile-dossier h3 {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 24px;
  font-family: var(--jg-font);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.profile-dossier h3 svg {
  width: 20px;
  height: 20px;
  color: var(--jg-muted);
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.profile-academic strong {
  display: block;
  font-size: 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.profile-academic p {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
}

.profile-scores {
  display: grid;
  gap: 14px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.profile-scores li {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  font-size: 13px;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.profile-scores li span {
  min-width: 0;
}

.profile-scores strong {
  max-width: 70%;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  color: var(--jg-accent-text);
  text-align: right;
}

.profile-interests {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.profile-interests li {
  max-width: 100%;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--jg-accent-text);
  overflow-wrap: anywhere;
  background: var(--jg-subtle);
  border-radius: 6px;
}

.profile-empty {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.profile-empty strong {
  font-size: 14px;
  font-weight: 500;
  color: var(--jg-secondary);
}

.profile-empty p {
  margin-top: 6px;
  font-size: 11px;
}

.profile-notes {
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid var(--jg-line);
}

.profile-notes h4 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--jg-muted);
}

.profile-notes p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.profile-muted {
  color: var(--jg-muted) !important;
}

.profile-editor {
  padding-top: 12px;
}

.profile-editor fieldset {
  min-width: 0;
  padding: 0;
  margin: 0 0 20px;
  border: 0;
}

.profile-editor legend {
  width: 100%;
  padding: 0;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}

.profile-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.profile-editor label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--jg-secondary);
}

.profile-editor-wide {
  grid-column: 1 / -1;
}

.profile-editor :deep(.ant-input-number) {
  width: 100%;
}

.profile-editor footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--jg-line);
}

@media (max-width: 600px) {
  .profile-dossier {
    --profile-padding: 20px;

    gap: 12px;
  }

  .profile-hero {
    padding: 0 20px;
  }

  .profile-identity {
    flex-wrap: wrap;
    gap: 12px;
    padding: 20px 0;
  }

  .profile-avatar {
    flex-basis: 52px;
    width: 52px;
    height: 52px;
    font-size: 20px;
  }

  .profile-person {
    flex-basis: calc(100% - 64px);
  }

  .profile-person h2 {
    font-size: 23px;
  }

  .profile-person p {
    font-size: 12px;
  }

  .profile-edit {
    margin-left: 64px;
  }

  .profile-targets {
    gap: 16px;
    padding: 16px 0 20px;
  }

  .profile-targets dd {
    font-size: 16px;
  }

  .profile-details {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .profile-dossier h3 {
    margin-bottom: 16px;
  }

  .profile-editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
