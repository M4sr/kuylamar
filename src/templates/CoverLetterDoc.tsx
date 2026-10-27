import type { Resume } from "../types";
import type { Letter } from "../lib/cover";

/** Surat lamaran format surat resmi Indonesia: satu halaman, 3 paragraf, teks bisa dibaca ATS. */
export function CoverLetterDoc({ r, letter }: { r: Resume; letter: Letter }) {
  const c = r.basics;
  const kontak = [c.email, c.phone, c.city].filter(Boolean).join("  ·  ");

  return (
    <article className="text-[12px] leading-relaxed">
      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight uppercase">{c.name || "(Nama)"}</h1>
        <p className="mt-1 text-[10.5px] text-mute">{kontak}</p>
      </header>

      <p className="mt-5 text-right">{letter.dateLine}</p>

      <div className="mt-5 space-y-0.5">
        {letter.addressee.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>

      <p className="mt-5 font-semibold underline underline-offset-4">{letter.subject}</p>

      <p className="mt-4">{letter.salutation}</p>

      <div className="mt-3 space-y-3 text-justify">
        {letter.paragraphs.map((p, i) => (
          <p key={i} className="indent-8">
            {p}
          </p>
        ))}
      </div>

      <div className="mt-8 text-right">
        <p>Hormat saya,</p>
        <p className="mt-14 font-semibold underline underline-offset-4">{letter.signOff || "(Nama)"}</p>
      </div>
    </article>
  );
}
