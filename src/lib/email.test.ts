import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleResume } from "../data/sample.ts";
import type { Job, Resume } from "../types.ts";
import { cekAmanInti } from "./cover.ts";
import { buildEmail, mailto, subjek, type Jenis } from "./email.ts";

const job: Job = { position: "Frontend Developer", company: "PT Uji Coba", source: "JobStreet", url: "https://x/1", description: "React, TypeScript, Next.js" };
const profil: Resume = { ...sampleResume, basics: { ...sampleResume.basics, email: "rahman@email.com", phone: "+62 812-3456-7890" } };
const semua: Jenis[] = ["lamaran", "followup", "wawancara"];

test("email menyebut perusahaan, posisi, dan nama pelamar", () => {
  for (const jenis of semua) {
    const s = buildEmail(jenis, profil, job);
    assert.ok(s.isi.includes("PT Uji Coba"), `${jenis}: perusahaan hilang`);
    assert.ok(s.isi.includes("Frontend Developer"), `${jenis}: posisi hilang`);
    assert.ok(s.isi.includes("Hormat saya,\nAbdul Rahman"), `${jenis}: nama tidak langsung ikut salam penutup`);
    assert.ok(s.subjek.includes("Frontend Developer"), `${jenis}: subjek tanpa posisi`);
    assert.ok(s.subjek.includes("Abdul Rahman"), `${jenis}: subjek tanpa nama`);
  }
});

test("tanda tangan pakai kontak profil, tanpa kontak karangan", () => {
  const s = buildEmail("lamaran", profil, job);
  assert.ok(s.isi.includes("rahman@email.com"));
  assert.ok(s.isi.includes("+62 812-3456-7890"));
  assert.ok(!s.isi.includes("hrd@"), "email tujuan tidak boleh masuk isi");
});

test("jenis email menghasilkan teks berbeda", () => {
  const a = buildEmail("lamaran", profil, job).isi;
  const b = buildEmail("followup", profil, job).isi;
  const c = buildEmail("wawancara", profil, job).isi;
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(b.includes("Terima kasih atas waktu dan perhatian Bapak/Ibu."), "follow-up tanpa penutup khas menanyakan kabar");
  assert.ok(c.includes("mengonfirmasi kehadiran"));
});

test("jadwal & pewawancara hanya dipakai di email wawancara", () => {
  const opsi = { jadwal: "Selasa, 27 Oktober 2026, 10.00 WIB", pewawancara: "Bu Sari" };
  const w = buildEmail("wawancara", profil, job, opsi).isi;
  assert.ok(w.includes("Selasa, 27 Oktober 2026, 10.00 WIB"));
  assert.ok(w.startsWith("Yth. Bu Sari,"));
  const l = buildEmail("lamaran", profil, job, opsi).isi;
  assert.ok(!l.includes("Selasa, 27 Oktober"), "jadwal tidak bocor ke email lamaran");
  assert.ok(l.startsWith("Yth. Tim Rekrutmen PT Uji Coba,"));
});

test("wawancara tanpa jadwal tetap mengalir, tidak ada kalimat menggantung", () => {
  const s = buildEmail("wawancara", profil, job).isi;
  assert.ok(s.includes("sesuai jadwal yang Bapak/Ibu kirimkan"));
  assert.ok(!/pada\s*\./.test(s));
});

test("daftar kualifikasi JD dipakai apa adanya, maksimal 6", () => {
  const s = buildEmail("lamaran", profil, job, { cocok: ["React", "TypeScript", "Next.js", "REST API", "Code Splitting", "Caching", "Testing"] }).isi;
  assert.ok(s.includes("React, TypeScript"));
  assert.ok(!s.includes("Testing"), "kelebihan item harus dipotong");
});

test("deterministik: lowongan sama → email sama, beda lowongan → varian ikut bergeser", () => {
  assert.equal(buildEmail("lamaran", profil, job).isi, buildEmail("lamaran", profil, job).isi);
  const lain = buildEmail("lamaran", profil, { ...job, company: "PT Lain", position: "Backend Developer" }).isi;
  assert.ok(lain.includes("PT Lain"));
  assert.notEqual(lain, buildEmail("lamaran", profil, job).isi);
});

test("email tanpa data profil tidak menyisakan placeholder kosong/aneh", () => {
  const kosong: Resume = { ...sampleResume, basics: { ...sampleResume.basics, name: "", email: "", phone: "" } };
  const s = buildEmail("lamaran", kosong, { ...job, position: "", company: "" });
  assert.ok(s.isi.includes("(nama kamu)"));
  assert.ok(!/undefined|null|NaN/.test(s.isi + s.subjek));
  assert.ok(s.isi.startsWith("Yth. Tim Rekrutmen (nama perusahaan),"));
});

test("subjek selalu satu baris, tanpa baris baru", () => {
  for (const jenis of semua) assert.ok(!/\n/.test(subjek(jenis, job, "Abdul Rahman")));
});

test("mailto membawa subjek + isi, spasi tidak jadi tanda plus", () => {
  const s = buildEmail("lamaran", profil, job);
  const url = mailto("hrd@perusahaan.com", s);
  assert.ok(url.startsWith("mailto:hrd%40perusahaan.com?subject="));
  assert.ok(!url.includes("+"), "mailto memakai %20, bukan +");
  assert.ok(decodeURIComponent(url.split("body=")[1]).includes("Abdul Rahman"));
});

test("penjaga anti-halusinasi menolak angka & kredensial baru", () => {
  const asli = buildEmail("lamaran", profil, job).isi;
  assert.equal(cekAmanInti(asli, asli, 0.4, 2), true, "teks apa adanya harus lolos");
  assert.equal(cekAmanInti(asli, asli.replace("PT Nusantara Digital", "PT Nusantara Digital dengan 50 karyawan"), 0.4, 2), false, "angka baru ditolak");
  assert.equal(cekAmanInti(asli, `${asli} Saya bergelar S1 dan bersertifikat TOEFL.`, 0.4, 2), false, "klaim kredensial baru ditolak");
});
