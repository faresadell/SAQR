"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Last-resort boundary for unexpected server/client errors. Details stay in the server log, never on screen. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-5">
      <ErrorState
        className="w-full"
        title="حدث خطأ غير متوقع"
        action={<Button onClick={reset}>إعادة المحاولة</Button>}
      >
        لم نتمكن من إكمال العملية. جرّب مرة أخرى، وإن تكرر الأمر تواصل مع الدعم.
      </ErrorState>
    </main>
  );
}
