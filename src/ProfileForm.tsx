import { useRef, useState } from "react";
import { tulisProyek, tulisRingkasan } from "./lib/ai";
import type { Basics, Education, Job, Project, Resume, Skill, Work } from "./types";
import { Btn, Icon, Label, Tags, type IconName } from "./ui";
import { rapiTautan } from "./lib/tautan";
import { GH_SAYA } from "./lib/github";
import { angkaIpk } from "./lib/ipk";

/** Ganti satu baris dalam daftar tanpa membuang sisa datanya. */
function row<T extends object>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

/** String yang sudah dipangkas spasi — dipakai untuk menilai bagian terisi. */
function btrim(v?: string): string {
  return (v ?? "").trim();
}

/** Riwayat posisi/julukan yang pernah dipakai — biar lamaran berikutnya tinggal pilih. */
const POS = "lamarkerja.posisi";
function posisiTersimpan(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(POS) ?? "[]") as string[];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}
function simpanPosisi(label: string) {
  const v = label.trim();
  if (!v) return;
  const list = [v, ...posisiTersimpan().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 12);
  localStorage.setItem(POS, JSON.stringify(list));
}

/** Katalog keahlian per kategori — buat saran klik-cepat di tab, bukan batasan. */
const KATALOG: Record<string, string[]> = {
  "Teknis": [
    "React", "Next.js", "TypeScript", "JavaScript", "Tailwind CSS", "HTML", "CSS", "Vue", "Node.js", "Express",
    "REST API", "GraphQL", "Supabase", "Firebase", "PostgreSQL", "MySQL", "MongoDB", "Prisma", "PHP", "Laravel",
    "Python", "Java", "Go", "Git", "GitHub Actions", "Docker", "Linux", "Nginx", "AWS", "Cloudflare", "Redis",
    "Vitest", "Jest", "Playwright", "React Native", "Flutter", "CI/CD", "Kotlin", "Swift", "WordPress",
  ],
  "Desain & Kreatif": [
    "Figma", "Canva", "Adobe Photoshop", "Adobe Illustrator", "Desain Grafis", "UI/UX Design", "Wireframing",
    "Prototyping", "Design System", "Editing Video", "CapCut", "Premiere Pro", "Fotografi", "Videografi",
    "Motion Graphics", "Copywriting", "Content Writing", "Storytelling", "Branding", "Tipografi", "Ilustrasi",
  ],
  "Data & Analitik": [
    "Excel", "Google Sheets", "SQL", "Analisis Data", "Riset Pasar", "Data Entry", "Google Analytics",
    "Looker Studio", "Power BI", "Tableau", "Statistik", "Web Scraping", "Pivot Table", "A/B Testing",
  ],
  "Pemasaran & Sosial": [
    "SEO", "SEM", "Social Media Marketing", "Digital Marketing", "Content Creation", "Marketplace Ads",
    "Shopee Ads", "TikTok Ads", "Meta Ads", "Google Ads", "Email Marketing", "Copywriting Iklan", "KOL Management",
    "Community Management", "Affiliate Marketing",
  ],
  "Bisnis & Soft Skill": [
    "Komunikasi", "Kolaborasi Tim", "Problem Solving", "Berpikir Kritis", "Manajemen Waktu", "Kepemimpinan",
    "Public Speaking", "Presentasi", "Negosiasi", "Adaptif", "Detail-oriented", "Kreativitas", "Inisiatif",
    "Manajemen Proyek", "Agile/Scrum", "Kanban", "Jira", "Trello", "Notion", "Manajemen Stok", "Kasir/POS",
    "Customer Service", "Rekrutmen", "Pelatihan Karyawan", "Kerja Remote", "Multitasking",
  ],
  "Perkantoran": [
    "Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Google Workspace", "Google Docs",
    "Administrasi", "Kearsipan", "Surat-menyurat", "Akuntansi Dasar", "Pembukuan", "Perpajakan Dasar",
    "Input Data", "Laporan Harian", "Manajemen Agenda", "Telepon/Etiket Kantor",
  ],
  "Bahasa": ["Bahasa Indonesia", "Bahasa Inggris", "Bahasa Inggris (Aktif)", "Bahasa Mandarin", "Bahasa Jepang", "Bahasa Korea", "Bahasa Arab", "Bahasa Sunda", "Bahasa Jawa"],
};

