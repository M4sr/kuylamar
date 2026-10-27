/**
 * 9router bisa balas JSON biasa ataupun SSE (kadang campur: JSON + `data: [DONE]`).
 * Fungsi ini menormalkan keduanya jadi satu teks.
 */
export function jsonIsi(mentah: string): string {
  const akhir = mentah.lastIndexOf("}");
  try {
    const d = JSON.parse(mentah.slice(0, akhir + 1)) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

/** Kumpulkan potongan delta dari aliran SSE. */
export function rakitSse(mentah: string): string {
  let out = "";
  for (const baris of mentah.split("\n")) {
    const t = baris.trim();
    if (!t.startsWith("data:")) continue;
    const isi = t.slice(5).trim();
    if (!isi || isi === "[DONE]") continue;
    try {
      const d = JSON.parse(isi) as { choices?: { delta?: { content?: string } }[] };
      out += d.choices?.[0]?.delta?.content ?? "";
    } catch {
      /* baris SSE rusak — lewati */
    }
  }
  return out;
}

/** Tebak format dari content-type; kalau meleset, coba cara lain. */
export function rakitBalas(mentah: string, contentType = ""): string {
  const sse = contentType.includes("event-stream");
  return (sse ? rakitSse(mentah) || jsonIsi(mentah) : jsonIsi(mentah) || rakitSse(mentah)).trim();
}
