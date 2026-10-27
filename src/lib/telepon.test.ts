import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleResume } from "../data/sample.ts";
import type { Job } from "../types.ts";
import { bank } from "./wawancara.ts";
import { cuplikan, daftarTelepon, gabungNilai, lanjutan, laporan, namaHrd, nilaiJawaban, pembuka, penutup, pilihSuara, promptNilai, rataRekap, rekapDari, tambahRekap, transkrip, trenRekap, type Giliran } from "./telepon.ts";

const job: Job = {
  position: "Frontend Developer",
  company: "PT Uji Coba",
  source: "JobStreet",
  url: "https://x/1",
  description: "React, TypeScript, Next.js, GraphQL, Docker, Kubernetes",
};

const kunci = ["pengalaman React di PT Lama", "pakai struktur: keadaan → aksi → hasil"];

const panjang =
  "Saya tiga tahun terakhir mengerjakan aplikasi React dan TypeScript di PT Lama untuk tim operasional, jadi saya paham alur kerja dari kebutuhan sampai rilis. Contohnya saya memimpin migrasi halaman laporan ke Next.js dan memotong waktu muat dari enam detik jadi dua detik.";

function giliran(over: Partial<Giliran> = {}): Giliran {
  return { q: "Ceritakan pengalaman React kamu?", jawaban: panjang, detik: 45, kunci, ...over };
}

test("nilai: jawaban lewat → skor 0 + catatan dilewati", () => {
  const n = nilaiJawaban(giliran({ jawaban: "   " }));
  assert.equal(n.skor, 0);
  assert.equal(n.kata, 0);
  assert.match(n.catatan[0], /dilewati/);
});

test("nilai: jawaban pendek dihukum, jawaban panjang + relevan dapat tinggi", () => {
  const pendek = nilaiJawaban(giliran({ jawaban: "Saya pernah pakai React.", detik: 3 }));
  const bagus = nilaiJawaban(giliran());
  assert.ok(pendek.skor < 45, `pendek=${pendek.skor}`);
  assert.ok(bagus.skor >= 75, `bagus=${bagus.skor}`);
  assert.ok(bagus.kunciKena.length >= 1, "kunci seharusnya kena");
});

test("nilai: kata pengisi menurunkan poin kelancaran", () => {
  const bersih = nilaiJawaban(giliran());
  const penuh = nilaiJawaban(giliran({ jawaban: `${panjang} eee gitu kayak hmm sebenarnya pokoknya anu mungkin hihi hehe` }));
  assert.ok(penuh.filler >= 6, `filler=${penuh.filler}`);
  assert.ok(penuh.skor < bersih.skor, `${penuh.skor} harus < ${bersih.skor}`);
  assert.ok(penuh.catatan.some((c) => /kata pengisi/.test(c)));
});

test("nilai: tempo ekstrem dicatat, tempo mustahil (mode ketik) diabaikan", () => {
  const lambat = nilaiJawaban(giliran({ detik: 240 }));
  const cepat = nilaiJawaban(giliran({ detik: 12 }));
  assert.ok(lambat.wpm < 70 && lambat.catatan.some((c) => /terdengar ragu/.test(c)));
  assert.ok(cepat.wpm > 200 && cepat.wpm <= 400 && cepat.catatan.some((c) => /terlalu cepat/.test(c)));
  // 40 kata dalam 4 detik = 600 kata/menit: jelas diketik, jadi tempo tidak dinilai & tidak dikomentari
  const diketik = nilaiJawaban(giliran({ detik: 4 }));
  assert.ok(diketik.wpm > 400);
  assert.ok(!diketik.catatan.some((c) => /Tempo/.test(c)), diketik.catatan.join("|"));
  assert.ok(diketik.skor >= cepat.skor - 15, `${diketik.skor} vs ${cepat.skor}`);
  assert.ok(!/Pelan sedikit/.test(lanjutan(giliran({ detik: 4 }), diketik) ?? ""));
});

const mid =
  "Saya pernah mengerjakan proyek React di kampus dan belajar sendiri lewat dokumentasi resmi, jadi saya cukup paham dasar sampai sekarang walaupun belum pernah kerja di tim besar.";

