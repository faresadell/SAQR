"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const NAMES = [
  "الرحمن", "الرحيم", "الملك", "القدوس", "السلام", "المؤمن", "المهيمن", "العزيز", "الجبار", "المتكبر",
  "الخالق", "البارئ", "المصور", "الغفار", "القهار", "الوهاب", "الرزاق", "الفتاح", "العليم", "القابض",
  "الباسط", "الخافض", "الرافع", "المعز", "المذل", "السميع", "البصير", "الحكم", "العدل", "اللطيف",
  "الخبير", "الحليم", "العظيم", "الغفور", "الشكور", "العلي", "الكبير", "الحفيظ", "المقيت", "الحسيب",
  "الجليل", "الكريم", "الرقيب", "المجيب", "الواسع", "الحكيم", "الودود", "المجيد", "الباعث", "الشهيد",
  "الحق", "الوكيل", "القوي", "المتين", "الولي", "الحميد", "المحصي", "المبدئ", "المعيد", "المحيي",
  "المميت", "الحي", "القيوم", "الواجد", "الماجد", "الواحد", "الأحد", "الصمد", "القادر", "المقتدر",
  "المقدم", "المؤخر", "الأول", "الآخر", "الظاهر", "الباطن", "الوالي", "المتعالي", "البر", "التواب",
  "المنتقم", "العفو", "الرؤوف", "مالك الملك", "ذو الجلال والإكرام", "المقسط", "الجامع", "الغني", "المغني", "المانع",
  "الضار", "النافع", "النور", "الهادي", "البديع", "الباقي", "الوارث", "الرشيد", "الصبور",
] as const;

/** One of the beautiful names of Allah at a time, with next / previous / random. */
export function NamesCard() {
  const [i, setI] = useState(0);
  const go = (n: number) => setI((n + NAMES.length) % NAMES.length);
  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-xl font-bold text-ink-muted">أسماء الله الحسنى</h2>
      <p key={i} className="animate-rise-in text-6xl font-bold leading-relaxed text-brand sm:text-7xl">{NAMES[i]}</p>
      <p className="num text-xs text-ink-muted">{(i + 1).toLocaleString("ar-EG")} / {NAMES.length.toLocaleString("ar-EG")}</p>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="الاسم السابق" onClick={() => go(i - 1)} className="flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-card transition-transform active:scale-90">
          <Icon name="chevronRight" className="size-5" />
        </button>
        <button type="button" aria-label="اسم عشوائي" onClick={() => go(Math.floor(Math.random() * NAMES.length))} className="flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-card transition-transform active:scale-90">
          <Icon name="refresh" className="size-5" />
        </button>
        <button type="button" aria-label="الاسم التالي" onClick={() => go(i + 1)} className="flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-card transition-transform active:scale-90">
          <Icon name="chevronLeft" className="size-5" />
        </button>
      </div>
    </Card>
  );
}
