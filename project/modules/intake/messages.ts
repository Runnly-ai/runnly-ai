export const intakeMessages = {
  conversationReplyOnly: 'Replied directly without starting orchestration.',
  needsInfoInitial: 'I need a bit more information to get started.',
  needsInfoFollowup: 'Just one more thing before I can start.',
  loadedSession: (sessionId: string) => `Loaded session ${sessionId}.`,
  loadedEvents: (sessionId: string, count: number) => `Loaded ${count} event(s) for session ${sessionId}.`,
  createdSessionNoStart: (sessionId: string) => `Created session ${sessionId} without starting it.`,
  startedSession: (sessionId: string) => `Got it! I've started working on this. Session ID: ${sessionId}`,
} as const;

