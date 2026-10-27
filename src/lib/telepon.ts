import type { Job, Resume } from "../types";
import { tokens } from "./ats.ts";
import type { Tanya } from "./wawancara.ts";

/**
 * Penilaian simulasi wawancara telepon.
 * Semua fungsi di sini murni (tanpa jaringan, tanpa jam) supaya bisa diuji dan hasilnya
 * bisa diulang — transkrip yang sama selalu menghasilkan skor yang sama.
 */

export type Giliran = { q: string; jawaban: string; detik: number; kunci: string[]; susulan?: string };

export type Nilai = {
  skor: number;
  kata: number;
  wpm: number;
  filler: number;
  kunciKena: string[];
  kunciHilang: string[];
  catatan: string[];
};

export type Laporan = {
  skor: number;
  nada: "lolos" | "pertimbang" | "belum";
  putusan: string;
  ringkas: string;
  perGiliran: (Nilai & { q: string; jawaban: string })[];
  kuat: string[];
  perbaiki: string[];
  kosong: number;
  /** true kalau skor/putusan/catatan di atas datang dari AI, bukan penilai aturan lokal. */
  dinilaiAi?: boolean;
};

/** Kata pengisi yang bikin jawaban terdengar ragu. */
const FILLER = new Set(
  "eee ee eem emm em hmm hm anu hehe hihi kayak pokoknya semacam sih kan gitu deh mungkin sebenarnya gimana".split(" "),
);

/** Jawaban di bawah ini dianggap belum menjawab. */
export const MIN_KATA = 25;

/** Target tempo bicara (kata per menit) saat wawancara. */
const WPM_MIN = 75;
const WPM_MAKS = 185;

export const HRD_W = "Bu Rina";
export const HRD_P = "Pak Andika";
/** Nama HRD default (perempuan) — pertahankan untuk pemanggil lama. */
export const HRD = HRD_W;

export type Gender = "wanita" | "pria";

export function namaHrd(g: Gender): string {
  return g === "pria" ? HRD_P : HRD_W;
}

/** Ciri nama suara perempuan/laki-laki di daftar suara browser (inferensi, bukan API). */
const CIRI_W = ["gadis", "damayanti", "wanita", "female", "siti", "dewi", "putri", "indah", "arum"];
const CIRI_P = ["andika", "ardi", "pria", "male", "budi", "arif", "rizwan", "reza", "bima"];

/**
 * Pilih suara Indonesia sesuai jenis kelamin pengawancara.
 * Browser tidak pernah memberi tahu gender suara, jadi dicocokkan dari nama dulu;
 * kalau tidak ada yang cocok, ambil suara Indonesia pertama (wanita) atau kedua (pria).
 */
export function pilihSuara<T extends { name: string; lang: string }>(v: T[], g: Gender): T | null {
  const lokal = v.filter((x) => /^(id|ms|jv|su)[-_]/i.test(x.lang));
  const pool = lokal.length ? lokal : v;
  if (!pool.length) return null;
  const ciri = g === "wanita" ? CIRI_W : CIRI_P;
  const cocok = pool.find((x) => ciri.some((c) => x.name.toLowerCase().includes(c)));
  if (cocok) return cocok;
  const id = pool.filter((x) => /^id[-_]/i.test(x.lang));
  const urut = id.length ? id : pool;
  return urut[g === "pria" && urut.length > 1 ? 1 : 0] ?? null;
}

export function pembuka(r: Resume, job: Job, n: number, nama: string = HRD): string {
  const pt = job.company.trim() || "perusahaan ini";
  const pos = job.position.trim() || r.basics.label.trim() || "posisi ini";
  return `Halo ${r.basics.name.split(" ")[0] || "kak"}, terima kasih sudah meluangkan waktu. Saya ${nama} dari ${pt}, saya yang akan mewawancarai kamu untuk posisi ${pos}. Santai saja ya, ada ${n} pertanyaan, jawab lewat suara seperti obrolan biasa. Kalau sudah siap, kita mulai dari pertanyaan pertama.`;
}

