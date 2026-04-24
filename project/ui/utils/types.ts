export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  sessionId?: string;
}

interface ChatEvent {
  id: string;
  type: string;
  createdAt: number;
}

export type ChatApiResponse =
  | {
      kind: 'task';
      sessionId: string;
      status: string;
      currentStep: string;
      progress: number;
      summary: string;
      events: ChatEvent[];
    }
  | {
      kind: 'task_needs_info';
      summary: string;
      events: ChatEvent[];
    }
  | {
      kind: 'conversation';
      summary: string;
      events: ChatEvent[];
    };
