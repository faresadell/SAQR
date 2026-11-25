/** The kinds of vehicle a driver delivers with. Safe to import from client components. */
export const VEHICLE_TYPES = ["MOTORCYCLE", "TRICYCLE", "TUKTUK", "QUARTER_TRUCK", "HALF_TRUCK"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  MOTORCYCLE: "موتوسيكل",
  TRICYCLE: "تروسيكل",
  TUKTUK: "توكتوك",
  QUARTER_TRUCK: "ربع نقل",
  HALF_TRUCK: "نص نقل",
};

export function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === "string" && (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function vehicleLabel(value: string | null | undefined): string {
  return isVehicleType(value) ? VEHICLE_LABELS[value] : VEHICLE_LABELS.MOTORCYCLE;
}
