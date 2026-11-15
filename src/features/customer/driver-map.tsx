import { formatDateTime } from "@/lib/format";

/** The driver's last shared position on OpenStreetMap (official embed). Refreshed by the page's 20-second auto refresh. */
export function DriverMap({ lat, lng, updatedAt }: { lat: number; lng: number; updatedAt: Date }) {
  const pad = 0.006;
  const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].map((n) => n.toFixed(5)).join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
  return (
    <div className="flex flex-col gap-1">
      <iframe title="مكان المندوب على الخريطة" src={src} loading="lazy" referrerPolicy="no-referrer" className="h-56 w-full rounded-control border border-line" />
      <p className="text-xs text-ink-muted">آخر تحديث لموقع المندوب: {formatDateTime(updatedAt)}</p>
    </div>
  );
}
