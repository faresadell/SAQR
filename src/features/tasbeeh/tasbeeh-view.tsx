"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/states";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
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

      {/* Counter */}
      <Card className="flex flex-col items-center gap-5 bg-navy-900 p-6 text-white sm:p-8">
        <p className="text-center text-xl font-bold leading-relaxed sm:text-2xl">{text || dhikrLabel(state)}</p>

        <div role="status" aria-live="polite" aria-label={`العدّاد ${formatNumber(state.count)}`} className="flex flex-col items-center">
          <span key={state.count} className="num animate-count-pop font-latin text-8xl font-bold leading-none sm:text-9xl">{state.count.toLocaleString("en-US")}</span>
          <span className="mt-2 text-sm text-silver">الهدف: {formatNumber(state.goal)}</span>
        </div>

        <div className="flex w-full flex-col gap-1.5">
          <Progress value={state.count} max={state.goal} label="التقدم نحو الهدف" tone={reached ? "success" : "brand"} className="bg-white/15" />
          <p className="num text-center text-xs text-silver">
            {reached ? "بلغت الهدف" : `${formatNumber(state.count)} من ${formatNumber(state.goal)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => dispatch({ type: "tap", now: Date.now() })}
          className="flex min-h-28 w-full touch-manipulation select-none items-center justify-center gap-3 rounded-sheet bg-white text-3xl font-bold text-navy-900 transition-transform active:scale-[0.98] hover:bg-silver"
        >
          <Icon name="plus" className="size-8" />
          سبّح
        </button>

        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => dispatch({ type: "undo" })} disabled={state.count === 0}>
            <Icon name="undo" className="size-4" />
            تراجع عن آخر تسبيحة
          </Button>
          <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setConfirmReset(true)} disabled={state.count === 0}>
            <Icon name="refresh" className="size-4" />
            تصفير العدّاد
          </Button>
        </div>
      </Card>

      {/* Settings */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Select label="الذكر" value={editingCustom ? "custom" : state.dhikrId} onChange={(e) => onSelect(e.target.value)}>
            {DHIKR_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </Select>
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink">الهدف</legend>
          <div className="flex flex-wrap gap-2">
            {GOAL_PRESETS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={state.goal === g}
                onClick={() => applyGoal(g)}
                className={cn(
                  "num h-10 min-w-16 rounded-full border px-4 text-sm font-semibold",
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
              className={cn("h-10 rounded-full border px-4 text-sm font-semibold", !goalIsPreset ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-ink hover:bg-canvas")}
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
