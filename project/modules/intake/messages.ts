export const intakeMessages = {
  conversationReplyOnly: 'Replied directly without starting orchestration.',
  needsInfoInitial: 'Before I start execution, I need the some required task information.',
  needsInfoFollowup: 'I still need one more requirement before I can start work.',
  loadedSession: (sessionId: string) => `Loaded session ${sessionId}.`,
  loadedEvents: (sessionId: string, count: number) => `Loaded ${count} event(s) for session ${sessionId}.`,
  createdSessionNoStart: (sessionId: string) => `Created session ${sessionId} without starting it.`,
  startedSession: (sessionId: string) => `Started session ${sessionId} from user request.`,
} as const;

