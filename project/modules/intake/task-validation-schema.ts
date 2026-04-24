export interface TaskValidationFieldRule {
  path: string;
  required: boolean;
  reason: string;
  question: string;
  seedFromGoal?: boolean;
}

export interface TaskValidationSchema {
  id: string;
  description?: string;
  requiredFields: TaskValidationFieldRule[];
}

