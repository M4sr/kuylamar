/**
 * Pelacak lamaran — arsip lowongan yang sudah/belum dilamar.
 * Murni (tanpa DOM) biar gampang diuji; penyimpanan localStorage diurus komponen.
 */
export const TAHAP = ["dilamar", "wawancara", "ditawarkan", "ditolak"] as const;
export type Tahap = (typeof TAHAP)[number];

export type Lamaran = {
  id: string;
  position: string;
  company: string;
  source: string;
  url?: string;
  /** Tanggal melamar (YYYY-MM-DD). */
  tanggal: string;
  /** Tanggal status terakhir berubah — dasar pengingat "sudah lama sepi". */
  update: string;
  tahap: Tahap;
  /** Teks JD lowongan — disimpan biar surat bisa dibuat ulang kapan saja. */
  description?: string;
  /** Tanggal pengingat follow-up (opsional). */
  followUp?: string;
  catatan?: string;
};

/** Tanggal lokal (bukan UTC — biar tidak meleset sehari dini hari WIB). */
export function tanggal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function id(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

/** Hari yang sudah lewat sejak `tgl` (0 = hari ini). `null` kalau tanggal tak valid. */
export function selisih(tgl: string | undefined, dari: string = tanggal()): number | null {
  if (!tgl || !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return null;
  const a = Date.parse(`${tgl}T00:00:00`);
  const b = Date.parse(`${dari}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Pengingat follow-up bawaan: seminggu setelah melamar (bisa diubah di kartu lamaran). */
export const FOLLOWUP_HARI = 7;

/** Tanggal n hari setelah `hari` (YYYY-MM-DD). */
export function tambahHari(hari: string, n: number): string {
  const d = new Date(`${hari}T00:00:00`);
  d.setDate(d.getDate() + n);
  return tanggal(d);
}

/** Butuh perhatian: follow-up yang dijadwalkan sudah tiba, atau 14 hari tanpa kabar. */
export const SEPI_HARI = 14;
export function perluFollowUp(l: Lamaran, hari: string = tanggal()): boolean {
  if (l.tahap !== "dilamar") return false;
  if (l.followUp && (selisih(l.followUp, hari) ?? -1) >= 0) return true;
  return (selisih(l.update, hari) ?? 0) >= SEPI_HARI;
}

export function dariJob(job: { position?: string; company?: string; source?: string; url?: string; description?: string }, hari: string = tanggal()): Lamaran {
  return {
    id: id(),
    position: job.position?.trim() ?? "",
    company: job.company?.trim() ?? "",
    source: job.source?.trim() ?? "",
    url: job.url?.trim() || undefined,
    description: job.description?.trim() || undefined,
    tanggal: hari,
    update: hari,
    tahap: "dilamar",
    followUp: tambahHari(hari, FOLLOWUP_HARI),
  };
}

/** Kembar kalau URL-nya sama; kalau URL kosong, pasangan posisi+perusahaan yang sama. */
function kembar(a: Lamaran, b: Lamaran): boolean {
  if (a.url && b.url) return a.url === b.url;
  const p = a.position.trim().toLowerCase();
  const c = a.company.trim().toLowerCase();
  if (!p && !c) return false;
  return p === b.position.trim().toLowerCase() && c === b.company.trim().toLowerCase();
}

/** Tambah. Lamaran kembar tidak digandakan — list lama dikembalikan apa adanya. */
export function tambah(list: Lamaran[], l: Lamaran): Lamaran[] {
  return list.some((x) => kembar(x, l)) ? list : [l, ...list];
}

export function ubah(list: Lamaran[], id: string, patch: Partial<Lamaran>, hari: string = tanggal()): Lamaran[] {
  return list.map((l) => (l.id === id ? { ...l, ...patch, update: patch.tahap ? hari : l.update } : l));
}

export function buang(list: Lamaran[], id: string): Lamaran[] {
  return list.filter((l) => l.id !== id);
}

/** Terbaru dulu; tanggal sama → urut nama perusahaan. */
export function urut(list: Lamaran[]): Lamaran[] {
  return [...list].sort((a, b) => (a.tanggal === b.tanggal ? a.company.localeCompare(b.company) : a.tanggal < b.tanggal ? 1 : -1));
}

export function hitung(list: Lamaran[]): Record<Tahap, number> & { total: number } {
  const r = { dilamar: 0, wawancara: 0, ditawarkan: 0, ditolak: 0, total: list.length };
  for (const l of list) r[l.tahap] += 1;
  return r;
}
