// Endpoint produksi: Cloudflare Pages Function → GET /api/job?url=<link lowongan>
import { jobFromUrl } from "../../src/lib/jobApi";

export const onRequestGet = async (context: { request: Request }) => {
  const url = new URL(context.request.url).searchParams.get("url") ?? "";
  const r = await jobFromUrl(url);
  return new Response(JSON.stringify(r.data ?? { error: r.error }), {
    status: r.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
