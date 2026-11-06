"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { buttonSizes, buttonVariants, type ButtonSize, type ButtonVariant } from "./button-styles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/**
 * A submit button that carries a choice (name + value, e.g. approve vs reject) writes it into a hidden field of its form
 * at click time, so the server always receives which button was pressed. In real-browser tests the button's own
 * name/value did not reach the server action, which silently turned "approve" into "reject".
 */
function rememberChoice(button: HTMLButtonElement): void {
  const { form, name, value, type } = button;
  if (!form || type !== "submit" || !name) return;
  let hidden = form.querySelector<HTMLInputElement>(`input[type="hidden"][data-choice="${CSS.escape(name)}"]`);
  if (!hidden) {
    hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = name;
    hidden.dataset.choice = name;
    form.appendChild(hidden);
  }
  hidden.value = value;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, type = "button", onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(event) => {
        rememberChoice(event.currentTarget);
        onClick?.(event);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      {children}
    </button>
  );
});
