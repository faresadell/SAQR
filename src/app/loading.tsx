import { SkeletonCards } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <SkeletonCards />
    </div>
  );
}
