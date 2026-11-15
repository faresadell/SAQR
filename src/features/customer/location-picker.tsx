"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Free OpenStreetMap picker with no map library: plain tile images, drag to move, +/- to zoom, the pin stays in the middle.
 * The customer presses "تأكيد هذا الموقع" and only then are lat/lng posted with the form. It is optional.
 */
const TILE = 256;
const START = { lat: 30.0444, lng: 31.2357 }; // Cairo, only where the map opens when nothing is saved
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;

const worldSize = (z: number) => TILE * 2 ** z;
const toPx = (lat: number, lng: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * worldSize(z), y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z) };
};
const toLatLng = (x: number, y: number, z: number) => ({
  lng: (x / worldSize(z)) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize(z)))) * 180) / Math.PI,
});

export interface PickedLocation { lat: number; lng: number }

export function LocationPicker({ initial }: { initial?: PickedLocation | null }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 360, h: 288 });
  const [zoom, setZoom] = useState(initial ? 16 : 12);
  const [center, setCenter] = useState<PickedLocation>(initial ?? START);
  const [confirmed, setConfirmed] = useState<PickedLocation | null>(initial ?? null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || 288 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = toPx(center.lat, center.lng, zoom);
  const left = c.x - size.w / 2;
  const top = c.y - size.h / 2;
  const n = 2 ** zoom;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ key: `${zoom}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${((tx % n) + n) % n}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
    }
  }

  const moveBy = useCallback((dx: number, dy: number) => {
    setCenter((cur) => {
      const p = toPx(cur.lat, cur.lng, zoom);
      const next = toLatLng(p.x - dx, Math.min(worldSize(zoom), Math.max(0, p.y - dy)), zoom);
      return { lat: Math.max(-85, Math.min(85, next.lat)), lng: ((((next.lng + 180) % 360) + 360) % 360) - 180 };
    });
  }, [zoom]);

  function locateMe() {
    setNote(null);
    if (!navigator.geolocation) return setNote("جهازك لا يدعم تحديد الموقع. حرّك الخريطة يدوياً.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(17);
      },
      () => setNote("لم نتمكن من تحديد موقعك. اسمح للمتصفح بالوصول للموقع أو حرّك الخريطة يدوياً."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">حدّد موقعك على الخريطة (اختياري)</p>
      <div
        ref={box}
        role="application"
        aria-label="خريطة اختيار الموقع. اسحب الخريطة ليكون الدبوس على موقعك."
        className="relative h-72 w-full touch-none select-none overflow-hidden rounded-card border border-line bg-canvas"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          moveBy(e.clientX - drag.current.x, e.clientY - drag.current.y);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY < 0 ? 1 : -1))))}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: t.x, top: t.y }} />
        ))}
        <Icon name="pin" className="pointer-events-none absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-full text-danger" />
        <div className="absolute end-2 top-2 flex flex-col gap-1">
          <button type="button" aria-label="تكبير" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => z + 1)} onPointerDown={(e) => e.stopPropagation()} className="size-9 rounded-control bg-surface text-lg font-bold shadow disabled:opacity-40">+</button>
          <button type="button" aria-label="تصغير" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => z - 1)} onPointerDown={(e) => e.stopPropagation()} className="size-9 rounded-control bg-surface text-lg font-bold shadow disabled:opacity-40">−</button>
        </div>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-0 start-0 bg-white/80 px-1.5 text-[10px] text-ink">© مساهمو OpenStreetMap</a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={locateMe}>موقعي الحالي</Button>
        <Button type="button" onClick={() => setConfirmed({ lat: Math.round(center.lat * 1e6) / 1e6, lng: Math.round(center.lng * 1e6) / 1e6 })}>تأكيد هذا الموقع</Button>
        {confirmed ? <Button type="button" variant="ghost" onClick={() => setConfirmed(null)}>إلغاء التحديد</Button> : null}
      </div>
      {confirmed ? <p className="text-sm font-semibold text-success" data-testid="location-confirmed">تم تحديد الموقع على الخريطة ✓</p> : <p className="text-xs text-ink-muted">اسحب الخريطة حتى يكون الدبوس على باب بيتك ثم اضغط «تأكيد هذا الموقع». لا يزال عليك كتابة العنوان بالتفصيل.</p>}
      {note ? <p className="text-xs text-danger">{note}</p> : null}
      {confirmed ? (
        <>
          <input type="hidden" name="lat" value={confirmed.lat} />
          <input type="hidden" name="lng" value={confirmed.lng} />
        </>
      ) : null}
    </div>
  );
}
