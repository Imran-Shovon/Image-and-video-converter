import { Check } from 'lucide-react';

export function WorkflowSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="workflow-steps" aria-label="Your progress">
      {['Upload a file', 'Choose & edit', 'Download'].map((label, index) => {
        const step = index + 1;
        return (
          <li
            key={label}
            aria-current={step === current ? 'step' : undefined}
            className={step <= current ? 'is-active' : ''}
          >
            <span className="step-number">
              {step < current ? <Check className="size-3.5" aria-hidden /> : step}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
