/**
 * Judul dokumen = nama berkas default saat "Simpan sebagai PDF" di browser.
 * Tanpa ini semua hasil cetak bernama sama ("Kuylamar — CV & Surat Lamaran").
 */
export function namaBerkas(
  t: "cv" | "letter" | "both",
  nama: string,
  perusahaan = "",
  now = new Date(),
): string {
  const kepala = t === "cv" ? "CV" : t === "letter" ? "Surat Lamaran" : "CV & Surat";
  const bulan = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return [kepala, nama, perusahaan, bulan]
    .map((s) => s.replace(/[\\/:*?"<>|\s]+/g, " ").trim())
    .filter(Boolean)
    .join(" - ")
    .slice(0, 120);
}
