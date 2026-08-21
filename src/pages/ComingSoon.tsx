import { useT } from "@/i18n";

interface ComingSoonProps {
  title: string;
  phase: string;
  blurb: string;
}

export function ComingSoon({ title, phase, blurb }: ComingSoonProps) {
  const t = useT();
  return (
    <div>
      <h1 className="qf-heading text-2xl text-ink">{title}</h1>
      <div className="mt-16 flex flex-col items-center justify-center text-center">
        <div className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-widest text-ink-faint">
          {phase}
        </div>
        <p className="mt-4 max-w-sm text-sm text-ink-soft">{blurb}</p>
        <p className="mt-2 text-xs text-ink-faint">{t("comingSoon.footer")}</p>
      </div>
    </div>
  );
}
