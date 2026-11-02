"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; error: string };

/** Client-side convenience check only. The server must validate type, size and content again. */
export function checkFile(file: { type: string; size: number }, accept: readonly string[] = DEFAULT_ACCEPT, maxBytes = DEFAULT_MAX_BYTES): FileCheck {
  if (!accept.includes(file.type)) return { ok: false, error: "نوع الملف غير مدعوم. اختر صورة JPG أو PNG أو WebP." };
  if (file.size > maxBytes) return { ok: false, error: `حجم الملف كبير. الحد الأقصى ${Math.round(maxBytes / 1024 / 1024)} ميجابايت.` };
  if (file.size === 0) return { ok: false, error: "الملف فارغ." };
  return { ok: true };
}

interface FileUploadProps {
  label: string;
  /** Form field name, so the chosen file is posted with the surrounding <form>. */
  name: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  accept?: readonly string[];
  maxBytes?: number;
  onFileChange?: (file: File | null) => void;
}

/** Picks one image, validates it locally and shows a preview. Does not upload anything by itself. */
export function FileUpload({ label, name, hint, error, disabled, required, accept = DEFAULT_ACCEPT, maxBytes = DEFAULT_MAX_BYTES, onFileChange }: FileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handle(file: File | undefined) {
    setLocalError(null);
    if (!file) {
      setPreview(null);
      setFileName(null);
      onFileChange?.(null);
      return;
    }
    const verdict = checkFile(file, accept, maxBytes);
    if (!verdict.ok) {
      setLocalError(verdict.error);
      setPreview(null);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      onFileChange?.(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    onFileChange?.(file);
  }

  const shownError = error ?? localError ?? undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
      </label>
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-control border border-dashed bg-surface p-3 hover:bg-canvas has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-brand",
          shownError ? "border-danger" : "border-line-strong",
          disabled && "cursor-not-allowed opacity-60 hover:bg-surface",
        )}
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-canvas text-silver-dim">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="معاينة الصورة المختارة" className="size-full object-cover" />
          ) : (
            <Icon name="upload" className="size-6" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-ink">{fileName ?? "اختر صورة"}</span>
          <span className="block text-ink-muted">{hint ?? "JPG أو PNG أو WebP حتى 5 ميجابايت"}</span>
        </span>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept.join(",")}
          disabled={disabled}
          required={required}
          className="sr-only"
          aria-invalid={shownError ? true : undefined}
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </label>
      {shownError ? <p role="alert" className="text-sm font-medium text-danger-ink">{shownError}</p> : null}
    </div>
  );
}
