"use client";

/** Replaces the whole page when the root layout itself fails. Keeps its own <html>, no app providers or fonts are assumed. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#070B1A", color: "#F4F6FB", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <main>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>حدث خطأ غير متوقع</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.8 }}>لم نتمكن من فتح الصفحة. جرّب مرة أخرى بعد لحظات.</p>
          <button type="button" onClick={reset} style={{ height: 44, padding: "0 24px", borderRadius: 12, border: 0, background: "#F5B301", color: "#0B1530", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
