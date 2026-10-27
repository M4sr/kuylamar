/**
 * Pencarian lowongan lintas platform (tanpa backend, lewat /api/cari di vite dev / Cloudflare Pages).
 * Skrip ekstraksi dijalankan DI DALAM halaman target (CDP) supaya tidak perlu parser HTML.
 */
import type { Resume } from "../types.ts";

export type PlatformId = "jobstreet" | "linkedin" | "kalibrr" | "dealls" | "lokerid" | "glints";

export type Loker = {
  id: string;
  platform: PlatformId;
  posisi: string;
  perusahaan: string;
  lokasi: string;
  gaji: string;
  /** Teks umur posting apa adanya dari platform, mis. "8 hari yang lalu". */
  tanggal: string;
  /** Perkiraan umur posting dalam hari (null = platform tidak menyebutkan). */
  hariLalu: number | null;
  url: string;
  /** Cuplikan isi kartu, dipakai untuk skor kecocokan. */
  teks: string;
};

export type StatusLoker = "buka" | "tutup" | "ragu";

const AWAL = `
const b=(s)=>((s||"").replace(/\\s+/g," ").trim());
const tunggu=async(f,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(f())return true}catch{}await new Promise(r=>setTimeout(r,500))}return false};
const abs=(h)=>{try{return new URL(h,location.origin).href}catch{return ""}};
const baris=(el)=>((el.innerText||"").split("\\n").map(b).filter(Boolean));
const link=(sel)=>[...document.querySelectorAll(sel)].slice(0,40);
`;

const skripJobstreet = `(async()=>{${AWAL}
  await tunggu(()=>document.querySelectorAll('[data-automation="normalJob"]').length>0,40000); // Jobstreet kadang butuh lewat tantangan bot dulu
  return link('[data-automation="normalJob"]').map(k=>{
    const g=(s)=>{const e=k.querySelector(s);return e?b(e.textContent):""};
    const a=k.querySelector('a[data-automation="jobTitle"]');
    return {posisi:g('[data-automation="jobTitle"]'),perusahaan:g('[data-automation="jobCompany"]'),
      lokasi:g('[data-automation="jobLocation"]'),gaji:g('[data-automation="jobSalary"]'),
      tanggal:g('[data-automation="jobListingDate"]'),url:a?abs(a.getAttribute('href')):"",teks:b(k.textContent).slice(0,400)};
  });})()`;

const skripLinkedin = `(async()=>{${AWAL}
  await tunggu(()=>document.querySelectorAll('.base-search-card').length>0,25000);
  return link('.base-search-card').map(k=>{
    const g=(s)=>{const e=k.querySelector(s);return e?b(e.textContent):""};
    const a=k.querySelector('a.base-card__full-link');
    const w=k.querySelector('time');
    return {posisi:g('.base-search-card__title'),perusahaan:g('.base-search-card__subtitle'),
      lokasi:g('.job-search-card__location'),gaji:"",tanggal:w?(w.getAttribute('datetime')||b(w.textContent)):"",
      url:a?a.getAttribute('href').split('?')[0]:"",teks:b(k.textContent).slice(0,400)};
  });})()`;

const skripKalibrr = `(async()=>{${AWAL}
  await tunggu(()=>document.querySelectorAll('h2 a[href*="/jobs/"]').length>0,25000);
  return link('h2 a[href*="/jobs/"]').map(a=>{
    const pos=b(a.textContent);
    // Kartu Kalibrr: <div class="k-bg-white k-border-solid …"> berisi judul, perusahaan, kota, gaji, tipe.
    const kartu=a.closest('div[class*="k-bg-white"]')||a.parentElement?.parentElement?.parentElement||a.parentElement||a;
    const isi=b(kartu.textContent);
    const perusahaan=b(a.parentElement?.parentElement?.textContent).replace(pos,"").trim().slice(0,64);
    const sisa=isi.slice(Math.max(0,isi.indexOf(perusahaan)+perusahaan.length));
    return {posisi:pos,perusahaan,
      lokasi:(sisa.match(/([\\w .'-]{2,28},\\s*Indonesia)/)||[])[1]||"",
      gaji:(isi.match(/(Gaji Tidak Diumumkan|Rp[\\d.,]+\\s*(jt|juta|rb|ribu)?)/i)||[])[0]||"",
      tanggal:(isi.match(/Apply before [^A-Z]{1,12}|Rekruter terakhir aktif [^A-Z]{1,12}/)||[])[0]||"",
      url:abs(a.getAttribute('href')),teks:isi.slice(0,400)};
  });})()`;