export function penutup(h: Laporan): string {
  const kabar =
    h.nada === "lolos"
      ? "Secara keseluruhan saya suka jawaban kamu."
      : h.nada === "pertimbang"
        ? "Jawaban kamu sudah cukup, tapi masih ada yang bisa dirapikan."
        : "Jujur, masih banyak yang perlu dilatih.";
  const kuat = h.kuat[0] ? ` ${h.kuat[0]}` : "";
  const perbaiki = h.perbaiki[0] ? ` Catatan saya: ${h.perbaiki[0]}` : "";
  return `Baik, sesi kita selesai. ${kabar} Skor rata-rata kamu ${h.skor} dari 100. ${h.putusan}.${kuat}${perbaiki} Terima kasih ya, hasil lengkapnya bisa kamu baca di layar.`;
}

export function kalimatSela(i: number): string {
  const p = ["Oke, lanjut ya.", "Baik, terima kasih.", "Hmm, oke.", "Baik, saya catat.", "Oke, kita lanjut."];
  return p[i % p.length];
}

function skorTempo(wpm: number, kata: number): number {
  if (kata < 8) return 0;
  if (wpm >= WPM_MIN && wpm <= WPM_MAKS) return 1;
  if (wpm < WPM_MIN) return Math.max(0, 0.6 + ((wpm - 35) / (WPM_MIN - 35)) * 0.4);
  return Math.max(0, 1 - (wpm - WPM_MAKS) / 130);
}

function potong(s: string, maks = 46): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > maks ? `${t.slice(0, maks - 1)}…` : t;
}

export function nilaiJawaban(j: Giliran): Nilai {
  const tk = tokens(j.jawaban);
  const kata = tk.length;
  const raw = j.jawaban.trim() ? j.jawaban.trim().split(/\s+/).length : 0;
  const wpm = Math.round((raw / Math.max(1, j.detik)) * 60);
  const filler = tk.filter((t) => FILLER.has(t)).length;

  // Jawaban kosong = nol di semua komponen. Tanpa guard ini, "kelancaran" & "tanpa kata pengisi"
  // ikut memberi poin pada jawaban yang tidak ada isinya.
  if (kata === 0 || raw < 3) {
    return {
      skor: 0,
      kata,
      wpm,
      filler,
      kunciKena: [],
      kunciHilang: j.kunci,
      catatan: ["Pertanyaan ini dilewati — di wawancara asli, tetap jawab walau singkat."],
    };
  }

  const isi = new Set(tk);
  const kena: string[] = [];
  const hilang: string[] = [];
  for (const k of j.kunci) {
    const kt = [...new Set(tokens(k))];
    if (kt.length === 0) continue;
    const ada = kt.filter((t) => isi.has(t)).length / kt.length;
    if (ada >= 0.34) kena.push(k);
    else hilang.push(k);
  }
  const total = kena.length + hilang.length;
  const cove = total ? kena.length / total : 0.5;

  const rasioFiller = kata ? filler / kata : 0;
  // Jawaban mode ketik: 40 kata dalam 4 detik = 600 kata/menit — tempo mustahil diucapkan, jadi tidak dinilai.
  const ketik = wpm > 400;
  const skor = Math.round(
    Math.min(1, kata / MIN_KATA) * 40 + cove * 30 + Math.max(0, 1 - rasioFiller * 4) * 15 + (ketik ? 1 : skorTempo(wpm, kata)) * 15,
  );

  const catatan: string[] = [];
  if (kata === 0) catatan.push("Pertanyaan ini dilewati — di wawancara asli, tetap jawab walau singkat.");
  else if (kata < 10) catatan.push(`Hanya ${kata} kata — terlalu pendek; HRD butuh 1–2 menit.`);
  else if (kata < MIN_KATA) catatan.push(`Masih pendek (${kata} kata) — tambah satu contoh nyata + hasilnya.`);
  else catatan.push(`Panjang jawaban pas (${kata} kata).`);

  if (hilang.length) catatan.push(`Belum kesebut: ${hilang.slice(0, 3).map((k) => potong(k, 40)).join("; ")}.`);
  if (rasioFiller > 0.08) catatan.push(`${filler} kata pengisi (eee/gitu) — lebih baik diam sebentar daripada mengisi suara.`);
  else if (kata > 10) catatan.push("Bicara cukup lancar, kata pengisi minim.");
  if (!ketik && kata >= 8 && wpm < 70) catatan.push(`Tempo ${wpm} kata/menit — terdengar ragu; naikkan sedikit.`);
  else if (!ketik && wpm > 200) catatan.push(`Tempo ${wpm} kata/menit — terlalu cepat, HRD susah menangkap.`);

  return { skor: Math.max(0, Math.min(100, skor)), kata, wpm, filler, kunciKena: kena, kunciHilang: hilang, catatan };
}