test("laporan: putusan naik sesuai skor & urut", () => {
  const bagus = () => giliran({ kunci: ["pengalaman React di PT Lama"] });
  const semuaBagus = laporan([bagus(), bagus()], "Abdul");
  const semuaKosong = laporan([giliran({ jawaban: "" }), giliran({ jawaban: "" })]);
  const campur = laporan([giliran({ jawaban: mid, detik: 22 }), giliran({ jawaban: mid, detik: 22 })]);
  assert.equal(semuaBagus.nada, "lolos");
  assert.equal(semuaKosong.nada, "belum");
  assert.equal(semuaKosong.kosong, 2);
  assert.equal(campur.nada, "pertimbang");
  assert.ok(semuaBagus.skor > campur.skor && campur.skor > semuaKosong.skor);
  assert.equal(semuaBagus.perGiliran.length, 2);
  assert.ok(semuaBagus.kuat.length >= 1);
  assert.ok(campur.perbaiki.length >= 1);
  assert.ok(!campur.ringkas.includes("undefined"));
});

test("laporan: nol pertanyaan tidak meledak", () => {
  const h = laporan([]);
  assert.equal(h.skor, 0);
  assert.equal(h.perGiliran.length, 0);
  assert.ok(h.ringkas.length > 10);
});

test("daftarTelepon: potong sesuai pilihan", () => {
  const d = bank(sampleResume, job);
  assert.equal(daftarTelepon(d, "3").length, 3);
  assert.equal(daftarTelepon(d, "5").length, 5);
  assert.equal(daftarTelepon(d, "semua").length, d.length);
});

