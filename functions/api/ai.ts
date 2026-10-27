/**
 * /api/ai untuk Cloudflare Pages — tembusan ke endpoint OpenAI-compatible.
 * Set AI_BASE + AI_KEY di environment Pages. Balasan dinormalkan ke `{ teks }`.
 */
export const onRequestPost = async ({ request, env }: { request: Request; env: Record<string, string> }) => {
  const json = (code: number, obj: unknown) =>
    new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json; charset=utf-8" } });

  const base = env.AI_BASE;
  const key = env.AI_KEY;
  if (!base || !key) return json(503, { error: { message: "AI belum dikonfigurasi di server ini (set AI_BASE & AI_KEY)." } });

  const { model = "super-kombo", messages, max_tokens = 800, tanpaPikir } = (await request.json().catch(() => ({}))) as {
    model?: string;
    messages?: unknown;
    max_tokens?: number;
    /** Model penalar menumpahkan proses berpikirnya ke `content` kalau ini tidak dimatikan. */
    tanpaPikir?: boolean;
  };
  try {
    const r = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens, ...(tanpaPikir ? { thinking: { type: "disabled" } } : {}) }),
    });
    const mentah = await r.text();
    if (!r.ok) return json(r.status, { error: { message: mentah.slice(0, 300) || `HTTP ${r.status}` } });
    return json(200, { teks: rakitBalas(mentah, r.headers.get("content-type") ?? "") });
  } catch (e) {
    return json(502, { error: { message: `Endpoint AI tidak terjangkau (${(e as Error).message}).` } });
  }
};

function jsonIsi(mentah: string): string {
  const akhir = mentah.lastIndexOf("}");
  try {
    const d = JSON.parse(mentah.slice(0, akhir + 1)) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

/** 9router balas JSON atau SSE (kadang campur) → satu teks. */
function rakitBalas(mentah: string, contentType = ""): string {
  const sse = contentType.includes("event-stream");
  const delta = () => {
    let out = "";
    for (const baris of mentah.split("\n")) {
      const t = baris.trim();
      if (!t.startsWith("data:")) continue;
      const isi = t.slice(5).trim();
      if (!isi || isi === "[DONE]") continue;
      try {
        out += (JSON.parse(isi) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? "";
      } catch {
        /* baris rusak — lewati */
      }
    }
    return out;
  };
  return (sse ? delta() || jsonIsi(mentah) : jsonIsi(mentah) || delta()).trim();
}
