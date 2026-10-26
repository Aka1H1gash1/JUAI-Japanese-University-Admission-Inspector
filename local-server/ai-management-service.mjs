import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { providerConfig } from './assistant-provider.mjs';
import { createCodexBridge } from './codex-bridge.mjs';

const now = () => new Date().toISOString();
const identifier = (s) => typeof s === 'string' && /^[\w-]{1,100}$/.test(s);
const legacyProvider = (provider) => {
  let deepseek = provider.adapter === 'deepseek';
  try {
    deepseek ||= new URL(provider.baseUrl).hostname === 'api.deepseek.com';
  } catch {}
  return deepseek && provider.protocol === 'responses'
    ? { ...provider, protocol: 'chat_completions', adapter: 'deepseek' }
    : provider;
};
export const aiFeatures = [
  {
    id: 'web_collection',
    name: '网址解析查询',
    description:
      '从研究室和研究科链接出发，读取网页与 PDF，生成带来源的档案草稿。',
    tools: true,
  },
  {
    id: 'workspace_chat',
    name: '工作区助手',
    description: '查询与比较大学、研究室资料，提出待确认的修改建议。',
    tools: true,
  },
  {
    id: 'document_chat',
    name: '阅读与笔记问答',
    description: '解释当前资料、检索原文、引用回跳与转存笔记。',
    tools: true,
  },
  {
    id: 'admission_extract',
    name: '募集要项提取',
    description: '读取募集要项，提取带出处的报考要求，核对后填表。',
    tools: false,
  },
];
const redact = (s, key) =>
  String(s || '连接操作失败。')
    .replaceAll(key || '\u0000', '[已隐藏密钥]')
    .replaceAll(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replaceAll(/sk-[\w-]{8,}/g, '[已隐藏密钥]')
    .slice(0, 600);
async function requestApiModels(provider, key) {
  const response = await fetch(`${provider.baseUrl}/models`, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  const chunks = [];
  const reader = response.body?.getReader();
  let bytes = 0;
  if (!reader) throw new Error('服务商没有返回模型目录。');
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > 1_048_576) throw new Error('模型列表响应过大。');
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!response.ok)
    throw new Error(`服务商返回 ${response.status}，请检查地址、密钥或网络。`);
  let raw;
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('服务商未返回有效模型列表，请手动填写模型 ID。');
  }
  if (!Array.isArray(raw.data))
    throw new Error('此服务没有兼容的模型目录，请手动填写模型 ID。');
  const models = raw.data
    .filter((m) => typeof m?.id === 'string' && m.id.length <= 160)
    .slice(0, 300)
    .map((m) => ({
      id: m.id,
      name: typeof m.name === 'string' ? m.name.slice(0, 200) : m.id,
      ...(m.is_default === true || m.default === true
        ? { isDefault: true }
        : {}),
      ...(Array.isArray(m.input_modalities)
        ? {
            inputModalities: m.input_modalities.filter((s) =>
              ['image', 'text'].includes(s),
            ),
          }
        : {}),
    }));
  if (models.length === 0) throw new Error('服务商没有返回可用模型。');
  return models;
}
export function createAiManagementService({
  db,
  transaction,
  snapshot,
  json,
  jsonBody,
  fail,
}) {
  if (
    !db.prepare('SELECT version FROM schema_migrations WHERE version=10').get()
  )
    transaction(() =>
      db.exec(`
    CREATE TABLE ai_connections (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE ai_feature_bindings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE ai_registry_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    INSERT INTO ai_registry_state VALUES (1, '{"legacyImported":false}');
    INSERT INTO schema_migrations VALUES (10, datetime('now'));`),
    );
  const discovering = new Set();
  const invalidators = new Set();
  const native = createCodexBridge();
  const vault = new Map();
  let closed = false;
  let settingUp = false;
  const all = () =>
    db
      .prepare('SELECT data FROM ai_connections ORDER BY rowid')
      .all()
      .map((r) => JSON.parse(r.data));
  const connection = (id) => {
    if (!identifier(id)) fail('AI 连接 ID 不合法。');
    const row = db
      .prepare('SELECT data FROM ai_connections WHERE id=?')
      .get(id);
    if (!row) fail('AI 连接已不存在，请重新选择。', 404);
    return JSON.parse(row.data);
  };
  const save = (value) =>
    db
      .prepare(
        'INSERT INTO ai_connections VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, JSON.stringify(value));
  const binding = (id) => {
    if (!aiFeatures.some((f) => f.id === id)) fail('AI 功能不存在。');
    const row = db
      .prepare('SELECT data FROM ai_feature_bindings WHERE id=?')
      .get(id);
    return row
      ? JSON.parse(row.data)
      : {
          feature: id,
          connectionId: '',
          model: '',
          enabled: true,
          thinking: 'inherit',
        };
  };
  const invalidate = (id) => {
    for (const callback of invalidators) callback(id);
  };
  function keyConfigured(provider) {
    const value =
      provider?.connectionId &&
      all().find((c) => c.id === provider.connectionId);
    return (
      !!value &&
      value.enabled &&
      value.provider.baseUrl === provider.baseUrl &&
      value.provider.protocol === provider.protocol &&
      !!vault.get(value.id)
    );
  }
  function credentials(provider) {
    const value = connection(provider.connectionId);
    if (!value.enabled)
      fail('此 AI 连接已停用，请到 AI 管理选择其他连接。', 409);
    if (
      value.provider.baseUrl !== provider.baseUrl ||
      value.provider.protocol !== provider.protocol ||
      value.provider.adapter !== provider.adapter ||
      (provider.protocol === 'codex' &&
        value.provider.codexPath !== provider.codexPath)
    )
      fail('原连接地址或接口已更改，请开始新对话。', 409);
    const key = vault.get(value.id) || '';
    if (!provider.local && !key)
      fail(
        '此连接的 API 密钥尚未填写或已随服务重启清除，请在 AI 管理重新填写。',
        409,
      );
    return key;
  }
  const clearKey = (id) => {
    connection(id);
    invalidate(id);
    vault.delete(id);
  };
  function resolve(feature, required = true, overrideId) {
    const base = binding(feature);
    const selected = overrideId
      ? {
          ...base,
          connectionId: overrideId,
          model: base.connectionId === overrideId ? base.model : '',
          thinking:
            base.connectionId === overrideId ? base.thinking : 'inherit',
        }
      : base;
    const value = all().find((c) => c.id === selected.connectionId);
    const unavailable = (() => {
      if (selected.enabled) {
        if (value) {
          if (!value.enabled) {
            return '此功能的连接已停用。';
          }
          return '';
        }
        return '请先在 AI 管理为此功能分配连接。';
      }
      return '此功能的 AI 已停用。';
    })();
    if (unavailable) {
      if (required) fail(unavailable, 409);
      return undefined;
    }
    const provider = {
      ...value.provider,
      model: selected.model || value.provider.model,
      connectionId: value.id,
    };
    if (selected.thinking !== 'inherit' && provider.adapter === 'deepseek')
      provider.thinking = selected.thinking;
    if (
      aiFeatures.find((f) => f.id === feature).tools &&
      provider.protocol !== 'codex' &&
      !value.supportsTools
    ) {
      if (required) fail('此功能需要工具调用，请选择支持工具的模型连接。', 409);
      return undefined;
    }
    const catalogueModel = value.discovery?.models.find(
      (m) => m.id === provider.model,
    );
    const knownModalities =
      catalogueModel?.inputModalities ||
      (() => {
        if (
          provider.adapter === 'deepseek' &&
          provider.model === 'deepseek-flash'
        ) {
          return ['text', 'image'];
        }
        if (
          provider.adapter === 'deepseek' &&
          provider.model === 'deepseek-v4-pro'
        ) {
          return ['text'];
        }
        return undefined;
      })();
    return {
      provider,
      connection: value,
      binding: selected,
      supportsImages: knownModalities
        ? knownModalities.includes('image')
        : value.supportsImages,
      structured:
        provider.adapter === 'deepseek' || provider.jsonMode !== 'prompt',
    };
  }
  function publicConnection(value) {
    return {
      ...value,
      keyConfigured: keyConfigured({
        ...value.provider,
        connectionId: value.id,
      }),
      features: aiFeatures
        .filter((f) => binding(f.id).connectionId === value.id)
        .map((f) => f.id),
    };
  }
  function validateKey(key) {
    if (
      key !== undefined &&
      (typeof key !== 'string' || key.length > 4096 || /[\r\n]/.test(key))
    )
      fail('API 密钥格式错误。');
  }
  function upsert(input, id = randomUUID()) {
    const old = all().find((c) => c.id === id);
    if (
      !input ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 80 ||
      !['codex', 'compatible', 'deepseek', 'openai'].includes(input.kind) ||
      (input.notes !== undefined &&
        (typeof input.notes !== 'string' || input.notes.length > 600))
    )
      fail('请填写连接名称与有效连接类型。');
    if (!old && all().length >= 140) fail('最多保存 140 个 AI 连接。');
    const raw = {
      ...input.provider,
      ...(input.kind === 'codex' ? { protocol: 'codex' } : {}),
      ...(input.kind === 'deepseek'
        ? { adapter: 'deepseek', protocol: 'chat_completions' }
        : {}),
    };
    if (input.kind !== 'codex' && raw.protocol === 'codex')
      fail('API 连接不能使用本机 Agent 协议。');
    const provider = providerConfig(raw, fail);
    validateKey(input.apiKey);
    if (
      old &&
      (old.provider.baseUrl !== provider.baseUrl ||
        old.provider.protocol !== provider.protocol ||
        old.provider.codexPath !== provider.codexPath)
    ) {
      invalidate(id);
      vault.delete(id);
    } else if (old?.enabled && input.enabled === false) invalidate(id);
    if (input.clearKey === true) {
      invalidate(id);
      vault.delete(id);
    }
    if (input.apiKey?.trim()) {
      invalidate(id);
      vault.set(id, input.apiKey.trim());
    }
    const value = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      provider,
      enabled: input.enabled !== false,
      supportsTools:
        provider.protocol === 'codex' || input.supportsTools !== false,
      supportsImages: input.supportsImages === true,
      notes: input.notes || '',
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
      ...(old?.provider.baseUrl === provider.baseUrl &&
      old?.provider.codexPath === provider.codexPath
        ? { discovery: old.discovery }
        : {}),
    };
    save(value);
    return value;
  }
  function saveBinding(feature, input) {
    const previous = binding(feature);
    if (input?.connectionId === '') {
      const value = {
        feature,
        connectionId: '',
        model: '',
        enabled: input.enabled !== false,
        thinking: 'inherit',
        updatedAt: now(),
      };
      db.prepare(
        'INSERT INTO ai_feature_bindings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      ).run(feature, JSON.stringify(value));
      invalidate(`__feature_${feature}__`);
      return value;
    }
    if (input?.enabled === false && !input.connectionId) {
      const value = { ...previous, enabled: false, updatedAt: now() };
      db.prepare(
        'INSERT INTO ai_feature_bindings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      ).run(feature, JSON.stringify(value));
      return value;
    }
    if (
      !input ||
      !identifier(input.connectionId) ||
      typeof input.model !== 'string' ||
      input.model.length > 160 ||
      !['disabled', 'enabled', 'inherit'].includes(input.thinking || 'inherit')
    )
      fail('请选择连接与有效模型。');
    const value = connection(input.connectionId);
    const actualModel = input.model.trim() || value.provider.model;
    if (value.provider.protocol !== 'codex' && !actualModel)
      fail('请填写模型 ID。');
    if (
      input.enabled !== false &&
      aiFeatures.find((f) => f.id === feature).tools &&
      value.provider.protocol !== 'codex' &&
      !value.supportsTools
    )
      fail('工作区助手与阅读问答需要支持工具调用的模型。');
    const result = {
      ...previous,
      connectionId: value.id,
      model: input.model.trim(),
      enabled: input.enabled !== false,
      thinking: input.thinking || 'inherit',
      updatedAt: now(),
    };
    db.prepare(
      'INSERT INTO ai_feature_bindings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
    ).run(feature, JSON.stringify(result));
    if (!result.enabled) invalidate(`__feature_${feature}__`);
    return result;
  }
  function saveLegacy(feature, provider, apiKey, options = {}) {
    provider = legacyProvider(provider);
    const id =
      feature === 'admission_extract'
        ? 'legacy-admission-api'
        : 'legacy-assistant';
    const old = all().find((c) => c.id === id);
    const value = upsert(
      {
        name:
          old?.name ||
          (feature === 'admission_extract' ? '原募集要项 API' : '原助手连接'),
        kind: (() => {
          if (provider.protocol === 'codex') {
            return 'codex';
          }
          if (
            provider.adapter === 'deepseek' ||
            provider.baseUrl.includes('api.deepseek.com')
          ) {
            return 'deepseek';
          }
          return 'compatible';
        })(),
        provider,
        apiKey,
        supportsTools: true,
        supportsImages: options.supportsImages ?? old?.supportsImages ?? false,
        enabled: true,
        notes: old?.notes || '从原有功能配置导入，可在此统一管理。',
        clearKey: options.clearKey,
      },
      id,
    );
    saveBinding(feature, {
      connectionId: id,
      model: provider.model,
      enabled: true,
      thinking: 'inherit',
    });
    return value;
  }
  function importLegacy() {
    const state = JSON.parse(
      db.prepare('SELECT data FROM ai_registry_state WHERE id=1').get().data,
    );
    if (state.legacyImported) return;
    transaction(() => {
      const oldAssistant = db
        .prepare('SELECT data FROM assistant_settings WHERE id=1')
        .get();
      let defaultConnection;
      if (oldAssistant) {
        const old = JSON.parse(oldAssistant.data);
        if (old.provider?.model)
          defaultConnection = saveLegacy(
            'workspace_chat',
            old.provider,
            undefined,
          );
      }
      const oldApi = db
        .prepare('SELECT data FROM admission_ai_settings WHERE id=1')
        .get();
      let admission;
      if (oldApi) {
        const old = JSON.parse(oldApi.data);
        if (old.provider?.model)
          admission = saveLegacy(
            'admission_extract',
            { ...old.provider, jsonMode: old.structured ? 'schema' : 'prompt' },
            undefined,
            { supportsImages: old.supportsImages },
          );
      }
      if (defaultConnection) {
        saveBinding('document_chat', {
          connectionId: defaultConnection.id,
          model: '',
          enabled: true,
        });
        if (!admission)
          saveBinding('admission_extract', {
            connectionId: defaultConnection.id,
            model: '',
            enabled: true,
          });
      }
      // Historical sessions retain their original provider; credentials are isolated per connection.
      for (const row of db
        .prepare('SELECT id,data FROM assistant_sessions')
        .all()) {
        const session = JSON.parse(row.data);
        if (session.provider.connectionId) continue;
        session.provider = legacyProvider(session.provider);
        let value = all().find(
          (c) =>
            c.provider.baseUrl === session.provider.baseUrl &&
            c.provider.protocol === session.provider.protocol &&
            (c.provider.codexPath || '') === (session.provider.codexPath || ''),
        );
        if (!value)
          value = upsert({
            name: `历史连接 ${all().length + 1}`,
            kind:
              session.provider.protocol === 'codex' ? 'codex' : 'compatible',
            provider: session.provider,
            supportsTools: true,
            supportsImages: false,
          });
        session.provider = {
          ...providerConfig(session.provider, fail),
          connectionId: value.id,
        };
        db.prepare('UPDATE assistant_sessions SET data=? WHERE id=?').run(
          JSON.stringify(session),
          row.id,
        );
      }
      db.prepare('UPDATE ai_registry_state SET data=? WHERE id=1').run(
        JSON.stringify({ legacyImported: true }),
      );
    });
  }
  function permissions() {
    const row = db
      .prepare('SELECT data FROM assistant_settings WHERE id=1')
      .get();
    const value = row ? JSON.parse(row.data) : {};
    return {
      majorIds:
        value.majorIds ||
        snapshot()
          .data.majors.slice(0, 100)
          .map((m) => m.id),
      writableKinds: value.writableKinds || ['major', 'lab'],
    };
  }
  async function discover(id) {
    if (discovering.has(id)) fail('此连接正在读取模型列表，请稍后。', 409);
    const value = connection(id);
    if (!value.enabled) fail('请先启用此连接。');
    discovering.add(id);
    let key = '';
    try {
      key =
        value.provider.protocol === 'codex'
          ? ''
          : credentials({ ...value.provider, connectionId: value.id });
      let models, state;
      if (value.provider.protocol === 'codex') {
        state = await native.connect(value.provider.codexPath || '');
        if (!state.ready) return { native: state, models: [] };
        models = state.models.map((m) => ({
          id: m.id,
          name: m.name,
          inputModalities: m.inputModalities,
          isDefault: m.isDefault,
        }));
      } else {
        const response = await fetch(`${value.provider.baseUrl}/models`, {
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        });
        const chunks = [];
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          for (;;) {
            const item = await reader.read();
            if (item.done) break;
            bytes += item.value.length;
            if (bytes > 1_048_576) throw new Error('模型列表响应过大。');
            chunks.push(item.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (!response.ok)
          throw new Error(
            `服务商返回 ${response.status}，请检查地址、密钥或网络。`,
          );
        let raw;
        try {
          raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new Error('服务商未返回有效模型列表；可继续手动填写模型 ID。');
        }
        if (!Array.isArray(raw.data))
          throw new Error('此服务没有兼容的模型目录，可手动填写模型 ID。');
        models = raw.data
          .filter((m) => typeof m?.id === 'string' && m.id.length <= 160)
          .slice(0, 300)
          .map((m) => ({
            id: m.id,
            name: typeof m.name === 'string' ? m.name.slice(0, 200) : m.id,
            ...(Array.isArray(m.input_modalities)
              ? {
                  inputModalities: m.input_modalities.filter((s) =>
                    ['image', 'text'].includes(s),
                  ),
                }
              : {}),
          }));
        if (models.length === 0) throw new Error('服务商没有返回可用模型。');
      }
      const current = connection(id);
      if (current.updatedAt !== value.updatedAt)
        fail('连接配置已变化，请重新读取模型。', 409);
      current.discovery = { at: now(), models };
      save(current);
      return {
        models,
        native: state,
        connection: publicConnection(current),
        message: '模型目录已读取；尚未发起推理。',
      };
    } catch (error) {
      fail(redact(error.message, key), error.status || 502);
    } finally {
      discovering.delete(id);
    }
  }
  async function quickSetup(input) {
    if (settingUp) fail('正在连接 AI，请稍后。', 409);
    if (!input || !['api', 'local'].includes(input.mode))
      fail('请选择本地 Agent 或 API。');
    settingUp = true;
    let key = '';
    try {
      const old = input.connectionId
        ? connection(input.connectionId)
        : undefined;
      const kind = input.mode === 'local' ? 'codex' : input.kind;
      if (
        !['codex', 'compatible', 'deepseek', 'openai'].includes(kind) ||
        (input.mode === 'api' && kind === 'codex')
      )
        fail('请选择有效的 API 服务类型。');
      if (old && old.kind !== kind)
        fail('连接类型已变化，请刷新 AI 管理后重试。', 409);
      validateKey(input.apiKey);
      if (
        input.model !== undefined &&
        (typeof input.model !== 'string' || input.model.length > 160)
      )
        fail('模型 ID 格式不正确。');
      let catalogue, provider, state;
      if (kind === 'codex') {
        const codexPath = input.codexPath ?? old?.provider.codexPath ?? '';
        provider = providerConfig(
          {
            protocol: 'codex',
            model: input.model?.trim() || old?.provider.model || '',
            codexPath,
          },
          fail,
        );
        state = await native.connect(provider.codexPath);
        if (!state.ready) {
          if (old && connection(old.id).updatedAt !== old.updatedAt)
            fail('连接已被其他页面更新，请刷新后重试。', 409);
          const pending = upsert(
            {
              name: old?.name || '本机 Codex',
              kind,
              provider,
              enabled: true,
              supportsTools: true,
              notes: old?.notes || '',
            },
            old?.id,
          );
          return {
            status: 'login_required',
            connection: publicConnection(pending),
            native: state,
          };
        }
        catalogue = state.models.map((m) => ({
          id: m.id,
          name: m.name,
          inputModalities: m.inputModalities,
          isDefault: m.isDefault,
        }));
        const requested = input.model?.trim();
        if (requested && !catalogue.some((m) => m.id === requested))
          fail('本机账户未提供所选模型，请重新选择。');
        provider.model =
          requested ||
          (catalogue.some((m) => m.id === provider.model)
            ? provider.model
            : state.defaultModel || catalogue[0]?.id);
        if (!provider.model) fail('本机 Codex 没有返回可用模型。');
      } else {
        if (old?.supportsTools === false)
          fail(
            '此连接标记为不支持工具调用，请选择支持工具调用的模型后再统一启用。',
          );
        const protocol =
          kind === 'deepseek'
            ? 'chat_completions'
            : (input.protocol ??
              old?.provider.protocol ??
              (kind === 'openai' ? 'responses' : 'chat_completions'));
        if (!['chat_completions', 'responses'].includes(protocol))
          fail('API 接口类型不正确。');
        provider = providerConfig(
          {
            ...old?.provider,
            protocol,
            baseUrl: input.baseUrl,
            model:
              input.model?.trim() ||
              old?.provider.model ||
              'juai-model-pending',
            ...(kind === 'deepseek'
              ? { adapter: 'deepseek', jsonMode: 'json' }
              : {
                  adapter: 'standard',
                  jsonMode: kind === 'openai' ? 'schema' : 'prompt',
                }),
          },
          fail,
        );
        const sameEndpoint =
          old?.provider.baseUrl === provider.baseUrl &&
          old?.provider.protocol === provider.protocol;
        key =
          input.apiKey?.trim() || (sameEndpoint ? vault.get(old.id) || '' : '');
        if (!provider.local && !key) fail('请填写 API Key。');
        if (!input.model?.trim() && (!sameEndpoint || !old?.provider.model)) {
          try {
            catalogue = await requestApiModels(provider, key);
          } catch (error) {
            fail(
              `${redact(error.message, key)} 展开“模型与接口选项”后，也可以手动填写模型 ID。`,
              502,
            );
          }
          const textModels = catalogue.filter(
            (m) =>
              !/embed|rerank|whisper|tts|dall-e|image|audio|realtime|transcri|moderation|speech|sora/i.test(
                m.id,
              ),
          );
          const selected =
            textModels.find((m) => m.isDefault) ||
            (kind === 'deepseek'
              ? textModels.find((m) =>
                  /^deepseek-(flash|chat)(?:$|-)/i.test(m.id),
                )
              : undefined) ||
            (kind === 'openai'
              ? textModels.find((m) => /^(?:gpt|chatgpt)-/i.test(m.id))
              : undefined) ||
            textModels[0];
          if (!selected)
            fail(
              '目录中没有可自动选择的聊天模型，请在“模型与接口选项”中填写模型 ID。',
            );
          provider.model = selected.id;
        }
      }
      if (closed) throw new Error('JUAI 服务已停止。');
      if (old && connection(old.id).updatedAt !== old.updatedAt)
        fail('连接已被其他页面更新，请刷新后重试。', 409);
      if (
        kind !== 'codex' &&
        old &&
        !input.apiKey?.trim() &&
        key &&
        vault.get(old.id) !== key
      )
        fail('此连接的密钥已被更新或清除，请重新填写后保存。', 409);
      const vaultBefore = new Map(vault);
      let value;
      try {
        transaction(() => {
          value = upsert(
            {
              name:
                old?.name ||
                (() => {
                  if (kind === 'codex') {
                    return '本机 Codex';
                  }
                  if (kind === 'deepseek') {
                    return '我的 DeepSeek';
                  }
                  if (kind === 'openai') {
                    return '我的 OpenAI';
                  }
                  return '我的 API';
                })(),
              kind,
              provider,
              enabled: true,
              supportsTools: true,
              supportsImages:
                catalogue
                  ?.find((m) => m.id === provider.model)
                  ?.inputModalities?.includes('image') ||
                (old?.provider.model === provider.model &&
                  old.supportsImages) ||
                false,
              notes: old?.notes || '',
              ...(key ? { apiKey: key } : {}),
            },
            old?.id,
          );
          if (catalogue) {
            value.discovery = { at: now(), models: catalogue };
            save(value);
          }
          for (const feature of aiFeatures)
            saveBinding(feature.id, {
              connectionId: value.id,
              model: '',
              enabled: true,
              thinking: 'inherit',
            });
        });
      } catch (error) {
        vault.clear();
        for (const [id, secret] of vaultBefore) vault.set(id, secret);
        throw error;
      }
      return {
        status: 'configured',
        connection: publicConnection(value),
        native: state,
        model: provider.model,
        catalogueRead: !!catalogue,
      };
    } catch (error) {
      fail(redact(error.message, key), error.status || 400);
    } finally {
      settingUp = false;
    }
  }
  return {
    native,
    resolve,
    resolveRequest(feature, input = {}) {
      if (!input.aiMode && !input.aiConnectionId) return resolve(feature);
      if (!['agent', 'api'].includes(input.aiMode))
        fail('请选择 Agent 查询或 API 查询。');
      const selected = input.aiConnectionId
        ? connection(input.aiConnectionId)
        : all().find(
            (c) =>
              c.enabled &&
              (input.aiMode === 'agent'
                ? c.provider.protocol === 'codex'
                : c.provider.protocol !== 'codex'),
          );
      if (
        !selected ||
        !selected.enabled ||
        (selected.provider.protocol === 'codex') !== (input.aiMode === 'agent')
      )
        fail('所选查询方式尚未配置，请先到 AI 管理连接。');
      return resolve(feature, true, selected.id);
    },
    binding,
    connection,
    credentials,
    keyConfigured,
    clearKey,
    saveLegacy,
    importLegacy,
    initializeFeature(feature, fromFeature) {
      if (
        db.prepare('SELECT id FROM ai_feature_bindings WHERE id=?').get(feature)
      )
        return;
      const existing = resolve(fromFeature, false);
      if (existing)
        saveBinding(feature, {
          connectionId: existing.provider.connectionId,
          model: existing.provider.model,
          thinking: existing.binding.thinking || 'inherit',
          enabled: true,
        });
    },
    permissions,
    onInvalidate(callback) {
      invalidators.add(callback);
      return () => invalidators.delete(callback);
    },
    async handle(req, res, route) {
      if (!route.startsWith('/api/japangrad/ai/')) return false;
      const endpoint = route.slice('/api/japangrad/ai'.length);
      const reply = (data, status = 200) => {
        json(res, data, status);
        return true;
      };
      if (endpoint === '/management' && req.method === 'GET')
        return reply({
          connections: all().map((item) => publicConnection(item)),
          features: aiFeatures.map((f) => ({ ...f, ...binding(f.id) })),
          permissions: permissions(),
          native: await native.status(),
          keyStorage: 'memory',
        });
      if (endpoint === '/quick-setup' && req.method === 'POST')
        return reply(await quickSetup(await jsonBody(req)));
      if (endpoint === '/connections' && req.method === 'POST')
        return reply(publicConnection(upsert(await jsonBody(req))), 201);
      let match = endpoint.match(
        /^\/connections\/([\w-]+)(?:\/(models|key|login))?$/,
      );
      if (match) {
        const value = connection(match[1]);
        if (!match[2] && req.method === 'PUT')
          return reply(publicConnection(upsert(await jsonBody(req), value.id)));
        if (!match[2] && req.method === 'DELETE') {
          await jsonBody(req);
          if (aiFeatures.some((f) => binding(f.id).connectionId === value.id))
            fail('此连接仍被功能使用，请先为对应功能换一个连接。', 409);
          invalidate(value.id);
          vault.delete(value.id);
          db.prepare('DELETE FROM ai_connections WHERE id=?').run(value.id);
          return reply({ deleted: true });
        }
        if (match[2] === 'key' && req.method === 'DELETE') {
          await jsonBody(req);
          invalidate(value.id);
          vault.delete(value.id);
          return reply(publicConnection(value));
        }
        if (match[2] === 'models' && req.method === 'POST') {
          await jsonBody(req);
          return reply(await discover(value.id));
        }
        if (
          match[2] === 'login' &&
          req.method === 'POST' &&
          value.provider.protocol === 'codex'
        ) {
          await jsonBody(req);
          return reply(await native.login(value.provider.codexPath || ''));
        }
      }
      match = endpoint.match(
        /^\/features\/(workspace_chat|document_chat|admission_extract|web_collection)$/,
      );
      if (match && req.method === 'PUT')
        return reply(saveBinding(match[1], await jsonBody(req)));
      if (endpoint === '/permissions' && req.method === 'PUT') {
        const input = await jsonBody(req);
        const kinds = new Set([
          'lab',
          'major',
          'professor',
          'school',
          'university',
        ]);
        if (
          !Array.isArray(input?.majorIds) ||
          input.majorIds.length > 100 ||
          input.majorIds.some(
            (id) => !snapshot().data.majors.some((m) => m.id === id),
          ) ||
          !Array.isArray(input.writableKinds) ||
          input.writableKinds.some((id) => !kinds.has(id))
        )
          fail('请选择有效专攻与资料类型。');
        const old = db
          .prepare('SELECT data FROM assistant_settings WHERE id=1')
          .get();
        const data = {
          ...(old ? JSON.parse(old.data) : {}),
          majorIds: [...new Set(input.majorIds)],
          writableKinds: [...new Set(input.writableKinds)],
        };
        db.prepare(
          'INSERT INTO assistant_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        ).run(JSON.stringify(data));
        invalidate('__permissions__');
        return reply(permissions());
      }
      fail('AI 管理操作不存在。', 404);
    },
    close() {
      if (closed) return;
      closed = true;
      native.close();
      vault.clear();
      invalidators.clear();
    },
  };
}
