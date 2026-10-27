import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLetter, cekAmanSurat } from "./cover.ts";
import type { AtsResult } from "./ats.ts";
import type { Job, Resume } from "../types.ts";

const resume: Resume = {
  basics: {
    name: "Abdul Rahman",
    label: "Web Developer",
    email: "a@b.c",
    phone: "08",
    city: "Bekasi",
    summary: "Ringkasan profil.",
  },
  work: [
    { company: "PT Maju", position: "Frontend Dev", start: "2022-01", end: "sekarang", highlights: ["Menurunkan waktu muat 40%"] },
  ],
  education: [],
  projects: [],
  skills: [],
};

const ats: AtsResult = { score: 70, matched: ["react", "typescript"], missing: [] };

const job = (company: string, position = "Web Developer"): Job => ({
  company,
  position,
  source: "JobStreet",
  description: "React TypeScript",
});

test("surat: lamaran sama selalu menghasilkan surat sama (deterministik)", () => {
  const a = buildLetter(resume, job("PT Satu"), ats, new Date("2026-01-02"));
  const b = buildLetter(resume, job("PT Satu"), ats, new Date("2026-01-02"));
  assert.deepEqual(a, b);
});

test("surat: perusahaan berbeda memakai varian frasa berbeda", () => {
  const p1 = new Set<string>();
  const p3 = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const l = buildLetter(resume, job(`PT Contoh ${i}`), ats);
    p1.add(l.paragraphs[0]);
    p3.add(l.paragraphs[2]);
  }
  assert.ok(p1.size >= 8, `variant p1 cuma ${p1.size}`);
  assert.ok(p3.size >= 3, `variant p3 cuma ${p3.size}`);
});

const asli = "Saya Web Developer dengan pengalaman 4,8 tahun, terakhir sebagai Frontend Dev di PT Maju.";

test("penjaga: parafrase wajar lolos, fakta baru ditolak", () => {
  assert.equal(cekAmanSurat(asli, "Sebagai Web Developer dengan pengalaman 4,8 tahun, terakhir menjabat sebagai Frontend Dev di PT Maju, saya siap berkontribusi."), true);
  assert.equal(cekAmanSurat(asli, "Saya Web Developer dengan pengalaman 6 tahun di PT Maju."), false, "angka baru harus ditolak");
  assert.equal(cekAmanSurat(asli, "Saya Web Developer bersertifikat AWS di PT Maju."), false, "klaim kredensial baru harus ditolak");
  assert.equal(cekAmanSurat(asli, "Saya Web Developer di PT Sejahtera."), false, "nama perusahaan baru harus ditolak");
  assert.equal(cekAmanSurat(asli, "Singkat."), false, "potongan terlalu pendek harus ditolak");
  assert.equal(cekAmanSurat(asli, ""), false);
  assert.equal(
    cekAmanSurat(
      "Saya siap melamar posisi ini. Terima kasih atas waktu Bapak/Ibu.",
      "Saya siap mengajukan lamaran pada posisi ini. Terima kasih atas waktu Bapak/Ibu.",
    ),
    true,
    "sapaan Bapak/Ibu jangan dianggap temuan",
  );
  assert.equal(cekAmanSurat(asli, "Saya Web Developer. Di Gojek saya memimpin tim."), false, "nama perusahaan asing tetap harus ditolak");
});

test("surat: tetap memuat data profil + kata kunci JD, tanpa klaim baru", () => {
  const l = buildLetter(resume, job("PT Satu"), ats, new Date("2026-01-02"));
  const teks = l.paragraphs.join(" ");
  assert.match(teks, /Web Developer/);
  assert.match(teks, /react/);
  assert.match(teks, /Frontend Dev di PT Maju/);
  assert.deepEqual(l.addressee, ["Kepada Yth.", "Tim Rekrutmen PT Satu", "di tempat"]);
  assert.equal(l.subject, "Lamaran Pekerjaan — Web Developer");
});
