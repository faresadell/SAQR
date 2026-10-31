"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
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
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-24 w-full rounded-control border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted/70",
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
