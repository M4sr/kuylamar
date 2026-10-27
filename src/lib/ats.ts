import type { Resume } from "../types";

/** Kata umum yang muncul di hampir semua JD — bukan penanda kecocokan. */
const STOP = new Set(
  `dan atau yang untuk dengan pada dari ke di sebagai adalah akan dapat bisa harus kami kita anda saya kamu
  kerja bekerja perusahaan posisi lowongan kandidat pelamar membutuhkan dibutuhkan tanggung jawab jawab kualifikasi
  persyaratan memiliki menguasai mampu minimal maksimal tahun bulan pengalaman lebih serta juga akan dalam ke
  the and for with you your our we are is be will can able have has had that this from work working experience
  years year role job position company candidate candidates requirements responsibility responsibilities
  required must plus about into their they them at least more other than such per to of in on a an as by
  deskripsi benefit keuntungan gaji lokasi bergabung team tim join apply lamar kirim email cv resume
  baru fresh graduate sarjana smk sma d3 s1 minimal diutamakan nilai tambah`
    .split(/\s+/)
    .filter(Boolean),
);

type Bag = Map<string, number>;

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Unigram + bigram, dinilai dari frekuensi kemunculan di teks lowongan. */
export function extractTerms(text: string): Bag {
  const bag: Bag = new Map();
  const tk = tokens(text);
  const add = (term: string, w: number) => bag.set(term, (bag.get(term) ?? 0) + w);
  for (const t of tk) if (t.length >= 3) add(t, 1);
  for (let i = 0; i < tk.length - 1; i++) add(`${tk[i]} ${tk[i + 1]}`, 2);
  return bag;
}

/** Seluruh teks CV yang akan dibaca mesin ATS. */
export function resumeText(r: Resume): string {
  const b = r.basics;
  return [
    b.name, b.label, b.summary,
    ...r.work.flatMap((w) => [w.position, w.company, w.location ?? "", ...w.highlights]),
    ...r.education.flatMap((e) => [e.degree, e.school, e.note ?? ""]),
    ...r.projects.flatMap((p) => [p.name, p.description, ...(p.highlights ?? [])]),
    ...r.skills.flatMap((s) => [s.name, ...s.keywords]),
  ].join(" ");
}

export type AtsResult = {
  score: number;
  matched: string[];
  missing: string[];
};

/** Skor 0-100 dari cakupan istilah JD pada CV. Unigram berbobot frekuensi; frasa (bigram) cocok menambah bonus. */
export function atsScore(resume: Resume, jd: string): AtsResult {
  const bag = extractTerms(jd);
  const cv = " " + tokens(resumeText(resume)).join(" ") + " ";
  let total = 0;
  let hit = 0;
  let frasaCocok = 0;
  const matched: string[] = [];
  const missing: { term: string; w: number }[] = [];
  for (const [term, w] of bag) {
    if (term.includes(" ")) {
      if (cv.includes(` ${term} `)) frasaCocok++;
      continue;
    }
    total += w;
    if (cv.includes(` ${term} `)) {
      hit += w;
      matched.push(term);
    } else {
      missing.push({ term, w });
    }
  }
  const dasar = total ? (hit / total) * 100 : 0;
  const bonus = Math.min(5, frasaCocok);
  const important = missing
    .filter((m) => m.w > 1 || m.term.length > 7)
    .sort((a, b) => b.w - a.w)
    .slice(0, 25)
    .map((m) => m.term);
  return {
    score: Math.round(Math.min(100, dasar + bonus)),
    matched: matched.slice(0, 40),
    missing: important,
  };
}

/** Pemeriksaan format yang bikin CV gugur di mesin ATS. */
export function atsWarnings(r: Resume): string[] {
  const w: string[] = [];
  if (!r.basics.email) w.push("Email kosong — banyak ATS menolak CV tanpa email.");
  if (!r.basics.phone) w.push("Nomor telepon kosong.");
  if (r.basics.summary.length < 80) w.push("Ringkasan terlalu pendek; isi 2-3 kalimat berisi angka.");
  const bullets = r.work.flatMap((x) => x.highlights);
  if (bullets.some((b) => b.length > 240)) w.push("Ada poin pengalaman sangat panjang; ringkas jadi 1-2 baris.");
  if (!bullets.some((b) => /\d/.test(b))) w.push("Belum ada pencapaian dengan angka di pengalaman kerja.");
  if (r.skills.length === 0) w.push("Bagian keahlian kosong — ini yang paling sering jadi kunci penyaringan.");
  return w;
}
