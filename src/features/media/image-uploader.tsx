"use client";

import { useState } from "react";
import { downscaleImage } from "@/lib/uploads/downscale";

const BAD_FILE = "اختر صورة JPG أو PNG أو WebP.";

/** Uploads one picture to an image endpoint straight from the device's files. The picture is shrunk in the browser first (phone photos are several MB); the server checks the bytes again. */
export function ImageUploader({ endpoint, hasImage, addLabel, changeLabel }: { endpoint: string; hasImage: boolean; addLabel: string; changeLabel: string }) {
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(hasImage ? 0 : -1);
  const [broken, setBroken] = useState(false); // public pictures are served only while the product or offer is visible to shoppers

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const small = await downscaleImage(file);
      if (!small) {
        setStatus({ tone: "bad", text: BAD_FILE });
        return;
      }
      const body = new FormData();
      body.set("file", small);
      const res = await fetch(endpoint, { method: "POST", body });
      if (res.ok) {
        setStatus({ tone: "ok", text: "تم رفع الصورة." });
        setVersion((v) => v + 1);
        setBroken(false);
      } else setStatus({ tone: "bad", text: res.status === 415 ? "الملف ليس صورة صالحة (JPG أو PNG أو WebP)." : res.status === 413 ? "الصورة أكبر من 5 ميجابايت." : "تعذر رفع الصورة. حاول لاحقاً." });
    } catch {
      setStatus({ tone: "bad", text: "تعذر رفع الصورة. حاول لاحقاً." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {version >= 0 && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${endpoint}?v=${version}`} alt="" onError={() => setBroken(true)} className="size-16 rounded-control border border-line object-cover" />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-control border border-dashed border-line-strong text-xs text-ink-faint">بدون صورة</span>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {version >= 0 ? changeLabel : addLabel}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(ev) => void upload(ev.target.files?.[0])} className="font-normal" />
      </label>
      {status ? <p role="status" className={`text-sm font-medium ${status.tone === "ok" ? "text-success-ink" : "text-danger-ink"}`}>{status.text}</p> : null}
    </div>
  );
}
