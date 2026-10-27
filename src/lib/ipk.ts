/**
 * Nilai IPK bersih: buang awalan "IPK" yang mungkin sudah ikut terketik,
 * karena di form "IPK" tampil sebagai prefiks tetap.
 */
export function angkaIpk(v: string | undefined): string {
  return (v ?? "").replace(/^\s*ipk\s*[:.=]?\s*/i, "").trim();
}

/** Label siap tempel di CV: "" kalau kosong, " — IPK 3,45" kalau ada. */
export function labelIpk(v: string | undefined): string {
  const a = angkaIpk(v);
  return a ? ` — IPK ${a}` : "";
}
