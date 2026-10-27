import type { Job, Resume } from "../types";
import { cekAmanInti, cekAmanSurat, type Letter } from "./cover";
import type { Surel } from "./email";
import { rapiTautan } from "./tautan";
import { bank, parsePertanyaan, petunjuk, type Tanya } from "./wawancara.ts";
import { gabungNilai, promptNilai, type Giliran, type Laporan, type Nilai } from "./telepon.ts";

/**
 * Klien AI tipis ke endpoint OpenAI-compatible (9router lokal).
 * Tanpa key di browser → lewat /api/ai (proxy dev, key tetap di server).
 */
export type AiCfg = { base: string; model: string; key: string };

export const AIK = "lamarkerja.ai";
export const aiDefault: AiCfg = { base: "http://localhost:20128/v1", model: "super-kombo", key: "" };

export function aiCfg(): AiCfg {
  try {
    return { ...aiDefault, ...(JSON.parse(localStorage.getItem(AIK) ?? "{}") as Partial<AiCfg>) };
  } catch {
    return { ...aiDefault };
  }
}

export function simpanAi(c: AiCfg) {
  localStorage.setItem(AIK, JSON.stringify(c));
}

const CK = "lamarkerja.aicache";
const MAX_CACHE = 80;

/** FNV-1a: kunci pendek dari prompt panjang (pola sama dengan pemilih varian surat). */
function hashKunci(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cache jawaban AI di browser: prompt yang sama persis tidak dikirim ulang.
 * Dipakai untuk kerja otomatis (deskripsi proyek GitHub) — tombol manual kirim `segar` supaya
 * klik ulang tetap menghasilkan teks baru, bukan salinan lama.
 */
function dariCache(k: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(CK) ?? "{}") as Record<string, string>)[k] ?? null;
  } catch {
    return null;
  }
}

function keCache(k: string, v: string) {
  try {
    const m = JSON.parse(localStorage.getItem(CK) ?? "{}") as Record<string, string>;
    m[k] = v;
    const kunci = Object.keys(m);
    // urutan kunci = urutan masuk, jadi yang paling tua dibuang lebih dulu
    if (kunci.length > MAX_CACHE) for (const x of kunci.slice(0, kunci.length - MAX_CACHE)) delete m[x];
    localStorage.setItem(CK, JSON.stringify(m));
  } catch {
    /* storage penuh / mati — cache dilewati, bukan error */
  }
}

/** Ambil teks dari balasan: `{teks}` (proxy kita), `message.content`, atau `content` langsung. */
export function teksDari(data: unknown): string {
  const d = data as { teks?: string; choices?: { message?: { content?: string }; content?: string }[] };
  return d?.teks ?? d?.choices?.[0]?.message?.content ?? d?.choices?.[0]?.content ?? "";
}

