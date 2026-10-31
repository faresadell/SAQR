import { Badge } from "@/components/ui/badge";
import type { StatusInfo } from "@/features/shared/status";

/** Badge for any status table entry (text always accompanies color). */
export function StatusBadge({ status }: { status: StatusInfo }) {
  return <Badge tone={status.tone}>{status.label}</Badge>;
}
