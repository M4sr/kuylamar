/** Buang skema http(s) dan garis miring di ujung. Tampilan CV cukup "github.com/nama". */
export function rapiTautan(u?: string): string {
  return (u ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
