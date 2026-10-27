import type { ReactNode } from "react";
import { rapiTautan } from "../lib/tautan";
import { labelIpk } from "../lib/ipk";
import type { Resume } from "../types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="border-b border-line pb-1 text-[10px] font-bold tracking-[0.18em] uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">{left}</div>
      {right ? <div className="shrink-0 text-[10.5px] text-mute">{right}</div> : null}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug">
      {items.map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
}

/** Template CV: satu kolom, teks asli (tanpa gambar/ikon) — paling aman untuk parser ATS. */
export function ResumeDoc({ r }: { r: Resume }) {
  const c = r.basics;
  const kontak = [c.email, c.phone, c.city, c.linkedin, c.github, c.url].filter(Boolean).map((x) => rapiTautan(x));

  return (
    <article>
      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight uppercase">{c.name || "(Nama)"}</h1>
        <p className="mt-0.5 text-[13px] font-semibold text-ink">{c.label}</p>
        <p className="mt-1.5 text-[10.5px] text-mute">{kontak.join("  ·  ")}</p>
      </header>

      {c.summary ? (
        <Section title="Ringkasan">
          <p className="text-[11px] leading-snug">{c.summary}</p>
        </Section>
      ) : null}

      {r.work.length > 0 ? (
        <Section title="Pengalaman Kerja">
          <div className="space-y-3">
            {r.work.map((w) => (
              <div key={`${w.company}-${w.position}-${w.start}`}>
                <Row
                  left={
                    <>
                      <div className="text-[12px] font-semibold">{w.position}</div>
                      <div className="text-[11px] text-mute">
                        {w.company}
                        {w.location ? ` — ${w.location}` : ""}
                      </div>
                    </>
                  }
                  right={`${w.start} – ${w.end}`}
                />
                <Bullets items={w.highlights} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {r.projects.length > 0 ? (
        <Section title="Proyek">
          <div className="space-y-2.5">
            {r.projects.map((p) => (
              <div key={p.name}>
                <Row
                  left={<div className="text-[12px] font-semibold">{p.name}</div>}
                  right={rapiTautan(p.url)}
                />
                <p className="mt-0.5 text-[11px] leading-snug">{p.description}</p>
                <Bullets items={p.highlights ?? []} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {r.skills.length > 0 ? (
        <Section title="Keahlian">
          <div className="space-y-1 text-[11px]">
            {r.skills.map((s) => (
              <div key={s.name}>
                <span className="font-semibold">{s.name}: </span>
                <span>{s.keywords.join(", ")}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {r.education.length > 0 ? (
        <Section title="Pendidikan">
          <div className="space-y-2">
            {r.education.map((e) => (
              <div key={`${e.school}-${e.degree}`}>
                <Row
                  left={
                    <>
                      <div className="text-[12px] font-semibold">{e.degree}</div>
                      <div className="text-[11px] text-mute">
                        {e.school}
                        {labelIpk(e.note)}
                      </div>
                    </>
                  }
                  right={`${e.start} – ${e.end}`}
                />
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </article>
  );
}
