import { FLOW_STEPS } from '../lib/steps'
import { CheckIcon } from './icons'

interface StepIndicatorProps {
  current: number
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol
      className="stepper"
      aria-label={`流程进度：第 ${current} 步，共 ${FLOW_STEPS.length} 步`}
    >
      {FLOW_STEPS.map((step, index) => {
        const state =
          step.id < current ? 'done' : step.id === current ? 'active' : 'todo'

        return (
          <li
            key={step.id}
            className={`step step--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            {index < FLOW_STEPS.length - 1 && (
              <span className="step__line" aria-hidden="true" />
            )}
            <span className="step__dot">
              {state === 'done' ? <CheckIcon /> : step.id}
            </span>
            <span className="step__label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