const SARAN = Object.values(KATALOG).flat();

/** Bagian isian profil — dipisah tab biar tidak jadi satu halaman panjang. */
const BAGIAN: { v: Bagian; label: string; icon: IconName }[] = [
  { v: "diri", label: "Data diri", icon: "user" },
  { v: "keahlian", label: "Keahlian", icon: "spark" },
  { v: "kerja", label: "Pengalaman", icon: "briefcase" },
  { v: "didik", label: "Pendidikan", icon: "file" },
  { v: "proyek", label: "Proyek", icon: "code" },
];
type Bagian = "diri" | "keahlian" | "kerja" | "didik" | "proyek";
const BAGIAN_KEY = "lamarkerja.bagian";

function Sub({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="tabpane mt-4 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold tracking-wide text-mute uppercase">{title}</h3>
        <Btn onClick={onAdd} icon="plus" className="min-h-9 px-2 text-xs">
          Tambah
        </Btn>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** Satu isian berlabel — seragam dengan isian di tab Profil yang lain. */
function F(p: {
  label: string;
  value: string;
  set: (v: string) => void;
  ph?: string;
  rows?: number;
  /** Prefiks tetap di dalam kotak (mis. "IPK") — isinya cukup angka. */
  prefiks?: string;
}) {
  const isi = p.prefiks ? angkaIpk(p.value) : p.value;
  return (
    <label className="block">
      <Label>{p.label}</Label>
      {p.prefiks ? (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-semibold text-mute">
            {p.prefiks}
          </span>
          <input
            className="field"
            style={{ paddingLeft: "3rem" }}
            inputMode="decimal"
            value={isi}
            onChange={(e) => p.set(e.target.value)}
            placeholder={p.ph}
          />
        </div>
      ) : p.rows ? (
        <textarea
          rows={p.rows}
          className="field leading-relaxed"
          value={p.value}
          onChange={(e) => p.set(e.target.value)}
          placeholder={p.ph}
        />
      ) : (
        <input className="field" value={p.value} onChange={(e) => p.set(e.target.value)} placeholder={p.ph} />
      )}
    </label>
  );
}

function Box({
  i,
  onDel,
  children,
  ref,
  handle,
  gaya,
  seret,
}: {
  i: number;
  onDel: () => void;
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
  handle?: React.ReactNode;
  gaya?: React.CSSProperties;
  seret?: boolean;
}) {
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${i * 45}ms`, ...gaya }}
      className={`animate-fade-up space-y-2 rounded-xl border border-line bg-surface2/60 p-3 ${
        seret ? "relative z-20 select-none border-brand/40 shadow-lg shadow-brand/10" : ""
      }`}
    >
      {children}
      <div className="flex items-center justify-between gap-2">
        {handle ?? <span />}
        <Btn variant="danger" icon="trash" onClick={onDel} className="min-h-9 px-2 text-xs">
          Hapus
        </Btn>
      </div>
    </div>
  );
}

let noKartu = 0;

/** Kunci React yang stabil per kartu: tidak berubah saat mengetik, ikut berpindah saat diurut ulang. */
function kunciBaru(n: number): number[] {
  return Array.from({ length: n }, () => {
    noKartu += 1;
    return noKartu;
  });
}

/** Daftar isian yang bisa diurut ulang: tahan tombol "Geser" lalu geser. Pointer events → jalan di HP & desktop, animasi FLIP, tanpa dependensi. */
function Bagian<T extends object>({
  title,
  items,
  set,
  kosong,
  kosongTeks,
  render,
}: {
  title: string;
  items: T[];
  set: (next: T[]) => void;
  kosong: () => T;
  kosongTeks: string;
  render: (item: T, ubah: (patch: Partial<T>) => void, i: number) => React.ReactNode;
}) {
  const simpul = useRef<(HTMLDivElement | null)[]>([]);
  const wadah = useRef<HTMLDivElement | null>(null);
  const [pegang, setPegang] = useState<{ i: number; y0: number; dy: number } | null>(null);
  const [kunci, setKunci] = useState<number[]>(() => kunciBaru(items.length));

  // Item yang datang dari luar (impor profil, merge proyek GitHub) dapat kunci cadangan dari posisinya.
  const kunciSiap = items.map((_, i) => kunci[i] ?? -(i + 1));

  /** Geser halus (FLIP): ukur posisi lama → ganti data → mainkan selisihnya. `dari`/`ke` = kartu yang sedang dipegang. */
  const atur = (next: T[], mutasi: () => void, dari?: number, ke?: number) => {
    const lama = new Map<T, number>();
    items.forEach((it, i) => {
      const el = simpul.current[i];
      if (el) lama.set(it, el.getBoundingClientRect().top);
    });
    const nodePegang = dari === undefined ? undefined : simpul.current[dari];
    const atasPegang = nodePegang?.getBoundingClientRect().top ?? 0;
    const dipegang = dari === undefined ? undefined : items[dari];
    mutasi();
    requestAnimationFrame(() => {
      next.forEach((it, i) => {
        if (it === dipegang) return;
        const el = simpul.current[i];
        const atas = lama.get(it);
        if (!el || atas === undefined) return;
        const dy = atas - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
      });
      if (nodePegang && ke !== undefined) {
        // Kartu yang dipegang ikut pindah posisi DOM: geser titik pegangnya supaya tetap di bawah jari.
        const d = nodePegang.getBoundingClientRect().top - atasPegang;
        if (d) setPegang((p) => (p ? { ...p, i: ke, y0: p.y0 + d } : p));
      }
    });
  };

  const tambah = () => {
    setKunci([...kunciBaru(1), ...kunciSiap]);
    const next = [kosong(), ...items];
    atur(next, () => set(next));
  };

  const hapus = (i: number) => {
    setKunci(kunciSiap.filter((_, j) => j !== i));
    const next = items.filter((_, j) => j !== i);
    atur(next, () => set(next));
  };

  const pegangan = (i: number) => ({
    // Capture dipasang di WADAH daftar, bukan di tombolnya: saat diurut ulang tombol berpindah DOM → capture-nya lepas di tengah jalan.
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      wadah.current?.setPointerCapture(e.pointerId);
      setPegang({ i, y0: e.clientY, dy: 0 });
    },
  });

  /** Dipasang di wadah daftar → gerakan tetap sampai walau kartu yang dipegang berpindah posisi. */
  const gerak = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pegang) return;
    const dy = e.clientY - pegang.y0;
    const tengah = simpul.current.map((el, j) => {
      const r = el?.getBoundingClientRect();
      const t = r ? r.top + r.height / 2 : 0;
      return j === pegang.i ? t - pegang.dy : t; // buang pengaruh transform kartu yang dipegang
    });
    let ke = 0;
    tengah.forEach((t, j) => {
      if (j !== pegang.i && t < e.clientY) ke += 1;
    });
    if (ke === pegang.i) {
      setPegang({ ...pegang, dy });
      return;
    }
    const k = [...kunciSiap];
    const kk = k.splice(pegang.i, 1)[0];
    k.splice(ke, 0, kk);
    setKunci(k);
    const next = [...items];
    const it = next.splice(pegang.i, 1)[0];
    next.splice(ke, 0, it);
    atur(next, () => set(next), pegang.i, ke);
  };

  const lepas = () => setPegang(null);

  return (
    <Sub title={title} onAdd={tambah}>
      {items.length === 0 && <Empty text={kosongTeks} />}
      <div ref={wadah} onPointerMove={gerak} onPointerUp={lepas} onPointerCancel={lepas} className="space-y-2">
        {items.map((it, i) => {
          const dipegang = pegang !== null && items[pegang.i] === it;
          return (
            <Box
              key={kunciSiap[i]}
              ref={(el) => {
                simpul.current[i] = el;
              }}
              i={i}
              seret={dipegang}
              gaya={dipegang ? { transform: `translateY(${pegang.dy}px)`, transition: "none" } : undefined}
              onDel={() => hapus(i)}
              handle={
                <button
                  type="button"
                  aria-label="Ubah urutan — tahan lalu geser"
                  title="Tahan lalu geser untuk mengubah urutan"
                  className="flex min-h-9 cursor-grab touch-none items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-[11px] text-mute active:cursor-grabbing"
                  {...pegangan(i)}
                >
                  <Icon name="grip" className="size-4" />
                  Geser
                </button>
              }
            >
              {render(it, (patch) => set(row(items, i, patch)), i)}
            </Box>
          );
        })}
      </div>
    </Sub>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-xs text-mute">
      <Icon name="alert" className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** Form isian profil — pengganti edit JSON manual. Struktur tetap JSON Resume. */
export function ProfileForm({
  r,
  job,
  on,
  onToast,
  saran = [],
}: {
  r: Resume;
  job?: Job;
  on: (r: Resume) => void;
  onToast?: (s: string) => void;
  saran?: string[];
}) {
  const b = (p: Partial<Basics>) => on({ ...r, basics: { ...r.basics, ...p } });
  const keywords = r.skills.flatMap((s: Skill) => s.keywords);
  const [posisi, setPosisi] = useState(posisiTersimpan);
  const [busy, setBusy] = useState("");
  const [aiErr, setAiErr] = useState("");
  const opsi = [...new Set([...(job?.position ? [job.position] : []), ...posisi])];
  const [bagian, setBagian] = useState<Bagian>(() => {
    const v = localStorage.getItem(BAGIAN_KEY);
    return BAGIAN.some((b) => b.v === v) ? (v as Bagian) : "diri";
  });
  const tabref = useRef<HTMLDivElement>(null);
  const jumlah: Record<string, number> = {
    keahlian: keywords.length,
    kerja: r.work.length,
    didik: r.education.length,
    proyek: r.projects.length,
  };
  /** Bagian dianggap terisi kalau ada isi yang benar-benar muncul di CV — bukan sekadar baris kosong. */
  const isi: Record<Bagian, boolean> = {
    diri: !!btrim(r.basics.name) && !!(btrim(r.basics.email) || btrim(r.basics.phone)),
    keahlian: keywords.length > 0,
    kerja: r.work.some((w: Work) => !!btrim(w.company) || !!btrim(w.position)),
    didik: r.education.some((e: Education) => !!btrim(e.school) || !!btrim(e.degree)),
    proyek: r.projects.some((p: Project) => !!btrim(p.name)),
  };
  const terisi = BAGIAN.filter((t) => isi[t.v]).length;
  const persen = Math.round((terisi / BAGIAN.length) * 100);

  /** Ganti bagian: simpan pilihan + tarik baris tab ke atas biar tidak nyasar di tengah halaman. */
  function buka(v: Bagian) {
    setBagian(v);
    localStorage.setItem(BAGIAN_KEY, v);
    const el = tabref.current;
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    // chip aktif ikut digeser ke tengah strip; block "nearest" biar halaman tak ikut lompat
    el?.querySelector<HTMLElement>(`[data-v="${v}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  const jalankan = async (kunci: string, aksi: () => Promise<string>, terapkan: (t: string) => void) => {
    setBusy(kunci);
    setAiErr("");
    try {
      terapkan(await aksi());
      onToast?.("Ditulis pakai AI.");
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={terisi}
          aria-valuemin={0}
          aria-valuemax={BAGIAN.length}
          aria-label="Kelengkapan profil"
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface3"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${terisi === BAGIAN.length ? "bg-brand" : "bg-accent"}`}
            style={{ width: `${persen}%` }}
          />
        </div>
        <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${terisi === BAGIAN.length ? "text-brand" : "text-mute"}`}>
          {terisi === BAGIAN.length ? "Profil lengkap ✓" : `${terisi}/${BAGIAN.length} bagian terisi`}
        </span>
      </div>

      <div
        ref={tabref}
        className="tabrow sticky top-[7.5rem] z-10 -mx-4 scroll-mt-[7.5rem] bg-surface px-4 pt-1.5 pb-2 lg:top-[3.75rem] lg:scroll-mt-[3.75rem]"
        role="tablist"
        aria-label="Bagian profil"
      >
        {BAGIAN.map((t) => {
          const on = t.v === bagian;
          const n = jumlah[t.v] ?? 0;
          return (
            <button
              key={t.v}
              role="tab"
              data-v={t.v}
              aria-selected={on}
              onClick={() => buka(t.v)}
              className={`inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition duration-200 outline-offset-2 outline-brand focus-visible:outline-2 active:scale-[0.97] sm:min-h-11 sm:px-3 sm:text-xs lg:min-h-9 ${
                on ? "border-transparent bg-brand text-brandink shadow-sm" : "border-line bg-surface2 text-mute hover:bg-surface3 hover:text-ink"
              }`}
            >
              <Icon name={t.icon} className="hidden size-4 sm:block" />
              {t.label}
              {n > 0 ? (
                <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${on ? "bg-brandink/20" : "bg-surface3 text-mute"}`}>{n}</span>
              ) : isi[t.v] ? (
                <Icon name="check" className="size-3.5" />
              ) : null}
            </button>
          );
        })}
      </div>

      {bagian === "diri" && (
        <div className="tabpane space-y-3">
      <label className="block">
        <Label>Nama lengkap</Label>
        <input
          className="field"
          autoComplete="name"
          value={r.basics.name}
          onChange={(e) => b({ name: e.target.value })}
          placeholder="Nama lengkap"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label>Posisi / julukan</Label>
          <input
            className="field"
            list="posisi-tersimpan"
            value={r.basics.label}
            onChange={(e) => b({ label: e.target.value })}
            onBlur={() => {
              simpanPosisi(r.basics.label);
              setPosisi(posisiTersimpan());
            }}
            placeholder="Frontend Developer"
          />
          <datalist id="posisi-tersimpan">
            {opsi.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] text-mute">Pernah dipakai tersimpan — klik untuk pakai ulang.</span>
        </label>
        <label className="block">
          <Label>Email</Label>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={r.basics.email}
            onChange={(e) => b({ email: e.target.value })}
            placeholder="nama@email.com"
          />
        </label>
        <label className="block">
          <Label>No. HP</Label>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={r.basics.phone}
            onChange={(e) => b({ phone: e.target.value })}
            placeholder="0812xxxxxxx"
          />
        </label>
        <label className="block">
          <Label>Kota</Label>
          <input className="field" value={r.basics.city} onChange={(e) => b({ city: e.target.value })} placeholder="Bandung" />
        </label>
        <label className="block">
          <Label>LinkedIn (opsional)</Label>
          <input
            className="field"
            value={r.basics.linkedin ?? ""}
            onChange={(e) => b({ linkedin: e.target.value })}
            onBlur={(e) => b({ linkedin: rapiTautan(e.target.value) })}
            placeholder="linkedin.com/in/nama"
          />
        </label>
        <label className="block">
          <Label>GitHub / situs (opsional)</Label>
          <input
            className="field"
            value={r.basics.github ?? ""}
            onChange={(e) => b({ github: e.target.value })}
            onBlur={(e) => b({ github: rapiTautan(e.target.value) })}
            placeholder={`github.com/${GH_SAYA}`}
          />
        </label>
      </div>

      <div className="block">
        <div className="flex items-end justify-between gap-2">
          <Label>Ringkasan diri</Label>
          <Btn
            className="mb-1 min-h-9 px-2 text-[11px]"
            icon="spark"
            busy={busy === "ringkas"}
            onClick={() =>
              jalankan(
                "ringkas",
                // sudah ada isi = user minta versi baru → lewati cache
                () =>
                  tulisRingkasan(
                    r,
                    job ?? { position: "", company: "", source: "", description: "" },
                    undefined,
                    r.basics.summary.trim().length > 0,
                  ),
                (t) => b({ summary: t }),
              )
            }
          >
            Tulis pakai AI
          </Btn>
        </div>
        <textarea
          rows={4}
          className="field leading-relaxed"
          value={r.basics.summary}
          onChange={(e) => b({ summary: e.target.value })}
          placeholder="2–3 kalimat: siapa kamu, berapa tahun pengalaman, hal yang paling kamu kuasai."
        />
        <span className="mt-1 block text-[11px] text-mute">Muncul di bagian paling atas CV. AI menyesuaikan dengan JD di tab Lowongan.</span>
      </div>
        </div>
      )}

      {bagian === "keahlian" && (
      <div className="tabpane block">
        <Label>Keahlian (Enter/Tab untuk menempel)</Label>
        <Tags
          value={keywords}
          onChange={(v) => on({ ...r, skills: [{ name: "Keahlian", keywords: v }] })}
          saran={[...new Set([...saran, ...SARAN])]}
          katalog={{ ...(saran.length ? { "Dari lowongan": [...new Set(saran)] } : {}), ...KATALOG }}
          placeholder="React, TypeScript, Tailwind…"
        />
        <span className="mt-1 block text-[11px] text-mute">Klik chip di bawah untuk masuk, klik lagi (atau ×) untuk keluar. Bisa juga ketik bebas lalu Enter.</span>
      </div>
      )}

      {aiErr && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 p-2.5 text-xs text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {aiErr}
        </p>
      )}

      {bagian === "kerja" && (
      <Bagian
        title="Pengalaman kerja"
        items={r.work}
        set={(work) => on({ ...r, work })}
        kosong={() => ({ company: "", position: "", start: "", end: "", highlights: [] })}
        kosongTeks="Belum ada pengalaman. Tambah supaya bagian Pengalaman Kerja muncul di CV."
        render={(w: Work, ubah) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <F label="Jabatan" value={w.position} set={(v) => ubah({ position: v })} ph="mis. Frontend Developer" />
              <F label="Perusahaan" value={w.company} set={(v) => ubah({ company: v })} ph="mis. PT Nusantara Digital" />
              <F label="Mulai" value={w.start} set={(v) => ubah({ start: v })} ph="2022-01" />
              <F label="Selesai" value={w.end} set={(v) => ubah({ end: v })} ph="sekarang" />
            </div>
            <F
              label="Pencapaian (satu baris satu poin)"
              value={w.highlights.join("\n")}
              set={(v) => ubah({ highlights: v.split("\n") })}
              rows={3}
              ph={"memangkas waktu load 40%\nmenangani 30+ endpoint API"}
            />
          </>
        )}
      />
      )}

      {bagian === "didik" && (
      <Bagian
        title="Pendidikan"
        items={r.education}
        set={(education) => on({ ...r, education })}
        kosong={() => ({ school: "", degree: "", start: "", end: "", note: "" })}
        kosongTeks="Belum ada pendidikan."
        render={(e: Education, ubah) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <F label="Sekolah / kampus" value={e.school} set={(v) => ubah({ school: v })} ph="mis. Universitas Teknologi Indonesia" />
            <F label="Jurusan / gelar" value={e.degree} set={(v) => ubah({ degree: v })} ph="mis. S1 Teknik Informatika" />
            <F label="Mulai" value={e.start} set={(v) => ubah({ start: v })} ph="2017" />
            <F label="Selesai" value={e.end} set={(v) => ubah({ end: v })} ph="2021" />
            <F
              label="IPK (opsional)"
              prefiks="IPK"
              value={e.note ?? ""}
              set={(v) => ubah({ note: v })}
              ph="3,45"
            />
          </div>
        )}
      />
      )}

      {bagian === "proyek" && (
      <Bagian
        title="Proyek / portofolio"
        items={r.projects}
        set={(projects) => on({ ...r, projects })}
        kosong={() => ({ name: "", url: "", description: "" })}
        kosongTeks="Belum ada proyek. Portofolio menaikkan peluang dipanggil."
        render={(p: Project, ubah, i) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <F label="Nama proyek" value={p.name} set={(v) => ubah({ name: v })} ph="mis. Kasirku" />
              <label className="block">
                <Label>Link (opsional)</Label>
                <input
                  className="field"
                  value={p.url ?? ""}
                  onChange={(e) => ubah({ url: e.target.value })}
                  onBlur={(e) => ubah({ url: rapiTautan(e.target.value) })}
                  placeholder="github.com/M4sr/kasirku"
                />
              </label>
            </div>
            <F
              label="Deskripsi"
              value={p.description}
              set={(v) => ubah({ description: v })}
              rows={2}
              ph="Satu-dua kalimat: apa yang dibangun dan pakai teknologi apa"
            />
            <div className="flex justify-end">
              <Btn
                className="min-h-9 px-2 text-[11px]"
                icon="spark"
                busy={busy === `proyek${i}`}
                disabled={!p.name.trim()}
                onClick={() =>
                  jalankan(
                    `proyek${i}`,
                    () => tulisProyek({ name: p.name, bahan: p.description }, job?.description ?? "", undefined, p.description.trim().length > 0),
                    (t) => ubah({ description: t }),
                  )
                }
              >
                Deskripsi AI
              </Btn>
            </div>
          </>
        )}
      />
      )}
    </div>
  );
}
