export type AiTask = 'draft' | 'summary_latest' | 'summary_full' | 'chat';
export interface AiChatTurn { role: 'user' | 'assistant'; content: string }

export interface AiDraftInput {
  model: string;
  instruction: string;
  context: string;
  examples: string[];
  task?: AiTask;
  history?: AiChatTurn[];
}

export interface AiPublicConnection {
  paired: boolean;
  url: string;
  connected?: boolean;
  planAuthorized?: boolean;
  enabled?: boolean;
  account?: string;
}
