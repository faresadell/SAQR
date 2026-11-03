"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 20_000;

/** True while the person is typing somewhere: refreshing then could disturb what they are writing. */
function isTyping(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/**
 * Re-reads the current page's server data every 20 seconds while the tab is visible, and once more the moment the
 * tab comes back to the front. Changes made by an admin, a shop or a driver therefore show up without a manual refresh
 * (with up to ~20 seconds delay; this is polling, not a live push).
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && !isTyping()) router.refresh();
    };
    const timer = setInterval(tick, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
