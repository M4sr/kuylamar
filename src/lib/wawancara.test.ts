import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleResume } from "../data/sample.ts";
import type { Job } from "../types.ts";
import { bank, JUMLAH, parsePertanyaan, petunjuk } from "./wawancara.ts";

const job: Job = {
  position: "Frontend Developer",
  company: "PT Uji Coba",
  source: "JobStreet",
  url: "https://x/1",
  description: "React, TypeScript, Next.js, GraphQL, Docker, Kubernetes, Figma",
};

test("bank: minimal 8 pertanyaan, semua bertanya, tiap item punya petunjuk", () => {
  const d = bank(sampleResume, job);
  assert.ok(d.length >= JUMLAH, `cuma ${d.length} pertanyaan`);
  for (const t of d) {
    assert.ok(t.q.trim().endsWith("?"), `bukan pertanyaan: ${t.q}`);
    assert.ok(t.q.length > 15, `pertanyaan terlalu pendek: ${t.q}`);
    assert.ok(Array.isArray(t.kunci), `petunjuk hilang: ${t.q}`);
  }
  const teks = d.map((t) => t.q).join("\n");
  assert.ok(teks.includes("PT Uji Coba"), "nama perusahaan tidak dipakai");
  assert.ok(teks.includes("Frontend Developer"), "posisi tidak dipakai");
});

test("bank: kata kunci JD yang belum ada di CV muncul sebagai pertanyaan", () => {
  const d = bank(sampleResume, job);
  const teks = d.map((t) => t.q).join("\n").toLowerCase();
  assert.ok(teks.includes("kubernetes") || teks.includes("docker") || teks.includes("graphql"), "tidak ada pertanyaan soal kata kunci JD");
});

test("bank: tanpa JD tetap jalan (fallback posisi/label)", () => {
  const d = bank(sampleResume, { position: "", company: "", source: "", url: "", description: "" });
  assert.ok(d.length >= 5);
  assert.ok(d.every((t) => t.q.trim().endsWith("?")));
});

test("parsePertanyaan: buang nomor/bullet, tolak baris bukan pertanyaan, dedupe", () => {
  const q = parsePertanyaan(
    [
      "1. Ceritakan pengalaman React kamu?",
      "- Bagaimana cara kamu menangani konflik tim?",
      "Jawaban seharusnya begini: tetap tenang.",
      "2) ceritakan pengalaman react kamu?",
      "Ceritakan pengalaman React kamu?",
      "",
      "Kenapa tertarik posisi ini?",
    ].join("\n"),
  );
  assert.deepEqual(q, [
    "Ceritakan pengalaman React kamu?",
    "Bagaimana cara kamu menangani konflik tim?",
    "Kenapa tertarik posisi ini?",
  ]);
});

test("parsePertanyaan: balasan yang tidak berbentuk daftar ditolak (array kosong)", () => {
  assert.deepEqual(parsePertanyaan("Tentu! Berikut beberapa pertanyaan yang bisa dipakai."), []);
  assert.deepEqual(parsePertanyaan(""), []);
});

test("petunjuk: pertanyaan mirip dapat petunjuk dari bank, yang jauh kosong", () => {
  const d = bank(sampleResume, job);
  const mirip = petunjuk("Ceritakan singkat tentang diri kamu dan kenapa cocok untuk posisi Frontend Developer?", d);
  assert.ok(mirip.length > 0, "pertanyaan mirip harus dapat petunjuk");
  assert.deepEqual(petunjuk("Apa warna favorit kamu dan kenapa memilih warna itu?", d), []);
});