export function nadaDari(skor: number): Laporan["nada"] {
  return skor >= 75 ? "lolos" : skor >= 55 ? "pertimbang" : "belum";
}

export function putusanDari(nada: Laporan["nada"]): string {
  return nada === "lolos"
    ? "Lanjut ke tahap berikutnya"
    : nada === "pertimbang"
      ? "Masuk pertimbangan — rapikan poin di bawah"
      : "Belum lolos — latih lagi bagian ini";
}

export function laporan(giliran: Giliran[], nama = ""): Laporan {
  const perGiliran = giliran.map((g) => ({ ...nilaiJawaban(g), q: g.q, jawaban: g.jawaban }));
  const skor = perGiliran.length ? Math.round(perGiliran.reduce((a, n) => a + n.skor, 0) / perGiliran.length) : 0;
  const nada = nadaDari(skor);
  const putusan = putusanDari(nada);
  const kosong = perGiliran.filter((p) => p.kata === 0).length;

  const kuat = perGiliran
    .filter((p) => p.skor >= 75)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 2)
    .map((p) => `Jawaban soal "${potong(p.q)}" paling kuat (skor ${p.skor}).`);

  const perbaiki: string[] = [];
  for (const p of [...perGiliran].sort((a, b) => a.skor - b.skor)) {
    for (const c of p.catatan) {
      if (/pas \(|lancar|kata pengisi minim/.test(c)) continue;
      if (perbaiki.length < 4 && !perbaiki.includes(c)) perbaiki.push(c);
    }
  }
  if (!perbaiki.length && skor >= 75) perbaiki.push("Pertahankan gaya ini; siapkan 2 pertanyaan untuk balik tanya ke HRD.");

  const ringkas = `${nama ? `${nama}, ` : ""}skor rata-rata ${skor}/100 dari ${giliran.length} pertanyaan — ${putusan.toLowerCase()}${kosong ? `, ${kosong} dilewati` : ""}.`;
  return { skor, nada, putusan, ringkas, perGiliran, kuat, perbaiki, kosong };
}

export type Panjang = "3" | "5" | "semua";

/** Ambil sebagian daftar pertanyaan untuk satu sesi telepon. */
export function daftarTelepon(daftar: Tanya[], pilih: Panjang): Tanya[] {
  if (pilih === "semua") return daftar;
  return daftar.slice(0, Number(pilih));
}

/** Transkrip sesi untuk disalin/disimpan. */
export function transkrip(giliran: Giliran[], h: Laporan): string {
  const baris = giliran.map((g, i) => {
    const tegur = g.susulan ? `\n   HRD (susulan): ${g.susulan}` : "";
    return `${i + 1}. HRD: ${g.q}${tegur}\n   Saya: ${g.jawaban.trim() || "(dilewati)"}`;
  });
  const koreksi = h.perbaiki.map((c) => `- ${c}`).join("\n");
  const cara = h.dinilaiAi ? "dinilai AI" : "dinilai aturan lokal";
  return `SIMPULAN WAWANCARA TELEPON - skor ${h.skor}/100 (${h.putusan}) [${cara}]\n${h.ringkas}\n\n${baris.join("\n\n")}\n\nPerlu diperbaiki:\n${koreksi || "- (tidak ada)"}\n`;
}

/**
 * Pertanyaan susulan ala "HRD galak": satu pertanyaan tambahan kalau jawabannya kurang isi.
 * Dipilih dari aturan, bukan AI — supaya langsung diucapkan tanpa menunggu jaringan.
 * `ke` dipakai untuk memutar variasi kalau jawabannya masih lemah lagi.
 */
