import type { Basics, Job, Resume } from "../types";
// ekstensi .ts wajib: berkas ini ikut dijalankan `node --test` (ESM murni, tanpa bundler)
import { experienceMonths, pilihVarian } from "./cover.ts";

export type Jenis = "lamaran" | "followup" | "wawancara";

export const JENIS: { value: Jenis; label: string; hint: string }[] = [
  { value: "lamaran", label: "Lamaran", hint: "Kirim lamaran lewat email." },
  { value: "followup", label: "Follow-up", hint: "Menanyakan kabar lamaran." },
  { value: "wawancara", label: "Wawancara", hint: "Konfirmasi jadwal wawancara." },
];

export type Surel = { jenis: Jenis; subjek: string; isi: string };

/** Isian yang tidak ada di profil/lowongan: email tujuan, jadwal, nama pewawancara. */
export type Opsi = { jadwal?: string; pewawancara?: string; cocok?: string[] };

const tahun = (r: Resume, now: Date): string => {
  const b = experienceMonths(r, now);
  return b >= 12 ? `${(b / 12).toFixed(b % 12 === 0 ? 0 : 1).replace(".", ",")} tahun` : `${b} bulan`;
};

/** Blok tanda tangan — murni dari profil, jadi mustahil mengarang kontak. */
function tandaTangan(b: Basics): string {
  return ["Hormat saya,", b.name || "(nama kamu)", b.label, [b.email, b.phone].filter(Boolean).join(" | "), b.linkedin, b.github]
    .filter(Boolean)
    .join("\n");
}

/** Subjek dibuat deterministik (bukan karangan AI): jelas, singkat, ada posisi + nama. */
export function subjek(jenis: Jenis, job: Job, nama: string): string {
  const pos = job.position || "posisi ini";
  const akhir = nama ? ` — ${nama}` : "";
  if (jenis === "followup") return `Tindak lanjut lamaran ${pos}${akhir}`;
  if (jenis === "wawancara") return `Konfirmasi wawancara ${pos}${akhir}`;
  return `Lamaran ${pos}${job.company ? ` di ${job.company}` : ""}${akhir}`;
}

/**
 * Email siap kirim versi template — tanpa LLM. Isinya hanya dari profil + JD,
 * jadi tidak mungkin mengarang pengalaman; versi AI hanya merapikan kalimat ini.
 */
