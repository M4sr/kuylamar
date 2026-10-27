/** Satu tempat untuk ambil + uraikan halaman lowongan. Dipakai endpoint dev (Vite) dan Cloudflare Function. */
import { hostPrivat, parseJobAny, sumberDariUrl } from "./extract.ts";
import type { Job } from "../types.ts";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type JobLookup = { status: number; data?: Partial<Job>; error?: string };

/** Bentuk hasil jadi, atau null kalau halaman tidak memuat data lowongan yang layak. */
function jadi(data: Partial<Job> | null, sumber: string): JobLookup | null {
  if (!data?.position || (data.description ?? "").length < 150) return null;
  return { status: 200, data: { ...data, source: data.source || sumber } };
}

/**
 * Ambil satu halaman lowongan atas permintaan user (1 klik = 1 link, bukan crawler).
 * `ambilHtml` = jalur cadangan lewat browser sungguhan (hanya tersedia di server lokal).
 */
export async function jobFromUrl(
  raw: string,
  timeoutMs = 12000,
  ambilHtml?: (url: string) => Promise<string>,
): Promise<JobLookup> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { status: 400, error: "Link tidak valid." };
  }
  if (!/^https?:$/.test(url.protocol) || hostPrivat(url.href)) return { status: 400, error: "Link tidak didukung." };
  const sumber = sumberDariUrl(url.href) || "situs ini";

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let html = "";
  try {
    let next: string | null = url.href;
    for (let hop = 0; hop < 4 && next; hop++) {
      const res: Response = await fetch(next, {
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc: string | null = res.headers.get("location");
        next = loc ? new URL(loc, next).href : null;
        if (next && (!/^https?:/.test(next) || hostPrivat(next))) return { status: 400, error: "Link tidak didukung." };
        continue;
      }
      if (res.status === 404) return { status: 404, error: `Lowongan tidak ditemukan di ${sumber} (mungkin sudah ditutup).` };
      if (!res.ok) {
        const lewatBrowser = await cobaBrowser(ambilHtml, url.href, sumber);
        return lewatBrowser ?? pesanTolak(res.status, sumber);
      }
      html = (await res.text()).slice(0, 3_000_000);
      next = null;
    }
    if (!html) return { status: 502, error: `Terlalu banyak pengalihan dari ${sumber}.` };
  } catch (e) {
    return { status: 502, error: `Gagal menghubungi ${sumber}: ${(e as Error).message}` };
  } finally {
    clearTimeout(t);
  }

  const langsung = jadi(parseJobAny(html, sumber, url.href.split("?")[0]), sumber);
  if (langsung) return langsung;

  // Halaman tanpa data lowongan di HTML mentah (SPA) atau tertahan tantangan bot → coba browser.
  const lewatBrowser = await cobaBrowser(ambilHtml, url.href, sumber);
  if (lewatBrowser) return lewatBrowser;

  return {
    status: 422,
    error: `Isi lowongan tidak terbaca dari ${sumber} (mungkin butuh login). Tempel deskripsinya manual.`,
  };
}

/** Jalur cadangan browser; null = tidak tersedia atau tetap gagal. */
async function cobaBrowser(
  ambilHtml: ((url: string) => Promise<string>) | undefined,
  href: string,
  sumber: string,
): Promise<JobLookup | null> {
  if (!ambilHtml) return null;
  try {
    const html = await ambilHtml(href);
    return jadi(parseJobAny(html, sumber, href.split("?")[0]), sumber);
  } catch {
    return null;
  }
}

/** Situs yang memblokir bot → beri pesan yang bisa ditindaklanjuti user, bukan error mentah. */
function pesanTolak(status: number, sumber: string): JobLookup {
  if ([401, 403, 429].includes(status)) {
    return { status: 422, error: `${sumber} memblokir pengambilan otomatis (HTTP ${status}). Tempel deskripsi lowongannya manual.` };
  }
  return { status: 502, error: `${sumber} menolak permintaan (HTTP ${status}).` };
}
