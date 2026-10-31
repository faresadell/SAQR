import { UnavailableState, ErrorState } from "@/components/ui/states";
import { BACKEND_GAPS } from "./backend-gaps";
import type { Loaded } from "./loaded";

/** Renders the non-"ready" outcomes of a loader. In development it also tells the developer what the backend must provide. */
export function ResultState({ result }: { result: Exclude<Loaded<unknown>, { status: "ready" }> }) {
  if (result.status === "error") {
    return <ErrorState title="تعذر تحميل البيانات">{result.message}</ErrorState>;
  }
  const gap = BACKEND_GAPS[result.feature];
  return (
    <UnavailableState title={`${gap.title}: غير متاحة حالياً`}>
      <p>الواجهة جاهزة وستعمل بمجرد تفعيل الخدمة. لا تُعرض أي بيانات تجريبية هنا.</p>
      {process.env.NODE_ENV !== "production" ? (
        <p className="mt-3 rounded-control bg-canvas p-3 text-start text-xs text-ink-muted">
          <strong className="text-ink">للمطوّر:</strong> {gap.needs}
        </p>
      ) : null}
    </UnavailableState>
  );
}
