"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { downscaleImage } from "@/lib/uploads/downscale";

/**
 * Optional picture inside a normal form: the person picks a file from the device, it is shrunk in the browser and
 * travels with the form as the field `image`. A preview shows what was chosen; the visible input has no name, so the
 * original (large) file is never submitted.
 */
export function ImageField({ label }: { label: string }) {
  const hidden = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    if (hidden.current) hidden.current.value = "";
    if (visible.current) visible.current.value = "";
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  // React resets the form after a successful submit: drop the preview with it.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const onReset = () => setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  async function onPick(file: File | undefined) {
    setError(null);
    clear();
    if (!file) return;
    const small = await downscaleImage(file);
    if (!small) {
      setError("اختر صورة JPG أو PNG أو WebP.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(small);
    if (hidden.current) hidden.current.files = transfer.files;
    setPreview(URL.createObjectURL(small));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="الصورة المختارة" className="size-16 rounded-control border border-line object-cover" />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-control border border-dashed border-line-strong text-xs text-ink-faint">بدون صورة</span>
      )}
      <div className="flex flex-col gap-1">
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-2 text-sm font-semibold hover:bg-canvas">
          <Icon name="image" className="size-4" />
          {preview ? "تغيير الصورة" : label}
          <input ref={visible} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
        {preview ? (
          <button type="button" onClick={clear} className="w-fit text-sm font-semibold text-danger-ink hover:underline">إزالة الصورة</button>
        ) : null}
        {error ? <p role="alert" className="text-sm font-medium text-danger-ink">{error}</p> : null}
      </div>
      <input ref={hidden} type="file" name="image" className="sr-only" tabIndex={-1} aria-hidden="true" />
    </div>
  );
}
