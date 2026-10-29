import Image from "next/image";
import { cn } from "@/lib/cn";

interface LogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/** SAQR falcon mark. Decorative when next to the wordmark, so alt is empty by default. */
export function Logo({ size = 96, className, priority = false }: LogoProps) {
  return (
    <Image
      src="/brand/saqr-mark.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("rounded-card", className)}
    />
  );
}
