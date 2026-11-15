"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { shareLocationAction, stopSharingAction } from "./location-actions";

const SEND_EVERY_MS = 15_000;

/** The driver chooses to share their position with the customer while delivering. Works only while this page stays open. */
export function LocationSharer() {
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!on) return;
    if (!("geolocation" in navigator)) {
      setMessage({ tone: "danger", text: "المتصفح لا يدعم تحديد الموقع." });
      setOn(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        const result = await shareLocationAction(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        setMessage(result.ok ? { tone: "success", text: "الموقع بيتحدّث للعميل. سيب الصفحة مفتوحة." } : { tone: "warning", text: result.error ?? "تعذّر تحديث الموقع." });
      },
      (err) => {
        setMessage({ tone: "danger", text: err.code === err.PERMISSION_DENIED ? "اسمح للموقع بالوصول لموقعك من إعدادات المتصفح." : "تعذّر تحديد موقعك." });
        setOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [on]);

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-bold">مشاركة موقعي مع العميل</h2>
      <p className="text-sm text-ink-muted">العميل يشوف مكانك على الخريطة وهو في الطريق. بتشتغل بس لما الصفحة دي تكون مفتوحة، وبتتوقف وبيتمسح موقعك بعد التسليم.</p>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {on ? (
        <Button
          variant="outline"
          onClick={async () => {
            setOn(false);
            lastSent.current = 0;
            setMessage(null);
            await stopSharingAction();
          }}
        >
          إيقاف المشاركة
        </Button>
      ) : (
        <Button onClick={() => { setMessage(null); setOn(true); }}>ابدأ مشاركة موقعي</Button>
      )}
    </Card>
  );
}
