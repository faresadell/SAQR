import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";

type Props = {
  id: string;
  tag: string;
  title: string;
  accent: string;
  text: string;
  bullets?: readonly string[];
  cta: string;
  href: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  note?: string;
};

/** Navy storytelling band: live text on one side, a brand illustration on the other. On phones the picture sits on top and fades into the text. */
export function FeatureBand({ id, tag, title, accent, text, bullets, cta, href, image, alt, width, height, note }: Props) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-sheet bg-navy-900 text-white shadow-pop">
      <div className="grid items-center md:grid-cols-2">
        <div className="flex flex-col gap-4 p-6 sm:p-10">
          <span className="w-fit rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-300">{tag}</span>
          <h2 id={id} className="text-3xl font-bold leading-snug sm:text-4xl">
            {title} <span className="text-emerald-400">{accent}</span>
          </h2>
          <p className="text-sm leading-relaxed text-silver sm:text-base">{text}</p>
          {bullets ? (
            <ul className="flex flex-col gap-2 text-sm text-silver">
              {bullets.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" className="size-4 shrink-0 text-emerald-300" />
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          <LinkButton href={href} className="w-fit rounded-full bg-emerald-400 text-navy-900 hover:bg-emerald-300">
            {cta}
          </LinkButton>
          {note ? <p className="text-xs text-silver/70">{note}</p> : null}
        </div>
        <div className="order-first overflow-hidden md:order-none">
          <Image
            src={image}
            alt={alt}
            width={width}
            height={height}
            sizes="(min-width: 768px) 40vw, 100vw"
            className="aspect-[4/3] w-full object-cover [mask-image:linear-gradient(to_bottom,black_72%,transparent)] md:aspect-auto md:h-full md:max-h-[28rem] md:[mask-image:linear-gradient(to_left,black_78%,transparent)]"
          />
        </div>
      </div>
    </section>
  );
}
