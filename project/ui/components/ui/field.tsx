import * as React from 'react';

import { cn } from '@/utils/utils';

export function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-4', className)} {...props} />;
}

export function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-2', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

