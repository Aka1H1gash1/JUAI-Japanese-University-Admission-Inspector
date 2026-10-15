import { spawn } from 'node:child_process';
import { access, mkdtemp, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const toml = (value) =>
  typeof value === 'string'
    ? JSON.stringify(value)
    : typeof value === 'boolean' || typeof value === 'number'
      ? String(value)
      : Array.isArray(value)
        ? `[${value.map(toml).join(',')}]`
        : `{${Object.entries(value)
            .map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`)
            .join(',')}}`;
const safeMessage = (value) =>
  String(value || '本机 Codex 操作失败。')
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/sk-[\w-]{8,}/g, '[已隐藏密钥]')
    .slice(0, 600);
async function executable(explicit) {
  if (
    explicit &&
    (typeof explicit !== 'string' ||
      !path.isAbsolute(explicit) ||
      explicit.length > 2048 ||
      !['codex', 'codex.exe', 'codex.js'].includes(path.basename(explicit)))
  )
    throw new Error('请填写 codex 程序的绝对路径。');
  const candidates = explicit
    ? [explicit]
    : [
        ...(process.env.PATH || '')
          .split(path.delimiter)
          .filter(Boolean)
          .map((dir) =>
            path.join(
              dir,
              process.platform === 'win32' ? 'codex.exe' : 'codex',
            ),
          ),
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
        path.join(homedir(), '.local/bin/codex'),
        path.join(homedir(), '.npm-global/bin/codex'),
        '/Applications/Codex.app/Contents/Resources/codex',
      ];
  for (const candidate of new Set(candidates))
    try {
      const actual = await realpath(candidate);
      await access(actual, constants.R_OK);
      const handle = await open(actual, 'r'),
        buffer = Buffer.alloc(256);
      try {
        await handle.read(buffer, 0, buffer.length, 0);
      } finally {
        await handle.close();
      }
      const script =
        buffer.toString('utf8').startsWith('#!') &&
        buffer.toString('utf8').split('\n')[0].includes('node');
      if (!script) await access(actual, constants.X_OK);
      return {
        path: actual,
        command: script ? process.execPath : actual,
        prefix: script ? [actual] : [],
      };
    } catch {}
  throw new Error(
    '未找到本机 Codex。请安装 Codex CLI，或在设置中填写 codex 程序路径。',
  );
}
export function createCodexBridge() {
  let child,
    booting,
    ready = false,
    profileVerified = false,
    cwd = '',
    profile = '',
    requestedPath = '',
    connection = {
      connected: false,
      ready: false,
      needsLogin: false,
      models: [],
    },
    serial = 0;
  const pending = new Map(),
    listeners = new Map();
  const write = (value) => {
    if (!child?.stdin.writable)
      throw new Error('Codex 连接已关闭，请重新连接。');
    child.stdin.write(JSON.stringify(value) + '\n');
  };
  function rpc(method, params = {}, timeout = 30000) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`本机 Codex ${method} 响应超时。`));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }
  function terminate(reason = 'Codex 连接已断开。') {
    const previous = child;
    child = undefined;
    ready = false;
    profileVerified = false;
    connection = {
      ...connection,
      connected: false,
      ready: false,
      error: safeMessage(reason),
    };
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(safeMessage(reason)));
    }
    pending.clear();
    for (const listener of listeners.values())
      listener.failure(new Error(safeMessage(reason)));
    listeners.clear();
    if (previous) {
      previous.stdin.destroy();
      previous.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (previous.exitCode === null) previous.kill('SIGKILL');
      }, 2000);
      timer.unref();
    }
  }
  async function receive(message, processRef) {
    if (child !== processRef) return;
    if (message.method && message.id !== undefined) {
      if (message.method === 'item/tool/call') {
        const params = message.params || {},
          listener = listeners.get(params.threadId);
        try {
          if (!listener) throw new Error('此对话没有活动的资料工具。');
          if (!params.tool?.startsWith('juai_'))
            throw new Error('仅开放 JUAI 资料工具。');
          const result = await listener.tool(
            params.tool.slice(5),
            params.arguments,
          );
          if (child === processRef)
            write({
              id: message.id,
              result: {
                success: result.success,
                contentItems: [
                  { type: 'inputText', text: JSON.stringify(result.output) },
                ],
              },
            });
        } catch (error) {
          if (child === processRef)
            write({
              id: message.id,
              result: {
                success: false,
                contentItems: [
                  {
                    type: 'inputText',
                    text: JSON.stringify({ error: safeMessage(error.message) }),
                  },
                ],
              },
            });
        }
      } else if (
        [
          'item/commandExecution/requestApproval',
          'item/fileChange/requestApproval',
          'execCommandApproval',
          'applyPatchApproval',
        ].includes(message.method)
      )
        write({ id: message.id, result: { decision: 'decline' } });
      else
        write({
          id: message.id,
          error: {
            code: -32601,
            message:
              'JUAI does not grant system, file, or external tool access.',
          },
        });
      return;
    }
    if (message.id !== undefined) {
      const p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id);
      clearTimeout(p.timer);
      if (message.error)
        p.reject(new Error(safeMessage(message.error.message)));
      else p.resolve(message.result);
      return;
    }
    if (message.method) {
      const params = message.params || {};
      const listener = listeners.get(params.threadId);
      if (listener) listener.event(message.method, params);
      if (message.method === 'account/login/completed')
        connection = {
          ...connection,
          loginPending: false,
          ...(!params.success
            ? { error: safeMessage(params.error || 'Codex 登录未完成。') }
            : {}),
        };
    }
  }
  async function start(explicit = '') {
    if (ready && requestedPath === (explicit || '')) return;
    if (booting) return booting;
    if (listeners.size)
      throw new Error('请先停止当前 Codex 回答，再切换程序。');
    terminate();
    booting = (async () => {
      const binary = await executable(explicit);
      requestedPath = explicit || '';
      cwd = await mkdtemp(path.join(tmpdir(), 'juai-codex-'));
      profile = `juai_info_${randomUUID().slice(0, 8)}`;
      const overrides = {
        [`permissions.${profile}`]: {
          description: 'JUAI information tools only',
          filesystem: { ':minimal': 'read', [cwd]: 'read' },
          network: { enabled: false },
        },
        default_permissions: profile,
        'features.shell_tool': false,
        'features.unified_exec': false,
        'features.hooks': false,
        'features.code_mode.enabled': false,
        'features.apps': false,
        'computer_use.default_app_access': 'deny',
        'browser_use.allow_history_access': false,
        'browser_use.default_origin_policy': {
          access: 'deny',
          downloads: 'deny',
          uploads: 'deny',
          full_cdp_access: 'deny',
        },
        'features.remote_plugin': false,
        'features.multi_agent': false,
        'features.multi_agent_v2': false,
        'agents.enabled': false,
        'features.memories': false,
        'features.skip_host_skill_discovery': true,
        'skills.include_instructions': false,
        project_doc_max_bytes: 0,
        web_search: 'disabled',
        'analytics.enabled': false,
        'otel.log_user_prompt': false,
      };
      const args = [
        ...binary.prefix,
        'app-server',
        '--stdio',
        ...Object.entries(overrides).flatMap(([key, value]) => [
          '-c',
          `${key}=${toml(value)}`,
        ]),
      ];
      const processRef = spawn(binary.command, args, {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), process.env.PATH || ''].join(
            path.delimiter,
          ),
        },
      });
      child = processRef;
      let diagnostics = '';
      processRef.stderr.on('data', (buffer) => {
        diagnostics = (diagnostics + buffer.toString()).slice(-4000);
      });
      processRef.on('error', (error) => {
        if (child === processRef) terminate(error.message);
      });
      processRef.on('exit', () => {
        if (child === processRef)
          terminate(diagnostics || '本机 Codex 已退出，请重新连接。');
      });
      const lines = createInterface({
        input: processRef.stdout,
        crlfDelay: Infinity,
      });
      lines.on('line', (line) => {
        if (line.length > 4 * 1024 * 1024) {
          terminate('Codex 消息过大。');
          return;
        }
        let value;
        try {
          value = JSON.parse(line);
        } catch {
          return;
        }
        void receive(value, processRef).catch((error) => {
          if (child === processRef) terminate(error.message);
        });
      });
      const init = await rpc('initialize', {
        clientInfo: {
          name: 'juai_local_workspace',
          title: 'JUAI Local Workspace',
          version: '0.3.0',
        },
        capabilities: { experimentalApi: true },
      });
      write({ method: 'initialized', params: {} });
      ready = true;
      connection = {
        connected: true,
        ready: false,
        needsLogin: false,
        path: binary.path,
        version: String(
          init?.userAgent || init?.user_agent || 'Codex App Server',
        ),
        models: [],
      };
    })()
      .catch((error) => {
        terminate(error.message);
        throw error;
      })
      .finally(() => {
        booting = undefined;
      });
    return booting;
  }
  async function thread(model, tools, instructions) {
    const response = await rpc('config/read', { includeLayers: false, cwd });
    const config = response?.config || {};
    const overrides = {
      mcp_servers: Object.fromEntries(
        Object.entries(config.mcp_servers || {}).map(([name, value]) => [
          name,
          {
            ...(value.url
              ? { url: value.url }
              : value.command
                ? { command: value.command, args: value.args || [] }
                : {}),
            enabled: false,
            required: false,
          },
        ]),
      ),
      plugins: Object.fromEntries(
        Object.keys(config.plugins || {}).map((name) => [
          name,
          { enabled: false },
        ]),
      ),
    };
    overrides.computer_use = {
      default_app_access: 'deny',
      macos: {
        bundle_ids: Object.fromEntries(
          Object.keys(config.computer_use?.macos?.bundle_ids || {}).map(
            (id) => [id, 'deny'],
          ),
        ),
      },
    };
    overrides.browser_use = {
      allow_history_access: false,
      default_origin_policy: {
        access: 'deny',
        downloads: 'deny',
        uploads: 'deny',
        full_cdp_access: 'deny',
      },
      origins: Object.fromEntries(
        Object.keys(config.browser_use?.origins || {}).map((origin) => [
          origin,
          {
            access: 'deny',
            downloads: 'deny',
            uploads: 'deny',
            full_cdp_access: 'deny',
          },
        ]),
      ),
    };
    const result = await rpc('thread/start', {
      model: model || null,
      cwd,
      ephemeral: true,
      approvalPolicy: 'never',
      permissions: profile,
      runtimeWorkspaceRoots: [cwd],
      environments: [],
      baseInstructions: instructions,
      developerInstructions:
        '只使用 juai_ 开头的资料工具。没有命令执行、源码编辑、系统文件或其他 MCP 权限。修改通过网页建议确认，不直接写入。',
      config: overrides,
      dynamicTools: tools.map((t) => ({
        type: 'function',
        name: `juai_${t.name}`,
        description: t.description,
        inputSchema: t.parameters,
        deferLoading: false,
      })),
      serviceName: 'juai',
    });
    if (
      result.activePermissionProfile?.id !== profile ||
      result.sandbox?.type !== 'readOnly' ||
      result.approvalPolicy !== 'never'
    ) {
      if (result.thread?.id)
        await rpc('thread/unsubscribe', { threadId: result.thread.id }).catch(
          () => {},
        );
      throw new Error(
        '本机 Codex 未采用 JUAI 的只读资料权限，已停止连接。请检查 Codex 版本及管理策略。',
      );
    }
    return result.thread.id;
  }
  async function connect(explicit = '') {
    await start(explicit);
    const auth = await rpc('account/read', { refreshToken: false });
    connection = {
      ...connection,
      connected: true,
      needsLogin: !!auth.requiresOpenaiAuth && !auth.account,
      accountType: auth.account?.type || 'configured_provider',
      plan: auth.account?.planType || '',
      error: '',
    };
    if (connection.needsLogin) return { ...connection, ready: false };
    let cursor,
      models = [];
    for (let i = 0; i < 3; i++) {
      const result = await rpc('model/list', {
        limit: 50,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      models.push(...(result.data || []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    models = models
      .filter((m) => !m.hidden)
      .map((m) => ({
        id: m.model || m.id,
        name: m.displayName || m.model || m.id,
        isDefault: !!m.isDefault,
      }));
    if (!models.length)
      throw new Error('Codex 没有返回可用模型，请检查本机登录或模型配置。');
    profileVerified = false;
    connection.ready = false;
    const probe = await thread(
      (models.find((m) => m.isDefault) || models[0]).id,
      [],
      'JUAI 连接初始化；未启动推理。',
    );
    await rpc('thread/unsubscribe', { threadId: probe }).catch(() => {});
    profileVerified = true;
    connection = {
      ...connection,
      ready: true,
      models,
      defaultModel: (models.find((m) => m.isDefault) || models[0]).id,
    };
    return { ...connection };
  }
  async function status(refresh = false) {
    if (refresh && ready) {
      const auth = await rpc('account/read', { refreshToken: false });
      connection = {
        ...connection,
        needsLogin: !!auth.requiresOpenaiAuth && !auth.account,
        ready: profileVerified && (!auth.requiresOpenaiAuth || !!auth.account),
        accountType: auth.account?.type || 'configured_provider',
        plan: auth.account?.planType || '',
      };
    }
    return { ...connection };
  }
  async function login(explicit = '') {
    await start(explicit);
    const result = await rpc('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
    });
    let url;
    try {
      url = new URL(result.authUrl);
    } catch {
      throw new Error('Codex 未返回有效登录地址。');
    }
    if (
      url.protocol !== 'https:' ||
      !['openai.com', 'chatgpt.com'].some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    )
      throw new Error('Codex 登录地址不属于官方登录服务。');
    connection = { ...connection, loginPending: true };
    return { authUrl: url.toString() };
  }
  async function run({
    config,
    messages,
    instructions,
    tools,
    signal,
    onText,
    onTool,
  }) {
    const state = await connect(config.codexPath || '');
    if (!state.ready)
      throw new Error('本机 Codex 尚未登录，请先在助手中登录。');
    if (signal.aborted) throw new Error('本次对话已停止。');
    for (const item of tools)
      instructions = instructions.replaceAll(item.name, `juai_${item.name}`);
    const threadId = await thread(config.model, tools, instructions),
      allowed = new Set(tools.map((t) => t.name));
    let turnId,
      settled = false,
      nativeCompleted = false,
      lastItem = '',
      text = '',
      calls = 0;
    const itemText = new Map();
    let resolveDone, rejectDone;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    void done.catch(() => {});
    const finish = (error) => {
      if (settled) return;
      settled = true;
      error ? rejectDone(error) : resolveDone({ text, calls: [] });
    };
    const add = (id, delta) => {
      if (!delta) return;
      if (lastItem && lastItem !== id) {
        text += '\n\n';
        onText('\n\n');
      }
      lastItem = id;
      text += delta;
      itemText.set(id, (itemText.get(id) || '') + delta);
      onText(delta);
    };
    const interrupt = () => {
      if (turnId)
        void rpc('turn/interrupt', { threadId, turnId }, 5000).catch(() => {});
      finish(new Error('本次对话已停止。'));
    };
    listeners.set(threadId, {
      failure: finish,
      tool: async (name, input) => {
        if (signal.aborted || settled) throw new Error('本轮对话已停止。');
        if (!allowed.has(name)) throw new Error('此工具未授权。');
        if (++calls > 20) {
          interrupt();
          throw new Error('工具调用已达上限。');
        }
        return onTool(name, input);
      },
      event: (method, params) => {
        try {
          if (method === 'item/agentMessage/delta')
            add(params.itemId, params.delta || '');
          if (
            method === 'item/completed' &&
            params.item?.type === 'agentMessage' &&
            !itemText.has(params.item.id)
          )
            add(params.item.id, params.item.text || '');
          if (
            method === 'item/started' &&
            [
              'commandExecution',
              'fileChange',
              'mcpToolCall',
              'webSearch',
              'collabToolCall',
            ].includes(params.item?.type)
          ) {
            interrupt();
            finish(new Error('本轮尝试了资料范围以外的操作，已停止。'));
          }
          if (method === 'turn/completed') {
            nativeCompleted = true;
            const turn = params.turn;
            if (turn?.status === 'completed') finish();
            else
              finish(
                new Error(
                  turn?.status === 'interrupted'
                    ? '本次对话已停止。'
                    : safeMessage(turn?.error?.message || 'Codex 回答未完成。'),
                ),
              );
          }
          if (method === 'error' && !params.willRetry)
            finish(
              new Error(
                safeMessage(params.error?.message || 'Codex 处理失败。'),
              ),
            );
        } catch (error) {
          finish(error);
        }
      },
    });
    signal.addEventListener('abort', interrupt, { once: true });
    try {
      if (signal.aborted) throw new Error('本次对话已停止。');
      const input = JSON.stringify({
        notice:
          '请回答 messages 最后一条用户问题；其余消息是上下文。工作区事实仍需从 JUAI 资料工具读取。',
        messages,
      });
      const started = await rpc('turn/start', {
        threadId,
        input: [{ type: 'text', text: input }],
        approvalPolicy: 'never',
        permissions: profile,
        environments: [],
      });
      turnId = started.turn?.id;
      if (signal.aborted) interrupt();
      const result = await done;
      if (!result.text.trim()) throw new Error('Codex 没有返回文本回答。');
      return result;
    } finally {
      signal.removeEventListener('abort', interrupt);
      listeners.delete(threadId);
      if (turnId && !nativeCompleted)
        await rpc('turn/interrupt', { threadId, turnId }, 5000).catch(() => {});
      await rpc('thread/unsubscribe', { threadId }, 5000).catch(() => {});
    }
  }
  return {
    connect,
    status,
    login,
    run,
    close: () => terminate('JUAI 本地服务已停止。'),
  };
}
