export interface AiProvider {
  protocol: 'chat_completions' | 'codex' | 'responses';
  baseUrl: string;
  model: string;
  codexPath?: string;
  adapter?: string;
  stream: boolean;
  local?: boolean;
  thinking?: 'disabled' | 'enabled';
  reasoningEffort?: 'high' | 'low' | 'max';
  maxOutputTokens?: number;
  jsonMode?: 'json' | 'prompt' | 'schema';
}
export interface AiModel {
  id: string;
  name: string;
  inputModalities?: string[];
  isDefault?: boolean;
}
export interface AiConnection {
  id: string;
  name: string;
  kind: 'codex' | 'compatible' | 'deepseek' | 'openai';
  provider: AiProvider;
  enabled: boolean;
  supportsImages: boolean;
  supportsTools: boolean;
  keyConfigured: boolean;
  notes: string;
  features: string[];
  discovery?: { at: string; models: AiModel[] };
}
export interface AiFeature {
  id: string;
  name: string;
  description: string;
  tools: boolean;
  connectionId: string;
  model: string;
  enabled: boolean;
  thinking: 'disabled' | 'enabled' | 'inherit';
}
export interface AiNativeState {
  ready: boolean;
  connected: boolean;
  needsLogin?: boolean;
  loginPending?: boolean;
  accountType?: string;
  models: AiModel[];
}
export interface AiManagement {
  connections: AiConnection[];
  features: AiFeature[];
  permissions: { majorIds: string[]; writableKinds: string[] };
  native: AiNativeState;
  keyStorage: 'memory';
}
