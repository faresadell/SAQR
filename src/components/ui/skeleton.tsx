import { cn } from "@/lib/cn";

/** Loading placeholder. Use in loading.tsx files and while client data resolves. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("relative overflow-hidden rounded-control bg-line/70", className)} />;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="جاري التحميل" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
