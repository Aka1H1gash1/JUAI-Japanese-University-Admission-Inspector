export function providerConfig(input, fail) {
  if (
    !input ||
    typeof input.baseUrl !== 'string' ||
    input.baseUrl.length > 2048 ||
    typeof input.model !== 'string' ||
    !input.model.trim() ||
    input.model.length > 160 ||
    !['responses', 'chat_completions'].includes(input.protocol) ||
    (input.stream !== undefined && typeof input.stream !== 'boolean')
  )
    fail('请填写 API 地址、模型 ID 和有效接口类型。');
  let url;
  try {
    url = new URL(input.baseUrl.trim());
  } catch {
    fail('API 地址不是有效 URL。');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail(
      '远程 API 使用 HTTPS；本地模型可以使用 localhost HTTP。地址中不能包含密码、查询参数或片段。',
    );
  url.pathname = url.pathname
    .replace(/\/(?:chat\/completions|responses)\/?$/, '')
    .replace(/\/$/, '');
  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    model: input.model.trim(),
    protocol: input.protocol,
    stream: input.stream !== false,
    local,
  };
}
const tool = (item, protocol) =>
  protocol === 'responses'
    ? {
        type: 'function',
        name: item.name,
        description: item.description,
        parameters: item.parameters,
        strict: false,
      }
    : {
        type: 'function',
        function: {
          name: item.name,
          description: item.description,
          parameters: item.parameters,
          strict: false,
        },
      };
