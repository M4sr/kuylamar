import type { AtsResult } from "./ats";
import type { Job, Resume } from "../types";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export type Letter = {
  dateLine: string;
  addressee: string[];
  subject: string;
  salutation: string;
  paragraphs: string[];
  signOff: string;
};

function tanggalId(d: Date): string {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Total bulan pengalaman kerja dari rentang tanggal profil (deterministik, tanpa menebak). */
export function experienceMonths(r: Resume, now = new Date()): number {
  let total = 0;
  for (const w of r.work) {
    const [sy, sm] = w.start.split("-").map(Number);
    if (!sy) continue;
    const end = /sekarang|now|present/i.test(w.end) ? now : new Date(Number(w.end.slice(0, 4)), Number(w.end.slice(5, 7)) || 1, 1);
    const start = new Date(sy, (sm || 1) - 1, 1);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months > 0) total += months;
  }
  return total;
}

/**
 * Varian frasa: dipilih deterministik dari nama perusahaan + posisi.
 * Tujuannya: dua lamaran ke perusahaan berbeda tidak berbunyi identik, tapi lamaran yang sama selalu menghasilkan surat yang sama.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s.trim().toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** geser ikut di-hash, bukan ditambahkan, supaya tiap slot frasa tidak berkorelasi. */
export function pilihVarian<T>(arr: T[], seed: string, geser = 0): T {
  return arr[hash(`${seed}#${geser}`) % arr.length];
}

/** Kata kapital yang memang boleh muncul di surat tanpa ada di teks asli. */
const KATA_AMAN = new Set(["bapak", "ibu", "cv"]);
/** Klaim kredensial: kalau AI memunculkannya padahal teks asli tidak punya → tolak. */
const KLAIM = /sertifik|penghargaan|juara|pemenang|gelar|magang|toefl|ielts|ipk/i;

/**
 * Penjaga anti-halusinasi (inti, dipakai surat & email — toleransi panjang beda-beda).
 * Hasil parafrase AI hanya boleh memakai fakta yang sudah ada.
 * Tolak kalau ada angka baru, nama/merek baru di tengah kalimat, klaim kredensial baru,
 * teksnya berubah panjang ngawur, atau fakta aslinya malah hilang (ditulis ulang, bukan dirapikan).
 * ponytail: penjaga kata kunci — kalau nanti AI mulai lolos dengan klaim samar, tambah cek entitas/ner.
 */
