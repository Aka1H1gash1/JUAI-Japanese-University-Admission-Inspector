<script setup lang="ts">
import type { CollectionStatus } from './collection-types';

import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { App, Button, Input, InputNumber, Tabs } from 'ant-design-vue';

import { jsonOptions, localApi } from './local-api';
interface Profile {
  displayName: string;
  email: string;
  school: string;
  major: string;
  education: string;
  language: string;
  interests: string;
  notes: string;
  admissionYear: number;
  identity: string;
}
interface BrowserRuntime {
  browserMode: boolean;
  mobile: {
    available: boolean;
    enabled: boolean;
    urls: string[];
  };
  origin?: string;
  remote?: boolean;
  version: string;
  workspace: string;
}
const route = useRoute();
const { message } = App.useApp();
const busy = ref(false);
const errorMessage = ref('');
const loading = ref(false);
const tab = ref(
  route.query.tab === 'browser' || route.query.tab === 'mobile'
    ? route.query.tab
    : 'profile',
);
const browser = ref<CollectionStatus['browser']>();
const runtime = ref<BrowserRuntime>();
const runtimeBusy = ref(false);
const runtimeMessage = ref('');
const connectingBrowser = ref(false);
const browserLabel = computed(() => {
  if (connectingBrowser.value)
    return '正在等待浏览器授权，请切换到 Chrome / Edge 查看提示…';
  if (browser.value?.available)
    return `${browser.value.name} · ${browser.value.port} · 已连接`;
  if (browser.value?.detected)
    return `已检测到 ${browser.value.name} · ${browser.value.port}，等待连接`;
  return '尚未检测到浏览器调试连接';
});
const port = ref<number>();
const profile = ref<Profile>();
const version = ref(0);
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [settings, state] = await Promise.all([
      localApi<{ version: number; profile: Profile }>('/settings'),
      localApi<CollectionStatus>('/collection/status'),
    ]);
    version.value = settings.version;
    profile.value = settings.profile;
    browser.value = state.browser;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '设置读取失败。';
  } finally {
    loading.value = false;
  }
}
void load();
async function loadRuntime() {
  try {
    runtime.value = await localApi<BrowserRuntime>('/runtime/browser');
  } catch {
    runtime.value = undefined;
  }
}
void loadRuntime();
async function save() {
  busy.value = true;
  errorMessage.value = '';
  try {
    const saved = await localApi<{ version: number; profile: Profile }>(
      '/settings',
      jsonOptions('PUT', { version: version.value, profile: profile.value }),
    );
    version.value = saved.version;
    profile.value = saved.profile;
    message.success('个人信息与默认查询条件已保存。');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败。';
  } finally {
    busy.value = false;
  }
}
async function connect() {
  busy.value = true;
  connectingBrowser.value = true;
  errorMessage.value = '';
  try {
    browser.value = await localApi<CollectionStatus['browser']>(
      '/collection/browser',
      jsonOptions('POST', { port: port.value || 0 }),
    );
    message.info(
      browser.value.available
        ? '浏览器已授权，可以读取网页了。'
        : browser.value.message || '尚未检测到浏览器。',
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '浏览器连接失败。';
  } finally {
    connectingBrowser.value = false;
    busy.value = false;
  }
}
async function setMobileAccess(enabled: boolean) {
  runtimeBusy.value = true;
  runtimeMessage.value = '';
  try {
    const mobile = await localApi<BrowserRuntime['mobile']>(
      '/runtime/mobile',
      jsonOptions('POST', { enabled }),
    );
    if (runtime.value) runtime.value.mobile = mobile;
    runtimeMessage.value = enabled
      ? '手机访问已开启；关闭 JUAI 后链接会自动失效。'
      : '手机访问已关闭。';
  } catch (error) {
    runtimeMessage.value =
      error instanceof Error ? error.message : '手机访问设置失败。';
  } finally {
    runtimeBusy.value = false;
  }
}
async function copyMobileUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    message.success('手机访问链接已复制。');
  } catch {
    runtimeMessage.value = '复制失败，请长按或选中链接手动复制。';
  }
}
async function shutdownRuntime() {
  runtimeBusy.value = true;
  try {
    await localApi<{ closing: boolean }>(
      '/runtime/shutdown',
      jsonOptions('POST', {}),
    );
    runtimeMessage.value = 'JUAI 已退出，可以关闭当前页面。';
  } catch (error) {
    runtimeMessage.value =
      error instanceof Error ? error.message : 'JUAI 退出失败。';
    runtimeBusy.value = false;
  }
}
</script>
<template>
  <section class="workspace-settings">
    <header>
      <div>
        <p>WORKSPACE SETTINGS / 设置</p>
        <h1>设置</h1>
      </div>
      <RouterLink to="/japan-grad/ai">AI 接入与 API 配置 ↗</RouterLink>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading">正在读取设置…</p>
    <Tabs v-model:active-key="tab">
      <Tabs.TabPane key="profile" tab="个人信息">
        <form v-if="profile" class="settings-panel" @submit.prevent="save">
          <h2>个人信息</h2>
          <p>
            保存在本地工作区。AI
            查询默认预填入学年份和申请身份，其他资料由你决定是否填入备注。
          </p>
          <div class="settings-fields">
            <label>称呼<Input
                v-model:value="profile.displayName"
                :maxlength="160"
                :disabled="busy"
