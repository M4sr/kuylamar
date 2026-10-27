/** Uraikan halaman lowongan dari HTML mentah: JobStreet, LinkedIn, dan pola umum (JSON-LD / JSON tertanam). */
import type { Job } from "../types.ts";

function unescapeJson(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

/** HTML → teks biasa, bullet dipertahankan supaya JD tetap terbaca enak. */
function htmlToText(html: string): string {
  const s = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function meta(html: string, prop: string): string {
  const m = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i").exec(html);
  return m ? m[1] : "";
}

function cleanTitle(t: string): string {
  return t
    .replace(/\s*[-–|]\s*Jobstreet.*$/i, "")
    .replace(/\s+(Job|Lowongan|Job Vacancy)\s+in\s+.*$/i, "")
    .replace(/^Lowongan Kerja\s+/i, "")
    .trim();
}

export function parseJobPage(html: string, url = ""): Partial<Job> {
  let sk: Record<string, unknown> = {};
  const skRaw = /window\.SK_DL\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html);
  if (skRaw) {
    try {
      sk = JSON.parse(skRaw[1]) as Record<string, unknown>;
    } catch {
      /* pakai fallback meta */
    }
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  // Deskripsi: field content2 pada payload internal (satu-satunya di halaman).
  let description = "";
  for (const re of [/"content2"\s*:\s*"((?:[^"\\]|\\.)*)"/, /"abstract"\s*:\s*"((?:[^"\\]|\\.)*)"/]) {
    const m = re.exec(html);
    if (m) {
      const text = htmlToText(unescapeJson(m[1]));
      if (text.length > description.length) description = text;
    }
  }
  if (!description) {
    const d = meta(html, "og:description") || meta(html, "description");
    if (d) description = htmlToText(d);
  }

  const position = cleanTitle(str(sk.jobTitle)) || cleanTitle(meta(html, "og:title"));
  const company = str(sk.advertiserName) || str(sk.companyName);
  const extra = [str(sk.jobSalary), str(sk.jobLocation)].filter(Boolean);

  return {
    position: position || undefined,
    company: company || undefined,
    description: description ? (extra.length ? `${description}\n\n${extra.join(" · ")}` : description) : undefined,
    source: "JobStreet",
    url: url || undefined,
  };
}

export function isLinkedinUrl(url: string): boolean {
  try {
    return /(^|\.)linkedin\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** LinkedIn: halaman publik /jobs/view/<id> — data di markup topcard + blok deskripsi. */
export function parseLinkedinPage(html: string, url = ""): Partial<Job> {
  const satu = (re: RegExp) => {
    const m = re.exec(html);
    return m ? htmlToText(m[1]).replace(/\n/g, " ").trim() : "";
  };
  let description = "";
  const i = html.indexOf("show-more-less-html__markup");
  if (i >= 0) {
    const mulai = html.indexOf(">", i) + 1; // lewati sisa tag pembuka
    const akhir = html.indexOf("description__job-criteria-list", mulai);
    description = htmlToText(html.slice(mulai, akhir > mulai ? akhir : mulai + 40000));
  }
  if (!description) description = htmlToText(meta(html, "description"));

  const lokasi = satu(/topcard__flavor topcard__flavor--bullet">([\s\S]*?)<\/span>/);
  return {
    position: satu(/topcard__title">([\s\S]*?)<\/h1>/) || undefined,
    company: satu(/topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/) || undefined,
    description: description ? (lokasi ? `${description}\n\n${lokasi}` : description) : undefined,
    source: "LinkedIn",
    url: url || undefined,
  };
}

/** ---- Parser umum: JSON-LD JobPosting + JSON tertanam (Next/Nuxt/react-query) ---- */

const KUNCI_JUDUL = /^(title|position|jobTitle|job_title|name|role)$/i;
const KUNCI_DESK =
  /^(description|jobDescription|jobDescriptionHtml|descriptionHtml|descriptionJsonString|description_html|responsibilities|requirements|qualifications|about|abstract|introduction|conclusion|content)$/i;
const KUNCI_PERUSAHAAN =
  /^(companyName|company_name|company|organization|employer|hiringOrganization|advertiserName|brand|displayName)$/i;
/** Kunci khas data lowongan — dipakai membedakan lowongan dari artikel/blog yang juga punya title + content. */
const KUNCI_PENANDA =
  /^(post_type|employment|job_post_location|hiring_plan_id|pay_ranges|published_at|tenure|workExperience|numberOfOpenings|perks|jobId|salaryShown|applyRedirectUrl)$/i;

/** Teks kaya ala Draft.js/Slate (mis. Glints `descriptionJsonString`) → teks biasa. */
function teksBlok(v: unknown): string {
  if (typeof v !== "string" || !v.trimStart().startsWith("{")) return typeof v === "string" ? v : "";
  try {
    const o = JSON.parse(v) as { blocks?: { text?: unknown }[] };
    const bagian = (o.blocks ?? []).map((b) => String(b?.text ?? "")).filter(Boolean);
    return bagian.length ? bagian.join("\n") : v;
  } catch {
    return v;
  }
}

function namaDari(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return namaDari(o.name ?? o.title ?? "");
  }
  return "";
}

/** Semua blok JSON di halaman: ld+json, <script type="application/json">, window.__X__ = {...}. */
function blokJSON(html: string): unknown[] {
  const hasil: unknown[] = [];
  const tambah = (raw: string) => {
    try {
      hasil.push(JSON.parse(raw));
    } catch {
      /* blok rusak / literal JS — lewati */
    }
  };
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    tambah(m[1]);
  }
  for (const m of html.matchAll(
    /(?:window|self)\.(?:__(?:INITIAL_STATE|NUXT|DATA)__|__remixContext)\s*=\s*([\s\S]*?)<\/script>/g,
  )) {
    tambah(m[1].trim().replace(/;$/, ""));
  }
  return hasil;
}

function cariJobPosting(node: unknown, out: Record<string, unknown>[], dalam = 0) {
  if (dalam > 12) return;
  if (Array.isArray(node)) {
    for (const n of node) cariJobPosting(n, out, dalam + 1);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const jenis = Array.isArray(o["@type"]) ? o["@type"].map(String) : [String(o["@type"] ?? "")];
  if (jenis.some((x) => /jobposting/i.test(x))) out.push(o);
  for (const v of Object.values(o)) cariJobPosting(v, out, dalam + 1);
}

function lokasiLd(v: unknown): string {
  const satu = (x: unknown): string => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const alamat = (o.address && typeof o.address === "object" ? o.address : {}) as Record<string, unknown>;
      return [alamat.addressLocality, alamat.addressRegion, o.name].filter((s) => typeof s === "string").join(", ");
    }
    return "";
  };
  return (Array.isArray(v) ? v.map(satu) : [satu(v)]).filter(Boolean).join(" · ");
}

/** JSON-LD JobPosting — dipakai Lever, banyak situs karier perusahaan, sebagian job board. */
export function parseJsonLdJob(html: string, sumber = "", url = ""): Partial<Job> | null {
  const nodes: Record<string, unknown>[] = [];
  for (const b of blokJSON(html)) cariJobPosting(b, nodes);
  const o = nodes[0];
  const position = String(o?.title ?? "").trim();
  if (!position) return null;
  const description = [htmlToText(String(o.description ?? "")), lokasiLd(o.jobLocation)].filter(Boolean).join("\n\n");
  return {
    position,
    company: namaDari(o.hiringOrganization ?? o.organization) || undefined,
    description: description || undefined,
    source: sumber || undefined,
    url: url || undefined,
  };
}

type Calon = { skor: number; position: string; company: string; description: string };

/** Satu objek JSON dianggap lowongan kalau punya judul + isi panjang (dan bukan kamus i18n). */
function calonLoker(o: Record<string, unknown>): Calon | null {
  let position = "";
  let company = "";
  let penanda = false;
  const bag: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (KUNCI_PENANDA.test(k)) penanda = true;
    if (!position && KUNCI_JUDUL.test(k) && typeof v === "string" && v.trim().length >= 3 && v.length <= 140 && !v.includes("\n")) {
      position = v.trim();
    } else if (!company && KUNCI_PERUSAHAAN.test(k)) {
      const c = namaDari(v).trim();
      if (c && c.length <= 120 && !c.includes("\n")) company = c;
    } else if (KUNCI_DESK.test(k)) {
      const panjang = k.toLowerCase() === "content" ? 400 : 40; // "content" terlalu umum: minta teks panjang
      const teks = teksBlok(v);
      if (teks.length > panjang) bag.push(htmlToText(teks));
      else if (v && typeof v === "object") {
        const d = (v as Record<string, unknown>).description;
        if (typeof d === "string" && d.length > 40) bag.push(htmlToText(d));
      }
    }
  }
  const description = [...new Set(bag)].join("\n\n");
  if (!position || description.length < 250) return null;
  if (!company && bag.length < 2 && !penanda) return null; // buang teks antarmuka (kamus i18n) & artikel biasa
  return { skor: description.length, position, company, description };
}

/** JSON tertanam: Next.js __NEXT_DATA__ / react-query / Nuxt — Dealls, Kalibrr, Greenhouse, dsb. */
export function parseEmbeddedJob(html: string, sumber = "", url = ""): Partial<Job> | null {
  const hasil: { c?: Calon } = {};
  const telusuri = (node: unknown, dalam: number) => {
    if (dalam > 12) return;
    if (Array.isArray(node)) {
      for (const n of node) telusuri(n, dalam + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const c = calonLoker(o);
    if (c && (!hasil.c || c.skor > hasil.c.skor)) hasil.c = c;
    for (const v of Object.values(o)) if (v && typeof v === "object") telusuri(v, dalam + 1);
  };
  for (const b of blokJSON(html)) telusuri(b, 0);
  const b = hasil.c;
  if (!b) return null;
  return {
    position: b.position,
    company: b.company || undefined,
    description: b.description,
    source: sumber || undefined,
    url: url || undefined,
  };
}

/** Jalur lengkap: khusus JobStreet/LinkedIn → JSON-LD → JSON tertanam → meta og:. */
export function parseJobAny(html: string, sumber = "", url = ""): Partial<Job> {
  if (/^JobStreet$/i.test(sumber)) {
    const j = parseJobPage(html, url);
    if (j.position) return j;
  }
  if (/^LinkedIn$/i.test(sumber)) {
    const j = parseLinkedinPage(html, url);
    if (j.position) return j;
  }
  const ld = parseJsonLdJob(html, sumber, url);
  if (ld) return ld;
  const emb = parseEmbeddedJob(html, sumber, url);
  if (emb) return emb;
  const metaJ = parseJobPage(html, url);
  return { ...metaJ, source: sumber || metaJ.source };
}

const PETA_SUMBER: Array<[RegExp, string]> = [
  [/(^|\.)jobstreet\.(co\.(id|sg|my|ph)|com(\.(ph|my|sg))?)$/i, "JobStreet"],
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)glints\.com$/i, "Glints"],
  [/(^|\.)dealls\.com$/i, "Dealls"],
  [/(^|\.)kalibrr\.(id|com|ph|co\.th)$/i, "Kalibrr"],
  [/(^|\.)indeed\.(com|co\.id|com\.br)$/i, "Indeed"],
  [/(^|\.)jobsdb\.com$/i, "JobsDB"],
  [/(^|\.)lever\.co$/i, "Lever"],
  [/(^|\.)greenhouse\.io$/i, "Greenhouse"],
  [/(^|\.)workable\.com$/i, "Workable"],
  [/(^|\.)techinasia\.com$/i, "Tech in Asia"],
  [/(^|\.)loker\.id$/i, "Loker.id"],
];

export function sumberDariUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    for (const [re, nama] of PETA_SUMBER) if (re.test(host)) return nama;
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Link ke jaringan lokal/loopback ditolak — cegah situs diakses lewat bot ini (SSRF). */
export function hostPrivat(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (["localhost", "0.0.0.0", "::1", "[::1]"].includes(h) || h.endsWith(".local") || h.endsWith(".internal")) return true;
    return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h === "::1" || /^\[?(fc|fd|fe80)/.test(h);
  } catch {
    return true;
  }
}

export function isJobstreetUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)jobstreet\.(co\.(id|sg|my|ph)|com(\.(ph|my|sg))?)$/i.test(host);
  } catch {
    return false;
  }
}
