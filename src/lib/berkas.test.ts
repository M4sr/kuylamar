import assert from "node:assert/strict";
import test from "node:test";
import { namaBerkas } from "./berkas.ts";

const now = new Date(2026, 9, 26); // Oktober 2026

test("nama berkas: jenis, nama, perusahaan, bulan", () => {
  assert.equal(namaBerkas("cv", "Abdul Rahman", "PT Maju Jaya", now), "CV - Abdul Rahman - PT Maju Jaya - 2026-10");
  assert.equal(namaBerkas("letter", "Abdul Rahman", "PT Maju", now), "Surat Lamaran - Abdul Rahman - PT Maju - 2026-10");
  assert.equal(namaBerkas("both", "Abdul Rahman", "PT Maju", now), "CV & Surat - Abdul Rahman - PT Maju - 2026-10");
});

test("nama berkas: bagian kosong dibuang, karakter ilegal dibersihkan", () => {
  assert.equal(namaBerkas("cv", "Abdul Rahman", "", now), "CV - Abdul Rahman - 2026-10");
  assert.equal(namaBerkas("cv", "Abdul", 'PT "A/B":C', now), "CV - Abdul - PT A B C - 2026-10");
  assert.equal(namaBerkas("cv", "", "", now), "CV - 2026-10");
});
