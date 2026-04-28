exports.scripts = {
  summarize_reference: async (_args, context) => {
    const availableTools = context.toolExecutor?.listTools().map((tool) => tool.name) || [];
    return {
      message: 'Demo skill script executed.',
      availableTools,
      skillId: context.command.payload.skillId || 'unknown',
      taskId: context.taskId,
    };
  },
};