const skripDealls = `(async()=>{${AWAL}
  // Dealls memuat lambat (dan butuh scroll agar kartu dirender).
  await tunggu(()=>document.querySelectorAll('a[href^="/loker/"]').length>3,40000);
  for(let i=0;i<3;i++){window.scrollBy(0,1200);await new Promise(r=>setTimeout(r,700))}
  // Kartu lowongan asli berslug "...~perusahaan"; sisanya tautan kategori/footer.
  return link('a[href^="/loker/"]').filter(a=>(a.getAttribute('href')||"").includes("~")).map(a=>{
    // Baris pertama kadang lencana ("Loker Butuh Cepat") → buang dulu.
    const L=baris(a).filter(x=>!/^(loker butuh cepat|pelamar masih sedikit|butuh cepat|urgently needed|baru|new)$/i.test(x));
    const teks=b(a.textContent);
    return {posisi:L[0]||"",perusahaan:L[1]||"",
      lokasi:(L.find(x=>!/^\\d/.test(x)&&/jakarta|bandung|surabaya|yogyakarta|semarang|medan|bali|tangerang|bekasi|depok|bogor|remote|malang|makassar/i.test(x))||""),
      gaji:(teks.match(/Rp[\\d.,]*\\s*(jt|juta|rb|ribu)?/i)||[])[0]||"",
      tanggal:"",
      url:abs(a.getAttribute('href')),teks:teks.slice(0,400)};
  });})()`;

const skripLokerid = `(async()=>{${AWAL}
  await tunggu(()=>document.querySelectorAll('article[data-id]').length>0,25000);
  return link('article[data-id]').map(k=>{
    const a=k.querySelector('a[data-discover]')||k.querySelector('h3 a');
    const h=k.querySelector('h3');
    const p=k.querySelector('span.text-sm');
    const L=baris(k);
    const teks=b(k.textContent);
    // Baris kartu loker.id: [inisial, perusahaan, posisi, lokasi, jenis, pendidikan, jabatan, kategori]
    return {posisi:h?b(h.textContent):"",perusahaan:p?b(p.textContent):"",
      lokasi:(L.slice(3,6).find(x=>!/^(full|part)\\s*time|kontrak|intern|magang|freelance|fresh|staff|senior|junior|\\d/i.test(x))
        ||((teks.match(/(Jakarta|Bandung|Surabaya|Yogyakarta|Semarang|Medan|Denpasar|Bali|Tangerang|Bekasi|Depok|Bogor|Malang|Makassar|Remote)[^,.;|]{0,16}/i)||[])[0]||"").split(/(?<=[a-z])(?=[A-Z])/)[0]||""),
      gaji:(teks.match(/Rp[\\d.,]+\\s*(jt|juta|rb|ribu)/i)||[])[0]||"",
      tanggal:"",
      url:a?abs(a.getAttribute('href')):"",teks:teks.slice(0,400)};
  });})()`;

/** Glints menolak sesi tanpa login → kalau 0 kartu, UI memberi tahu. */
const skripGlints = `(async()=>{${AWAL}
  for(let i=0;i<4;i++){window.scrollBy(0,900);await new Promise(r=>setTimeout(r,600))}
  await tunggu(()=>document.querySelectorAll('article').length>0,8000);
  return link('article').map(k=>{
    const a=k.querySelector('a[href*="/opportunities/jobs/"]');
    const L=baris(k);
    const teks=b(k.textContent);
    return {posisi:(k.getAttribute('aria-label')||L[0]||"").replace(/^Job card\\s*\\d*\\s*/i,""),perusahaan:L[1]||"",
      lokasi:(L.find(x=>/jakarta|bandung|surabaya|remote|tangerang|bekasi|bali|yogyakarta/i.test(x))||""),
      gaji:(teks.match(/Rp[\\d.,\\s]*/i)||[])[0]||"",tanggal:"",
      url:a?abs(a.getAttribute('href')).split('?')[0]:"",teks:teks.slice(0,400)};
  });})()`;