test("skrip HRD & transkrip: tanpa placeholder kosong", () => {
  const h = laporan([giliran(), giliran({ jawaban: "" })], "Abdul");
  const teks = [pembuka(sampleResume, job, 3), penutup(h), transkrip([giliran(), giliran({ jawaban: "" })], h)].join("\n");
  assert.ok(pembuka(sampleResume, job, 3).includes("PT Uji Coba"));
  assert.ok(penutup(h).includes(String(h.skor)));
  assert.ok(teks.includes("SIMPULAN WAWANCARA TELEPON"));
  assert.ok(teks.includes("(dilewati)"));
  assert.ok(!/undefined|NaN|\[object/.test(teks), teks);
});

test("pembuka: nama pengawancara bisa diganti", () => {
  assert.ok(pembuka(sampleResume, job, 3, "Pak Andika").includes("Pak Andika"));
  assert.ok(pembuka(sampleResume, job, 3).includes("Bu Rina"));
  assert.equal(namaHrd("pria"), "Pak Andika");
});

test("pilihSuara: cocok lewat nama, jatuh ke urutan lokal kalau tidak ada ciri", () => {
  const v = [
    { name: "Google US English", lang: "en-US" },
    { name: "Microsoft Gadis", lang: "id-ID" },
    { name: "Microsoft Andika", lang: "id-ID" },
  ];
  assert.equal(pilihSuara(v, "wanita")?.name, "Microsoft Gadis");
  assert.equal(pilihSuara(v, "pria")?.name, "Microsoft Andika");
  const tanpaCiri = [{ name: "Suara A", lang: "id-ID" }, { name: "Suara B", lang: "id-ID" }];
  assert.equal(pilihSuara(tanpaCiri, "wanita")?.name, "Suara A");
  assert.equal(pilihSuara(tanpaCiri, "pria")?.name, "Suara B");
  assert.equal(pilihSuara([], "pria"), null);
  // tanpa suara Indonesia sama sekali → jangan balik null kalau masih ada suara lain
  assert.equal(pilihSuara([{ name: "Only EN", lang: "en-US" }], "wanita")?.name, "Only EN");
});

test("lanjutan: hanya menegur jawaban yang kurang isi", () => {
  const kuat = giliran({ kunci: ["pengalaman React di PT Lama"], jawaban: `${panjang} Tiga proyek selesai, muat turun 60 persen.`, detik: 45 });
  assert.equal(lanjutan(kuat, nilaiJawaban(kuat)), null);
  // kunci belum kesebut → tetap ditanya walau jawabannya panjang
  const kurangKunci = giliran({ jawaban: `${panjang} Tiga proyek selesai, muat turun 60 persen.`, detik: 45 });
  const t0 = lanjutan(kurangKunci, nilaiJawaban(kurangKunci));
  assert.ok(t0 && /belum kamu singgung/i.test(t0), String(t0));

  const pendek = giliran({ jawaban: "Saya pernah pakai React.", detik: 4 });
  const t1 = lanjutan(pendek, nilaiJawaban(pendek));
  assert.ok(t1 && /lebih panjang|belum kamu singgung|angka atau hasil/i.test(t1), String(t1));

  const tanpaAngka = giliran({ jawaban: panjang.replace(/tiga|enam|dua/gi, "beberapa"), detik: 45 });
  const t2 = lanjutan(tanpaAngka, nilaiJawaban(tanpaAngka), 1);
  assert.ok(t2 && t2.length > 10);
  assert.equal(lanjutan(giliran({ jawaban: "" }), nilaiJawaban(giliran({ jawaban: "" }))), null);
  assert.equal(lanjutan(kuat, { ...nilaiJawaban(kuat), skor: 90 }), null);
});

test("cuplikan: dipotong di batas kata, bukan di tengah", () => {
  assert.equal(cuplikan("Pakai struktur: keadaan → aksi → hasil"), "pakai struktur: keadaan → aksi →…");
  assert.equal(cuplikan("Sebut angka."), "sebut angka");
  const g = giliran({ susulan: "Boleh diceritakan lebih panjang?" });
  const t = transkrip([g], laporan([g]));
  assert.ok(t.includes("HRD (susulan): Boleh diceritakan lebih panjang?"), t);
  assert.ok(!/soal \S+…\s—/.test(t));
  assert.ok(promptNilai(job, [g], [nilaiJawaban(g)]).includes("Teguran HRD:"));
});

test("gabungNilai: pakai angka & catatan AI, tolak balasan ngawur", () => {
  const lokal = laporan([giliran(), giliran({ jawaban: "Saya pernah pakai React." })], "Abdul");
  const ai = gabungNilai(
    '```json\n{"skor": 82, "putusan": "Lanjut, perbaiki detail", "ringkas": "Kamu kuat di React.", "kuat": ["Contoh migrasi"], "perbaiki": ["Tambah angka"], "perGiliran": [{"i": 1, "skor": 85, "catatan": "Jelas"}, {"i": 2, "skor": 40, "catatan": "Terlalu pendek"}]}\n```',
    lokal,
  );
  assert.equal(ai.skor, 82);
  assert.equal(ai.nada, "lolos");
  assert.equal(ai.dinilaiAi, true);
  assert.equal(ai.perGiliran[0]!.skor, 85);
  assert.deepEqual(ai.perGiliran[1]!.catatan, ["Terlalu pendek"]);
  // ukuran lokal tidak hilang
  assert.equal(ai.perGiliran[0]!.kata, lokal.perGiliran[0]!.kata);
  assert.ok(transkrip([giliran()], ai).includes("dinilai AI"));

  assert.throws(() => gabungNilai("maaf saya tidak bisa", lokal), /skor lokal dipakai/);
  assert.throws(() => gabungNilai('{"skor": 300, "kuat": []}', lokal), /tidak lengkap/);
  const clamp = gabungNilai('{"skor": 120, "kuat": ["a"], "perGiliran": [{"i": 9, "skor": 70}]}', lokal);
  assert.equal(clamp.skor, 100);
  assert.equal(clamp.perGiliran[0]!.skor, lokal.perGiliran[0]!.skor);
});

test("rekap: urut terbaru, buang kembar, rata-rata & tren", () => {
  const h = laporan([giliran(), giliran({ jawaban: "" })]);
  const a = rekapDari(h, "Frontend", "PT Uji Coba", 1000, "a");
  const b = rekapDari({ ...h, skor: 70, nada: "pertimbang" }, "Frontend", "PT Uji Coba", 2000, "b");
  let list = tambahRekap([], a);
  list = tambahRekap(list, b);
  assert.deepEqual(list.map((r) => r.id), ["b", "a"]);
  assert.equal(rataRekap(list), Math.round((h.skor + 70) / 2));
  assert.equal(trenRekap(list), 70 - h.skor);
  assert.equal(trenRekap([a]), null);
  // id sama tidak digandakan
  list = tambahRekap(list, { ...b, skor: 90 });
  assert.equal(list.length, 2);
  assert.equal(list[0]!.skor, 90);
  // maksimal dijaga
  const banyak = Array.from({ length: 20 }, (_, i) => rekapDari(h, "X", "Y", i, `r${i}`));
  assert.equal(tambahRekap(banyak, a, 12).length, 12);
  assert.equal(a.kosong, h.kosong);
});
