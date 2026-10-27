import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleResume } from "../data/sample.ts";
import { atsScore } from "./ats.ts";
import { buildLetter } from "./cover.ts";
import { buildEmail } from "./email.ts";
import { labelPaket, namaBerkas, paketLamaran, suratTeks } from "./paket.ts";
import type { Job, Resume } from "../types.ts";

const job: Job = { position: "Frontend Developer", company: "PT Uji Coba", source: "JobStreet", url: "https://x/1", description: "React, TypeScript, Next.js" };
const profil: Resume = { ...sampleResume, basics: { ...sampleResume.basics, name: "Abdul Rahman", email: "rahman@email.com" } };
const letter = buildLetter(profil, job, atsScore(profil, job.description));

test("namaBerkas: hanya huruf/angka/dash, tanpa spasi & aksen", () => {
  assert.equal(namaBerkas("CV Budi & Sari/2026"), "CV-Budi-Sari-2026");
  assert.equal(namaBerkas("  --  "), "lamaran");
  assert.equal(namaBerkas(""), "lamaran");
  assert.equal(namaBerkas("a".repeat(200)).length, 60);
  assert.ok(!/[^A-Za-z0-9-]/.test(namaBerkas("PT. Sumber Rejeki (Bandung)")));
});

test("labelPaket: nama-pendek di depan, tanpa segmen kosong", () => {
  assert.equal(labelPaket(profil, job), "Abdul-Rahman-Frontend-Developer-PT-Uji-Coba");
  assert.equal(labelPaket(profil, { ...job, company: "" }), "Abdul-Rahman-Frontend-Developer");
});

test("suratTeks: urutan bagian surat lengkap", () => {
  const t = suratTeks(letter);
  assert.ok(t.startsWith(letter.dateLine.split("\n")[0]), "tanggal tidak di awal");
  assert.ok(t.includes(letter.subject), "perihal hilang");
  for (const p of letter.paragraphs) assert.ok(t.includes(p), "paragraf hilang");
  assert.ok(t.trimEnd().endsWith("Abdul Rahman"), "salam penutup/tanda tangan hilang");
});

test("paketLamaran: 5 berkas, email & surat terisi, data.json valid", () => {
  const berkas = paketLamaran({ resume: profil, job, letter, pelacak: [] });
  assert.deepEqual(
    berkas.map((b) => b.nama),
    ["email.txt", "surat.txt", "lowongan.txt", "data.json", "PETUNJUK.txt"],
  );
  const email = buildEmail("lamaran", profil, job);
  assert.equal(berkas[0].isi, `Subjek: ${email.subjek}\n\n${email.isi}\n`);
  assert.ok(berkas[1].isi.includes(letter.subject));
  assert.ok(berkas[2].isi.includes("Frontend Developer") && berkas[2].isi.includes("Next.js"));
  const data = JSON.parse(berkas[3].isi) as { profil: Resume; lowongan: Job; pelacak: unknown[] };
  assert.equal(data.lowongan.company, "PT Uji Coba");
  assert.equal(data.profil.basics.name, "Abdul Rahman");
  assert.deepEqual(data.pelacak, []);
});

test("paketLamaran: surel suntingan manual dipakai apa adanya + petunjuk sebut nama PDF", () => {
  const surel = { subjek: "Lamaran Frontend — Abdul Rahman", isi: "Halo, saya Abdul Rahman." };
  const berkas = paketLamaran({ resume: profil, job, letter, surel });
  assert.ok(berkas[0].isi.startsWith("Subjek: Lamaran Frontend — Abdul Rahman"));
  assert.ok(berkas[4].isi.includes("CV-Abdul-Rahman-Frontend-Developer-PT-Uji-Coba.pdf"));
  assert.ok(berkas[4].isi.includes("Checklist sebelum kirim"));
});

test("paketLamaran: lowongan kosong tidak membuat berkas gagal", () => {
  const kosong: Job = { position: "", company: "", source: "", url: "", description: "" };
  const berkas = paketLamaran({ resume: profil, job: kosong, letter });
  assert.equal(berkas.length, 5);
  assert.ok(berkas[2].isi.includes("Posisi     : -"));
});
