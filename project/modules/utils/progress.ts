
import { Task, TaskStatus, TaskType } from "../task/types/task";


/**
 * Ordered workflow step sequence for progress derivation.
 */
export const STEP_ORDER = [TaskType.PLAN, TaskType.IMPLEMENT, TaskType.TEST, TaskType.REVIEW] as const;

/**
 * Computes the current workflow step from task statuses.
 *
 * @param tasks Session tasks.
 * @returns Current step name or COMPLETED.
 */
export function getCurrentStep(tasks: Task[]): string {
  for (const step of STEP_ORDER) {
    const stepTasks = tasks.filter((task) => task.type === step);
    if (stepTasks.length === 0) {
      return step;
    }
    if (stepTasks.some((task) => task.status !== TaskStatus.DONE)) {
      return step;
    }
  }
  return 'COMPLETED';
}

/**
 * Computes completion percentage using DONE task ratio.
 *
 * @param tasks Session tasks.
 * @returns Progress percentage from 0 to 100.
 */
export function getProgress(tasks: Task[]): number {
  if (tasks.length === 0) {
    return 0;
  }
  const doneCount = tasks.filter((task) => task.status === TaskStatus.DONE).length;
  return Math.round((doneCount / tasks.length) * 100);
}