export function buildEmail(jenis: Jenis, r: Resume, job: Job, opsi: Opsi = {}, now = new Date()): Surel {
  const b = r.basics;
  const pos = job.position || "posisi yang Bapak/Ibu buka";
  const pt = job.company || "(nama perusahaan)";
  const src = job.source || "JobStreet";
  const nama = b.name || "(nama kamu)";
  // nama pewawancara hanya masuk akal untuk email wawancara; jenis lain selalu ke tim rekrutmen
  const sapaan = `Yth. ${jenis === "wawancara" && opsi.pewawancara ? opsi.pewawancara : `Tim Rekrutmen ${pt}`},`;
  // varian ikut jenis: email follow-up & lamaran untuk lowongan yang sama tidak berbunyi identik
  const v = (arr: string[], geser: number) => pilihVarian(arr, `${job.company}|${job.position}|${jenis}`, geser);
  const cocok = (opsi.cocok ?? []).filter((t) => t.includes(" ") || t.length > 3).slice(0, 6);
  const akhir = r.work[0] ? `, terakhir sebagai ${r.work[0].position} di ${r.work[0].company}` : "";
  const label = b.label || "profesional";

  let isi: string;
  if (jenis === "followup") {
    isi = [
      sapaan,
      "",
      v(
        [
          `Saya ${nama}, melamar posisi ${pos} di ${pt} melalui ${src} dan ingin menanyakan perkembangan proses seleksinya.`,
          `Saya ${nama}, salah satu pelamar posisi ${pos} di ${pt}. Saya ingin menanyakan kabar proses seleksi yang sedang berjalan.`,
          `Saya ${nama}, pelamar posisi ${pos} di ${pt} melalui ${src}. Saya bermaksud menanyakan status lamaran saya.`,
        ],
        2,
      ),
      "",
      v(
        [
          `Saya masih berharap dapat bergabung dan siap mengikuti tahap berikutnya kapan pun dibutuhkan.`,
          `Saya tetap tertarik pada posisi ini dan siap mengikuti tahap seleksi berikutnya bila diperlukan.`,
        ],
        3,
      ),
      "",
      "Terima kasih atas waktu dan perhatian Bapak/Ibu.",
      "",
      tandaTangan(b),
    ].join("\n");
  } else if (jenis === "wawancara") {
    isi = [
      sapaan,
      "",
      v(
        [
          `Terima kasih atas undangan wawancara untuk posisi ${pos} di ${pt}.`,
          `Terima kasih atas undangan wawancaranya untuk posisi ${pos} di ${pt}.`,
          `Saya mengucapkan terima kasih atas undangan wawancara untuk posisi ${pos} di ${pt}.`,
        ],
        4,
      ),
      "",
      opsi.jadwal
        ? `Saya mengonfirmasi kehadiran saya pada ${opsi.jadwal}.`
        : "Saya mengonfirmasi kehadiran saya sesuai jadwal yang Bapak/Ibu kirimkan.",
      "",
      `Bila ada dokumen atau persiapan yang perlu saya bawa, mohon diberi tahu. Saya siap dihubungi di ${[b.phone, b.email].filter(Boolean).join(" atau ") || "kontak yang tertera"}.`,
      "",
      tandaTangan(b),
    ].join("\n");
  } else {
    isi = [
      sapaan,
      "",
      `${v(
        [
          `Sehubungan dengan lowongan ${pos} yang saya temukan di ${src}, saya mengajukan lamaran untuk posisi tersebut melalui email ini.`,
          `Merujuk pada lowongan ${pos} di ${src}, saya bermaksud melamar posisi tersebut.`,
          `Saya menemukan lowongan ${pos} di ${src} dan ingin mengajukan lamaran untuk posisi tersebut.`,
        ],
        0,
      )} ${v(
        [
          `Saya ${label} dengan pengalaman kerja ${tahun(r, now)}${akhir}.`,
          `Latar belakang saya sebagai ${label} dengan pengalaman ${tahun(r, now)}${akhir}.`,
          `Selama ${tahun(r, now)} saya bekerja sebagai ${label}${akhir}, dan ingin melanjutkan di bidang yang sama.`,
        ],
        5,
      )}`,
      "",
      cocok.length
        ? v(
            [
              `Beberapa kualifikasi yang disebut di deskripsi lowongan sudah saya kerjakan sehari-hari, antara lain ${cocok.join(", ")}.`,
              `Dari deskripsi lowongan tersebut, hal-hal yang sejalan dengan pengalaman saya antara lain ${cocok.join(", ")}.`,
              `Deskripsi lowongan menyebut beberapa hal yang sudah menjadi pekerjaan saya sehari-hari, di antaranya ${cocok.join(", ")}.`,
            ],
            11,
          )
        : b.summary || "Saya siap menjelaskan pengalaman dan hasil kerja saya lebih rinci pada sesi wawancara.",
      "",
      "CV saya lampirkan pada email ini sebagai bahan pertimbangan. Terima kasih atas waktu dan pertimbangan Bapak/Ibu.",
      "",
      tandaTangan(b),
    ].join("\n");
  }

  return { jenis, subjek: subjek(jenis, job, b.name), isi };
}

/** Tautan mailto: buka aplikasi email bawaan dengan subjek + isi sudah terisi. */
export function mailto(kepada: string, s: Surel): string {
  const q = new URLSearchParams({ subject: s.subjek, body: s.isi }).toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(kepada.trim())}?${q}`;
}