/** Bersihkan keluaran model: buang pagar kode, tanda kutip pembungkus, bullet, spasi ganda. */
export function bersihTeks(t: string, maks = 400): string {
  return t
    .replace(/```[a-z]*|```/gi, " ")
    .replace(/^\s*(ringkasan|summary)\s*:\s*/i, "")
    .replace(/^[\s"'“”]+|[\s"'“”]+$/g, "")
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maks);
}

async function minta(prompt: string, cfg: AiCfg, maksToken = 400, tanpaPikir = false, segar = false): Promise<string> {
  const kunci = hashKunci(`${cfg.model}|${maksToken}|${tanpaPikir}|${prompt}`);
  if (!segar) {
    const simpanan = dariCache(kunci);
    if (simpanan !== null) return simpanan;
  }
  const pakaiKunci = cfg.key.trim().length > 0;
  const tipe = "Bearer";
  // Halaman di balik basic-auth (URL memuat user:pass) bikin fetch() menolak URL relatif → buang kredensialnya.
  const lokal = new URL("/api/ai", location.href);
  lokal.username = "";
  lokal.password = "";
  const url = pakaiKunci ? `${cfg.base.replace(/\/+$/, "")}/chat/completions` : lokal.toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(pakaiKunci ? { authorization: `${tipe} ${cfg.key.trim()}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maksToken,
      // model penalar menumpahkan proses berpikirnya ke content kalau ini tidak dimatikan
      ...(tanpaPikir ? { thinking: { type: "disabled" }, tanpaPikir: true } : {}),
    }),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const pesan = (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`AI tidak bisa dihubungi: ${pesan}`);
  }
  const teks = teksDari(data);
  if (!teks.trim()) throw new Error("AI balas kosong.");
  keCache(kunci, teks);
  return teks;
}

/** 2–3 kalimat ringkasan diri, disesuaikan dengan JD. */
export function promptRingkasan(r: Resume, job: Job): string {
  const b = r.basics;
  const kerja = r.work.map((w) => `${w.position} di ${w.company} (${w.start}–${w.end})`).join("; ") || "-";
  const skill = r.skills.flatMap((s) => s.keywords).slice(0, 20).join(", ") || "-";
  const proyek = r.projects.map((p) => p.name).slice(0, 5).join(", ") || "-";
  return [
    "Kamu penulis CV profesional berbahasa Indonesia. Tulis ringkasan diri untuk bagian atas CV.",
    "Aturan: 2–3 kalimat, maksimal 55 kata, orang pertama tanpa kata ganti berlebihan, tanpa bullet, tanpa embel-embel pujian kosong, tanpa menyebut nama sendiri, bahasa Indonesia baku tapi mengalir.",
    "Sebutkan bidang, pengalaman paling relevan, dan keahlian teknis yang paling nyambung dengan lowongan.",
    `Posisi dilamar: ${job.position || b.label || "-"}`,
    `Perusahaan: ${job.company || "-"}`,
    `Nama: ${b.name || "-"} | Posisi sekarang: ${b.label || "-"} | Kota: ${b.city || "-"}`,
    `Pengalaman: ${kerja}`,
    `Keahlian: ${skill}`,
    `Proyek: ${proyek}`,
    `Deskripsi lowongan: ${job.description.slice(0, 1500) || "-"}`,
    "Balas hanya teks ringkasannya.",
  ].join("\n");
}

/** Deskripsi proyek untuk CV, dari metadata repo + README + JD. */
export function promptProyek(proyek: { name: string; tech?: string[]; bahan?: string }, jd: string, perusahaan = ""): string {
  return [
    "Kamu penulis CV profesional berbahasa Indonesia. Tulis deskripsi singkat satu proyek untuk CV.",
    "Aturan: 1–2 kalimat, maksimal 32 kata, mulai langsung dengan pekerjaan/manfaatnya (tanpa frasa 'proyek ini' atau 'saya membuat'), sebut teknologi yang dipakai, tanpa bullet, tanpa tanda kutip.",
    "Kalau ada angka/hasil nyata di bahan, sebutkan; kalau tidak ada, jangan mengarang.",
    `Nama proyek: ${proyek.name}`,
    `Teknologi: ${proyek.tech?.join(", ") || "-"}`,
    `Bahan mentah: ${(proyek.bahan ?? "").slice(0, 900) || "-"}`,
    `Lowongan yang dilamar: ${jd.slice(0, 800) || "-"}${perusahaan ? ` di ${perusahaan}` : ""}`,
    "Balas hanya teks deskripsinya.",
  ].join("\n");
}

export async function tulisRingkasan(r: Resume, job: Job, cfg = aiCfg(), segar = false): Promise<string> {
  return bersihTeks(await minta(promptRingkasan(r, job), cfg, 700, false, segar), 400);
}

export async function tulisProyek(
  proyek: { name: string; tech?: string[]; bahan?: string },
  jd: string,
  cfg = aiCfg(),
  segar = false,
): Promise<string> {
  return bersihTeks(await minta(promptProyek(proyek, jd), cfg, 450, false, segar), 240);
}

/** Tulis deskripsi beberapa proyek berurutan (hemat kuota, hindari banjir permintaan). */
export async function tulisProyekBanyak<T extends { name: string; tech?: string[]; bahan?: string }>(
  items: T[],
  jd: string,
  cfg = aiCfg(),
): Promise<{ proyek: T; deskripsi: string }[]> {
  const hasil: { proyek: T; deskripsi: string }[] = [];
  for (const p of items) {
    try {
      hasil.push({ proyek: p, deskripsi: await tulisProyek(p, jd, cfg) });
    } catch {
      /* satu gagal, sisanya lanjut */
    }
  }
  return hasil;
}

/**
 * Parafrase pembuka & penutup surat. Aturan keras: hanya merapikan kalimat yang sudah ada —
 * tanpa menambah pengalaman, angka, kredensial, atau perusahaan baru.
 */
export function promptSurat(p1: string, p3: string, job: Job): string {
  return [
    "Kamu editor surat lamaran kerja bahasa Indonesia.",
    "Rapikan dua paragraf berikut supaya lebih mengalir dan profesional, TANPA menambah atau mengubah fakta.",
    "Larangan keras: jangan menambah pengalaman, keahlian, angka, sertifikasi, penghargaan, nama perusahaan, atau teknologi yang tidak ada di teks asli; jangan mengubah angka, nama, jabatan, atau nama perusahaan; jangan menambah kalimat baru.",
    "Pertahankan sudut pandang orang pertama, sapaan Bapak/Ibu, dan panjang yang mirip aslinya.",
    `Posisi dilamar: ${job.position || "-"} | Perusahaan: ${job.company || "-"}`,
    "Balas HANYA dua paragraf: paragraf pembuka, satu baris kosong, paragraf penutup. Tanpa nomor, tanpa judul, tanpa penjelasan.",
    "",
    "Paragraf pembuka (asli):",
    p1,
    "",
    "Paragraf penutup (asli):",
    p3,
  ].join("\n");
}

/** Rapikan pembuka & penutup surat pakai AI; kalau hasilnya menambah fakta, kembalikan error. */
export async function haluskanSurat(letter: Letter, job: Job, cfg = aiCfg(), segar = false): Promise<{ p1: string; p3: string }> {
  const p1 = letter.paragraphs[0];
  const p3 = letter.paragraphs[letter.paragraphs.length - 1];
  const mentah = (await minta(promptSurat(p1, p3, job), cfg, 900, true, segar)).replace(/```[a-z]*|```/gi, "");
  const bagian = mentah
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean);
  if (bagian.length < 2) throw new Error("AI tidak membalas dua paragraf — versi template dipakai.");
  const b1 = bagian[0];
  const b3 = bagian[bagian.length - 1];
  if (!cekAmanSurat(p1, b1) || !cekAmanSurat(p3, b3)) throw new Error("Hasil AI menambah fakta yang tidak ada di profil — versi template dipakai.");
  return { p1: b1, p3: b3 };
}

/**
 * Rapikan isi email lamaran. Aturan keras sama seperti surat: hanya merapikan kalimat yang sudah ada —
 * tanpa menambah pengalaman, angka, kredensial, kontak, atau tautan baru. Subjek tidak diutak-atik AI.
 */
export function promptEmail(s: Surel, job: Job): string {
  const jenis = s.jenis === "followup" ? "tindak lanjut lamaran" : s.jenis === "wawancara" ? "konfirmasi jadwal wawancara" : "lamaran kerja";
  return [
    "Kamu editor email kerja bahasa Indonesia.",
    `Rapikan email ${jenis} berikut supaya mengalir, sopan, dan profesional, TANPA menambah atau mengubah fakta.`,
    "Larangan keras: jangan menambah pengalaman, keahlian, angka, sertifikasi, penghargaan, nama perusahaan, alamat email, nomor telepon, atau tautan yang tidak ada di teks asli; jangan mengubah nama, jabatan, jadwal, atau nama perusahaan; jangan menambah kalimat baru.",
    "Pertahankan baris sapaan di awal dan blok tanda tangan di akhir (nama, jabatan, kontak) apa adanya, sudut pandang orang pertama, serta panjang yang mirip aslinya.",
    `Posisi dilamar: ${job.position || "-"} | Perusahaan: ${job.company || "-"}`,
    "Balas HANYA isi emailnya: tanpa baris Subjek, tanpa penjelasan, tanpa pagar kode.",
    "",
    "Isi email (asli):",
    s.isi,
  ].join("\n");
}

/** Rapikan isi email pakai AI; kalau hasilnya menambah fakta, kembalikan error (template tetap dipakai). */
export async function haluskanEmail(s: Surel, job: Job, cfg = aiCfg(), segar = false): Promise<string> {
  const mentah = (await minta(promptEmail(s, job), cfg, 900, true, segar)).replace(/```[a-z]*|```/gi, "");
  const bersih = mentah
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^\s*subjek\s*:.*$/gim, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // email sering jauh lebih pendek dari bahan template — toleransi panjangnya lebih longgar dari surat
  if (!cekAmanInti(s.isi, bersih, 0.4, 2)) throw new Error("Hasil AI menambah fakta yang tidak ada di profil — versi template dipakai.");
  return bersih;
}

/**
 * Pertanyaan wawancara untuk posisi ini. Aturan keras: hanya bertanya — tidak boleh menyatakan
 * pengalaman/keahlian pelamar, apalagi mengarang.
 */
export function promptWawancara(r: Resume, job: Job, jml = 10): string {
  const kerja = r.work.map((w) => `${w.position} di ${w.company}`).join("; ") || "-";
  const skill = r.skills.flatMap((s) => s.keywords).slice(0, 20).join(", ") || "-";
  return [
    "Kamu pewawancara teknis HR bahasa Indonesia. Susun daftar pertanyaan wawancara kerja untuk kandidat ini.",
    "Aturan: setiap baris berisi tepat satu pertanyaan dan diakhiri tanda tanya; tanpa nomor, tanpa bullet, tanpa penjelasan, tanpa jawaban.",
    "Larangan keras: jangan menyatakan atau mengandaikan pengalaman, keahlian, sertifikasi, atau angka yang tidak ada di data kandidat; jangan menyebut perusahaan lain yang tidak ada di data.",
    "Campurkan: 2 pertanyaan pembuka/perilaku, sisanya teknis sesuai deskripsi lowongan, dan 1 pertanyaan penutup untuk kandidat.",
    `Jumlah baris: ${jml}.`,
    `Posisi: ${job.position || r.basics.label || "-"} | Perusahaan: ${job.company || "-"}`,
    `Pengalaman kandidat: ${kerja}`,
    `Keahlian kandidat: ${skill}`,
    `Deskripsi lowongan: ${job.description.slice(0, 1500) || "-"}`,
    "Balas hanya daftar pertanyaannya.",
  ].join("\n");
}

/** Daftar pertanyaan dari AI + petunjuk jawaban dari bank lokal; gagal → bank lokal dipakai apa adanya. */
export async function tanyaWawancara(r: Resume, job: Job, cfg = aiCfg(), segar = false): Promise<Tanya[]> {
  const dasar = bank(r, job);
  const mentah = await minta(promptWawancara(r, job), cfg, 700, true, segar);
  const q = parsePertanyaan(mentah);
  if (q.length < 5) throw new Error("AI tidak membalas daftar pertanyaan — versi standar dipakai.");
  return q.map((x) => ({ q: x, kunci: petunjuk(x, dasar) }));
}

/** Cek cepat: endpoint AI hidup dan modelnya menjawab. */
export async function cekAi(cfg = aiCfg()): Promise<string> {
  return bersihTeks(await minta("Balas satu kata: siap", cfg, 200, false, true), 40);
}

/**
 * Penilaian transkrip wawancara telepon oleh AI. Semua keluaran wajib lewat `gabungNilai`
 * (nilai akhir di-clamp 0–100, item dibatasi panjangnya); balasan ngawur → error → skor lokal dipakai.
 */
export async function nilaiTelepon(
  job: Job,
  tanya: Giliran[],
  nilai: Nilai[],
  lokal: Laporan,
  cfg = aiCfg(),
  segar = false,
): Promise<Laporan> {
  const dasar = promptNilai(job, tanya, nilai);
  let galat = "";
  for (let coba = 0; coba < 2; coba++) {
    // Percobaan kedua: prompt dipertegas + lewati cache (model kadang balas prosa).
    const p = coba === 0 ? dasar : `${dasar}\n\nCatatan: balasan sebelumnya tidak terbaca. Kirim ULANG hanya objek JSON, mulai dengan { dan akhiri dengan }, tanpa kalimat pembuka atau pagar kode.`;
    const mentah = await minta(p, cfg, 1400, true, segar || coba > 0);
    try {
      return gabungNilai(mentah, lokal);
    } catch (e) {
      galat = (e as Error).message;
      try {
        sessionStorage.setItem("lamarkerja.ai.mentah", mentah.slice(0, 2000));
      } catch {
        /* storage mati — tidak masalah */
      }
    }
  }
  throw new Error(galat || "AI tidak membalas JSON penilaian.");
}

/** Bahan teks dari sebuah Repo GitHub (dipakai sebagai input deskripsi AI). */
export function bahanRepo(r: { name: string; description?: string | null; readme?: string; language?: string | null; topics?: string[]; homepage?: string | null }): string {
  return [r.description, r.language, r.topics?.join(", "), rapiTautan(r.homepage ?? ""), r.readme].filter(Boolean).join(" — ").slice(0, 900);
}