export function lanjutan(j: Giliran, n: Nilai, ke = 0): string | null {
  if (n.kata === 0) return null;
  if (n.skor >= 85) return null;
  const opsi: string[] = [];
  if (n.kata < MIN_KATA) opsi.push("Boleh diceritakan lebih panjang? Saya mau dengar situasinya, apa yang kamu kerjakan sendiri, dan hasilnya.");
  if (!/\d/.test(j.jawaban)) opsi.push("Ada angka atau hasil nyata dari pengalaman itu yang bisa kamu sebutkan?");
  if (n.kunciHilang.length) opsi.push(`Belum kamu singgung soal ${cuplikan(n.kunciHilang[0] ?? "")} — bisa jelaskan bagian itu?`);
  if (n.kata && n.filler / n.kata > 0.08) opsi.push("Coba ulangi lebih ringkas dan lebih tegas ya, jangan pakai kata pengisi.");
  if (n.wpm > 200 && n.wpm <= 400) opsi.push("Pelan sedikit ya, saya perlu waktu mencatat jawabanmu.");
  if (!opsi.length) return null;
  return opsi[ke % opsi.length] ?? null;
}

/** Potongan kunci pertanyaan yang enak diucapkan: maks 6 kata, dipotong di batas kata. */
export function cuplikan(teks: string, maksKata = 6): string {
  const kata = teks.trim().replace(/\s+/g, " ").split(" ");
  const ambil = kata.slice(0, maksKata).join(" ").replace(/[,;:.]+$/, "");
  const rapi = ambil.charAt(0).toLowerCase() + ambil.slice(1);
  return kata.length > maksKata ? `${rapi}…` : rapi;
}

/**
 * Prompt penilaian AI: menilai transkrip, bukan mengarang fakta kandidat.
 * Ukuran lokal (kata, tempo, kata pengisi) disertakan supaya AI tidak menebak-nebak.
 */
export function promptNilai(job: Job, tanya: Giliran[], nilai: Nilai[]): string {
  const isi = tanya
    .map((g, i) => {
      const n = nilai[i];
      const ukur = n ? `${n.kata} kata, ${g.detik}s, tempo ${n.wpm} kata/menit, kata pengisi ${n.filler}` : `${g.detik}s`;
      return [`Pertanyaan ${i + 1}: ${g.q}`, g.susulan ? `Teguran HRD: ${g.susulan}` : "", `Jawaban: ${g.jawaban.trim() || "(dilewati)"}`, `Ukuran: ${ukur}`].filter(Boolean).join("\n");
    })
    .join("\n\n");
  return [
    "Kamu pewawancara HR bahasa Indonesia yang menilai simulasi wawancara telepon seorang kandidat.",
    "Nilai HANYA dari transkrip di bawah. Larangan keras: jangan mengarang atau mengandaikan pengalaman, keahlian, angka, sertifikasi, atau nama perusahaan yang tidak ada di transkrip.",
    "Adil dan spesifik: puji yang konkret, tunjuk yang lemah dengan saran yang bisa langsung dipakai di jawaban berikutnya.",
    "Balas HANYA satu objek JSON tanpa penjelasan dan tanpa pagar kode, bentuknya:",
    '{"skor": <0-100>, "putusan": "<maks 8 kata>", "ringkas": "<1-2 kalimat untuk kandidat>", "kuat": ["<maks 3 item, tiap item maks 14 kata>"], "perbaiki": ["<maks 3 item, tiap item maks 14 kata>"], "perGiliran": [{"i": 1, "skor": <0-100>, "catatan": "<maks 16 kata>"}]}',
    `perGiliran wajib berisi tepat ${tanya.length} entri dengan i berurutan dari 1.`,
    `Posisi: ${job.position || "-"} | Perusahaan: ${job.company || "-"}`,
    `Deskripsi lowongan (potongan): ${job.description.slice(0, 700) || "-"}`,
    "",
    isi,
  ].join("\n");
}

function angkaDari(x: unknown, maks = 100): number | null {
  return typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(maks, Math.round(x))) : null;
}

function daftarTeks(x: unknown, maks = 3, panjang = 160): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.replace(/\s+/g, " ").trim().slice(0, panjang))
    .slice(0, maks);
}

