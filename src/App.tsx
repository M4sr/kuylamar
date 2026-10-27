import { useEffect, useMemo, useRef, useState } from "react";
import { GithubPicker } from "./GithubPicker";
import { emptyJob, sampleResume } from "./data/sample";
import { aiCfg, bahanRepo, cekAi, haluskanSurat, simpanAi, tulisProyekBanyak, type AiCfg } from "./lib/ai";
import { namaBerkas } from "./lib/berkas";
import { atsScore, atsWarnings } from "./lib/ats";
import { buildLetter, type Letter } from "./lib/cover";
import Email, { type Seed } from "./Email";
import { gantiOtomatis, ghUser, loadRepos, mergeProjects, pilihOtomatis, repoToProject } from "./lib/github";
import Pelacak from "./Pelacak";
import type { Lamaran } from "./lib/pelacak";
import { ProfileForm } from "./ProfileForm";
import Cari from "./Cari";
import { rapiTautan } from "./lib/tautan";
import { CoverLetterDoc } from "./templates/CoverLetterDoc";
import { ResumeDoc } from "./templates/ResumeDoc";
import { Btn, Card, Icon, IconBtn, Konfirmasi, Label, Logo, Segmented, Switch, type IconName } from "./ui";
import type { Job, Resume } from "./types";

const KEY = "lamarkerja.v2";
const THEME = "lamarkerja.theme";
const AUTO = "lamarkerja.autoproj";
/** Hasil edit manual dokumen di pratinjau (HTML) — dipakai saat cetak, menang atas hasil generate. */
const OVR = "lamarkerja.dokumen";
type Target = "cv" | "letter" | "both";
type Tab = "lowongan" | "profil" | "lamaran" | "email" | "pratinjau";
type SubLow = "link" | "cari";

/** Menu tab — dipakai Segmented (HP) dan sidebar mini (desktop). */
const MENU: { value: Tab; label: string; icon: IconName }[] = [
  { value: "lowongan", label: "Lowongan", icon: "briefcase" },
  { value: "profil", label: "Profil", icon: "user" },
  { value: "lamaran", label: "Lamaran", icon: "target" },
  { value: "email", label: "Email", icon: "mail" },
  { value: "pratinjau", label: "Pratinjau", icon: "eye" },
];

/** Dua kartu di tab Lowongan dipisah jadi dua sub-tab, biar tidak saling menumpuk. */
const MENU_LOW: { value: SubLow; label: string; icon: IconName }[] = [
  { value: "link", label: "Tempel link", icon: "link" },
  { value: "cari", label: "Cari lowongan", icon: "target" },
];
const SUBLOW = "lamarkerja.lowongan-tab";

/** Data lama masih menyimpan "https://" utuh — rapikan sekali saat dibaca. */
function bersihkan(resume: Resume): Resume {
  const t = rapiTautan;
  return {
    ...resume,
    basics: { ...resume.basics, linkedin: t(resume.basics.linkedin), github: t(resume.basics.github), url: t(resume.basics.url) },
    projects: resume.projects.map((p) => ({ ...p, url: t(p.url) })),
  };
}

function load(): { resume: Resume; job: Job } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as { resume: Resume; job: Job };
      return { ...data, resume: bersihkan(data.resume) };
    }
  } catch {
    /* data rusak -> pakai contoh */
  }
  return { resume: sampleResume, job: emptyJob };
}

/** Tombol format mode edit. execCommand sudah deprecated tapi masih jalan di semua browser modern. */
const ALAT: [cmd: string, val: string, label: string, judul: string][] = [
  ["undo", "", "↶", "Batalkan (Ctrl+Z)"],
  ["redo", "", "↷", "Ulangi (Ctrl+Y)"],
  ["bold", "", "B", "Tebal (Ctrl+B)"],
  ["italic", "", "I", "Miring (Ctrl+I)"],
  ["underline", "", "U", "Garis bawah (Ctrl+U)"],
  ["strikeThrough", "", "S", "Coret (strikethrough)"],
  ["insertUnorderedList", "", "•", "Daftar berbutir"],
  ["insertOrderedList", "", "1.", "Daftar bernomor"],
  ["outdent", "", "⇤", "Kurangi indentasi"],
  ["indent", "", "⇥", "Tambah indentasi"],
  ["justifyLeft", "", "Kiri", "Rata kiri"],
  ["justifyCenter", "", "Tengah", "Rata tengah"],
  ["justifyRight", "", "Kanan", "Rata kanan"],
  ["justifyFull", "", "Rata2", "Rata kiri-kanan (justify)"],
  ["insertHorizontalRule", "", "―", "Garis pemisah"],
  ["removeFormat", "", "Bersihkan", "Hapus format teks terpilih"],
];

/** Format blok (paragraf/heading) — dijalankan lewat formatBlock. */
const BLOK: [val: string, label: string][] = [
  ["p", "Paragraf"],
  ["h1", "Judul 1"],
  ["h2", "Judul 2"],
  ["h3", "Judul 3"],
  ["blockquote", "Kutipan"],
];

/** Ukuran huruf Word-style; execCommand fontSize pakai skala 1–7 (3 = normal). */
/** Platform yang dikenali /api/job + status jalurnya (dipakai modal info). */
const PLATFORM: [nama: string, domain: string, status: "langsung" | "browser" | "manual"][] = [
  ["JobStreet", "id.jobstreet.com", "langsung"],
  ["LinkedIn", "linkedin.com", "langsung"],
  ["Kalibrr", "kalibrr.id", "langsung"],
  ["Dealls", "dealls.com", "langsung"],
  ["Lever", "lever.co", "langsung"],
  ["Greenhouse", "greenhouse.io", "langsung"],
  ["Glints", "glints.com", "browser"],
  ["Indeed", "id.indeed.com", "manual"],
];