function cleanError(error, key) {
  let message = error?.message || '模型请求失败。';
  if (key) message = message.replaceAll(key, '[已隐藏密钥]');
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/sk-[\w-]{8,}/g, '[已隐藏密钥]')
    .slice(0, 500);
}
async function readBody(response, limit = 4 * 1024 * 1024) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('模型响应过大，请缩小问题或授权范围。');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}
async function events(response, receive) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    size = 0;
  async function process(raw) {
    const lines = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (!lines.length) return;
    const data = lines.join('\n');
    if (data === '[DONE]') return;
    let value;
    try {
      value = JSON.parse(data);
    } catch {
      throw new Error('模型流式数据格式错误，可在设置中关闭流式后重试。');
    }
    await receive(value);
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw new Error('模型流式响应超过大小限制。');
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        '\n',
      );
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        await process(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await process(buffer);
  } finally {
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}
export function responseInput(output) {
  return output.flatMap((item) => {
    if (item.type === 'function_call')
      return [
        {
          type: 'function_call',
          call_id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        },
      ];
    if (item.type === 'reasoning')
      return [
        {
          type: 'reasoning',
          ...(item.id ? { id: item.id } : {}),
          summary: item.summary ?? [],
          ...(item.encrypted_content
            ? { encrypted_content: item.encrypted_content }
            : {}),
        },
      ];
    if (item.type === 'message')
      return [
        {
          type: 'message',
          role: 'assistant',
          ...(item.phase ? { phase: item.phase } : {}),
          content: (item.content ?? [])
            .filter((c) => c.type === 'output_text' || c.type === 'refusal')
            .map((c) =>
              c.type === 'refusal'
                ? { type: 'refusal', refusal: c.refusal }
                : { type: 'output_text', text: c.text },
            ),
        },
      ];
    return [];
  });
}
export async function modelTurn({
  config,
  apiKey,
  messages,
  instructions,
  tools,
  signal,
  onText,
}) {
  const protocol = config.protocol;
  const body =
    protocol === 'responses'
      ? {
          model: config.model,
          instructions,
          input: messages,
          tools: tools.map((t) => tool(t, protocol)),
          max_output_tokens: 4096,
          stream: config.stream,
          store: false,
          include: ['reasoning.encrypted_content'],
        }
      : {
          model: config.model,
          messages: [{ role: 'system', content: instructions }, ...messages],
          tools: tools.map((t) => tool(t, protocol)),
          max_tokens: 4096,
          stream: config.stream,
        };
  try {
    const response = await fetch(
      `${config.baseUrl}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(75000)]),
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      let detail = '';
      try {
        const raw = JSON.parse(await readBody(response, 32768));
        detail = raw.error?.message || raw.message || '';
      } catch {}
      throw new Error(
        `模型服务返回 ${response.status}${detail ? `：${String(detail).slice(0, 400)}` : '，请检查地址、密钥、模型和接口类型。'}`,
      );
    }
    if (
      config.stream &&
      response.headers.get('content-type')?.includes('text/event-stream')
    ) {
      if (protocol === 'responses') {
        let completed,
          text = '';
        const items = new Map();
        await events(response, (value) => {
          if (value.type === 'response.output_text.delta') {
            text += value.delta ?? '';
            onText(value.delta ?? '');
          }
          if (value.type === 'response.output_item.done')
            items.set(value.output_index, value.item);
          if (value.type === 'response.completed') completed = value.response;
          if (
            ['error', 'response.failed', 'response.incomplete'].includes(
              value.type,
            )
          )
            throw new Error(
              value.error?.message ||
                value.response?.error?.message ||
                '模型响应未完成，请重试或更换模型。',
            );
        });
        if (!completed)
          throw new Error(
            '模型连接结束但未返回完成事件，可关闭流式响应后重试。',
          );
        const output =
          completed.output ??
          [...items.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
        if (!text) {
          text = responseText(output);
          if (text) onText(text);
        }
        return {
          text,
          output,
          calls: output
            .filter((i) => i.type === 'function_call')
            .map((i) => ({
              id: i.call_id,
              name: i.name,
              arguments: i.arguments,
            })),
          usage: completed.usage,
        };
      }
      let text = '',
        finish = '';
      const calls = new Map();
      let usage;
      await events(response, (value) => {
        if (value.error)
          throw new Error(value.error.message || '模型响应错误。');
        const choice = value.choices?.[0];
        usage = value.usage ?? usage;
        if (!choice) return;
        if (typeof choice.delta?.content === 'string') {
          text += choice.delta.content;
          onText(choice.delta.content);
        }
        for (const part of choice.delta?.tool_calls ?? []) {
          if (
            !Number.isInteger(part.index) ||
            part.index < 0 ||
            part.index > 15
          )
            throw new Error('模型工具调用过多或格式错误。');
          const current = calls.get(part.index) ?? {
            id: '',
            name: '',
            arguments: '',
          };
          if (part.id) current.id += part.id;
          if (part.function?.name) current.name += part.function.name;
          if (part.function?.arguments)
            current.arguments += part.function.arguments;
          calls.set(part.index, current);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      });
      if (!finish || ['length', 'content_filter'].includes(finish))
        throw new Error('模型响应未完成，请缩小问题后重试。');
      return { text, calls: [...calls.values()], usage };
    }
    const value = JSON.parse(await readBody(response));
    if (protocol === 'responses') {
      if (value.status && value.status !== 'completed')
        throw new Error(value.error?.message || '模型响应未完成。');
      const output = value.output ?? [];
      if (!Array.isArray(output)) throw new Error('Responses 返回格式错误。');
      const text = responseText(output);
      onText(text);
      return {
        text,
        output,
        calls: output
          .filter((i) => i.type === 'function_call')
          .map((i) => ({
            id: i.call_id,
            name: i.name,
            arguments: i.arguments,
          })),
        usage: value.usage,
      };
    }
    const choice = value.choices?.[0],
      message = choice?.message;
    if (!message || ['length', 'content_filter'].includes(choice.finish_reason))
      throw new Error('Chat Completions 返回格式错误或响应不完整。');
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.refusal || '';
    onText(text);
    return {
      text,
      calls: (message.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function?.name,
        arguments: c.function?.arguments,
      })),
      usage: value.usage,
    };
  } catch (error) {
    if (signal.aborted) throw new Error('本次对话已停止。');
    throw new Error(cleanError(error, apiKey));
  }
}
function responseText(output) {
  return output
    .filter((i) => i.type === 'message')
    .flatMap((i) => i.content ?? [])
    .map((c) =>
      c.type === 'output_text' ? c.text : c.type === 'refusal' ? c.refusal : '',
    )
    .join('\n');
}
