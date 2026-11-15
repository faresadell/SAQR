"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/states";
import { downscaleImage } from "@/lib/uploads/downscale";
import type { FormState } from "@/lib/form-state";
import { sendMessageAction, startChatAction } from "./actions";

const idle: FormState = {};

export interface ChatMessageView { id: string; mine: boolean; body: string; hasImage: boolean; createdAt: string }

function time(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function MessageList({ messages }: { messages: ChatMessageView[] }) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);
  if (messages.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">لا توجد رسائل بعد.</p>;
  return (
    <ul className="flex max-h-[55vh] min-h-48 flex-col gap-2 overflow-y-auto rounded-card border border-line bg-canvas p-3" aria-label="الرسائل">
      {messages.map((m) => (
        <li key={m.id} className={m.mine ? "flex justify-start" : "flex justify-end"}>
          <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${m.mine ? "bg-brand text-white" : "border border-line bg-surface text-ink"}`}>
            {m.hasImage ? (
              <a href={`/api/v1/chat/messages/${m.id}/image`} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/chat/messages/${m.id}/image`} alt="صورة مرسلة في المحادثة" loading="lazy" className="max-h-64 w-full rounded-control object-cover" />
              </a>
            ) : null}
            {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
            <p className={`mt-1 text-xs ${m.mine ? "text-white/70" : "text-ink-muted"}`}>{time(m.createdAt)}</p>
          </div>
        </li>
      ))}
      <div ref={end} />
    </ul>
  );
}

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, idle);
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  useEffect(() => {
    if (state.message === "sent") {
      form.current?.reset();
      setPicked(null);
    }
  }, [state]);

  // Phone photos are several MB; shrink to about 1600px JPEG here so the upload is small and fast.
  async function onPick(file: File | undefined) {
    setPickError(null);
    setPicked(null);
    if (!file) return;
    const small = await downscaleImage(file);
    if (!small) {
      setPickError("اختر صورة JPG أو PNG أو WebP لا يزيد حجمها عن 5 ميجابايت.");
      if (picker.current) picker.current.value = "";
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(small);
    if (picker.current) picker.current.files = transfer.files;
    setPicked(file.name);
  }
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Textarea label="رسالتك" name="body" maxLength={1000} rows={3} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-2 text-sm font-semibold hover:bg-canvas">
          <Icon name="image" className="size-4" />
          {picked ? "تغيير الصورة" : "إرفاق صورة"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
        {/* On a phone, capture opens the camera directly. On a computer it falls back to the file picker. */}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-2 text-sm font-semibold hover:bg-canvas">
          <span aria-hidden>📷</span>
          تصوير بالكاميرا
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
        <input ref={picker} type="file" name="image" tabIndex={-1} aria-hidden className="hidden" />
        {picked ? <span className="truncate text-xs text-ink-muted" dir="ltr">{picked}</span> : null}
      </div>
      {pickError ? <Notice tone="danger">{pickError}</Notice> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>إرسال</Button>
    </form>
  );
}

export function StartChatForm({ merchantId }: { merchantId: string }) {
  const [state, action, pending] = useActionState(startChatAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="merchantId" value={merchantId} />
      <Textarea label="رسالتك للنشاط" name="body" required maxLength={1000} rows={4} hint="اسأل عن المنتجات أو اكتب طلبك. الاتفاق على السعر النهائي يتم من خلال التاجر داخل المنصة." />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>بدء المحادثة</Button>
    </form>
  );
}
