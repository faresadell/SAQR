export type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type Size = "sm" | "md" | "lg";

export const buttonVariants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "bg-navy-900 text-white hover:bg-navy-800",
  ghost: "bg-transparent text-ink hover:bg-line",
  danger: "bg-danger text-white hover:bg-danger-ink",
  outline: "border border-line-strong bg-surface text-ink hover:bg-canvas",
};

export const buttonSizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-base",
  lg: "h-12 px-6 text-base",
};

export type ButtonVariant = Variant;
export type ButtonSize = Size;
