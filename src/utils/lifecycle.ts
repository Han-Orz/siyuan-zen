export interface LifecycleStep {
  name: string;
  run: () => void;
}

export type LifecycleErrorHandler = (name: string, error: unknown) => void;

export function runLifecycleSteps(
  steps: readonly LifecycleStep[],
  onError: LifecycleErrorHandler = (name, error) => {
    console.error(`[zenType] lifecycle step failed: ${name}`, error);
  },
): void {
  for (const step of steps) {
    try {
      step.run();
    } catch (error) {
      onError(step.name, error);
    }
  }
}
