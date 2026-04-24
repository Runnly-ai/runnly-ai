import { EventRecord } from '../event';
import { SessionView } from '../session';
import { SessionContext } from '../session';

export type UserIntentAction = 'START_SESSION' | 'GET_SESSION' | 'GET_EVENTS';
export type IntakeRoute = 'CONVERSE' | 'TASK';

export interface StartSessionRequest {
  action: 'START_SESSION';
  rawMessage: string;
  confidence: number;
  goal: string;
  autoStart: boolean;
  context: SessionContext;
}

export interface GetSessionRequest {
  action: 'GET_SESSION';
  rawMessage: string;
  confidence: number;
  sessionId: string;
}

export interface GetEventsRequest {
  action: 'GET_EVENTS';
  rawMessage: string;
  confidence: number;
  sessionId: string;
}

export type StructuredUserRequest = StartSessionRequest | GetSessionRequest | GetEventsRequest;

export interface ConversationalRequest {
  action: 'CONVERSE';
  rawMessage: string;
  confidence: number;
  reply: string;
}

export type ManagedIntakeRequest = StructuredUserRequest | ConversationalRequest;

export interface TaskRequestResult {
  kind: 'task';
  request: StructuredUserRequest;
  sessionId: string;
  status: string;
  currentStep: string;
  progress: number;
  summary: string;
  events: EventRecord[];
  view: SessionView;
}

export interface ConversationResult {
  kind: 'conversation';
  request: ConversationalRequest;
  summary: string;
  reply: string;
}

export interface TaskValidationIssue {
  field: string;
  reason: string;
  question: string;
}

export interface TaskNeedsInfoResult {
  kind: 'task_needs_info';
  request: StartSessionRequest;
  summary: string;
  questions: string[];
  missing: TaskValidationIssue[];
}

export type StructuredRequestResult = TaskRequestResult | ConversationResult | TaskNeedsInfoResult;
