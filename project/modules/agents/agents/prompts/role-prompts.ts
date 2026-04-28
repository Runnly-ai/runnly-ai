import { CommandType } from '../../../command';
import { planningPrompts } from '../../prompts/planning';
import { generatePrompts } from '../../prompts/generate';
import { verifyPrompts } from '../../prompts/verify';
import { reviewPrompts } from '../../prompts/review';
import { reactPrompts } from '../../prompts/react';
import { RolePromptSet } from '../../prompts/types';

/**
 * Centralized mapping of command types to existing prompt sets.
 * Uses the exact prompts defined in modules/agents/prompts/ - NO modifications.
 */
export const ROLE_PROMPTS: Record<CommandType, RolePromptSet> = {
  PLAN: planningPrompts,
  GENERATE: generatePrompts,
  FIX: generatePrompts, // FIX uses same prompts as GENERATE
  VERIFY: verifyPrompts,
  REVIEW: reviewPrompts,
  REACT: reactPrompts,
};

/**
 * Gets the system prompt for a given command type.
 */
export function getSystemPrompt(commandType: CommandType): string {
  return ROLE_PROMPTS[commandType]?.system || '';
}

/**
 * Gets the requirement/task guidance for a given command type.
 */
export function getRequirementPrompt(commandType: CommandType): string {
  return ROLE_PROMPTS[commandType]?.requirement || '';
}
