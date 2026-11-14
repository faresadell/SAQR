"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { sendMessageAction, startChatAction } from "./actions";

const idle: FormState = {};

export interface ChatMessageView { id: string; mine: boolean; body: string; createdAt: string }

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
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
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
  useEffect(() => {
    if (state.message === "sent") form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Textarea label="رسالتك" name="body" required maxLength={1000} rows={3} />
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
