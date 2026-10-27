import { test } from "node:test";
import assert from "node:assert/strict";
import { TAHAP, tanggal, selisih, perluFollowUp, dariJob, tambah, tambahHari, ubah, buang, urut, hitung, type Lamaran } from "./pelacak.ts";

const dasar = { position: "Frontend", company: "PT A", source: "JobStreet", url: "https://x/1" };
const contoh = (p: Partial<Lamaran> = {}): Lamaran => ({ ...dariJob(dasar, "2026-10-01"), id: "a", ...p });

test("tanggal pakai waktu lokal, bukan UTC", () => {
  assert.equal(tanggal(new Date(2026, 0, 1, 23, 30)), "2026-01-01");
  assert.equal(tanggal(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
});

test("selisih hitung hari, aman untuk tanggal kosong/ngawur", () => {
  assert.equal(selisih("2026-10-01", "2026-10-15"), 14);
  assert.equal(selisih("2026-10-15", "2026-10-01"), -14);
  assert.equal(selisih(undefined, "2026-10-15"), null);
  assert.equal(selisih("besok", "2026-10-15"), null);
});

test("follow-up: hanya tahap dilamar, saat jadwal tiba atau 14 hari sepi", () => {
  assert.equal(perluFollowUp(contoh({ update: "2026-10-01", followUp: undefined }), "2026-10-15"), true);
  assert.equal(perluFollowUp(contoh({ update: "2026-10-01", followUp: undefined }), "2026-10-14"), false);
  assert.equal(perluFollowUp(contoh({ update: "2026-10-01", tahap: "wawancara" }), "2026-12-01"), false);
  assert.equal(perluFollowUp(contoh({ update: "2026-10-14", followUp: "2026-10-15" }), "2026-10-15"), true);
});

test("lamaran baru otomatis dapat pengingat follow-up 7 hari", () => {
  const l = dariJob(dasar, "2026-10-01");
  assert.equal(l.followUp, "2026-10-08");
  assert.equal(tambahHari("2026-10-01", 7), "2026-10-08");
  assert.equal(tambahHari("2026-10-31", 1), "2026-11-01");
  assert.equal(perluFollowUp(l, "2026-10-08"), true, "hari pengingat sudah tiba");
  assert.equal(perluFollowUp(l, "2026-10-07"), false, "belum waktunya & belum 14 hari");
});

test("tambah: url sama tidak digandakan", () => {
  const a = contoh();
  assert.equal(tambah([], a).length, 1);
  assert.equal(tambah([a], contoh({ id: "b" })).length, 1);
  assert.equal(tambah([a], contoh({ id: "b", url: undefined })).length, 1, "tanpa URL, posisi+perusahaan sama tetap kembar");
  assert.equal(tambah([a], contoh({ id: "b", url: undefined, company: "PT B" })).length, 2);
  assert.equal(tambah([a], dariJob({}, "2026-10-01")).length, 2, "entri kosong tidak dianggap kembar");
});

test("ubah: ganti tahap menandai update, buang: hapus satu", () => {
  const l = contoh({ update: "2026-10-01" });
  const naik = ubah([l], "a", { tahap: "wawancara" }, "2026-10-20");
  assert.deepEqual(naik[0], { ...l, tahap: "wawancara", update: "2026-10-20" });
  assert.equal(ubah([l], "a", { catatan: "telepon HRD" }, "2026-10-20")[0].update, "2026-10-01");
  assert.equal(buang([l], "a").length, 0);
});

test("urut: terbaru dulu, tanggal sama urut perusahaan", () => {
  const ab = [contoh({ id: "1", company: "Zeta", tanggal: "2026-09-01" }), contoh({ id: "2", company: "Beta", tanggal: "2026-10-01" }), contoh({ id: "3", company: "Alfa", tanggal: "2026-10-01" })];
  assert.deepEqual(
    urut(ab).map((l) => l.id),
    ["3", "2", "1"],
  );
});

test("hitung: rekap per tahap, semua tahap terwakili", () => {
  const list = TAHAP.map((t, i) => contoh({ id: String(i), tahap: t }));
  assert.deepEqual(hitung(list), { dilamar: 1, wawancara: 1, ditawarkan: 1, ditolak: 1, total: 4 });
});
