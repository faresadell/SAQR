"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Labelled input with accessible hint and error wiring. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, id, className, required, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
        {required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-11 w-full rounded-control border bg-surface px-3 text-base text-ink",
          "placeholder:text-ink-muted/70 disabled:bg-line/50",
          error ? "border-danger" : "border-line",
          className,
        )}
        {...rest}
      />
      {hint && !error ? <p id={hintId} className="text-sm text-ink-muted">{hint}</p> : null}
      {error ? <p id={errorId} role="alert" className="text-sm font-medium text-danger-ink">{error}</p> : null}
    </div>
  );
});
