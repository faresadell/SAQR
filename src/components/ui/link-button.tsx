import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { buttonSizes, buttonVariants, type ButtonSize, type ButtonVariant } from "./button";

interface LinkButtonProps extends Omit<ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** A link that looks like a Button (navigation, not an action). */
export function LinkButton({ variant = "primary", size = "md", className, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    />
  );
}
