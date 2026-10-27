import type { Job, Resume } from "../types";
import type { Letter } from "./cover";
import { buildEmail, type Surel } from "./email.ts";
import type { Lamaran } from "./pelacak";
import type { Berkas } from "./zip";

/** Nama berkas aman (huruf/angka/dash) dari teks bebas — termasuk perusahaan ber-aksen/emoji. */
export function namaBerkas(s: string, maks = 60): string {
  const r = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maks)
    .replace(/-+$/, "");
  return r || "lamaran";
}

/** Label paket: `Nama-Posisi-Perusahaan`. */
export function labelPaket(r: Resume, job: Job): string {
  const seg = (s: string, maks: number) => (s.trim() ? namaBerkas(s, maks) : "");
  return [seg(r.basics.name, 30), seg(job.position, 30), seg(job.company, 30)].filter(Boolean).join("-") || "lamaran";
}

export function suratTeks(letter: Letter): string {
  return [letter.dateLine, "", ...letter.addressee, "", letter.subject, "", letter.salutation, "", ...letter.paragraphs, "", letter.signOff]
    .join("\n")
    .trim();
}

/**
 * Isi paket lamaran. PDF tidak dibuat di sini — browser yang menghasilkan file PDF dari tombol Cetak;
 * jadi petunjuknya menyebut nama berkas yang dipakai saat menyimpan PDF.
 */
export function paketLamaran({
  resume,
  job,
  letter,
  surel,
  pelacak,
}: {
  resume: Resume;
  job: Job;
  letter: Letter;
  surel?: Surel | null;
  pelacak?: Lamaran[];
}): Berkas[] {
  const label = labelPaket(resume, job);
  const email = surel ?? buildEmail("lamaran", resume, job, {});
  const pratinjau = [
    "PAKET LAMARAN",
    "",
    `Pelamar   : ${resume.basics.name || "-"}`,
    `Posisi    : ${job.position || "-"}`,
    `Perusahaan: ${job.company || "-"}`,
    `Sumber    : ${job.source || "-"}${job.url ? ` (${job.url})` : ""}`,
    "",
    "Berkas di paket ini",
    "  1. email.txt     — subjek + isi email siap tempel",
    "  2. surat.txt     — isi surat lamaran",
    "  3. lowongan.txt  — data lowongan + deskripsi (JD)",
    "  4. data.json     — cadangan profil, lowongan, dan pelacak lamaran",
    "  5. PETUNJUK.txt  — langkah kirim + nama berkas PDF",
    "",
    "Nama berkas PDF yang disarankan (buat dari tab Pratinjau → Cetak CV / Surat):",
    `  CV-${label}.pdf`,
    `  Surat-${label}.pdf`,
    "",
    "Checklist sebelum kirim",
    "  [ ] Baca ulang email & surat, pastikan tidak ada fakta yang salah",
    "  [ ] Lampirkan CV PDF",
    "  [ ] Sudah diuji buka di HP (lampiran terbaca)",
    "  [ ] Catat lamaran ini di tab Lamaran, beri pengingat follow-up",
  ].join("\n");

  return [
    { nama: "email.txt", isi: `Subjek: ${email.subjek}\n\n${email.isi}\n` },
    { nama: "surat.txt", isi: `${suratTeks(letter)}\n` },
    {
      nama: "lowongan.txt",
      isi: [
        `Posisi     : ${job.position || "-"}`,
        `Perusahaan : ${job.company || "-"}`,
        `Sumber     : ${job.source || "-"}`,
        `URL        : ${job.url || "-"}`,
        "",
        "Deskripsi lowongan (JD):",
        job.description.trim() || "-",
        "",
      ].join("\n"),
    },
    { nama: "data.json", isi: `${JSON.stringify({ profil: resume, lowongan: job, pelacak: pelacak ?? [] }, null, 2)}\n` },
    { nama: "PETUNJUK.txt", isi: `${pratinjau}\n` },
  ];
}
