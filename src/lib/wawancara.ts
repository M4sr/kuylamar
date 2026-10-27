import type { Job, Resume } from "../types";
import { atsScore, tokens } from "./ats.ts";

export type Tanya = { q: string; kunci: string[] };

/** Jumlah pertanyaan yang wajar untuk satu sesi latihan. */
export const JUMLAH = 8;

const UMUM = [
  "Jawab 1–2 menit, urut: sekarang → pengalaman paling relevan → kenapa posisi ini.",
  "Sebut contoh nyata dari CV, bukan sifat umum seperti \"pekerja keras\".",
];

/**
 * Pertanyaan standar + petunjuk jawaban yang isinya diambil dari CV & JD (bukan karangan).
 * Dipakai sebagai versi dasar, sekaligus jadi bahan saat AI tidak tersedia.
 */
export function bank(r: Resume, job: Job): Tanya[] {
  const a = atsScore(r, job.description);
  const pos = job.position.trim() || r.basics.label.trim() || "posisi ini";
  const pt = job.company.trim() || "perusahaan ini";
  const kerja = r.work[0];
  const angka = r.work.flatMap((w) => w.highlights).find((h) => /\d/.test(h));
  const skill = r.skills.flatMap((s) => s.keywords);
  const kurang = a.missing.slice(0, 3);
  const ada = a.matched.slice(0, 3);
  const proyek = r.projects[0];

  const daftar: Tanya[] = [
    {
      q: `Ceritakan singkat tentang diri kamu dan kenapa cocok untuk posisi ${pos}?`,
      kunci: [
        r.basics.label && `posisi sekarang: ${r.basics.label}`,
        kerja && `pengalaman sebagai ${kerja.position} di ${kerja.company}`,
        ...UMUM,
      ].filter(Boolean) as string[],
    },
    {
      q: `Kenapa kamu tertarik bekerja di ${pt}?`,
      kunci: ["Sebut hal nyata dari JD/deskripsi perusahaan, bukan pujian umum.", kerja && `hubungkan dengan pekerjaan di ${kerja.company}.`, ...UMUM],
    },
  ];

  if (angka) {
    daftar.push({
      q: "Ceritakan pencapaian kerja yang paling kamu banggakan?",
      kunci: [`Angka di CV yang bisa kamu pakai: "${angka.length > 90 ? `${angka.slice(0, 90)}…` : angka}"`, "Pakai struktur: keadaan → yang kamu lakukan → hasil.", ...UMUM],
    });
  } else {
    daftar.push({
      q: "Ceritakan hasil kerja yang paling kamu banggakan?",
      kunci: ["Pakai struktur: keadaan → yang kamu lakukan → hasil.", "Belum ada angka di CV — sebut dampaknya secara kualitatif, jangan mengarang angka.", ...UMUM],
    });
  }

  for (const k of ada) {
    daftar.push({
      q: `Bagaimana pengalaman nyata kamu dengan ${k}?`,
      kunci: [`Ini sudah ada di CV — sebut proyek/pekerjaan konkretnya${proyek ? `, mis. ${proyek.name}` : ""}.`, "Sebut 1 masalah nyata yang pernah kamu selesaikan dengan itu."],
    });
  }

  for (const k of kurang) {
    daftar.push({
      q: `Kalau kami pakai ${k}, sejauh mana kamu menguasainya?`,
      kunci: [`${k} belum ada di CV — jawab jujur.`, "Kalau belum pernah: sebut yang paling dekat yang sudah kamu kuasai + rencana belajar.", skill[0] && `keahlian terdekat: ${skill.slice(0, 3).join(", ")}`].filter(Boolean) as string[],
    });
  }

  daftar.push(
    {
      q: "Ceritakan saat kamu menghadapi tekanan tenggat atau masalah yang tidak terduga?",
      kunci: ["Struktur STAR: Situasi, Tugas, Aksi, Hasil.", "Tutup dengan pelajaran/pencegahan yang kamu lakukan.", ...UMUM],
    },
    {
      q: "Apa kelebihan dan kekurangan kamu?",
      kunci: ["Kelebihan: sebut 1 yang bisa dibuktikan dari CV.", "Kekurangan: sebut 1 yang nyata + langkah perbaikan yang sedang kamu jalankan."],
    },
    {
      q: "Berapa ekspektasi gaji kamu?",
      kunci: ["Sebut rentang (bukan angka tunggal) dan alasannya.", "Sebut bahwa kamu terbuka mendiskusikan tunjangan & pengembangan."],
    },
    {
      q: "Ada yang mau kamu tanyakan ke kami?",
      kunci: ["Siapkan 2 pertanyaan soal tim, alat kerja, atau target 3 bulan pertama.", "Hindari pertanyaan yang jawabannya ada di lowongan."],
    },
  );

  return daftar;
}

/** Ambil daftar pertanyaan dari balasan AI: satu per baris, tiap baris harus bertanya. */
export function parsePertanyaan(teks: string, maks = 12): string[] {
  const baris = teks
    .replace(/```[a-z]*|```/gi, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 12 && l.endsWith("?") && /\s/.test(l));
  const unik: string[] = [];
  for (const b of baris) {
    if (!unik.some((u) => u.toLowerCase() === b.toLowerCase())) unik.push(b);
  }
  return unik.slice(0, maks);
}

/** Petunjuk jawaban untuk sebuah pertanyaan: ambil dari pertanyaan bank yang paling mirip. */
export function petunjuk(q: string, daftar: Tanya[]): string[] {
  const a = new Set(tokens(q));
  if (a.size === 0) return [];
  let terbaik: { t: Tanya; skor: number } | null = null;
  for (const t of daftar) {
    const b = new Set(tokens(t.q));
    let sama = 0;
    for (const w of a) if (b.has(w)) sama++;
    const skor = sama / Math.min(a.size, b.size || 1);
    if (skor > 0.4 && (!terbaik || skor > terbaik.skor)) terbaik = { t, skor };
  }
  return terbaik?.t.kunci ?? [];
}
