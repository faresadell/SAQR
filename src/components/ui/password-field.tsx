"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Field, type FieldProps } from "./field";

/** 0 = empty, 1 = weak, 2 = fair, 3 = strong. Mirrors the server rules (8+ characters, letters mixed with digits or symbols); the server stays the judge. */
export function passwordScore(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  const letters = /[A-Za-z؀-ۿ]/.test(value);
  const other = /[0-9\W_]/.test(value);
  if (value.length < 8 || !letters || !other) return 1;
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) ? 3 : 2;
}

const LABELS = ["", "ضعيفة", "مقبولة", "قوية"] as const;
const BAR = ["", "bg-danger", "bg-warning", "bg-success"] as const;

export interface PasswordFieldProps extends Omit<FieldProps, "type"> {
  /** Show the strength bar (use when choosing a new password, not when signing in). */
  meter?: boolean;
}

/** Password input with a show/hide button and an optional strength meter. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField({ meter, onChange, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<0 | 1 | 2 | 3>(0);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Field
          ref={ref}
          {...props}
          type={visible ? "text" : "password"}
          dir="ltr"
          className={cn("pe-20 text-start", props.className)}
          onChange={(e) => {
            if (meter) setScore(passwordScore(e.target.value));
            onChange?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="absolute end-2 top-[1.9rem] rounded-control px-2 py-1 text-xs font-bold text-brand hover:bg-canvas"
        >
          {visible ? "إخفاء" : "إظهار"}
        </button>
      </div>
      {meter && score > 0 ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn("flex-1 rounded-full", n <= score ? BAR[score] : "bg-line")} />
            ))}
          </div>
          <span className="text-xs font-semibold text-ink-muted">قوة كلمة المرور: {LABELS[score]}</span>
        </div>
      ) : null}
    </div>
  );
});