export const PLATFORM: Record<PlatformId, {
  label: string;
  /** URL halaman hasil pencarian. */
  alamat: (q: string, halaman: number) => string;
  skrip: string;
  /** Catatan pemakaian yang ditampilkan di UI (mis. butuh login). */
  catatan?: string;
  /** Batas tunggu gate "halaman siap" (ms); dealls sering ditahan Cloudflare → lebih pendek. */
  tunggu?: number;
}> = {
  jobstreet: {
    label: "JobStreet",
    alamat: (q, h) => `https://id.jobstreet.com/id/${encodeURIComponent(q).replace(/%20/g, "-")}-jobs${h > 1 ? `?page=${h}` : ""}`,
    skrip: skripJobstreet,
  },
  linkedin: {
    label: "LinkedIn",
    alamat: (q, h) => `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(q)}&location=Indonesia&start=${(h - 1) * 25}`,
    skrip: skripLinkedin,
  },
  kalibrr: {
    label: "Kalibrr",
    alamat: (q) => `https://www.kalibrr.com/job-board/te/${encodeURIComponent(q)}`,
    skrip: skripKalibrr,
  },
  dealls: {
    label: "Dealls",
    alamat: (q) => `https://dealls.com/?keyword=${encodeURIComponent(q)}`,
    skrip: skripDealls,
    tunggu: 8_000,
  },
  lokerid: {
    label: "Loker.id",
    // Loker.id mencocokkan frasa persis: "frontend developer" → 1 hasil, "frontend" → 21. Pakai kata pertama.
    alamat: (q) => `https://www.loker.id/cari-lowongan-kerja?q=${encodeURIComponent((q.trim().split(/\s+/)[0] ?? q))}`,
    skrip: skripLokerid,
    catatan: "kata kunci dipotong jadi kata pertama (loker.id cocokkan frasa utuh)",
  },
  glints: {
    label: "Glints",
    alamat: (q) => `https://glints.com/id/opportunities/jobs/explore?keyword=${encodeURIComponent(q)}&country=ID`,
    skrip: skripGlints,
    catatan: "Butuh login Glints di browser",
    tunggu: 8_000,
  },
};

export const PLATFORM_ID = Object.keys(PLATFORM) as PlatformId[];

/** Umur posting → hari. "Baru"/"Hari ini" = 0, "1 bulan yang lalu" = 30. */
export function hariDari(teks: string): number | null {
  const s = (teks || "").toLowerCase();
  if (!s) return null;
  if (/baru|hari ini|just posted|today/.test(s)) return 0;
  if (/kemarin|yesterday/.test(s)) return 1;
  if (/\\ban?\\s*(hour|day|week|month)\\b/.test(s)) return s.includes("week") ? 7 : s.includes("month") ? 30 : 1;
  const m = s.match(/(\d+)\s*(menit|jam|hari|minggu|bulan|tahun|day|week|month|hour|minute)/);
  if (!m) {
    const d = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (d) return Math.max(0, Math.round((Date.now() - Date.parse(s.slice(0, 10))) / 86400000));
    return null;
  }
  const n = Number(m[1]);
  const kali: Record<string, number> = { menit: 0, jam: 0, minute: 0, hour: 0, hari: 1, day: 1, minggu: 7, week: 7, bulan: 30, month: 30, tahun: 365 };
  return Math.round(n * (kali[m[2]] ?? 1));
}

/** Rapikan keluaran mentah skrip in-page. */
export function normalkan(platform: PlatformId, mentah: unknown): Loker[] {
  const arr = Array.isArray(mentah) ? mentah : [];
  const jelas = new Set<string>();
  const hasil: Loker[] = [];
  for (const r of arr as Record<string, string>[]) {
    const url = (r?.url ?? "").trim();
    const posisi = (r?.posisi ?? "").trim();
    const perusahaan = (r?.perusahaan ?? "").trim();
    if (!url || !posisi || jelas.has(url)) continue;
    jelas.add(url);
    hasil.push({
      id: url,
      platform,
      posisi,
      perusahaan,
      lokasi: (r?.lokasi ?? "").trim(),
      gaji: (r?.gaji ?? "").trim(),
      tanggal: (r?.tanggal ?? "").trim(),
      hariLalu: hariDari(r?.tanggal ?? ""),
      url,
      teks: (r?.teks ?? "").trim(),
    });
  }
  return hasil;
}

