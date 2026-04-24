import { Task } from "../task/types/task";
import { Session } from "./types/session";


/**
 * API projection for session status/progress.
 */
export interface SessionView {
  id: string;
  goal: string;
  status: string;
  currentStep: string;
  progress: number;
  tasks: Task[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Builds the API-facing session view.
 *
 * @param session Session record.
 * @param tasks Session tasks.
 * @param currentStep Derived current workflow step.
 * @param progress Derived completion percentage.
 * @returns Session view payload.
 */
export function buildSessionView(
  session: Session,
  tasks: Task[],
  currentStep: string,
  progress: number
): SessionView {
  return {
    id: session.id,
    goal: session.goal,
    status: session.status,
    currentStep,
    progress,
    tasks,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