/></label><label>邮箱<Input
                v-model:value="profile.email"
                :maxlength="240"
                :disabled="busy"
            /></label>
            <label>毕业 / 在读院校<Input
                v-model:value="profile.school"
                :maxlength="240"
                :disabled="busy"
/></label><label>专业<Input
                v-model:value="profile.major"
                :maxlength="240"
                :disabled="busy"
            /></label>
            <label>当前学历<Input
                v-model:value="profile.education"
                :maxlength="240"
                :disabled="busy"
/></label><label>语言成绩<Input
                v-model:value="profile.language"
                :maxlength="1000"
                :disabled="busy"
                placeholder="如 JLPT、TOEFL、IELTS 等"
            /></label>
            <label>默认入学年份<InputNumber
                v-model:value="profile.admissionYear"
                :min="1900"
                :max="2200"
                :precision="0"
                :disabled="busy"
/></label><label>默认申请身份<Input
                v-model:value="profile.identity"
                :maxlength="240"
                :disabled="busy"
                placeholder="如：修士・外国人留学生"
            /></label>
            <label class="settings-wide">研究兴趣<Input.TextArea
                v-model:value="profile.interests"
                :rows="3"
                :maxlength="2000"
                :disabled="busy"
/></label><label class="settings-wide">个人备注<Input.TextArea
                v-model:value="profile.notes"
                :rows="3"
                :maxlength="4000"
                :disabled="busy"
            /></label>
          </div>
          <footer>
            <Button type="primary" html-type="submit" :loading="busy">
              保存设置
            </Button>
          </footer>
        </form>
      </Tabs.TabPane>
      <Tabs.TabPane key="browser" tab="浏览器连接">
        <section class="settings-panel">
          <h2>连接你的 Chrome / Edge</h2>
          <p>
            网址查询可直接读取公开页面；动态网页或需要已有登录状态的页面，可使用已授权的
            Chrome / Edge。
          </p>
          <div class="settings-browser-state">
            <i :class="{ ready: browser?.available }"></i>{{ browserLabel }}
          </div>
          <p v-if="browser?.message && !connectingBrowser">
            {{ browser.message }}
          </p>
          <ol>
            <li>
              在 Chrome 打开
              <code>chrome://inspect/#remote-debugging</code>；Edge 使用
              <code>edge://inspect/#remote-debugging</code>。
            </li>
            <li>开启页面中的远程调试选项，保持浏览器打开。</li>
            <li>点击下方按钮，切换到浏览器，在弹出的连接请求中选择“允许”。</li>
          </ol>
          <Button type="primary" :loading="busy" @click="connect">
            {{ connectingBrowser ? '等待浏览器授权…' : '检查并连接浏览器' }}
          </Button>
          <details>
            <summary>手动指定调试端口（可选）</summary>
            <InputNumber
              v-model:value="port"
              :min="1"
              :max="65535"
              placeholder="留空自动检测"
              :disabled="busy"
            />
          </details>
          <p>查询只创建并关闭自己的标签页。登录和验证码由你在浏览器中完成。</p>
        </section>
      </Tabs.TabPane>
      <Tabs.TabPane key="mobile" tab="手机访问">
        <section class="settings-panel">
          <h2>在手机上打开 JUAI</h2>
          <p>
            电脑和手机连接同一个 Wi-Fi
            后，可以临时让手机访问这台电脑上的工作区。数据仍保存在电脑，不会上传到云端。
          </p>
          <template v-if="runtime">
            <div class="settings-browser-state">
              <i :class="{ ready: runtime.mobile.enabled }"></i>
              {{
                runtime.remote
                  ? '当前正通过电脑上的手机链接访问'
                  : runtime.mobile.enabled
                    ? '手机访问已开启'
                    : runtime.mobile.available
                      ? '手机访问已关闭'
                      : '未检测到可用的局域网'
              }}
            </div>
            <div
              v-if="runtime.mobile.enabled && !runtime.remote"
              class="mobile-access-links"
            >
              <p>将下方链接发送到自己的手机并打开：</p>
              <div v-for="url in runtime.mobile.urls" :key="url">
                <Input :value="url" readonly />
                <Button @click="copyMobileUrl(url)">复制链接</Button>
              </div>
              <p>
                链接带有本次启动的临时密钥，不要发给其他人。退出 JUAI
                后密钥自动失效。仅在信任的家庭或个人网络中使用。
              </p>
            </div>
            <div v-if="!runtime.remote" class="runtime-actions">
              <Button
                v-if="!runtime.mobile.enabled"
                type="primary"
                :disabled="!runtime.mobile.available"
                :loading="runtimeBusy"
                @click="setMobileAccess(true)"
              >
                开启手机访问
              </Button>
              <Button
                v-else
                danger
                :loading="runtimeBusy"
                @click="setMobileAccess(false)"
              >
                关闭手机访问
              </Button>
              <Button :disabled="runtimeBusy" @click="shutdownRuntime">
                完全退出 JUAI
              </Button>
            </div>
            <p v-else>
              运行管理只能在电脑上操作。需要关闭手机访问或退出 JUAI
              时，请回到电脑设置页。
            </p>
            <p>JUAI {{ runtime.version }} · {{ runtime.workspace }}</p>
          </template>
          <template v-else>
            <div class="settings-browser-state">
              <i></i>开发服务器 / 旧桌面版不提供手机访问开关
            </div>
            <p>该功能将随 JUAI v1.2 本地浏览器版提供。</p>
          </template>
          <p v-if="runtimeMessage" role="status">{{ runtimeMessage }}</p>
        </section>
      </Tabs.TabPane>
    </Tabs>
  </section>
