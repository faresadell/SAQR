"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { setAvatarAction } from "./avatar-actions";

const idle: FormState = {};
const SIZE = 256;

/** Resize the chosen picture to a 256px JPEG in the browser, then send it. The server re-checks type and size. */
async function toJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function AvatarPanel({ name, version }: { name: string; version: number | null }) {
  const [state, action, pending] = useActionState(setAvatarAction, idle);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const shown = preview ?? (version ? `/api/me/avatar?v=${version}` : null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    try {
      const url = await toJpegDataUrl(file);
      setPreview(url);
      if (imageRef.current) imageRef.current.value = url;
      formRef.current?.requestSubmit();
    } catch {
      setLocalError("تعذّر قراءة الصورة. جرّب صورة أخرى.");
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col items-center gap-3">
      <input ref={imageRef} type="hidden" name="image" />
      <span className="relative flex size-24 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-3xl font-bold text-white shadow-card">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, already-resized picture from our own route
          <img src={shown} alt="صورتي" className="size-full object-cover" />
        ) : (
          <span aria-hidden="true">{Array.from(name)[0] ?? "؟"}</span>
        )}
      </span>
      <div className="flex flex-wrap justify-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-canvas">
          {shown ? "تغيير الصورة" : "إضافة صورة"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
        {shown ? (
          <Button type="submit" size="sm" variant="ghost" name="remove" value="1" loading={pending} onClick={() => setPreview(null)}>حذف الصورة</Button>
        ) : null}
      </div>
      {localError ? <Notice tone="danger">{localError}</Notice> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </form>
  );
}
