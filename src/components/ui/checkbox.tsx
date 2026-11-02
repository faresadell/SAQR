"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, error, id, className, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2 text-sm">
        <input ref={ref} id={inputId} type="checkbox" className={cn("mt-1 size-4 accent-brand", className)} aria-invalid={error ? true : undefined} {...rest} />
        <span>{label}</span>
      </label>
      {error ? <p role="alert" className="text-sm font-medium text-danger-ink">{error}</p> : null}
    </div>
  );
});
