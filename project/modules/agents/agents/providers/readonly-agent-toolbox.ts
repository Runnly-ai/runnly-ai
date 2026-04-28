import { BasicAgentToolbox } from './basic-agent-toolbox';
import { AgentToolSpec } from '../../tools';

/**
 * Read-only toolbox for planning and analysis agents.
 * Only exposes safe, non-mutating tools.
 */
export class ReadonlyAgentToolbox extends BasicAgentToolbox {
  constructor() {
    super({ readonlyOnly: true });
  }

  listTools(): AgentToolSpec[] {
    return super.listTools();
  }
}
