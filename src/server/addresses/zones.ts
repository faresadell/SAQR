import "server-only";
import { db } from "@/lib/db";
import { resolveZoneFee, ZoneUnavailableError } from "@/server/delivery/zones";

export interface OpenZone {
  id: string;
  name: string;
  feeCents: number;
}

/** Zones a customer can deliver to right now (active and with a fee in force), with the fee the server will charge. */
export async function listOpenZones(): Promise<OpenZone[]> {
  const zones = await db.deliveryZone.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const now = new Date();
  const result: OpenZone[] = [];
  for (const zone of zones) {
    try {
      const fee = await resolveZoneFee(zone.id, now);
      result.push({ id: zone.id, name: zone.name, feeCents: fee.feeCents });
    } catch (error) {
      if (!(error instanceof ZoneUnavailableError)) throw error;
    }
  }
  return result;
}