const STATUS = {
  langsung: { label: "Langsung", cls: "bg-emerald-500/15 text-emerald-500" },
  browser: { label: "Via browser", cls: "bg-amber-500/15 text-amber-500" },
  manual: { label: "Manual", cls: "bg-rose-500/15 text-rose-500" },
} as const;

const UKURAN: [val: string, label: string][] = [
  ["2", "Kecil"],
  ["3", "Normal"],
  ["5", "Besar"],
  ["6", "Besar sekali"],
];

export default function App() {
  const [{ resume, job }, set] = useState(load);
  const [draft, setDraft] = useState(() => JSON.stringify(load().resume, null, 2));
  const [err, setErr] = useState("");
  const [jobErr, setJobErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target>("cv");
  const [mini, setMini] = useState(() => window.innerWidth < 1024);
  const [jsonMode, setJsonMode] = useState(false);
  const [tab, setTab] = useState<Tab>("lowongan");
  const [subLow, setSubLow] = useState<SubLow>(() => (localStorage.getItem(SUBLOW) === "cari" ? "cari" : "link"));
  const [infoPlat, setInfoPlat] = useState(false);
  /** Dialog "Keluar" sendiri — window.confirm tampil sebagai popup sistem yang tak bisa ditata. */
  const [tanyaKeluar, setTanyaKeluar] = useState(false);
  const [toast, setToast] = useState("");
  /** Permintaan dari pelacak: buka tab Email dengan jenis & lowongan tertentu. */
  const [emailSeed, setEmailSeed] = useState<Seed | null>(null);
  const [autoOn, setAutoOn] = useState(() => localStorage.getItem(AUTO) !== "off");
  const [autoNote, setAutoNote] = useState("");
  const [ai, setAi] = useState<AiCfg>(aiCfg);
  const [aiPesan, setAiPesan] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  /** Hasil parafrase AI untuk surat (hanya pembuka & penutup; isi P2 tetap deterministik biar kata kunci JD utuh). */
  const [suratAi, setSuratAi] = useState<{ kunci: string; p1: string; p3: string } | null>(null);
  const [suratBusy, setSuratBusy] = useState(false);
  const autoUrls = useRef<string[]>([]);
  const panah = useRef<HTMLElement>(null);
  const autoRun = useRef(0);
  const [editOn, setEditOn] = useState(false);
  const [ovr, setOvr] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OVR) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  /** Isi HTML tiap dokumen saat mode edit — dipakai sekali saat masuk mode, bukan tiap ketikan (kursor tidak lompat). */
  const [isi, setIsi] = useState<Record<string, string>>({});
  /** Elemen <section class="sheet"> tiap dokumen — sumber HTML saat mode edit disimpan. */
  const kertas = useRef<Record<string, HTMLElement | null>>({ cv: null, letter: null });
  /** Dokumen yang terakhir diklik — tombol format & simpan berlaku untuk yang ini. */
  const fokus = useRef<"cv" | "letter">("cv");
  const simpanTmr = useRef<number | undefined>(undefined);
  const ovrRef = useRef(ovr);
  useEffect(() => {
    ovrRef.current = ovr;
  }, [ovr]);
  const [dark, setDark] = useState(() => localStorage.getItem(THEME) ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark === "dark");
    localStorage.setItem(THEME, dark);
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ resume, job }));
  }, [resume, job]);

  /** Ctrl/Cmd+S: simpan paksa + umpan balik. Autosave di atas jalan diam-diam. */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      localStorage.setItem(KEY, JSON.stringify({ resume, job }));
      setToast("Tersimpan di browser kamu");
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [resume, job]);

  // Esc buat nutup modal platform
  useEffect(() => {
    if (!infoPlat) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setInfoPlat(false);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [infoPlat]);

  /**
   * Auto-pasang proyek GitHub paling relevan ke CV begitu JD / username GitHub siap.
   * Hanya menyentuh proyek yang dia sendiri pasang (autoUrls) — proyek manual aman.
   */
  useEffect(() => {
    const user = ghUser(resume.basics.github ?? "");
    const id = ++autoRun.current;
    const lepas = () => {
      const lama = autoUrls.current;
      autoUrls.current = [];
      if (lama.length) set((s) => ({ ...s, resume: { ...s.resume, projects: s.resume.projects.filter((p) => !p.url || !lama.includes(p.url)) } }));
    };

    if (!autoOn || !user) {
      lepas();
      return;
    }

    const t = setTimeout(async () => {
      setAutoNote("Mencari proyek paling relevan…");
      try {
        const list = await loadRepos(user);
        if (autoRun.current !== id) return;
        const top = pilihOtomatis(list, job.description);
        if (top.length === 0) {
          lepas();
          setAutoNote("Belum ada repo yang cukup nyambung — pilih manual di bawah.");
          return;
        }
        set((s) => {
          const hasil = gantiOtomatis(s.resume.projects, autoUrls.current, top.map((r) => repoToProject(r.repo)));
          autoUrls.current = hasil.urls;
          return { ...s, resume: { ...s.resume, projects: hasil.projects } };
        });
        setAutoNote(
          job.description.trim()
            ? `${top.length} proyek relevan terpasang otomatis (${top.map((r) => `${r.score}%`).join(" · ")}).`
            : `${top.length} proyek paling layak pamer terpasang otomatis (JD belum diisi).`,
        );

        // Deskripsi proyek ditulis AI kalau endpoint-nya hidup; gagal → biarkan deskripsi dari GitHub.
        const ditulis = await tulisProyekBanyak(
          top.map((r) => ({
            url: r.repo.html_url,
            name: r.repo.name,
            tech: [...(r.repo.language ? [r.repo.language] : []), ...(r.repo.topics ?? [])],
            bahan: bahanRepo(r.repo),
          })),
          job.description,
        );
        if (autoRun.current !== id || ditulis.length === 0) return;
        const peta = new Map(ditulis.map((d) => [d.proyek.url, d.deskripsi]));
        set((s) => ({
          ...s,
          resume: {
            ...s.resume,
            projects: s.resume.projects.map((p) => (p.url && peta.has(p.url) ? { ...p, description: peta.get(p.url)! } : p)),
          },
        }));
        setAutoNote((n) => `${n} Deskripsi proyek ditulis AI (${ditulis.length}).`);
      } catch (e) {
        if (autoRun.current === id) setAutoNote(`Gagal ambil repo: ${(e as Error).message}`);
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [autoOn, resume.basics.github, job.description]);

  /* Bisa dihitung saat render — tidak perlu disimpan di state. */
  const catatanRepo = !autoOn
    ? ""
    : ghUser(resume.basics.github ?? "")
      ? autoNote
      : "Isi username GitHub di profil → proyek relevan masuk CV sendiri.";

  /** 1 klik = 1 link: ambil posisi/perusahaan/deskripsi dari halaman lowongan. */
  async function ambil() {
    const url = (job.url ?? "").trim();
    if (!url) return setJobErr("Tempel link lowongan dulu.");
    setBusy(true);
    setJobErr("");
    try {
      // URL absolut tanpa kredensial: fetch() relatif mati kalau halaman dibuka lewat gate
      // basic-auth (URL memuat user:pass). Kredensial tetap terkirim dari cache browser.
      const alamat = new URL(`/api/job?url=${encodeURIComponent(url)}`, location.href);
      alamat.username = "";
      alamat.password = "";
      const res = await fetch(alamat);
      const data = (await res.json()) as Partial<Job> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Gagal mengambil data (HTTP ${res.status}).`);
      set((s) => ({ ...s, job: { ...s.job, ...data, url } }));
      setToast("Data lowongan terisi otomatis.");
    } catch (e) {
      setJobErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ats = useMemo(() => atsScore(resume, job.description), [resume, job.description]);
  const warn = useMemo(() => atsWarnings(resume), [resume]);
  const letter = useMemo(() => buildLetter(resume, job, ats), [resume, job, ats]);

  /** Hasil AI terikat pada satu lowongan — ganti perusahaan/posisi otomatis balik ke versi template. */
  const kunciSurat = `${job.company ?? ""}|${job.position ?? ""}`;
  const suratAiAktif = suratAi?.kunci === kunciSurat ? suratAi : null;
  const letterTampil: Letter = suratAiAktif
    ? { ...letter, paragraphs: [suratAiAktif.p1, ...letter.paragraphs.slice(1, -1), suratAiAktif.p3] }
    : letter;

  /** Rapikan surat pakai AI 9router; kalau AI menambah fakta, hasilnya ditolak dan template dipakai. */
  async function haluskan() {
    setSuratBusy(true);
    try {
      const h = await haluskanSurat(letter, job, ai, Boolean(suratAiAktif)); // sudah pernah dirapikan → klik ulang minta versi baru
      setSuratAi({ kunci: kunciSurat, ...h });
      setToast("Surat dirapikan AI — baca dulu sebelum dikirim.");
    } catch (e) {
      setSuratAi(null);
      setToast((e as Error).message);
    } finally {
      setSuratBusy(false);
    }
  }

  function applyDraft(text = draft) {
    try {
      const parsed = JSON.parse(text) as Resume;
      if (!parsed.basics || !parsed.basics.name) throw new Error("Profil butuh field basics.name");
      setErr("");
      set((s) => ({ ...s, resume: parsed }));
      setToast("Profil diterapkan.");
    } catch (e) {
      setErr(`JSON profil tidak valid: ${(e as Error).message}`);
    }
  }

  /** Pindah tab: posisi scroll direset, jadi halaman tidak "nyangkut" di tengah konten baru. */
  function pindahTab(t: Tab) {
    setTab(t);
    panah.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /** Mode mini (HP): CV + surat jadi thumbnail satu layar; ketuk untuk buka ukuran penuh. */
  function bukaPenuh(t: "cv" | "letter") {
    setTarget(t);
    setMini(false);
  }

  /**
   * Mode edit dokumen: kertas jadi contentEditable. HTML hasil generate diambil apa adanya
   * sebagai titik awal, lalu disunting sebagai string — React tidak ikut menulis ulang isinya
   * supaya posisi kursor tidak melompat.
   */
  function simpan(t: "cv" | "letter") {
    const html = kertas.current[t]?.firstElementChild?.innerHTML;
    if (html == null) return;
    const next = { ...ovrRef.current, [t]: html };
    ovrRef.current = next;
    localStorage.setItem(OVR, JSON.stringify(next));
    setOvr(next);
  }

  function mulaiEdit() {
    const d: Record<string, string> = {};
    for (const t of ["cv", "letter"] as const) d[t] = ovr[t] ?? kertas.current[t]?.firstElementChild?.innerHTML ?? "";
    setIsi(d);
    setEditOn(true);
    setMini(false);
    setToast("Mode edit aktif — klik teksnya lalu tulis. Ctrl+B / Ctrl+I / Ctrl+U buat format.");
  }

  function sudahiEdit() {
    simpan(fokus.current);
    setEditOn(false);
    setToast("Suntingan dokumen disimpan.");
  }

  /** Buang suntingan manual; dokumen kembali dibuat otomatis dari profil + lowongan. */
  function otomatis(t?: "cv" | "letter") {
    const next = { ...ovrRef.current };
    if (t) delete next[t];
    else {
      delete next.cv;
      delete next.letter;
    }
    ovrRef.current = next;
    localStorage.setItem(OVR, JSON.stringify(next));
    setOvr(next);
    setEditOn(false);
    setToast(t ? "Dokumen itu kembali otomatis." : "CV & surat kembali otomatis dari profil.");
  }

  /**
   * Seleksi terakhir di kertas. Tombol toolbar merebut fokus browser, jadi range-nya harus
   * disimpan dulu dan dipasang balik sebelum format dijalankan.
   */
  const sel = useRef<Range | null>(null);

  function jagaSel() {
    const s = document.getSelection();
    sel.current = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  }

  /**
   * Jalankan perintah format ke dokumen yang sedang disorot.
   * val kosong = perintah tanpa argumen (bold, indent, dst).
   */
  function perintah(cmd: string, val = "") {
    const s = document.getSelection();
    if (s && sel.current) {
      s.removeAllRanges();
      s.addRange(sel.current);
    }
    document.execCommand(cmd, false, val);
    simpan(fokus.current);
  }

  /** Tautan: Word-style prompt. Protokol dibuang mengikuti gaya link CV yang polos. */
  function tautan() {
    const url = window.prompt("Alamat tautan (tanpa https://)");
    if (!url) return;
    perintah("createLink", url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, ""));
  }

  function print(t: Target) {
    if (editOn) {
      simpan(fokus.current);
      setEditOn(false);
    }
    setTarget(t);
    // Judul dokumen = nama berkas default di dialog "Simpan sebagai PDF" (tanpa ini semua hasil cetak bernama sama).
    const judul = document.title;
    document.title = namaBerkas(t, resume.basics.name, job.company ?? "");
    window.addEventListener("afterprint", () => { document.title = judul; }, { once: true });
    setTimeout(() => window.print(), 60);
  }

  const cls = (t: "cv" | "letter") => `sheet ${target === "both" || target === t ? "" : "inactive"}`;
  const score = ats.score;
  const tone = score >= 60 ? "text-brand" : score >= 35 ? "text-accent" : "text-danger";
  const bar = score >= 60 ? "bg-brand" : score >= 35 ? "bg-accent" : "bg-danger";
  const setJob = (p: Partial<Job>) => set((s) => ({ ...s, job: { ...s.job, ...p } }));

  return (
    <div className="min-h-dvh text-ink">
      {/* ---- Header ---- */}
      <header className="orn-header no-print sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 items-center gap-3 px-4 sm:px-5">
          <Logo className="orn-btn-primary size-9 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-sm leading-tight font-extrabold tracking-tight sm:text-base">Kuylamar</h1>
            <p className="truncate text-[11px] text-mute">CV + surat lamaran otomatis, siap ATS</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:flex">
              <Btn variant="primary" icon="print" onClick={() => print("cv")} className="rounded-r-none">
                Cetak CV
              </Btn>
              <Btn icon="file" onClick={() => print("letter")} className="rounded-l-none rounded-r-none border-x-0">
                Surat
              </Btn>
              <Btn icon="download" onClick={() => print("both")} className="rounded-l-none" title="CV + surat dalam satu PDF">
                Keduanya
              </Btn>
            </div>
            <IconBtn name="logout" label="Keluar" onClick={() => setTanyaKeluar(true)} />
            <IconBtn
              name={dark === "dark" ? "sun" : "moon"}
              label={dark === "dark" ? "Mode terang" : "Mode gelap"}
              onClick={() => setDark(dark === "dark" ? "light" : "dark")}
            />
          </div>
        </div>
      </header>

      <div
        className={`lg:grid ${
          tab === "pratinjau"
            ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]"
            : "lg:grid-cols-[4.5rem_minmax(0,460px)_minmax(0,1fr)]"
        }`}
      >
        {/* ---- Sidebar mini (desktop): pengganti tab bar yang disembunyikan di layar lebar ---- */}
        <nav
          aria-label="Menu utama"
          className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] flex-col items-center gap-1 border-r border-line bg-surface/90 py-3 backdrop-blur-md lg:flex"
        >
          {MENU.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => pindahTab(value)}
              title={label}
              aria-label={label}
              aria-current={tab === value ? "page" : undefined}
              className={`flex w-14 cursor-pointer flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition ${
                tab === value ? "orn-on bg-brand/12 text-brand" : "text-mute hover:bg-surface2 hover:text-ink"
              }`}
            >
              <Icon name={icon} className="size-5" />
              {label}
            </button>
          ))}
        </nav>

        {/* ---- Panel kiri: input ---- */}
        <aside
          ref={panah}
          className={`no-print min-w-0 space-y-4 overscroll-contain border-line p-4 sm:p-5 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-r ${
            tab === "pratinjau" ? "lg:hidden" : ""
          }`}
        >
          {tab === "lowongan" && (
            <div className="tabpane space-y-4">
            <Segmented
              className="w-full"
              value={subLow}
              onChange={(v) => {
                setSubLow(v);
                localStorage.setItem(SUBLOW, v);
              }}
              items={MENU_LOW}
            />
            {subLow === "cari" ? (
            <Cari
              resume={resume}
              onMuat={(j) => {
                setJob(j);
                setToast(`${j.company || j.position || "Lowongan"} dimuat ke editor.`);
              }}
              onToast={setToast}
            />
            ) : (
            <Card
              icon="briefcase"
              title="Lowongan"
              desc="Tempel link, sisanya otomatis."
              right={
                <button
                  type="button"
                  onClick={() => setInfoPlat(true)}
                  title="Platform yang didukung"
                  aria-label="Platform yang didukung"
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-mute transition hover:bg-surface2 hover:text-ink"
                >
                  <Icon name="info" className="size-[18px]" />
                </button>
              }
            >
              <label className="block">
                <Label>Link lowongan kerja</Label>
                <div className="flex gap-2">
                  <input
                    className="field flex-1"
                    value={job.url ?? ""}
                    onChange={(e) => setJob({ url: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && ambil()}
                    placeholder="https://id.jobstreet.com/id/job/…"
                  />
                  <Btn
                    variant="primary"
                    icon={busy ? undefined : "spark"}
                    busy={busy}
                    onClick={ambil}
                    className="shrink-0 px-3"
                  >
                    {busy ? "Mengambil" : "Ambil Data"}
                  </Btn>
                </div>
              </label>

              {busy && (
                <div className="mt-3 space-y-2">
                  <div className="skeleton h-9" />
                  <div className="skeleton h-9" />
                  <div className="skeleton h-16" />
                </div>
              )}

              {jobErr && (
                <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 p-2.5 text-xs text-danger">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {jobErr} <button onClick={ambil} className="cursor-pointer font-semibold underline">Coba lagi</button>
                  </span>
                </p>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <Label>Posisi</Label>
                  <input className="field" value={job.position ?? ""} onChange={(e) => setJob({ position: e.target.value })} placeholder="Frontend Developer" />
                </label>
                <label className="block">
                  <Label>Perusahaan</Label>
                  <input className="field" value={job.company ?? ""} onChange={(e) => setJob({ company: e.target.value })} placeholder="PT Contoh" />
                </label>
              </div>

              <label className="mt-3 block">
                <Label>Deskripsi lowongan (JD)</Label>
                <textarea
                  rows={8}
                  className="field leading-relaxed"
                  value={job.description}
                  onChange={(e) => setJob({ description: e.target.value })}
                  placeholder="Tempel deskripsi lowongan di sini — dipakai untuk skor ATS dan isi surat."
                />
                <span className="mt-1 block text-[11px] text-mute">{job.description.trim().split(/\s+/).filter(Boolean).length} kata</span>
              </label>
            </Card>
            )}

            <Card icon="target" title="Skor kecocokan" desc="Seberapa nyambung CV kamu dengan JD ini.">
              <div className="flex items-end gap-3">
                <div key={score} className={`animate-pop text-4xl leading-none font-extrabold tabular-nums ${tone}`}>
                  {score}
                  <span className="text-lg font-bold">%</span>
                </div>
                <div className="flex-1 pb-1">
                  <div className="h-2 overflow-hidden rounded-full bg-surface3">
                    <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${bar}`} style={{ width: `${score}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-mute">
                    {score >= 60 ? "Bagus, siap dikirim." : score >= 35 ? "Lumayan — tambah kata kunci dari JD." : "Masih jauh — sesuaikan keahlian dengan JD."}
                  </p>
                </div>
              </div>

              {ats.matched.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">Sudah ada di CV</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ats.matched.slice(0, 14).map((k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2.5 py-1 text-[11px] font-medium text-brand">
                        <Icon name="check" className="size-3" />
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {ats.missing.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">Belum ada di CV ({ats.missing.length})</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ats.missing.slice(0, 14).map((k) => (
                      <span key={k} className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] text-mute">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {warn.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {warn.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-xs text-accent">
                      <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            </div>
          )}

          {tab === "lamaran" && (
            <Pelacak
              job={job}
              resume={resume}
              onToast={setToast}
              onMuat={(l: Lamaran) => {
                setJob({ position: l.position, company: l.company, source: l.source, url: l.url, description: l.description ?? job.description });
                pindahTab("lowongan");
                setToast(`${l.company || l.position || "Lowongan"} dimuat ke editor.`);
              }}
              onFollowUp={(l: Lamaran) => {
                setEmailSeed({ n: Date.now(), jenis: "followup", position: l.position, company: l.company });
                pindahTab("email");
                setToast(`Follow-up ${l.company || l.position || "lamaran"} disiapkan.`);
              }}
            />
          )}

          {tab === "email" && <Email resume={resume} job={job} cocok={ats.matched} letter={letterTampil} seed={emailSeed} onToast={setToast} />}

          {tab === "profil" && (
            <div className="tabpane">
            <Card
              icon="user"
              title="Profil kamu"
              desc="Isi sekali, dipakai ulang untuk semua lamaran."
              right={
                <div className="flex gap-1.5">
                  <Btn
                    size="sm"
                    icon="eye"
                    onClick={() => {
                      if (jsonMode) applyDraft();
                      else setDraft(JSON.stringify(resume, null, 2));
                      setJsonMode(!jsonMode);
                    }}
                  >
                    {jsonMode ? "Selesai" : "JSON"}
                  </Btn>
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface2 px-2 text-[11px] font-semibold transition hover:bg-surface3">
                    <Icon name="upload" className="size-3.5" />
                    Impor
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) applyDraft(await f.text());
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <IconBtn
                    name="download"
                    label="Ekspor profil (.json)"
                    size="sm"
                    onClick={() => {
                      setDraft(JSON.stringify(resume, null, 2));
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([JSON.stringify(resume, null, 2)], { type: "application/json" }));
                      a.download = "profil.json";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  />
                </div>
              }
            >
              {jsonMode ? (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={16}
                    spellCheck={false}
                    className="field font-mono text-[11px] leading-snug"
                  />
                  <div className="flex items-center gap-2">
                    <Btn variant="primary" icon="check" onClick={() => applyDraft()}>
                      Terapkan
                    </Btn>
                    <span className="text-[11px] text-mute">Format JSON Resume.</span>
                  </div>
                </div>
              ) : (
                <ProfileForm
                  r={resume}
                  job={job}
                  saran={ats.missing}
                  on={(next) => set((s) => ({ ...s, resume: next }))}
                  onToast={setToast}
                />
              )}
              {err && (
                <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 p-2.5 text-xs text-danger">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  {err}
                </p>
              )}
            </Card>

            <Card
              icon="code"
              title="Proyek dari GitHub"
              desc="Otomatis ambil proyek paling relevan ke lowongan ini."
              right={
                <Switch
                  checked={autoOn}
                  onChange={(v) => {
                    setAutoOn(v);
                    localStorage.setItem(AUTO, v ? "on" : "off");
                  }}
                  label="Pasang proyek otomatis"
                />
              }
            >
              <p className={`mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed ${autoOn ? "bg-brand/8 text-ink" : "bg-surface2 text-mute"}`}>
                <Icon name={autoOn ? "spark" : "alert"} className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{catatanRepo || "Isi username GitHub di profil, proyek paling nyambung langsung masuk CV."}</span>
              </p>
              <GithubPicker
                jd={job.description}
                existing={resume.projects}
                defaultUser={resume.basics.github}
                key={resume.basics.github ?? ""}
                onAdd={(ps) => {
                  const next = mergeProjects(resume.projects, ps);
                  set((s) => ({ ...s, resume: { ...s.resume, projects: next } }));
                  setToast(`${next.length - resume.projects.length} proyek masuk ke CV.`);
                }}
              />
            </Card>

            <Card icon="spark" title="Mesin tulis AI" desc="Dipakai untuk ringkasan diri & deskripsi proyek.">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <Label>Endpoint (OpenAI-compatible)</Label>
                  <input className="field" value={ai.base} onChange={(e) => setAi({ ...ai, base: e.target.value })} placeholder="http://localhost:20128/v1" />
                </label>
                <label className="block">
                  <Label>Model</Label>
                  <input className="field" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="super-kombo" />
                </label>
              </div>
              <label className="mt-2 block">
                <Label>API key (opsional)</Label>
                <input
                  className="field"
                  type="password"
                  value={ai.key}
                  onChange={(e) => setAi({ ...ai, key: e.target.value })}
                  placeholder="biarkan kosong → pakai 9router lokal lewat /api/ai"
                  autoComplete="off"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Btn
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    simpanAi(ai);
                    setToast("Setelan AI disimpan.");
                  }}
                >
                  Simpan
                </Btn>
                <Btn
                  icon="spark"
                  busy={aiBusy}
                  onClick={async () => {
                    setAiBusy(true);
                    setAiPesan("");
                    try {
                      setAiPesan(`AI menjawab: “${await cekAi(ai)}”`);
                    } catch (e) {
                      setAiPesan((e as Error).message);
                    } finally {
                      setAiBusy(false);
                    }
                  }}
                >
                  Uji koneksi
                </Btn>
                {aiPesan && <span className="text-[11px] text-mute">{aiPesan}</span>}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-mute">
                Kunci disimpan di browser kamu saja. Dikosongkan pun jalan selama 9router hidup di komputer ini — kuncinya diambil server saat pengembangan.
              </p>
            </Card>

            <p className="px-1 text-[11px] leading-relaxed text-mute">
              Data tersimpan di browser kamu sendiri (localStorage) — tidak dikirim ke server mana pun. Tekan{" "}
              <kbd className="rounded border border-line bg-surface2 px-1">Ctrl</kbd>+
              <kbd className="rounded border border-line bg-surface2 px-1">S</kbd> untuk menyimpan sekarang. Saat cetak, pilih
              &quot;Simpan sebagai PDF&quot;, ukurannya sudah A4.
            </p>
            </div>
          )}
        </aside>

        {/* ---- Panel kanan: pratinjau ---- */}
        <main
          className={`preview-wrap tabpane min-w-0 flex-1 overscroll-contain p-4 sm:p-6 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto ${
            tab === "pratinjau" ? "" : "tab-off"
          }`}
        >
          <div className="no-print sticky top-0 z-10 mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Segmented
                  value={target}
                  onChange={setTarget}
                  className="mx-auto max-w-md backdrop-blur-md"
                  items={[
                    { value: "cv", label: "CV", icon: "file" },
                    { value: "letter", label: "Surat", icon: "spark" },
                    { value: "both", label: "Keduanya", icon: "eye" },
                  ]}
                />
              </div>
              <Btn
                icon="eye"
                size="sm"
                className="shrink-0 lg:hidden"
                title={mini ? "Perbesar jadi ukuran asli" : "Kecilkan jadi thumbnail satu layar"}
                onClick={() => setMini(!mini)}
              >
                <span className="hidden sm:inline">{mini ? "Penuh" : "Mini"}</span>
              </Btn>
              <Btn
                icon={editOn ? "check" : "pen"}
                variant={editOn ? "primary" : "soft"}
                size="sm"
                className="shrink-0"
                title={editOn ? "Simpan suntingan dokumen" : "Edit teks CV & surat langsung di kertas pratinjau"}
                onClick={editOn ? sudahiEdit : mulaiEdit}
              >
                {editOn ? "Selesai" : "Edit"}
              </Btn>
            </div>
            {editOn && (
              /* onMouseDown: simpan seleksi sebelum fokus pindah ke toolbar. */
              <div
                onMouseDown={jagaSel}
                className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface/90 p-1 backdrop-blur-md"
              >
                {ALAT.map(([cmd, val, label, judul]) => (
                  <button
                    key={cmd}
                    type="button"
                    title={judul}
                    /* preventDefault: jangan lepas fokus dari kertas, kalau tidak perintah format tidak kena. */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => perintah(cmd, val)}
                    className="min-h-9 min-w-9 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-semibold text-ink hover:bg-surface2"
                  >
                    {label}
                  </button>
                ))}

                <span className="mx-0.5 h-6 w-px shrink-0 bg-line" aria-hidden="true" />

                <select
                  title="Format blok (judul bagian)"
                  aria-label="Format blok"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) perintah("formatBlock", `<${e.target.value}>`);
                    e.target.value = "";
                  }}
                  className="min-h-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs font-semibold text-ink"
                >
                  <option value="">Format…</option>
                  {BLOK.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  title="Ukuran huruf"
                  aria-label="Ukuran huruf"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) perintah("fontSize", e.target.value);
                    e.target.value = "";
                  }}
                  className="min-h-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs font-semibold text-ink"
                >
                  <option value="">Ukuran…</option>
                  {UKURAN.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>

                <label
                  title="Warna huruf"
                  className="flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink hover:bg-surface2"
                >
                  Warna
                  <input
                    type="color"
                    defaultValue="#111111"
                    aria-label="Warna huruf"
                    onChange={(e) => perintah("foreColor", e.target.value)}
                    className="size-5 cursor-pointer rounded border border-line bg-transparent p-0"
                  />
                </label>

                <button
                  type="button"
                  title="Sisipkan tautan ke teks terpilih"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={tautan}
                  className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-semibold text-ink hover:bg-surface2"
                >
                  Tautan
                </button>
                <button
                  type="button"
                  title="Hapus tautan"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => perintah("unlink")}
                  className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-semibold text-ink hover:bg-surface2"
                >
                  Lepas tautan
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => otomatis(fokus.current)}
                  className="ml-auto min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-[11px] font-semibold text-danger hover:bg-danger/10"
                >
                  Kembalikan otomatis
                </button>
              </div>
            )}
            {editOn && (
              <p className="text-center text-[11px] text-mute">
                Klik teks di kertas lalu tulis. B · I · U · Coret · daftar • / 1. · rata kiri/tengah/kanan/justify · indentasi ·
                Format (judul bagian) · Ukuran · Warna · Tautan · Garis · Bersihkan. Ctrl+Z batalkan, Ctrl+Y ulangi. Perubahan
                tersimpan sendiri.
              </p>
            )}
            {!editOn && (ovr.cv || ovr.letter) && (
              <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-[11px] text-mute">
                <Icon name="pen" className="size-3.5" />
                <span>
                  {[ovr.cv && "CV", ovr.letter && "Surat"].filter(Boolean).join(" & ")} sudah diedit manual — yang dicetak versi
                  ini.
                </span>
                <button
                  type="button"
                  onClick={() => otomatis()}
                  className="cursor-pointer font-semibold text-brand underline underline-offset-2"
                >
                  Kembalikan otomatis
                </button>
              </p>
            )}
            {!editOn && (
              <p className="flex flex-wrap items-center justify-center gap-2 text-center text-[11px] text-mute">
                <button
                  type="button"
                  disabled={suratBusy}
                  onClick={haluskan}
                  className="cursor-pointer font-semibold text-brand underline underline-offset-2 disabled:opacity-50"
                >
                  {suratBusy ? "AI sedang merapikan…" : suratAiAktif ? "Rapikan ulang pakai AI" : "Perhalus surat pakai AI"}
                </button>
                {suratAiAktif && (
                  <button
                    type="button"
                    onClick={() => {
                      setSuratAi(null);
                      setToast("Surat kembali ke versi template.");
                    }}
                    className="cursor-pointer font-semibold text-danger underline underline-offset-2"
                  >
                    Kembalikan template
                  </button>
                )}
              </p>
            )}
            {mini && !editOn && <p className="text-center text-[11px] text-mute lg:hidden">Ketuk halaman untuk buka ukuran penuh.</p>}
          </div>

          <div key={`${tab}-${target}`} className={`sheet-stack tabpane mx-auto w-fit space-y-6 ${mini ? "mini" : ""}`}>
            <section
              ref={(el) => {
                kertas.current.cv = el;
              }}
              className={cls("cv")}
              aria-label="Pratinjau CV"
              onClick={mini && !editOn ? () => bukaPenuh("cv") : undefined}
            >
              {editOn ? (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Isi CV"
                  className="dok-edit"
                  onFocus={() => {
                    fokus.current = "cv";
                  }}
                  onInput={() => {
                    window.clearTimeout(simpanTmr.current);
                    simpanTmr.current = window.setTimeout(() => simpan("cv"), 700);
                  }}
                  dangerouslySetInnerHTML={{ __html: isi.cv ?? "" }}
                />
              ) : ovr.cv ? (
                <div className="dok-edit" dangerouslySetInnerHTML={{ __html: ovr.cv }} />
              ) : (
                <ResumeDoc r={resume} />
              )}
            </section>
            <section
              ref={(el) => {
                kertas.current.letter = el;
              }}
              className={cls("letter")}
              aria-label="Pratinjau surat lamaran"
              onClick={mini && !editOn ? () => bukaPenuh("letter") : undefined}
            >
              {editOn ? (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Isi surat lamaran"
                  className="dok-edit"
                  onFocus={() => {
                    fokus.current = "letter";
                  }}
                  onInput={() => {
                    window.clearTimeout(simpanTmr.current);
                    simpanTmr.current = window.setTimeout(() => simpan("letter"), 700);
                  }}
                  dangerouslySetInnerHTML={{ __html: isi.letter ?? "" }}
                />
              ) : ovr.letter ? (
                <div className="dok-edit" dangerouslySetInnerHTML={{ __html: ovr.letter }} />
              ) : (
                <CoverLetterDoc r={resume} letter={letterTampil} />
              )}
            </section>
          </div>
        </main>
      </div>

      {/* ---- Dock bawah (HP): kapsul ekspor (khusus Pratinjau) + dock tab melayang ---- */}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {tab === "pratinjau" && (
          <div className="orn-dock pointer-events-auto flex w-full max-w-md items-center gap-1.5 rounded-full border border-line/70 bg-surface/80 p-1.5 shadow-[0_12px_28px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl">
            <Btn variant="primary" icon="print" compact onClick={() => print("cv")} className="flex-1">
              Cetak CV
            </Btn>
            <Btn icon="file" compact onClick={() => print("letter")} className="flex-1">
              Surat
            </Btn>
            <Btn icon="download" compact onClick={() => print("both")} className="flex-1">
              Keduanya
            </Btn>
          </div>
        )}

        <nav
          aria-label="Menu tab"
          className="orn-dock pointer-events-auto flex w-full max-w-md items-center gap-1.5 rounded-full border border-line/70 bg-surface/80 p-2 shadow-[0_14px_34px_-14px_rgba(0,0,0,.95)] backdrop-blur-xl"
        >
          {MENU.map(({ value, label, icon }) => {
            const aktif = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => pindahTab(value)}
                aria-current={aktif ? "page" : undefined}
                className={`flex cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full py-2.5 text-[11px] font-semibold transition-all duration-300 ease-out active:scale-95 ${
                  aktif ? "orn-btn-primary grow-[2] basis-0 bg-brand px-2 text-surface" : "grow basis-0 px-0 text-mute"
                }`}
              >
                <Icon name={icon} className="size-5 shrink-0" />
                <span
                  className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
                    aktif ? "max-w-24 opacity-100" : "max-w-0 opacity-0"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
      <div aria-hidden className={tab === "pratinjau" ? "h-32 lg:hidden" : "h-[4.75rem] lg:hidden"} />

      {/* ---- Dialog keluar: bottom-sheet di HP, modal di desktop ---- */}
      {tanyaKeluar && (
        <Konfirmasi
          icon="logout"
          judul="Keluar dari Kuylamar?"
          pesan="Isian sudah tersimpan otomatis di perangkat ini, jadi aman ditinggal. Untuk masuk lagi butuh akun dari pemilik."
          ya="Keluar"
          onYa={() => {
            location.href = "/__keluar";
          }}
          onBatal={() => setTanyaKeluar(false)}
        />
      )}

      {/* ---- Modal platform ---- */}
      {infoPlat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Platform yang didukung"
          onClick={() => setInfoPlat(false)}
          className="no-print fixed inset-0 z-50 grid place-items-end bg-black/45 p-3 backdrop-blur-sm sm:place-items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-fade-up w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-xl"
          >
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                <Icon name="info" className="size-[18px]" />
              </span>
              <h2 className="flex-1 text-sm font-bold tracking-tight">Platform yang didukung</h2>
              <button
                type="button"
                onClick={() => setInfoPlat(false)}
                aria-label="Tutup"
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-mute transition hover:bg-surface2 hover:text-ink"
              >
                <Icon name="x" className="size-[18px]" />
              </button>
            </div>
            <div className="space-y-1.5">
              {PLATFORM.map(([nama, domain, status]) => (
                <div key={nama} className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-surface2/70 px-2.5 py-2">
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
                    onError={(e) => {
                      const i = e.currentTarget;
                      if (i.dataset.cadangan) return;
                      i.dataset.cadangan = "1";
                      i.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    }}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-6 shrink-0 rounded-md bg-white object-contain p-0.5"
                  />
                  <span className="flex-1 text-xs font-semibold text-ink">{nama}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS[status].cls}`}>{STATUS[status].label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-mute">
              Selain itu, situs apa pun yang menyimpan data <code>JobPosting</code> biasanya ikut kebaca. Link yang gagal tetap bisa diisi manual — Posisi, Perusahaan, dan JD.
            </p>
          </div>
        </div>
      )}

      {/* ---- Notifikasi ---- */}
      {toast && (
        <div
          aria-live="polite"
          className="no-print fixed bottom-24 left-1/2 z-40 -translate-x-1/2 animate-fade-up rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold shadow-lg lg:bottom-6"
        >
          <span className="flex items-center gap-2">
            <Icon name="check" className="size-4 text-brand" />
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