export function cekAmanInti(asli: string, baru: string, min = 0.6, maks = 1.5): boolean {
  const n = baru.trim();
  if (!n) return false;
  if (n.length < asli.length * min || n.length > asli.length * maks) return false;

  const angka = (t: string) => new Set(t.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const asliAngka = angka(asli);
  if ([...angka(n)].some((x) => !asliAngka.has(x))) return false;
  if (KLAIM.test(n) && !KLAIM.test(asli)) return false;

  const ada = new Set(asli.toLowerCase().match(/[a-z]+/g) ?? []);
  // kata asli yang >=5 huruf harus tetap kebanyakan ada → AI merapikan, bukan menulis ulang
  const panjang = (t: string): string[] => t.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  const asliPanjang = new Set(panjang(asli));
  const selamat = panjang(n).filter((k) => asliPanjang.has(k)).length;
  if (asliPanjang.size && selamat / asliPanjang.size < 0.6) return false;
  const rapih = n.replace(/\s+/g, " ");
  for (const m of rapih.matchAll(/[A-Za-z]+/g)) {
    const kata = m[0];
    if (m.index === 0 || !/^[A-Z]/.test(kata)) continue;
    const sebelum = rapih.slice(Math.max(0, m.index - 2), m.index).trim();
    if (!sebelum || /[.!?:;]$/.test(sebelum)) continue; // awal kalimat, wajar berkapital
    const l = kata.toLowerCase();
    if (!ada.has(l) && !KATA_AMAN.has(l)) return false;
  }
  return true;
}

/** Penjaga surat: panjang wajib mirip aslinya — AI merapikan, bukan menulis ulang. */
export function cekAmanSurat(asli: string, baru: string): boolean {
  return cekAmanInti(asli, baru);
}

/**
 * Surat lamaran versi template. Sengaja TIDAK pakai LLM di MVP:
 * isinya hanya diambil dari profil + istilah JD, jadi mustahil mengarang pengalaman.
 * Kalau nanti ditambah LLM, guardrail-nya wajib sama: hanya parafrase data profil.
 */
export function buildLetter(r: Resume, job: Job, ats: AtsResult, now = new Date()): Letter {
  const b = r.basics;
  const last = r.work[0];
  const bulan = experienceMonths(r, now);
  const tahun = bulan >= 12 ? `${(bulan / 12).toFixed(bulan % 12 === 0 ? 0 : 1).replace(".", ",")} tahun` : `${bulan} bulan`;
  const seed = `${job.company ?? ""}|${job.position ?? ""}`;

  const cocok = ats.matched.filter((t) => t.includes(" ") || t.length > 3).slice(0, 6);
  const angka = r.work.flatMap((w) => w.highlights).find((h) => /\d/.test(h));

  const pos = job.position || "yang Bapak/Ibu buka";
  const src = job.source || "JobStreet";
  const label = b.label || "profesional";
  const akhir = last ? `, terakhir sebagai ${last.position} di ${last.company}` : "";

  const p1 = `${pilihVarian(
    [
      `Sehubungan dengan lowongan ${pos} yang saya temukan di ${src}, saya bermaksud melamar posisi tersebut.`,
      `Merujuk pada lowongan ${pos} di ${src}, saya mengajukan lamaran untuk posisi tersebut.`,
      `Saya menemukan lowongan ${pos} pada ${src} dan ingin mengajukan diri untuk posisi tersebut.`,
      `Lowongan ${pos} yang dipublikasikan di ${src} sejalan dengan latar belakang saya.`,
    ],
    seed,
  )} ${pilihVarian(
    [
      `Saya ${label} dengan pengalaman kerja ${tahun}${akhir}.`,
      `Latar belakang saya sebagai ${label} dengan pengalaman ${tahun}${akhir}.`,
      `Selama ${tahun} saya bekerja sebagai ${label}${akhir}, dan saya ingin melanjutkan di bidang yang sama.`,
    ],
    seed,
    5,
  )}`;

  const p2 = cocok.length
    ? `${pilihVarian(
        [
          `Setelah membaca deskripsi lowongan, saya melihat beberapa kualifikasi yang sejalan dengan pengalaman saya, di antaranya ${cocok.join(", ")}.`,
          `Dari deskripsi lowongan tersebut, beberapa hal yang sejalan dengan pengalaman saya adalah ${cocok.join(", ")}.`,
          `Deskripsi lowongan menyebut beberapa hal yang sudah saya kerjakan sehari-hari, antara lain ${cocok.join(", ")}.`,
        ],
        seed,
        11,
      )}${angka ? ` Sebagai gambaran hasil kerja saya: ${angka}` : ""}`
    : `${b.summary}`;

  const p3 = pilihVarian(
    [
      `Saya melampirkan curriculum vitae sebagai bahan pertimbangan. Saya siap menjelaskan pengalaman dan hasil kerja saya lebih rinci pada sesi wawancara, dan dapat mulai bekerja sesuai kesepakatan. Terima kasih atas waktu dan pertimbangan Bapak/Ibu.`,
      `CV saya terlampir sebagai bahan pertimbangan. Saya bersedia menjelaskan pengalaman dan hasil kerja saya lebih rinci saat wawancara, dan siap mulai bekerja sesuai kesepakatan. Terima kasih atas perhatian Bapak/Ibu.`,
      `Sebagai bahan pertimbangan, saya lampirkan curriculum vitae. Saya senang berdiskusi lebih rinci mengenai pengalaman saya pada sesi wawancara, dan dapat mulai bekerja sesuai kesepakatan. Atas waktu dan pertimbangan Bapak/Ibu, saya ucapkan terima kasih.`,
    ],
    seed,
    7,
  );

  return {
    dateLine: `${b.city || "Indonesia"}, ${tanggalId(now)}`,
    addressee: [`Kepada Yth.`, `Tim Rekrutmen ${job.company || "(nama perusahaan)"}`, `di tempat`],
    subject: `Lamaran Pekerjaan — ${job.position || "(posisi)"}`,
    salutation: "Dengan hormat,",
    paragraphs: [p1, p2, p3],
    signOff: b.name,
  };
}
