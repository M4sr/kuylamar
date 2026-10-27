/**
 * Pencarian lowongan lintas platform. Dua mode:
 * - "kerjaan": cari manual per profesi, bisa filter status buka/tutup.
 * - "auto": pakai profesi/keahlian dari CV, ambil semua platform, urutkan skor kecocokan.
 * Datanya diambil lewat /api/cari (vite dev) atau functions/api/cari.ts (produksi).
 */
import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Icon, Label, Segmented } from "./ui";
import {
  PLATFORM,
  PLATFORM_ID,
  kunciDariResume,
  segar,
  saring,
  skorCocok,
  type Filter,
  type Loker,
  type PlatformId,
  type StatusLoker,
} from "./lib/cari";
import { dariJob, tanggal, tambah, type Lamaran } from "./lib/pelacak";
import type { Job, Resume } from "./types";

const KEY_LAMARAN = "lamarkerja.lamaran";
const KEY_CEK = "lamarkerja.cek";
const KEY_CARI = "lamarkerja.cari";
/** Batas cek detail sekali klik — biar tidak menghajar platform. */
const TAHAP = ["Menghubungi platform…", "Menarik daftar lowongan…", "Menyaring hasil…", "Menyusun daftar…"];

const CEK_MAKS = 10;

type Mode = "kerjaan" | "auto";
type Pesan = Record<string, string>;

function baca<T>(key: string, cadangan: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : cadangan;
  } catch {
    return cadangan;
  }
}

function tulis(key: string, nilai: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(nilai));
  } catch {
    /* kuota penuh — abaikan, bukan data kritis */
  }
}

const BADGE: Record<StatusLoker, string> = {
  buka: "bg-emerald-500/15 text-emerald-600",
  tutup: "bg-rose-500/15 text-rose-600",
  ragu: "bg-amber-500/15 text-amber-600",
};

const NAMA_STATUS: Record<StatusLoker, string> = { buka: "Masih buka", tutup: "Sudah tutup", ragu: "Belum pasti" };

