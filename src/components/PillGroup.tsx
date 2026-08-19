import type { ReactNode } from 'react';

interface Props<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Explanatory line under the pills — e.g. what the chosen audience implies. */
  hint?: ReactNode;
}

/**
 * A labelled row of single-select pills. Rendered as a radiogroup rather than a set of
 * toggle buttons so the arrow keys move between options and screen readers announce it
 * as one choice with N options.
 */
export default function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: Props<T>) {
  return (
    <section className="pillgroup">
      <h2 className="pillgroup__label" id={`pg-${label}`}>
        {label}
      </h2>
      <div className="pillgroup__options" role="radiogroup" aria-labelledby={`pg-${label}`}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`pill${selected ? ' pill--selected' : ''}`}
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      {hint && <p className="pillgroup__hint">{hint}</p>}
    </section>
  );
}
