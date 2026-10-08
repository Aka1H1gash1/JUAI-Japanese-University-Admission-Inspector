<script setup lang="ts">
import { computed } from 'vue';

import { Button, Drawer } from 'ant-design-vue';

import { useExplorerStore, websiteUrl } from '../explorer';
import ExplorerIcon from './explorer-icon.vue';

const props = defineProps<{ professorId: string }>();
const emit = defineEmits<{ edit: [id: string]; remove: [id: string] }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const professor = computed(() =>
  store.professors.find((item) => item.id === props.professorId),
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
  <Drawer
    v-model:open="open"
    title="老师资料"
    :width="560"
    :destroy-on-close="true"
    class="professor-detail-drawer"
  >
    <div v-if="professor" class="professor-details">
      <p class="detail-affiliation">
        {{ university?.name }} / {{ school?.name }} / {{ major?.name }}
      </p>
      <span class="entity-symbol teacher-symbol"><ExplorerIcon name="user" /></span>
      <h2>{{ professor.name }}</h2>
      <p class="detail-japanese">
        {{
          [professor.japaneseName, professor.title]
            .filter(Boolean)
            .join(' · ') || '职称待补充'
        }}
      </p>
      <Button
        class="icon-button favorite-button"
        :class="{ 'is-favorite': professor.favorite }"
        :aria-pressed="professor.favorite"
        @click="store.toggleFavorite(professor.id)"
      >
        <ExplorerIcon name="heart" />{{
          professor.favorite ? '已标记为心仪老师' : '标记为心仪老师'
        }}
      </Button>
      <dl class="professor-fields">
        <div>
          <dt>研究方向</dt>
          <dd>{{ professor.research || '尚未填写' }}</dd>
        </div>
        <div>
          <dt>研究室</dt>
          <dd>{{ professor.laboratory || '尚未填写' }}</dd>
        </div>
        <div>
          <dt>联系邮箱</dt>
          <dd>
            <a v-if="professor.email" :href="`mailto:${professor.email}`">{{
              professor.email
            }}</a><span v-else>尚未填写</span>
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
              >访问个人主页<ExplorerIcon name="link" /></a><span v-else>尚未填写</span>
          </dd>
        </div>
        <div>
          <dt>研究室主页</dt>
          <dd>
            <a
              v-if="websiteUrl(professor.laboratoryWebsite)"
              :href="websiteUrl(professor.laboratoryWebsite)"
              target="_blank"
              rel="noopener noreferrer"
              class="icon-link"
              >访问研究室主页<ExplorerIcon name="link" /></a><span v-else>尚未填写</span>
          </dd>
        </div>
        <div>
          <dt>关注理由 / 个人备注</dt>
          <dd class="notes-value">
            {{ professor.notes || '记下这位老师吸引你的地方。' }}
          </dd>
        </div>
      </dl>
      <div class="professor-detail-actions">
        <Button
          class="icon-button"
          @click="
            open = false;
            emit('edit', professor.id);
          "
        >
          <ExplorerIcon name="edit" />编辑资料
</Button><Button
          danger
          class="icon-button"
          @click="emit('remove', professor.id)"
        >
          <ExplorerIcon name="trash" />删除老师
        </Button>
      </div>
    </div>
  </Drawer>
</template>
