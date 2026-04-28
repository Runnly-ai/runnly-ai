import { AgentToolCall, AgentToolExecutor, AgentToolSpec } from '../tools';
import { SkillToolExecutor } from './types';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Restricts an existing tool executor to a skill's allowed/disallowed tool set.
 */
export class SkillScopedToolExecutor implements SkillToolExecutor {
  constructor(
    private readonly baseExecutor: AgentToolExecutor,
    private readonly allowedTools: string[] = [],
    private readonly disallowedTools: string[] = []
  ) {}

  listTools(): AgentToolSpec[] {
    const allowed = unique(this.allowedTools);
    const denied = new Set(unique(this.disallowedTools));
    const tools = this.baseExecutor.listTools();
    if (allowed.length === 0) {
      return tools.filter((tool) => !denied.has(tool.name));
    }
    const allowedSet = new Set(allowed);
    return tools.filter((tool) => allowedSet.has(tool.name) && !denied.has(tool.name));
  }

  async execute(call: AgentToolCall, cwd: string, workspaceRoot?: string): Promise<string> {
    const allowed = new Set(unique(this.allowedTools));
    const denied = new Set(unique(this.disallowedTools));
    if (denied.has(call.tool)) {
      throw new Error(`Tool "${call.tool}" is disallowed for this skill.`);
    }
    if (allowed.size > 0 && !allowed.has(call.tool)) {
      throw new Error(`Tool "${call.tool}" is not allowed for this skill.`);
    }
    return this.baseExecutor.execute(call, cwd, workspaceRoot);
  }
}

