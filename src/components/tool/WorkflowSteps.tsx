import { Check } from 'lucide-react';

export type WorkflowStep = 1 | 2 | 3;

export function WorkflowSteps({
  current,
  availableThrough,
  onSelect,
}: {
  current: WorkflowStep;
  availableThrough: WorkflowStep;
  onSelect: (step: WorkflowStep) => void;
}) {
  return (
    <ol className="workflow-steps" aria-label="Your progress">
      {['Upload a file', 'Choose & edit', 'Download'].map((label, index) => {
        const step = (index + 1) as WorkflowStep;
        return (
          <li
            key={label}
            className={step === current || step < availableThrough ? 'is-active' : ''}
          >
            <button
              type="button"
              onClick={() => onSelect(step)}
              disabled={step > availableThrough}
              title={
                step > availableThrough
                  ? step === 2
                    ? 'Upload a valid file first'
                    : 'Process your file first'
                  : undefined
              }
              aria-current={step === current ? 'step' : undefined}
            >
              <span className="step-number">
                {step < availableThrough ? <Check className="size-3.5" aria-hidden /> : step}
              </span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
