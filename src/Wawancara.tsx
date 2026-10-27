import { useMemo, useState } from "react";
import Telepon from "./Telepon";
import { aiCfg, tanyaWawancara } from "./lib/ai";
import { bank, JUMLAH, type Tanya } from "./lib/wawancara";
import { Btn, Card, IconBtn } from "./ui";
import type { Job, Resume } from "./types";

/**
 * Latihan wawancara: pertanyaan versi standar langsung tampil (tanpa AI, dari JD + CV),
 * tombol AI opsional untuk daftar yang lebih nyambung dengan lowongan.
 */
export default function Wawancara({
  resume,
  job,
  dari,
  onToast,
}: {
  resume: Resume;
  job: Job;
  /** Kalau dibuka dari sebuah lamaran di pelacak. */
  dari?: { position: string; company: string; description?: string } | null;
  onToast: (s: string) => void;
}) {
  const lowongan = useMemo<Job>(
    () => ({
      ...job,
      position: dari?.position || job.position,
      company: dari?.company || job.company,
      description: dari?.description || job.description,
    }),
    [job, dari],
  );
  const dasar = useMemo(() => bank(resume, lowongan), [resume, lowongan]);
  const [pakai, setPakai] = useState<Tanya[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [telp, setTelp] = useState(false);
  const daftar = pakai ?? dasar;

  async function pakaiAi(segar: boolean) {
    setBusy(true);
    try {
      setPakai(await tanyaWawancara(resume, lowongan, aiCfg(), segar));
      onToast("Pertanyaan dari AI siap — cek dulu sebelum dipakai.");
    } catch (e) {
      setPakai(null);
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function salin(teks: string, apa: string) {
    try {
      await navigator.clipboard.writeText(teks);
      onToast(`${apa} tersalin.`);
    } catch {
      onToast("Clipboard diblokir browser — blok teksnya lalu salin manual.");
    }
  }

  const semuaTeks = daftar.map((t, i) => `${i + 1}. ${t.q}${t.kunci.length ? `\n   - ${t.kunci.join("\n   - ")}` : ""}`).join("\n");

  return (
    <Card
      icon="mic"
      title="Latihan wawancara"
      desc={`Pertanyaan khas ${lowongan.position || "posisi ini"}${lowongan.company ? ` di ${lowongan.company}` : ""} + petunjuk jawaban dari CV kamu.`}
      right={<span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-semibold text-mute">{daftar.length} pertanyaan</span>}
    >
      {dari && (
        <p className="mb-2 text-[11px] text-mute">
          Dipakai dari pelacak: <strong className="text-ink">{dari.position || dari.company}</strong>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Btn icon="spark" busy={busy} onClick={() => pakaiAi(Boolean(pakai))} title="Susun ulang pertanyaan sesuai lowongan">
          {pakai ? "Versi AI lagi" : `Pakai AI (${JUMLAH}+ pertanyaan)`}
        </Btn>
        {pakai && (
          <Btn
            icon="check"
            onClick={() => {
              setPakai(null);
              onToast("Kembali ke daftar standar.");
            }}
          >
            Kembali ke standar
          </Btn>
        )}
        <Btn icon="copy" onClick={() => salin(semuaTeks, "Semua pertanyaan")}>
          Salin semua
        </Btn>
        <Btn icon="mic" variant="primary" onClick={() => setTelp(true)} title="HRD bertanya lewat suara, kamu jawab lewat suara">
          Simulasi telepon
        </Btn>
      </div>

      <ol className="mt-3 space-y-3 border-t border-line pt-3">
        {daftar.map((t, i) => (
          <li key={`${i}-${t.q}`} className="flex gap-2">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-bold text-brand tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.q}</p>
              {t.kunci.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {t.kunci.map((k) => (
                    <li key={k} className="flex items-start gap-1.5 text-[11px] text-mute">
                      <span className="mt-[6px] size-1 shrink-0 rounded-full bg-mute" />
                      {k}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <IconBtn size="sm" name="copy" label="Salin pertanyaan" onClick={() => salin(t.q, "Pertanyaan")} />
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] text-mute">Petunjuk jawaban diambil dari CV & JD kamu — bukan jawaban jadi; sesuaikan dengan pengalaman nyata.</p>

      {telp ? (
        <Telepon resume={resume} job={lowongan} daftar={daftar} dari={dari} onTutup={() => setTelp(false)} onToast={onToast} />
      ) : null}
    </Card>
  );
}