/** Kata kunci pencarian dari CV: posisi terakhir, label, keahlian. */
export function kunciDariResume(resume: Resume): string[] {
  const k = [resume?.basics?.label, resume?.work?.[0]?.position, ...(resume?.skills ?? []).flatMap((s) => [s.name, ...(s.keywords ?? []).slice(0, 3)])];
  return [...new Set(k.map((x) => (x ?? "").trim()).filter((x) => x.length > 2))].slice(0, 6);
}

/** Skor kecocokan 0-100 + kata kunci yang ketemu. */
export function skorCocok(l: Loker, kunci: string[]): { skor: number; cocok: string[] } {
  const teks = `${l.posisi} ${l.perusahaan} ${l.teks}`.toLowerCase();
  const unik = [...new Set(kunci.map((x) => x.toLowerCase()))].filter((x) => x.length > 2);
  if (!unik.length) return { skor: 0, cocok: [] };
  const potong = (x: string) => x.split(/[\s,/|-]+/).filter((w) => w.length > 2);
  const cocok: string[] = [];
  let poin = 0;
  for (const k of unik) {
    const inti = potong(k);
    const kebal = inti.length ? inti.filter((w) => teks.includes(w)).length / inti.length : 0;
    const bobot = l.posisi.toLowerCase().includes(k) ? 1.35 : 1;
    poin += kebal * bobot;
    if (kebal > 0.5) cocok.push(k);
  }
  const skor = Math.min(100, Math.round((poin / unik.length) * 92) + (cocok.length ? 8 : 0));
  return { skor, cocok };
}

/** Masih dianggap buka: umur posting ≤ 30 hari, atau platform tidak menyebutkan umur. */
export const BATAS_SEGAR = 30;
export function segar(l: Loker): boolean {
  return l.hariLalu === null || l.hariLalu <= BATAS_SEGAR;
}

/**
 * Skrip cek status di halaman DETAIL lowongan. Perkiraan (bukan sumber resmi):
 * tanda "ditutup" kalah prioritas di bawah tanda "masih bisa melamar".
 */
export const SKRIP_STATUS = `(async()=>{${AWAL}
  await tunggu(()=>b(document.body.innerText).length>200,15000);
  const t=b(document.body.innerText).toLowerCase();
  const tandaTutup=[
    /(lowongan|loker|job|posisi)[^.!?]{0,60}(sudah |telah )?(ditutup|diklosed|closed|kedaluwarsa|expired|tidak lagi (tersedia|dibuka|aktif|menerima))/,
    /no longer (accepting|available|active)/,
    /(job|vacancy|position) (is )?(closed|expired|no longer)/,
    /maaf,? (lowongan|loker)/,
  ];
  const tandaBuka=[
    /(lamar|melamar|apply|kirim lamaran|apply now|quick apply)/,
    /(lowongan|loker) ini (masih )?(dibuka|aktif|tersedia)/,
    /buka sampai|batas akhir|deadline/,
  ];
  const tembus=tandaTutup.find(p=>p.test(t));
  const nyala=tandaBuka.find(p=>p.test(t));
  const tombol=document.querySelector('[data-automation="job-detail-apply"],a[href*="apply"],button[type="submit"]');
  return {tandaTutup:tembus?tembus.source.slice(0,40):"",tandaBuka:nyala?nyala.source.slice(0,40):"",
    adaTombol:!!tombol,cuplik:t.slice(0,240)};
})()`;

/** Putuskan status dari keluaran SKRIP_STATUS. */
export function statusDari(m: unknown): StatusLoker {
  const r = (m ?? {}) as { tandaTutup?: string; tandaBuka?: string; adaTombol?: boolean };
  if (r.tandaBuka || r.adaTombol) return "buka";
  if (r.tandaTutup) return "tutup";
  return "ragu";
}

export type Filter = { platform: PlatformId[]; status: "semua" | "buka" | "tutup"; cek: Record<string, StatusLoker> };

export function saring(list: Loker[], f: Filter): Loker[] {
  return list.filter((l) => {
    if (f.platform.length && !f.platform.includes(l.platform)) return false;
    if (f.status === "semua") return true;
    const manual = f.cek[l.url];
    return f.status === "buka" ? (manual ? manual === "buka" : segar(l)) : manual === "tutup";
  });
}
