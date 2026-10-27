import { useEffect, useMemo, useState } from "react";
import Wawancara from "./Wawancara";
import { Btn, Card, Icon, IconBtn, Konfirmasi, Label } from "./ui";
import type { Job, Resume } from "./types";
import { TAHAP, buang, dariJob, hitung, perluFollowUp, selisih, tanggal, tambah, ubah, urut, type Lamaran, type Tahap } from "./lib/pelacak";

const KEY = "lamarkerja.lamaran";

const LABEL: Record<Tahap, string> = { dilamar: "Dilamar", wawancara: "Wawancara", ditawarkan: "Ditawarkan", ditolak: "Ditolak" };
const WARNA: Record<Tahap, string> = {
  dilamar: "bg-brand/12 text-brand",
  wawancara: "bg-amber-500/15 text-amber-600",
  ditawarkan: "bg-emerald-500/15 text-emerald-600",
  ditolak: "bg-rose-500/15 text-rose-600",
};

function load(): Lamaran[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? (data as Lamaran[]) : [];
  } catch {
    return [];
  }
}

/** Pelacak lamaran: arsip lowongan + status, disimpan lokal di browser. */
export default function Pelacak({
  job,
  resume,
  onMuat,
  onFollowUp,
  onToast,
}: {
  job: Job;
  resume: Resume;
  onMuat: (l: Lamaran) => void;
  onFollowUp: (l: Lamaran) => void;
  onToast: (s: string) => void;
}) {
  const [list, setList] = useState<Lamaran[]>(load);
  /** Lamaran yang dipakai untuk latihan wawancara (kosong = pakai lowongan di editor). */
  const [latihan, setLatihan] = useState<Lamaran | null>(null);
  /** Lamaran yang diminta dibuang — dialognya sendiri, bukan window.confirm. */
  const [tanyaHapus, setTanyaHapus] = useState<Lamaran | null>(null);
  // Tanggal "hari ini" dikunci saat panel dibuka — biar badge follow-up tidak berubah di tengah sesi.
  const [hari] = useState(() => tanggal());

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(list));
  }, [list]);

  const rekap = hitung(list);
  const tersusun = useMemo(() => urut(list), [list]);
  const perluDaftar = useMemo(() => tersusun.filter((l) => perluFollowUp(l, hari)), [tersusun, hari]);
  const bisaSimpan = Boolean(job.position.trim() || job.company.trim());

  function simpan() {
    const next = tambah(list, dariJob(job, hari));
    if (next === list) return onToast("Lowongan ini sudah ada di pelacak.");
    setList(next);
    onToast(`${job.company.trim() || job.position.trim()} masuk pelacak.`);
  }

  return (
    <div className="tabpane space-y-4">
      <Card
        icon="target"
        title="Pelacak lamaran"
        desc="Arsip lowongan yang kamu lamar, plus status & jadwal follow-up."
        right={
          <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-semibold text-mute">{rekap.total} lamaran</span>
        }
      >
        <Btn variant="primary" icon="plus" onClick={simpan} disabled={!bisaSimpan} className="w-full">
          Simpan lowongan aktif
        </Btn>
        {!bisaSimpan && <p className="mt-2 text-xs text-mute">Isi posisi atau perusahaan di tab Lowongan dulu.</p>}

        {rekap.total > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {TAHAP.map((t) => (
              <span key={t} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${WARNA[t]}`}>
                {LABEL[t]} {rekap[t]}
              </span>
            ))}
          </div>
        )}
      </Card>

      {perluDaftar.length > 0 && (
        <Card icon="alert" title={`${perluDaftar.length} lamaran butuh follow-up`} desc="Sudah lewat pengingat, atau 14 hari tanpa kabar — kabari HRD biar tidak menggantung.">
          <div className="space-y-2">
            {perluDaftar.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{l.company || l.position || "(tanpa nama)"}</p>
                  <p className="truncate text-[11px] text-mute">
                    {l.position || "(tanpa posisi)"} · {l.followUp ? `pengingat ${l.followUp}` : `update ${l.update}`}
                  </p>
                </div>
                <Btn size="sm" icon="mail" onClick={() => onFollowUp(l)}>
                  Siapkan follow-up
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tersusun.length === 0 ? (
        <Card icon="info" title="Belum ada catatan">
          <p className="text-sm text-mute">
            Tempel lowongan di tab <strong>Lowongan</strong>, lalu klik <strong>Simpan lowongan aktif</strong>. Tiap lamaran bisa
            diubah statusnya jadi wawancara, ditawarkan, atau ditolak — dan diberi pengingat follow-up.
          </p>
        </Card>
      ) : (
        tersusun.map((l) => {
          const perlu = perluFollowUp(l, hari);
          return (
            <Card key={l.id} className={perlu ? "ring-1 ring-amber-500/40" : ""}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{l.position || "(tanpa posisi)"}</p>
                  <p className="truncate text-xs text-mute">
                    {l.company || "(tanpa perusahaan)"}
                    {l.source ? ` · ${l.source}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${WARNA[l.tahap]}`}>{LABEL[l.tahap]}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mute">
                <span className="inline-flex items-center gap-1">
                  <Icon name="clock" className="size-3.5" />
                  dilamar {l.tanggal}
                </span>
                {selisihText(l, hari) && <span>· update {selisihText(l, hari)}</span>}
                {perlu && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600">
                    <Icon name="alert" className="size-3.5" />
                    waktunya follow-up
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <Label>Tahap</Label>
                  <select className="field" value={l.tahap} onChange={(e) => setList(ubah(list, l.id, { tahap: e.target.value as Tahap }, hari))}>
                    {TAHAP.map((t) => (
                      <option key={t} value={t}>
                        {LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <Label>Pengingat follow-up</Label>
                  <input type="date" className="field" value={l.followUp ?? ""} onChange={(e) => setList(ubah(list, l.id, { followUp: e.target.value || undefined }))} />
                </label>
              </div>

              <textarea
                rows={2}
                className="field mt-2 leading-relaxed"
                placeholder="Catatan: kontak HRD, jadwal wawancara, hasilnya…"
                value={l.catatan ?? ""}
                onChange={(e) => setList(ubah(list, l.id, { catatan: e.target.value }))}
              />

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Btn size="sm" icon="pen" onClick={() => onMuat(l)} title="Muat lowongan ini kembali ke editor">
                  Muat ke editor
                </Btn>
                <Btn size="sm" icon="mail" onClick={() => onFollowUp(l)} title="Buka tab Email dengan jenis follow-up">
                  Follow-up
                </Btn>
                <Btn
                  size="sm"
                  icon="mic"
                  onClick={() => {
                    setLatihan(l);
                    document.getElementById("latihan-wawancara")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  title="Latihan wawancara untuk lamaran ini"
                >
                  Latihan
                </Btn>
                {l.url && (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Buka lowongan asli"
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface2 px-2 text-[11px] font-semibold text-mute transition hover:text-ink active:scale-[0.97]"
                  >
                    <Icon name="link" className="size-4" />
                    Lowongan
                  </a>
                )}
                <IconBtn
                  size="sm"
                  name="trash"
                  label="Hapus dari pelacak"
                  className="ml-auto hover:border-rose-500/40 hover:text-rose-600"
                  onClick={() => setTanyaHapus(l)}
                />
              </div>
            </Card>
          );
        })
      )}

      {tanyaHapus && (
        <Konfirmasi
          bahaya
          icon="trash"
          judul="Hapus dari pelacak?"
          pesan={`"${tanyaHapus.position || tanyaHapus.company}" akan dibuang dari daftar lamaran. Bisa ditambahkan lagi dari tab Lowongan.`}
          ya="Hapus"
          onYa={() => {
            setList(buang(list, tanyaHapus.id));
            setTanyaHapus(null);
          }}
          onBatal={() => setTanyaHapus(null)}
        />
      )}

      <div id="latihan-wawancara" className="scroll-mt-24">
        <Wawancara resume={resume} job={job} dari={latihan} onToast={onToast} />
      </div>
    </div>
  );
}

/** "3 hari lalu" / "hari ini" untuk tanggal update. */
function selisihText(l: Lamaran, hari: string): string {
  const d = selisih(l.update, hari);
  if (d === null) return "";
  if (d === 0) return "hari ini";
  if (d === 1) return "kemarin";
  return `${d} hari lalu`;
}