/**
 * Gabungkan penilaian AI ke laporan lokal. Ukuran lokal (kata, tempo, kunci) tetap dipertahankan;
 * yang ditimpa hanya skor/putusan/ringkas/kuat/perbaiki dan catatan per pertanyaan.
 * Kalau balasan AI tidak masuk akal, lempar error → UI kembali ke skor lokal.
 */
export function gabungNilai(mentah: string, lokal: Laporan): Laporan {
  const a = mentah.indexOf("{");
  const b = mentah.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("AI tidak membalas JSON penilaian — skor lokal dipakai.");
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(mentah.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("Balasan penilaian AI tidak bisa dibaca — skor lokal dipakai.");
  }
  const skor = angkaDari(o.skor);
  const kuat = daftarTeks(o.kuat);
  const perbaiki = daftarTeks(o.perbaiki);
  if (skor === null || (!kuat.length && !perbaiki.length)) {
    throw new Error("Penilaian AI tidak lengkap — skor lokal dipakai.");
  }

  const peta = new Map<number, { skor: number; catatan: string[] }>();
  if (Array.isArray(o.perGiliran)) {
    for (const it of o.perGiliran as { i?: unknown; skor?: unknown; catatan?: unknown }[]) {
      const i = angkaDari(it?.i, 999);
      if (i === null || i < 1 || i > lokal.perGiliran.length) continue;
      const catatan = daftarTeks([it?.catatan], 1, 200);
      peta.set(i - 1, { skor: angkaDari(it?.skor) ?? lokal.perGiliran[i - 1]!.skor, catatan });
    }
  }
  const perGiliran = lokal.perGiliran.map((p, i) => {
    const x = peta.get(i);
    return x ? { ...p, skor: x.skor, catatan: x.catatan.length ? x.catatan : p.catatan } : p;
  });

  const nada = nadaDari(skor);
  const teks = (x: unknown, maks: number, cadangan: string) =>
    typeof x === "string" && x.trim() ? x.replace(/\s+/g, " ").trim().slice(0, maks) : cadangan;
  return {
    skor,
    nada,
    putusan: teks(o.putusan, 80, putusanDari(nada)),
    ringkas: teks(o.ringkas, 240, lokal.ringkas),
    perGiliran,
    kuat,
    perbaiki,
    kosong: lokal.kosong,
    dinilaiAi: true,
  };
}

/** Satu baris riwayat sesi telepon (disimpan di localStorage oleh komponen). */
export type Rekap = {
  id: string;
  waktu: number;
  posisi: string;
  perusahaan: string;
  skor: number;
  nada: Laporan["nada"];
  tanya: number;
  kosong: number;
  ai?: boolean;
};

export const MAKS_REKAP = 12;

export function rekapDari(h: Laporan, posisi: string, perusahaan: string, waktu: number, id: string): Rekap {
  return {
    id,
    waktu,
    posisi: posisi.trim().slice(0, 80),
    perusahaan: perusahaan.trim().slice(0, 80),
    skor: h.skor,
    nada: h.nada,
    tanya: h.perGiliran.length,
    kosong: h.kosong,
    ...(h.dinilaiAi ? { ai: true } : {}),
  };
}

/** Tambahkan rekap terbaru di depan, buang id kembar/skor ngawur, simpan maksimal `maks` entri. */
export function tambahRekap(list: Rekap[], r: Rekap, maks = MAKS_REKAP): Rekap[] {
  const bersih = list.filter((x) => x && x.id !== r.id && typeof x.skor === "number" && Number.isFinite(x.skor));
  return [r, ...bersih].sort((a, b) => b.waktu - a.waktu).slice(0, Math.max(1, maks));
}

export function rataRekap(list: Rekap[]): number | null {
  const sah = list.filter((r) => Number.isFinite(r.skor));
  return sah.length ? Math.round(sah.reduce((a, r) => a + r.skor, 0) / sah.length) : null;
}

/** Selisih skor sesi terbaru dengan sesi sebelumnya (null kalau belum ada pembanding). */
export function trenRekap(list: Rekap[]): number | null {
  if (list.length < 2) return null;
  const u = [...list].sort((a, b) => b.waktu - a.waktu);
  return u[0]!.skor - u[1]!.skor;
}
