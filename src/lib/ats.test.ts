import assert from "node:assert/strict";
import test from "node:test";
import { sampleResume } from "../data/sample.ts";
import { atsScore, atsWarnings, extractTerms, resumeText } from "./ats.ts";

const jd = `Kami mencari Frontend Developer berpengalaman.
Tanggung jawab: membangun antarmuka aplikasi menggunakan React dan Next.js, mengintegrasikan REST API,
menjaga kualitas kode TypeScript, bekerja sama dengan tim desain.
Persyaratan: minimal 2 tahun pengalaman sebagai pengembang frontend, menguasai React, TypeScript, Tailwind CSS,
memahami Git. Bahasa pemrograman apa saja yang bisa kamu gunakan? Pengalaman dengan Supabase nilai tambah.`;

const kosong = {
  basics: { name: "", label: "", email: "", phone: "", city: "", summary: "" },
  work: [],
  education: [],
  projects: [],
  skills: [],
};

test("JD menghasilkan istilah teknis, bukan kata umum", () => {
  const bag = extractTerms(jd);
  assert.ok(bag.has("react"), "react harus terdeteksi");
  assert.ok(bag.has("next.js"), "next.js harus terdeteksi");
  assert.ok(!bag.has("yang"), "kata umum harus dibuang");
  assert.ok(!bag.has("kami"), "kata umum harus dibuang");
});

test("CV sample cocok tinggi dengan JD frontend", () => {
  const r = atsScore(sampleResume, jd);
  assert.ok(r.score > 30, `skor terlalu rendah: ${r.score}`);
  assert.ok(r.matched.includes("react"));
  assert.ok(r.missing.length > 0, "harus melaporkan yang belum ada di CV");
});

test("JD yang tidak relevan skornya jauh lebih rendah", () => {
  const koki = `Dibutuhkan barista dan koki untuk kafe baru. Persyaratan: menguasai teknik latte art,
  pengalaman menangani espresso machine, memahami standar HACCP kebersihan dapur, sanggup kerja shift malam.`;
  const cocok = atsScore(sampleResume, jd).score;
  const meleset = atsScore(sampleResume, koki).score;
  assert.ok(cocok > meleset + 5, `frontend ${cocok} vs koki ${meleset} — pembeda terlalu lemah`);
});

test("CV kosong terhadap JD => skor 0", () => {
  assert.equal(atsScore(kosong, "Hanya butuh Kubernetes dan Go").score, 0);
});

test("teks CV memuat seluruh bagian", () => {
  const t = resumeText(sampleResume);
  for (const part of ["Abdul Rahman", "Next.js", "Universitas Teknologi Indonesia", "Kasirku"]) {
    assert.ok(t.includes(part), `hilang: ${part}`);
  }
});

test("peringatan format muncul saat data kurang", () => {
  const w = atsWarnings({ ...sampleResume, skills: [], basics: { ...sampleResume.basics, summary: "Singkat." } });
  assert.ok(w.length >= 2, `hanya ${w.length} peringatan`);
});

test("JD kosong tidak error", () => {
  assert.deepEqual(atsScore(sampleResume, ""), { score: 0, matched: [], missing: [] });
});
