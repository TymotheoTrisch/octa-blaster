export interface AiChatTurn { role: 'user' | 'assistant'; content: string }
export type AiTask = 'summary_latest' | 'summary_full' | 'chat';
export interface AiSummaryInput {
  model?: string;
  task: AiTask;
  instruction: string;
  context: string;
  history?: AiChatTurn[];
}
export interface AiPublicConnection {
  connected: boolean;
  planAuthorized: boolean;
  enabled: boolean;
  account?: string;
  model?: string;
}
