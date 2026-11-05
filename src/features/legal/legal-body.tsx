import type { ReactNode } from "react";

/**
 * Renders the plain text of a legal page as readable sections. Only three line shapes are understood:
 * "## heading", "- bullet" and ordinary paragraphs. Everything is rendered as React text, never as HTML.
 */
export function LegalBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="flex list-disc flex-col gap-2 ps-6 marker:text-ink-muted">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>,
    );
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push(<h2 key={`h-${blocks.length}`} className="mt-4 text-lg font-bold text-ink">{line.slice(3)}</h2>);
    } else if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else {
      flush();
      blocks.push(<p key={`p-${blocks.length}`}>{line}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-3 text-base leading-8 text-ink">{blocks}</div>;
}
