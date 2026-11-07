"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const SALAWAT = [
  "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ",
  "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ",
  "اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ",
] as const;

const DUAS = [
  "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
  "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي",
  "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ",
  "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
  "رَبِّ زِدْنِي عِلْمًا",
  "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً إِنَّكَ أَنتَ الْوَهَّابُ",
] as const;

function Cycler({ title, items, tone, icon }: { title: string; items: readonly string[]; tone: string; icon: "heart" | "star" }) {
  const [i, setI] = useState(0);
  return (
    <section className={cn("relative overflow-hidden rounded-sheet p-6 text-center text-white shadow-card", tone)}>
      <span aria-hidden="true" className="absolute -start-8 top-10 size-24 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -end-6 bottom-6 size-20 rounded-full bg-white/10" />
      <span className="relative mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/20"><Icon name={icon} className="size-7" /></span>
      <h2 className="relative text-xl font-bold text-accent">{title}</h2>
      <p key={i} className="relative mt-3 min-h-24 animate-rise-in text-xl leading-loose">{items[i]}</p>
      <button type="button" aria-label={`${title}: التالي`} onClick={() => setI((i + 1) % items.length)} className="relative mt-4 inline-flex size-12 items-center justify-center rounded-full bg-white text-ink-muted shadow-card transition-transform active:scale-90">
        <Icon name="refresh" className="size-6" />
      </button>
    </section>
  );
}

/** Two coloured cards, each cycling through short texts with one button. */
export function DuaCards() {
  return (
    <>
      <Cycler title="صلوات" items={SALAWAT} tone="bg-gradient-to-b from-navy-800 to-navy-900" icon="star" />
      <Cycler title="أدعية" items={DUAS} tone="bg-gradient-to-br from-navy-800 to-navy-900" icon="heart" />
    </>
  );
}
