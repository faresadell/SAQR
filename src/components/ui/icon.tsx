import { createElement } from "react";
import { cn } from "@/lib/cn";
import { ICON_SHAPES, type IconName } from "./icon-paths";

export type { IconName };

interface IconProps {
  name: IconName;
  className?: string;
  /** Pass a label only when the icon alone carries meaning; otherwise it is hidden from assistive tech. */
  label?: string;
  /** Mirror in RTL (arrows, chevrons that point "forward"). */
  flip?: boolean;
}

/** Inline SVG icon (24px grid, 2px stroke). Size it with Tailwind `size-*`. */
export function Icon({ name, className, label, flip = false }: IconProps) {
  const shapes = ICON_SHAPES[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", flip && "rtl:-scale-x-100", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {shapes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