</template>
<style scoped>
.workspace-settings {
  max-width: 1000px;
  padding-bottom: 40px;
  margin: auto;
}

.workspace-settings > header {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 28px;
}

.workspace-settings header p {
  margin: 0;
  font-size: 10px;
  color: var(--jg-accent-text);
  letter-spacing: 0.13em;
}

.workspace-settings h1 {
  margin: 10px 0 0;
  font-size: 32px;
  letter-spacing: -0.04em;
}

.workspace-settings header a {
  font-size: 12px;
  color: var(--jg-accent-text);
}

.settings-panel {
  padding: 25px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}

.settings-panel h2 {
  margin: 0 0 12px;
  font-size: 21px;
}

.settings-panel p,
.settings-panel li {
  font-size: 12px;
  line-height: 1.9;
  color: var(--jg-muted);
}

.settings-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin: 24px 0;
}

.settings-fields label {
  display: grid;
  gap: 8px;
  font-size: 12px;
  color: var(--jg-secondary);
}

.settings-fields .ant-input-number {
  width: 100%;
}

.settings-wide {
  grid-column: 1/-1;
}

.settings-panel footer {
  display: flex;
  justify-content: flex-end;
}

.settings-browser-state {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 15px;
  margin: 24px 0;
  font-size: 13px;
  color: var(--jg-secondary);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.settings-browser-state i {
  width: 7px;
  height: 7px;
  background: var(--jg-muted);
  border-radius: 50%;
}

.settings-browser-state .ready {
  background: var(--jg-success);
}

.settings-panel ol {
  padding-left: 20px;
  margin: 20px 0;
}

.settings-panel details {
  margin: 22px 0;
  font-size: 12px;
  color: var(--jg-muted);
}

.mobile-access-links {
  padding: 16px;
  margin: 18px 0;
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.mobile-access-links > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin: 10px 0;
}

.runtime-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
}

.settings-panel summary {
  margin-bottom: 12px;
  cursor: pointer;
}

@media (max-width: 600px) {
  .settings-fields {
    grid-template-columns: 1fr;
  }

  .settings-panel {
    padding: 18px;
  }

  .mobile-access-links > div {
    grid-template-columns: 1fr;
  }
}
</style>
