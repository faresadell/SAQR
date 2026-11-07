"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { AdhkarSection } from "./adhkar-section";
import { DuaCards } from "./dua-cards";
import { NamesCard } from "./names-card";
import { useTasbeeh } from "./use-tasbeeh";
import {
  DHIKR_OPTIONS,
  GOAL_PRESETS,
  MAX_CUSTOM_LENGTH,
  MAX_GOAL,
  MIN_GOAL,
  cleanCustomText,
  dhikrLabel,
  dhikrText,
  isValidGoal,
  type DhikrId,
} from "./tasbeeh-state";

type PendingDhikr = { id: DhikrId; text: string };

/** Full tasbeeh screen: counter, goal, dhikr choice and a device-local session log. */
export function TasbeehView() {
  const { state, dispatch, storageAvailable } = useTasbeeh();
  const [editingCustom, setEditingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalCustomOpen, setGoalCustomOpen] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDhikr | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [adhkarTab, setAdhkarTab] = useState("morning");
  const evening = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(new Date())) >= 12;

  const reached = state.count >= state.goal;
  const goalIsPreset = (GOAL_PRESETS as readonly number[]).includes(state.goal);

  function requestDhikr(id: DhikrId, text: string) {
    if (id === state.dhikrId && (id !== "custom" || cleanCustomText(text) === state.customText)) {
      setEditingCustom(false);
      return;
    }
    if (state.count > 0) {
      setPending({ id, text });
      return;
    }
    dispatch({ type: "changeDhikr", dhikrId: id, customText: text, mode: "keep", now: Date.now() });
    setEditingCustom(false);
  }

  function onSelect(value: string) {
    const id = DHIKR_OPTIONS.find((d) => d.id === value)?.id;
    if (!id) return;
    if (id === "custom") {
      setEditingCustom(true);
      setCustomDraft(state.dhikrId === "custom" ? state.customText : "");
      return;
    }
    setEditingCustom(false);
    setCustomError(null);
    requestDhikr(id, "");
  }

  function applyCustom() {
    const cleaned = cleanCustomText(customDraft);
    if (!cleaned) {
      setCustomError("اكتب الذكر الذي تريد العدّ عليه.");
      return;
    }
    setCustomError(null);
    requestDhikr("custom", cleaned);
  }

  function applyGoal(goal: number) {
    dispatch({ type: "setGoal", goal });
    setGoalCustomOpen(false);
    setGoalError(null);
  }

  function applyCustomGoal() {
    const n = Number(goalDraft.trim());
    if (!isValidGoal(n)) {
      setGoalError(`اكتب رقماً صحيحاً بين ${formatNumber(MIN_GOAL)} و${formatNumber(MAX_GOAL)}.`);
      return;
    }
    applyGoal(n);
  }

  function resolvePending(mode: "keep" | "new") {
    if (!pending) return;
    dispatch({ type: "changeDhikr", dhikrId: pending.id, customText: pending.text, mode, now: Date.now() });
    setPending(null);
    setEditingCustom(false);
  }

  const text = dhikrText(state);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {!storageAvailable ? (
        <Notice tone="warning">تعذّر حفظ العدّاد على هذا المتصفح، لذلك لن يبقى بعد إغلاق الصفحة.</Notice>
      ) : null}

      {/* Greeting and quick entries */}
      <section aria-label="أذكار اليوم" className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-sheet bg-gradient-to-br from-navy-800 to-navy-900 p-6 text-white shadow-card">
          <span aria-hidden="true" className="absolute -start-10 -top-10 size-40 rounded-full bg-white/10" />
          <h2 className="relative text-3xl font-bold">{evening ? "مساء الخير" : "صباح الخير"}</h2>
          <p className="relative mt-1 text-base text-white/90">{evening ? "اختم يومك بأذكار المساء." : "ابدأ يومك بأذكار الصباح."}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "morning", label: "ورد الصباح", icon: "sun" },
            { id: "evening", label: "ورد المساء", icon: "star" },
            { id: "prayer", label: "بعد الصلاة", icon: "check" },
            { id: "sleep", label: "النوم والاستيقاظ", icon: "bell" },
          ].map((t) => (
            <a
              key={t.id}
              href="#adhkar"
              onClick={() => setAdhkarTab(t.id)}
              className={cn("flex h-20 items-center justify-between gap-2 rounded-card bg-gradient-to-br from-navy-800 to-navy-900 px-4 text-lg font-bold text-white shadow-card transition-transform active:scale-95")}
            >
              {t.label}
              <Icon name={t.icon as never} className="size-7 opacity-90" />
            </a>
          ))}
        </div>
      </section>

      {/* Tasbeeh ring: the circle on one side, the dhikr pills on the other */}
      <Card className="flex flex-col gap-4 border-t-4 border-t-pink-500 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-brand">حلقة التسبيح</h2>
          <button type="button" aria-label="تصفير العدّاد" disabled={state.count === 0} onClick={() => setConfirmReset(true)} className="flex size-10 items-center justify-center rounded-full text-ink-muted transition-transform hover:bg-canvas active:scale-90 disabled:opacity-40">
            <Icon name="refresh" className="size-5" />
          </button>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            type="button"
            aria-label={`سبّح. العدّاد ${formatNumber(state.count)} من ${formatNumber(state.goal)}`}
            onClick={() => {
              dispatch({ type: "tap", now: Date.now() });
              try {
                navigator.vibrate?.(10);
              } catch {
                /* optional */
              }
            }}
            className="relative flex aspect-square min-w-0 flex-1 touch-manipulation select-none items-center justify-center rounded-full transition-transform duration-100 active:scale-95"
          >
            <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="12" className="text-line" />
              <circle
                cx="100"
                cy="100"
                r="92"
                fill="none"
                stroke={reached ? "#10b981" : "#ec4899"}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 92}
                strokeDashoffset={2 * Math.PI * 92 * (1 - Math.min(state.count / state.goal, 1))}
                className="transition-[stroke-dashoffset] duration-300 ease-out"
              />
            </svg>
            <span role="status" aria-live="polite" className="relative flex w-[72%] flex-col items-center rounded-full bg-surface py-6 text-center shadow-card">
              <span className="text-lg font-bold leading-snug text-brand sm:text-2xl">{text || dhikrLabel(state)}</span>
              <span key={state.count} className="num animate-count-pop mt-2 font-latin text-4xl font-bold leading-none text-ink sm:text-5xl">{state.count.toLocaleString("en-US")}</span>
              <span className="mt-1 text-xs text-ink-muted">{reached ? "بلغت الهدف" : `من ${formatNumber(state.goal)}`}</span>
            </span>
          </button>
          <div role="radiogroup" aria-label="الذكر" className="flex w-[38%] shrink-0 flex-col gap-2.5">
            {DHIKR_OPTIONS.filter((d) => d.id !== "custom" && d.id !== "salat").map((d, i) => {
              const active = (editingCustom ? "custom" : state.dhikrId) === d.id;
              const tones = ["border-brand text-brand", "border-brand text-brand", "border-brand text-brand", "border-brand text-brand", "border-brand text-brand"];
              const fills = ["bg-brand", "bg-brand", "bg-brand", "bg-brand", "bg-brand"];
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelect(d.id)}
                  className={cn(
                    "min-h-12 rounded-full border-2 px-2 text-sm font-bold leading-tight transition-all duration-200 active:scale-95",
                    active ? `${fills[i]} ${tones[i]?.split(" ")[0]} text-white shadow-card` : `bg-surface ${tones[i]}`,
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {DHIKR_OPTIONS.filter((d) => d.id === "custom" || d.id === "salat").map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={(editingCustom ? "custom" : state.dhikrId) === d.id} onClick={() => onSelect(d.id)} className={cn("h-9 rounded-full border px-3 text-xs font-semibold active:scale-95", (editingCustom ? "custom" : state.dhikrId) === d.id ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-ink")}>
                {d.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={state.count === 0} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted active:scale-95 disabled:opacity-40">
            <Icon name="undo" className="size-4" />
            تراجع
          </button>
        </div>
        <fieldset className="flex flex-col gap-2 rounded-control bg-canvas p-3">
          <legend className="px-1 text-sm font-bold text-brand">الهدف</legend>
          <div className="flex flex-wrap gap-2">
            {GOAL_PRESETS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={state.goal === g}
                onClick={() => applyGoal(g)}
                className={cn(
                  "num h-9 min-w-14 rounded-full border px-3 text-sm font-semibold",
                  state.goal === g ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-ink hover:bg-canvas",
                )}
              >
                {formatNumber(g)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={!goalIsPreset}
              onClick={() => setGoalCustomOpen((v) => !v)}
              className={cn("h-9 rounded-full border px-3 text-sm font-semibold", !goalIsPreset ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-ink hover:bg-canvas")}
            >
              {!goalIsPreset ? `مخصص: ${formatNumber(state.goal)}` : "هدف مخصص"}
            </button>
          </div>
          {goalCustomOpen ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="الهدف المخصص" type="number" inputMode="numeric" min={MIN_GOAL} max={MAX_GOAL} value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} error={goalError ?? undefined} dir="ltr" />
              </div>
              <Button onClick={applyCustomGoal} variant="secondary">اعتماد الهدف</Button>
            </div>
          ) : null}
        </fieldset>
        <p className="text-center text-xs text-ink-faint">المس الدائرة للتسبيح</p>
      </Card>

      <AdhkarSection tab={adhkarTab} onTab={setAdhkarTab} />

      <NamesCard />

      <DuaCards />

      {/* Settings */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {editingCustom || state.dhikrId === "custom" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field
                  label="الذكر المخصص"
                  value={editingCustom ? customDraft : state.customText}
                  onChange={(e) => {
                    setEditingCustom(true);
                    setCustomDraft(e.target.value);
                  }}
                  maxLength={MAX_CUSTOM_LENGTH}
                  error={customError ?? undefined}
                  hint={`حتى ${formatNumber(MAX_CUSTOM_LENGTH)} حرفاً`}
                />
              </div>
              <Button onClick={applyCustom} variant="secondary">اعتماد الذكر</Button>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-ink-muted">
          هذا العدّاد للاستخدام الشخصي فقط، ولا علاقة له بنجوم صقر أو الباقات أو الطلبات أو المكافآت.
        </p>
      </Card>

      {/* History */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">سجل الجلسات</h2>
          {state.history.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" className="size-4" />
              مسح السجل
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-ink-muted">يُحفظ السجل على هذا الجهاز فقط ولا يتزامن مع أجهزتك الأخرى.</p>
        {state.history.length === 0 ? (
          <p className="rounded-control bg-canvas p-4 text-center text-sm text-ink-muted">لا توجد جلسات محفوظة بعد. تُحفظ الجلسة عند التصفير أو بدء دورة جديدة.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {state.history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.dhikrLabel}</p>
                  <p className="num text-xs text-ink-muted">{formatDateTime(r.endedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-sm font-bold">{formatNumber(r.count)} <span className="font-normal text-ink-muted">/ {formatNumber(r.goal)}</span></span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", r.completed ? "bg-success-soft text-success-ink" : "bg-canvas text-ink-muted")}>
                    {r.completed ? "اكتمل الهدف" : "لم يكتمل"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Dialogs */}
      <Modal
        open={state.goalPrompt}
        onClose={() => dispatch({ type: "continue" })}
        title="أتممت الهدف"
        variant="sheet"
        footer={
          <>
            <Button variant="outline" onClick={() => dispatch({ type: "continue" })}>مواصلة التسبيح</Button>
            <Button onClick={() => dispatch({ type: "newCycle", now: Date.now() })}>بدء دورة جديدة</Button>
          </>
        }
      >
        <p>بارك الله فيك، بلغت {formatNumber(state.goal)} من «{dhikrLabel(state)}». يمكنك المواصلة من حيث وصلت، أو حفظ هذه الدورة والبدء من الصفر.</p>
      </Modal>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="تغيير الذكر"
        variant="sheet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>إلغاء</Button>
            <Button variant="outline" onClick={() => resolvePending("keep")}>الاحتفاظ بالعدّاد</Button>
            <Button onClick={() => resolvePending("new")}>جلسة جديدة</Button>
          </>
        }
      >
        <p>
          لديك {formatNumber(state.count)} على «{dhikrLabel(state)}». «الاحتفاظ بالعدّاد» يكمل نفس الجلسة على الذكر الجديد، و«جلسة جديدة» تحفظ ما عددته في السجل ثم تبدأ من الصفر. لن يُصفَّر العدّاد بدون اختيارك.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="تصفير العدّاد؟"
        message="سيرجع العدّاد إلى الصفر، وتُحفظ هذه الجلسة في السجل المحلي على هذا الجهاز."
        confirmLabel="تصفير"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: "reset", now: Date.now() });
          setConfirmReset(false);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        title="مسح سجل الجلسات؟"
        message="سيُحذف السجل من هذا الجهاز نهائياً. العدّاد الحالي لن يتأثر."
        confirmLabel="مسح السجل"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          dispatch({ type: "clearHistory" });
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
