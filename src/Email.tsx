import { useEffect, useMemo, useState } from "react";
import Paket from "./Paket";
import { aiCfg, haluskanEmail } from "./lib/ai";
import type { Letter } from "./lib/cover";
import { buildEmail, JENIS, mailto, type Jenis, type Surel } from "./lib/email";
import { Btn, Card, Icon, IconBtn, Label, Segmented } from "./ui";
import type { Job, Resume } from "./types";

const EK = "lamarkerja.email";
const ES = "lamarkerja.email.surel";

/** Dari mana email ini diminta: pelacak (follow-up lamaran tertentu) atau tab email biasa. */
export type Seed = { n: number; jenis: Jenis; position?: string; company?: string };

/**
 * Email siap kirim: subjek + isi dibuat versi template (tanpa AI) begitu tab dibuka,
 * AI opsional cuma merapikan kalimat — kalau hasilnya menambah fakta, versi template yang dipakai.
 */
export default function Email({
  resume,
  job,
  cocok,
  letter,
  seed,
  onToast,
}: {
  resume: Resume;
  job: Job;
  cocok: string[];
  letter: Letter;
  seed?: Seed | null;
  onToast: (s: string) => void;
}) {
  const [jenis, setJenis] = useState<Jenis>("lamaran");
  const [kepada, setKepada] = useState("");
  const [jadwal, setJadwal] = useState("");
  const [pewawancara, setPewawancara] = useState("");
  const [surel, setSurel] = useState<Surel | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // isian manual disimpan supaya tidak perlu diketik ulang tiap ganti tab
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(EK) ?? "{}") as { kepada?: string; jadwal?: string; pewawancara?: string };
      setKepada(s.kepada ?? "");
      setJadwal(s.jadwal ?? "");
      setPewawancara(s.pewawancara ?? "");
    } catch {
      /* isian rusak — mulai dari kosong */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(EK, JSON.stringify({ kepada, jadwal, pewawancara }));
  }, [kepada, jadwal, pewawancara]);

  // isi email terakhir ikut disimpan — dipakai tombol ekspor paket di bawah
  useEffect(() => {
    if (surel) localStorage.setItem(ES, JSON.stringify({ kunci: `${job.company ?? ""}|${job.position ?? ""}`, ...surel }));
  }, [surel, job.company, job.position]);

  /** Dari pelacak: pakai posisi/perusahaan lamaran itu, bukan yang sedang di editor. */
  const sumber = useMemo<Job>(
    () => (seed ? { ...job, position: seed.position || job.position, company: seed.company || job.company } : job),
    [job, seed],
  );

  // dibuka dari pelacak → langsung jenis yang diminta
  useEffect(() => {
    if (!seed) return;
    setJenis(seed.jenis);
    setDirty(false);
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // begitu tab dibuka / ganti jenis email → langsung terisi; sunting manual tidak ditimpa
  useEffect(() => {
    if (!dirty) setSurel(buildEmail(jenis, resume, sumber, { jadwal, pewawancara, cocok }));
  }, [jenis, resume, sumber, jadwal, pewawancara, cocok, dirty, seed?.n]);

  const hint = JENIS.find((j) => j.value === jenis)?.hint ?? "";

  function ubah(patch: Partial<Surel>) {
    setDirty(true);
    setSurel((s) => (s ? { ...s, ...patch } : s));
  }

  async function rapikan() {
    if (!surel) return;
    setBusy(true);
    try {
      const isi = await haluskanEmail(surel, sumber, aiCfg(), true);
      setSurel({ ...surel, isi });
      setDirty(true);
      onToast("Email dirapikan AI — baca dulu sebelum dikirim.");
    } catch (e) {
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

  function buka() {
    if (!surel) return;
    if (!kepada.trim()) {
      onToast("Isi email tujuan dulu, atau pakai Salin lalu tempel sendiri.");
      return;
    }
    window.location.href = mailto(kepada, surel);
  }

  return (
    <div className="tabpane space-y-4">
      <Card icon="mail" title="Email" desc={`Subjek + isi siap kirim. ${hint}`}>
        <div className="space-y-3">
          <Segmented value={jenis} onChange={setJenis} items={JENIS.map(({ value, label }) => ({ value, label }))} />

          <label className="block">
            <Label>Email tujuan (opsional)</Label>
            <input
              type="email"
              className="field"
              value={kepada}
              onChange={(e) => setKepada(e.target.value)}
              placeholder="hrd@perusahaan.com"
              autoComplete="off"
            />
          </label>

          {jenis === "wawancara" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <Label>Jadwal wawancara</Label>
                <input className="field" value={jadwal} onChange={(e) => setJadwal(e.target.value)} placeholder="Selasa, 27 Oktober 2026, 10.00 WIB" />
              </label>
              <label className="block">
                <Label>Nama pewawancara</Label>
                <input className="field" value={pewawancara} onChange={(e) => setPewawancara(e.target.value)} placeholder="Bu Sari" />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Btn
              icon="pen"
              busy={busy}
              onClick={rapikan}
              disabled={!surel}
              title="Hanya merapikan kalimat — tidak menambah fakta"
            >
              Rapikan dengan AI
            </Btn>
            <Btn
              icon="mail"
              onClick={buka}
              disabled={!surel}
            >
              Buka di aplikasi email
            </Btn>
          </div>

          {surel ? (
            <div className="space-y-3 border-t border-line pt-3">
              <div className="block">
                <Label>Subjek</Label>
                <div className="flex gap-2">
                  <input className="field min-w-0 flex-1" value={surel.subjek} onChange={(e) => ubah({ subjek: e.target.value })} aria-label="Subjek email" />
                  <IconBtn name="copy" label="Salin subjek" size="sm" onClick={() => salin(surel.subjek, "Subjek")} />
                </div>
              </div>

              <div className="block">
                <Label>Isi email</Label>
                <textarea
                  rows={18}
                  className="field leading-relaxed"
                  value={surel.isi}
                  onChange={(e) => ubah({ isi: e.target.value })}
                  aria-label="Isi email"
                  spellCheck={false}
                />
                <p className="mt-1 text-[11px] text-mute">
                  Subjek + isi dari profil & lowongan — periksa sekali, lalu salin atau buka di aplikasi email.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Btn icon="copy" onClick={() => salin(surel.isi, "Isi email")}>
                  Salin isi
                </Btn>
                <Btn icon="copy" onClick={() => salin(`Subjek: ${surel.subjek}\n\n${surel.isi}`, "Subjek + isi")}>
                  Salin subjek + isi
                </Btn>
                <Btn
                  icon="spark"
                  onClick={() => {
                    setDirty(false);
                    setSurel(buildEmail(jenis, resume, sumber, { jadwal, pewawancara, cocok }));
                    onToast("Email disusun ulang dari profil & lowongan.");
                  }}
                  title="Buang suntingan manual, kembali ke versi template"
                >
                  Susun ulang
                </Btn>
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-mute">
                <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
                Lampirkan CV hasil tab Pratinjau sebelum kirim.
              </p>
            </div>
          ) : (
            <p className="text-xs text-mute">Isi lowongan & profil dulu — email muncul otomatis di sini.</p>
          )}
        </div>
      </Card>

      <Paket resume={resume} job={sumber} letter={letter} surel={surel} onToast={onToast} />
    </div>
  );
}
