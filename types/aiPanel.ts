import type { AiChatTurn } from './ai';
export type PanelTask = 'summary_latest' | 'summary_full' | 'reply';
export interface PanelSnapshot { context: string; title: string; key: string; namespace: string; digest: string; ticketNumber?: string; selection?: string; direction?: string; draftToken?: string; style?: string }
export interface AiPanelState { conversationKey?: string; id: string; title: string; messages: AiChatTurn[]; draft: string; busy: boolean; status: string; error: string; ready: boolean; queryMs?: number; cached?: boolean; kind?: 'general' | 'ticket'; detached?: boolean; ticketUrl?: string; ticketNumber?: string }

export interface AiTriggerProgress { busy: boolean; status: string; error?: string }
