import { modelTurn, responseInput } from './assistant-provider.mjs';

const object = (properties, required) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
export const collectionTools = [
  {
    name: 'read_web_page',
    description:
      '读取用户提供或已访问页面中实际出现的相关链接；自动保存网页来源或下载 PDF。不能编造链接。用于本次链接对象、所属上级与对应募集要项收集。',
    parameters: object(
      { url: { type: 'string' }, purpose: { type: 'string' } },
      ['url', 'purpose'],
    ),
  },
  {
    name: 'read_collected_source',
    description:
      '按页阅读已保存网页或 PDF，可用原文关键词定位相关段落。返回 sourceId、page、可逐字引用的 text。扫描 PDF 按需使用本机 OCR。',
    parameters: object(
      {
        sourceId: { type: 'string' },
        page: { type: 'integer', minimum: 1 },
        count: { type: 'integer', minimum: 1, maximum: 3 },
        query: { type: 'string' },
      },
      ['sourceId'],
    ),
  },
  {
    name: 'list_collection_sources',
    description: '列出本任务已访问来源、读取覆盖情况、相关链接和下载资料。',
    parameters: object({}, []),
  },
];
export async function runCollectionAgent({
  ai,
  instructions,
  prompt,
  outputSchema,
  signal,
  onTool,
  onModel,
  selection,
  getFinalPrompt,
  onPhase = () => {},
  savedOnly = false,
}) {
  const selected = selection || ai.resolve('web_collection');
  const config = { ...selected.provider };
  const apiKey = ai.credentials(config);
  if (prompt.length > 120_000)
    throw new Error('起始页面内容较多，请缩小目标范围后再收集。');
  if (config.protocol === 'codex') {
    const state = await ai.native.connect(config.codexPath || '');
    if (!state.ready)
      throw new Error('本机 Codex 尚未登录，请在 AI 管理中登录。');
    config.model ||= state.defaultModel;
  }
  onModel({ connectionId: config.connectionId, model: config.model });
  let phase = 'exploring';
  const setPhase = (next, reason) => {
    if (phase === next) return;
    phase = next;
    onPhase({ phase: next, reason });
  };
  const outputObserver = () => {
    let recent = '';
    return (delta) => {
      recent = (recent + delta).slice(-2048);
      if (/(?:^|\n)\s*(?:```(?:json)?\s*)?\{/.test(recent))
        setPhase('finalizing', 'model_output');
    };
  };
  const nativeTurn = (content, tools, extraInstructions = '') => {
    let outputLength = 0;
    const observe = outputObserver();
    return ai.native.run({
      config,
      instructions: instructions + extraInstructions,
      messages: [{ role: 'user', content }],
      tools,
      outputSchema,
      signal,
      onText(delta) {
        observe(delta);
        outputLength += delta.length;
        if (outputLength > 180_000)
          throw new Error('收集结果过长，请缩小目标范围。');
      },
      onTool: async (name, args) => {
        try {
          return { success: true, output: await invoke(name, args) };
        } catch (error) {
          return { success: false, output: { error: error.message } };
        }
      },
    });
  };
  const finalize = async (reason) => {
    signal.throwIfAborted();
    ai.credentials(config);
    setPhase('finalizing', reason);
    const content = await getFinalPrompt(reason);
    if (content.length > 120_000)
      throw new Error('已保存来源较多，整理输入超出上限；原始来源仍保留。');
    const extra =
      '\n现在是最终整理阶段，未开放任何工具。仅依据本条消息提供的已保存来源片段输出 JSON，不再访问网页或请求工具。片段截断、未读页、缺失信息如实说明；能确认的字段仍应整理，未知字段不填。';
    const result =
      config.protocol === 'codex'
        ? await nativeTurn(content, [], extra)
        : await modelTurn({
            config,
            apiKey,
            instructions: instructions + extra,
            messages: [{ role: 'user', content }],
            tools: [],
            outputSchema: selected.structured ? outputSchema : undefined,
            signal,
            onText() {},
          });
    if (result.calls.length > 0)
      throw new Error('整理阶段请求了未开放的工具，来源仍保留，可继续整理。');
    return result;
  };
  const names = new Set(collectionTools.map((t) => t.name));
  let calls = 0;
  const invoke = async (name, args) => {
    signal.throwIfAborted();
    if (!names.has(name) || ++calls > 20)
      throw new Error(
        '本次收集已达到工具调用上限，请核对当前结果或缩小范围重试。',
      );
    setPhase('exploring', 'reading_sources');
    const output = await onTool(name, args);
    return {
      ...output,
      collectionBudget: {
        remainingCalls: Math.max(0, 20 - calls),
        ...(calls >= 16
          ? {
              instruction:
                '读取次数即将用完，请根据已读来源完成 JSON 草稿；缺失项留空。',
            }
          : {}),
      },
    };
  };
  if (savedOnly) return finalize('resume_saved');
  if (config.protocol === 'codex') {
    try {
      return await nativeTurn(prompt, collectionTools);
    } catch (error) {
      if (error.code !== 'CODEX_TOOL_LIMIT' || signal.aborted) throw error;
      return finalize('tool_budget');
    }
  }
  const messages = [{ role: 'user', content: prompt }];
  for (let round = 0; round < 12; round++) {
    signal.throwIfAborted();
    if (JSON.stringify(messages).length > 180_000)
      return finalize('context_budget');
    const observe = outputObserver();
    const result = await modelTurn({
      config,
      apiKey,
      instructions,
      messages,
      tools: collectionTools,
      outputSchema: selected.structured ? outputSchema : undefined,
      signal,
      onText: observe,
    });
    if (result.calls.length === 0) return result;
    setPhase('exploring', 'reading_sources');
    if (result.calls.length > 6)
      throw new Error('模型同时请求了过多页面，请缩小范围后重试。');
    if (config.protocol === 'responses')
      messages.push(...responseInput(result.output));
    else
      messages.push({
        role: 'assistant',
        content: result.text || null,
        ...(config.adapter === 'deepseek'
          ? { reasoning_content: result.reasoningContent || '' }
          : {}),
        tool_calls: result.calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        })),
      });
    for (const call of result.calls) {
      let output;
      try {
        if (
          typeof call.id !== 'string' ||
          typeof call.arguments !== 'string' ||
          call.arguments.length > 10_000
        )
          throw new Error('读取请求格式不正确。');
        output = await invoke(call.name, JSON.parse(call.arguments));
      } catch (error) {
        output = { error: String(error.message || '读取失败。').slice(0, 600) };
      }
      messages.push(
        config.protocol === 'responses'
          ? {
              type: 'function_call_output',
              call_id: call.id,
              output: JSON.stringify(output),
            }
          : {
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(output),
            },
      );
    }
    if (calls >= 20) return finalize('tool_budget');
  }
  return finalize('round_budget');
}
