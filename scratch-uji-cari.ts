/** Uji panen v11 — jobstreet: skrip mentah vs hasil normalkan. */
import { evalBrowser } from "/home/kingforex/coding/lamarkerja/src/lib/browserFetch.ts";
import { PLATFORM, normalkan } from "/home/kingforex/coding/lamarkerja/src/lib/cari.ts";

const cfg = PLATFORM.jobstreet;
try {
  const r = await evalBrowser<unknown[]>(cfg.alamat("programmer", 1), cfg.skrip, cfg.tunggu ?? 30_000);
  console.log("mentah:", Array.isArray(r) ? r.length : typeof r);
  console.log(JSON.stringify((Array.isArray(r) ? r : []).slice(0, 2), null, 1).slice(0, 900));
  const n = normalkan("jobstreet", r);
  console.log("normal:", n.length);
  console.log(JSON.stringify(n.slice(0, 2), null, 1).slice(0, 700));
} catch (e) {
  console.log("GAGAL:", (e as Error).message);
}
process.exit(0);