export default function Cari({ resume, onMuat, onToast }: {
  resume: Resume;
  onMuat: (j: Job) => void;
  onToast: (s: string) => void;
}) {
  const simpan = baca<{ mode: Mode; q: string; platform: PlatformId[]; status: Filter["status"] }>(KEY_CARI, {
    mode: "kerjaan",
    q: "",
    platform: PLATFORM_ID,
    status: "semua",
  });
  const [mode, setMode] = useState<Mode>(simpan.mode);
  const [q, setQ] = useState(simpan.q);
  const [plat, setPlat] = useState<PlatformId[]>(simpan.platform);
  const [status, setStatus] = useState<Filter["status"]>(simpan.status);
  const [daftar, setDaftar] = useState<Loker[]>([]);
  const [pesan, setPesan] = useState<Pesan>({});
  const [sibuk, setSibuk] = useState(false);
  const [cek, setCek] = useState<Record<string, StatusLoker>>(() => baca(KEY_CEK, {}));
  const [cekSibuk, setCekSibuk] = useState(false);
  const [tahap, setTahap] = useState(0);
  const [aksi, setAksi] = useState<{ url: string; teks: string } | null>(null);
  const [panduan, setPanduan] = useState<Loker | null>(null);

  // Teks bergilir selama panen: tanda proses masih hidup walau hasil belum masuk.
  useEffect(() => {
    if (!sibuk) {
      setTahap(0);
      return;
    }
    const t = setInterval(() => setTahap((n) => (n + 1) % TAHAP.length), 1300);
    return () => clearInterval(t);
  }, [sibuk]);

  /** URL absolut tanpa kredensial: fetch() relatif ikut membawa user:pass dari gate basic-auth. */
  const api = (path: string) => {
    const u = new URL(path, location.href);
    u.username = "";
    u.password = "";
    return u.toString();
  };

  /** Animasi aksi per kartu; 380 ms supaya transisinya sempat terlihat. ponytail: bukan I/O nyata. */
  async function denganAksi(url: string, teks: string, fn: () => void) {
    setAksi({ url, teks });
    await new Promise((r) => setTimeout(r, 380));
    fn();
    setAksi(null);
  }

  /** Esc menutup panduan — modal tanpa jalan pintas keyboard bikin user terkunci di HP. */
  useEffect(() => {
    if (!panduan) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setPanduan(null);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [panduan]);

  /** Panduan langkah setelah menekan Lamar; nama platform ikut biar tidak generik. */
  function langkah(l: Loker) {
    const p = PLATFORM[l.platform].label;
    return [
      { judul: "Berkas siap di editor", isi: "CV & surat sudah terisi data lowongan ini. Rapikan ringkasan + skill biar lolos ATS." },
      { judul: `Kirim di ${p}`, isi: `Buka tab platform, unggah PDF dari tab Pratinjau, isi form, lalu kirim.` },
      { judul: "Catat di pelacak", isi: "Tekan “Sudah dilamar” supaya tanggal + status lamaran terlacak otomatis." },
      { judul: "Pantau & follow-up", isi: "Cek tab Pelacak tiap 5–7 hari; catat jadwal wawancara kalau dipanggil." },
    ];
  }

  /** "Lamar" = muat berkas ke editor, lalu tampilkan panduan langkah berikutnya. */
  async function lamar(l: Loker) {
    await denganAksi(l.url, "Menyiapkan berkas lamaran…", () =>
      onMuat({ position: l.posisi, company: l.perusahaan, source: PLATFORM[l.platform].label, url: l.url, description: l.teks }),
    );
    setPanduan(l);
  }

  const kunciCV = useMemo(() => kunciDariResume(resume), [resume]);
  const filter: Filter = { platform: plat, status, cek };
  const tampil = useMemo(() => saring(daftar, filter).sort((a, b) => (a.hariLalu ?? 99) - (b.hariLalu ?? 99)), [daftar, plat, status, cek]);
  const skor = useMemo(() => new Map(tampil.map((l) => [l.url, skorCocok(l, mode === "auto" ? kunciCV : [q])])), [tampil, kunciCV, mode, q]);

  function ingat(patch: Partial<{ mode: Mode; q: string; platform: PlatformId[]; status: Filter["status"] }>) {
    tulis(KEY_CARI, { mode, q, platform: plat, status, ...patch });
  }

  async function panen(target: PlatformId[], kata: string) {
    if (kata.trim().length < 2) return onToast("Isi dulu profesi/kata kuncinya (minimal 2 huruf).");
    if (!target.length) return onToast("Pilih minimal satu platform.");
    setSibuk(true);
    setDaftar([]);
    setPesan(Object.fromEntries(target.map((p) => [p, "mengambil…"])));
    const hasil = await Promise.allSettled(
      target.map(async (p) => {
        const r = await fetch(api(`/api/cari?platform=${p}&q=${encodeURIComponent(kata.trim())}`));
        const j = (await r.json()) as { loker?: Loker[]; catatan?: string; error?: { message?: string } };
        if (!r.ok) throw Object.assign(new Error(j.error?.message ?? `HTTP ${r.status}`), { platform: p });
        return { p, loker: j.loker ?? [], catatan: j.catatan ?? "" };
      }),
    );
    const semua: Loker[] = [];
    const kabar: Pesan = {};
    hasil.forEach((h, i) => {
      const p = target[i];
      if (h.status === "fulfilled") {
        semua.push(...h.value.loker);
        kabar[p] = h.value.loker.length ? `${h.value.loker.length} lowongan${h.value.catatan ? ` · ${h.value.catatan}` : ""}` : `0 lowongan — coba kata kunci lain${h.value.catatan ? ` (${h.value.catatan})` : ""}`;
      } else kabar[p] = (h.reason as Error).message ?? "gagal";
    });
    setDaftar(semua);
    setPesan(kabar);
    setSibuk(false);
    onToast(semua.length ? `${semua.length} lowongan terkumpul dari ${target.length} platform.` : "Belum ada hasil. Coba kata kunci lebih umum.");
  }

  function cariKerjaan() {
    ingat({ mode: "kerjaan", q, platform: plat, status });
    void panen(plat, q);
  }

  function cariOtomatis() {
    const kata = kunciCV[0] ?? "";
    setQ(kata);
    ingat({ mode: "auto", q: kata, platform: PLATFORM_ID, status: "semua" });
    setMode("auto");
    setPlat(PLATFORM_ID);
    setStatus("semua");
    void panen(PLATFORM_ID, kata);
  }

  async function verifikasi() {
    const target = tampil.filter((l) => !cek[l.url]).slice(0, CEK_MAKS);
    if (!target.length) return onToast("Status semua lowongan di daftar sudah diperiksa.");
    setCekSibuk(true);
    const baru = { ...cek };
    for (const l of target) {
      try {
        const r = await fetch(api(`/api/status?url=${encodeURIComponent(l.url)}`));
        const j = (await r.json()) as { status?: StatusLoker };
        baru[l.url] = j.status ?? "ragu";
      } catch {
        baru[l.url] = "ragu";
      }
      setCek({ ...baru });
    }
    tulis(KEY_CEK, baru);
    setCekSibuk(false);
    onToast(`${target.length} lowongan diperiksa lewat halaman detailnya.`);
  }

  function simpanPelacak(l: Loker) {
    const list = baca<Lamaran[]>(KEY_LAMARAN, []);
    const isi = dariJob({ position: l.posisi, company: l.perusahaan, source: PLATFORM[l.platform].label, url: l.url, description: l.teks });
    const berikut = tambah(list, isi);
    if (berikut === list) return onToast("Lowongan ini sudah ada di pelacak.");
    tulis(KEY_LAMARAN, berikut);
    onToast(`${l.perusahaan || l.posisi} masuk pelacak (${tanggal()}).`);
  }

  const kartu = (l: Loker) => {
    const k = skor.get(l.url);
    const st: StatusLoker | undefined = cek[l.url];
    return (
      <li key={l.url} className={`animate-pop rounded-2xl border border-line bg-surface2/60 p-3 ${aksi?.url === l.url ? "relative overflow-hidden" : ""}`}>
        {aksi?.url === l.url && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-surface/75 backdrop-blur-[1px]">
            <span className="relative h-1 w-28 overflow-hidden rounded-full bg-surface3">
              <span className="absolute inset-y-0 left-0 w-1/3 animate-progress rounded-full bg-brand shadow-[0_0_10px_var(--brand)]" />
            </span>
            <span className="text-[11px] font-semibold text-brand">{aksi.teks}</span>
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{l.posisi}</p>
            <p className="truncate text-xs text-mute">
              {[l.perusahaan, l.lokasi, l.gaji].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-surface3 px-2 py-0.5 text-[10px] font-semibold text-mute">{PLATFORM[l.platform].label}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          {l.tanggal && <span className="rounded-md bg-surface3 px-1.5 py-0.5 text-mute">{l.tanggal}</span>}
          {st ? (
            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${BADGE[st]}`}>{NAMA_STATUS[st]}</span>
          ) : (
            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${segar(l) ? BADGE.buka : BADGE.ragu}`}>{segar(l) ? "Kemungkinan buka" : "Lama"}</span>
          )}
          {mode === "auto" && k && k.skor > 0 && <span className="rounded-md bg-brand/12 px-1.5 py-0.5 font-semibold text-brand">cocok {k.skor}%</span>}
        </div>
        {mode === "auto" && k?.cocok.length ? <p className="mt-1 text-[10px] text-mute">Cocok di: {k.cocok.slice(0, 4).join(", ")}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Btn variant="soft" size="sm" busy={aksi?.url === l.url && aksi.teks.startsWith("Menyiapkan")} icon="briefcase" onClick={() => void lamar(l)}>
            Lamar
          </Btn>
          <Btn variant="soft" size="sm" busy={aksi?.url === l.url && aksi.teks.startsWith("Melamar")} icon="plus" onClick={() => void denganAksi(l.url, "Melamar & simpan ke pelacak…", () => simpanPelacak(l))}>
            Simpan
          </Btn>
          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface2 px-2 text-[11px] font-semibold text-ink transition hover:border-brand/40 hover:bg-surface3">
            <Icon name="link" className="size-3.5" /> Buka
          </a>
        </div>
      </li>
    );
  };

  const galat = {
    q: q.trim().length < 2,
    plat: !plat.length,
  };

  return (
    <>
    <Card
      icon="target"
      title="Cari lowongan"
      desc="Cari langsung di platform, tanpa buka tab baru."
      rightClassName="max-sm:basis-full"
      right={
        <Segmented
          className="max-sm:mx-auto max-sm:w-full max-sm:max-w-[25rem]"
          value={mode}
          onChange={(v) => {
            setMode(v);
            ingat({ mode: v });
          }}
          items={[
            { value: "kerjaan", label: "Mode kerjaan", icon: "briefcase" },
            { value: "auto", label: "Auto rekomendasi", icon: "spark" },
          ]}
        />
      }
    >
      <div className="space-y-3">
        <label className="block">
          <Label>Profesi / kata kunci</Label>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cariKerjaan()}
              placeholder="frontend developer, admin gudang, …"
              list="saran-profesi"
            />
            <datalist id="saran-profesi">
              {kunciCV.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <Btn variant="primary" icon={sibuk ? undefined : "spark"} busy={sibuk} onClick={cariKerjaan} className="shrink-0 px-3" disabled={galat.q}>
              {sibuk ? "Mencari" : "Cari"}
            </Btn>
          </div>
          {mode === "auto" && <p className="mt-1.5 text-[11px] text-mute">Saran dari CV kamu: {kunciCV.length ? kunciCV.join(" · ") : "profil masih kosong — isi posisi/keahlian di tab Profil"}</p>}
        </label>

        <div>
          <Label>Platform</Label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_ID.map((p) => {
              const on = plat.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  title={PLATFORM[p].catatan}
                  aria-pressed={on}
                  onClick={() => {
                    const berikut = on ? plat.filter((x) => x !== p) : [...plat, p];
                    setPlat(berikut);
                    ingat({ platform: berikut });
                  }}
                  className={`cursor-pointer rounded-xl border px-2.5 py-1 text-xs transition ${on ? "border-brand/50 bg-brand/12 font-semibold text-brand" : "border-line text-mute hover:bg-surface2"}`}
                >
                  {PLATFORM[p].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            className="max-sm:basis-full max-sm:mx-auto max-sm:w-full max-sm:max-w-[25rem]"
            value={status}
            onChange={(v) => {
              setStatus(v);
              ingat({ status: v });
            }}
            items={[
              { value: "semua", label: "Semua" },
              { value: "buka", label: "Masih dibuka", icon: "check" },
              { value: "tutup", label: "Sudah ditutup", icon: "x" },
            ]}
          />
          <Btn variant="soft" size="sm" icon={cekSibuk ? undefined : "eye"} busy={cekSibuk} onClick={() => void verifikasi()}>
            Cek buka/tutup
          </Btn>
          {mode === "auto" && (
            <Btn variant="soft" size="sm" icon="spark" onClick={cariOtomatis}>
              Cari otomatis dari CV
            </Btn>
          )}
        </div>

        {Object.keys(pesan).length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
            {Object.entries(pesan).map(([p, m]) => (
              <li key={p}>
                <span className="font-semibold text-ink">{PLATFORM[p as PlatformId]?.label ?? p}:</span> {m}
              </li>
            ))}
          </ul>
        )}

        {status !== "semua" && (
          <p className="text-[11px] text-mute">
            {status === "buka" ? `Dianggap masih buka: umur posting ≤ 30 hari. Tombol "Cek buka/tutup" memeriksa halaman detailnya.` : "Filter tutup hanya menampilkan lowongan yang sudah diperiksa lewat halaman detail."}
          </p>
        )}

        {sibuk && (
          <div className="space-y-2">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface3">
              <span className="absolute inset-y-0 left-0 w-1/3 animate-progress rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand">
              <Icon name="loader" className="size-3.5 animate-spin-slow" />
              {TAHAP[tahap]} <span className="font-normal text-mute">({plat.length} platform)</span>
            </p>
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-2xl border border-line bg-surface2/60 p-3">
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton mt-2 h-3 w-2/5" />
                  <div className="mt-2.5 flex gap-1.5">
                    <div className="skeleton h-5 w-14" />
                    <div className="skeleton h-5 w-20" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!sibuk &&
          (tampil.length > 0 ? (
            <ul className="space-y-2">{tampil.slice(0, 60).map(kartu)}</ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-3 text-xs text-mute">
              {daftar.length ? "Tidak ada yang cocok dengan filter ini." : "Belum ada hasil. Tulis profesi lalu tekan Cari."}
            </p>
          ))}
        {tampil.length > 60 && <p className="text-[11px] text-mute">Menampilkan 60 dari {tampil.length}. Persempit filter kalau perlu.</p>}
      </div>
    </Card>

    {/* ---- Panduan langkah setelah Lamar: bottom-sheet di HP, modal di desktop ---- */}
    {panduan && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Langkah melamar ${panduan.posisi}`}
        onClick={() => setPanduan(null)}
        className="no-print fixed inset-0 z-50 grid place-items-end overflow-y-auto overscroll-contain bg-black/45 p-3 backdrop-blur-sm sm:place-items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-up max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface p-4 text-left shadow-xl"
        >
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
              <Icon name="briefcase" className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold tracking-tight">Langkah selanjutnya</h2>
              <p className="truncate text-[11px] text-mute">
                {[panduan.posisi, panduan.perusahaan, PLATFORM[panduan.platform].label].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanduan(null)}
              aria-label="Tutup"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-mute transition hover:bg-surface2 hover:text-ink"
            >
              <Icon name="x" className="size-[18px]" />
            </button>
          </div>

          <ol className="space-y-1.5">
            {langkah(panduan).map((s, i) => (
              <li key={s.judul} className="flex gap-2.5 rounded-xl border border-line/60 bg-surface2/70 px-2.5 py-2">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    i === 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-brand/12 text-brand"
                  }`}
                >
                  {i === 0 ? <Icon name="check" className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-ink">{s.judul}</span>
                  <span className="block text-[11px] leading-snug text-mute">{s.isi}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-1.5">
            <a
              href={panduan.url}
              target="_blank"
              rel="noreferrer"
              className="orn-btn-primary inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-brandink transition duration-200 hover:brightness-110 active:scale-[0.97]"
            >
              <Icon name="link" className="size-4" /> Buka di {PLATFORM[panduan.platform].label}
            </a>
            <Btn
              variant="soft"
              icon="plus"
              onClick={() => {
                simpanPelacak(panduan);
                setPanduan(null);
              }}
            >
              Sudah dilamar
            </Btn>
            <Btn variant="ghost" onClick={() => setPanduan(null)}>
              Nanti
            </Btn>
          </div>
          <p className="text-[10px] text-mute">Berkas sudah dimuat ke editor & bisa diunduh dari tab Pratinjau.</p>
        </div>
      </div>
    )}
    </>
  );
}
