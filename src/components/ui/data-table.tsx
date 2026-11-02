import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<Row> {
  key: string;
  header: string;
  /** Cell content. */
  cell: (row: Row) => ReactNode;
  /** Align numbers/amounts to the end edge. */
  numeric?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
}

/**
 * Table on wide screens, stacked labelled cards on phones (no horizontal scrolling at 360px).
 * Every cell carries its header as a visible label on small screens.
 */
export function DataTable<Row>({ caption, columns, rows, rowKey, empty }: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden bg-surface-muted text-ink-muted md:table-header-group">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 text-start font-semibold", c.numeric && "text-end", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="block border-t border-line p-3 first:border-t-0 md:table-row md:p-0">
              {columns.map((c) => (
                <td key={c.key} className={cn("flex items-center justify-between gap-3 py-1 md:table-cell md:px-4 md:py-3", c.numeric && "md:text-end", c.className)}>
                  <span className="text-xs font-semibold text-ink-muted md:hidden">{c.header}</span>
                  <span className="min-w-0 text-end md:text-start">{c.cell(row)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
