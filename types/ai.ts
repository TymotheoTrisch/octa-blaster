export interface AiChatTurn { role: 'user' | 'assistant'; content: string }
export type AiProvider = 'chatgpt' | 'openai' | 'gemini' | 'claude' | 'nvidia' | 'gateway';
export interface AiProfile { id: string; name: string; role: string; products: string; tone: string; preferences: string; aliases: string[]; examples: string[] }
export interface AiProviderConfig { model: string; hasKey?: boolean; apiKey?: string; removeKey?: boolean; remoteStore: boolean; approvedData: boolean; baseUrl: string }
export interface AiConfig { provider: AiProvider; providers: Partial<Record<AiProvider, AiProviderConfig>>; profiles: AiProfile[]; profileId: string; retention: { idleDays: number; maxDays: number }; pendingDeletes?: number; storedTickets?: number }
export type AiTask = 'summary_latest' | 'summary_full' | 'chat' | 'general';
export interface AiSummaryInput {
  model?: string;
  task: AiTask;
  instruction: string;
  context: string;
  history?: AiChatTurn[];
  conversationKey?: string;
}
export interface AiPublicConnection {
  connected: boolean;
  planAuthorized: boolean;
  enabled: boolean;
  account?: string;
  model?: string;
  provider?: AiProvider;
  contextMode?: string;
}
