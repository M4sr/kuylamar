import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { jobFromUrl } from './src/lib/jobApi.ts'
import { htmlBrowser, evalBrowser } from './src/lib/browserFetch.ts'
import { PLATFORM, SKRIP_STATUS, normalkan, statusDari, type PlatformId } from './src/lib/cari.ts'
import { rakitBalas } from './src/lib/aiBalas.ts'

/** Endpoint lokal /api/job?url=… — produksi pakai functions/api/job.ts (Cloudflare Pages). */
function jobProxy(): Plugin {
  return {
    name: 'lamarkerja-job-proxy',
    configureServer(server) {
      server.middlewares.use('/api/job', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://local').searchParams.get('url') ?? ''
        const r = await jobFromUrl(url, 12000, htmlBrowser)
        res.statusCode = r.status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(r.data ?? { error: r.error }))
      })
    },
  }
}

/**
 * /api/ai — tembusan ke 9router (OpenAI-compatible) untuk auto-tulis ringkasan & deskripsi proyek.
 * Kunci diambil server-side (env AI_KEY atau DB 9router lokal) → browser tidak pernah pegang kunci.
 * Balasan selalu dinormalkan ke `{ teks }`.
 */
function aiProxy(): Plugin {
  const base = process.env.AI_BASE ?? 'http://localhost:20128/v1'

  async function kunci(): Promise<string> {
    if (process.env.AI_KEY) return process.env.AI_KEY
    try {
      const nama = 'node:sqlite'
      const { DatabaseSync } = (await import(nama)) as {
        DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => {
          prepare(q: string): { get(): unknown }
          close(): void
        }
      }
      const db = new DatabaseSync(join(homedir(), '.9router', 'db', 'data.sqlite'), { readOnly: true })
      const row = db.prepare('select key from apiKeys where isActive=1 limit 1').get() as { key?: string } | undefined
      db.close()
      return row?.key ?? ''
    } catch {
      return ''
    }
  }

  return {
    name: 'lamarkerja-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai', async (req, res) => {
        const kirim = (code: number, obj: unknown) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(obj))
        }
        const key = await kunci()
        if (req.method !== 'POST') return kirim(200, { status: key ? 'siap' : 'tanpa-kunci', base, model: 'super-kombo' })

        let isi = ''
        for await (const c of req) isi += c
        if (!key) return kirim(503, { error: { message: 'Kunci 9router belum ada — set AI_KEY atau jalankan 9router lokal.' } })

        const { model = 'super-kombo', messages, max_tokens = 800, tanpaPikir } = JSON.parse(isi || '{}') as {
          model?: string
          messages?: unknown
          max_tokens?: number
          tanpaPikir?: boolean
        }
        try {
          const r = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages, max_tokens, ...(tanpaPikir ? { thinking: { type: 'disabled' } } : {}) }),
          })
          const mentah = await r.text()
          if (!r.ok) return kirim(r.status, { error: { message: mentah.slice(0, 300) || `HTTP ${r.status}` } })
          const teks = rakitBalas(mentah, r.headers.get('content-type') ?? '')
          if (!teks.trim()) return kirim(502, { error: { message: 'Model balas kosong — coba model lain.' } })
          kirim(200, { teks })
        } catch (e) {
          kirim(502, { error: { message: `9router tidak terjangkau (${(e as Error).message}).` } })
        }
      })
    },
  }
}

/**
 * Akun gerbang Basic Auth. Satu baris `user:pass` per akun di ~/.lamarkerja-gate (0600);
 * baris tanpa `:` dianggap password lama (user: lamarkerja). Env GATE_USERS menggantikan isi file.
 * Dibaca tiap request → ganti password tanpa restart. Tanpa akun, gerbang mati (siapa pun bisa bakar kredit 9router lewat /api/ai).
 */
function akunGate(): Map<string, string> {
  const out = new Map<string, string>()
  let teks = process.env.GATE_USERS ?? ''
  if (!teks) { try { teks = readFileSync(join(homedir(), '.lamarkerja-gate'), 'utf8') } catch { /* tanpa file = tanpa gerbang */ } }
  for (const baris of teks.split('\n')) {
    const b = baris.trim()
    if (!b || b.startsWith('#')) continue
    const i = b.indexOf(':')
    if (i < 0) out.set('lamarkerja', b)
    else out.set(b.slice(0, i), b.slice(i + 1))
  }
  if (process.env.GATE_PASS) out.set('lamarkerja', process.env.GATE_PASS)
  return out
}

/** Bandingkan rahasia tanpa bocor lewat waktu eksekusi. */
function cocok(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Hanya izinkan tujuan internal: cegah open redirect lewat ?next=. */
function tujuanAman(s: string): string {
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : '/'
}

/** Rahasia tanda tangan kuki sesi. Dibuat sekali di ~/.lamarkerja-gate-sesi (0600). */
let kunciSesi: Buffer | null = null
function rahasiaSesi(): Buffer {
  if (kunciSesi) return kunciSesi
  const p = join(homedir(), '.lamarkerja-gate-sesi')
  try {
    const t = readFileSync(p, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(t)) return (kunciSesi = Buffer.from(t, 'hex'))
  } catch { /* belum ada */ }
  kunciSesi = randomBytes(32)
  try { writeFileSync(p, kunciSesi.toString('hex'), { mode: 0o600 }) } catch { /* fs read-only: sesi hidup selama proses hidup */ }
  return kunciSesi
}

const NAMA_KUKI = 'lmkj'
/** Tanda tangan `user.exp` → kuki tidak bisa dipalsukan tanpa rahasia. */
function tandaSesi(user: string, exp: number): string {
  return createHmac('sha256', rahasiaSesi()).update(`${user}.${exp}`).digest('base64url')
}

/** Isi halaman login dari gate/masuk.html, placeholder diisi nilai ter-escape. */
function halamanMasuk(root: string, galat: string, user: string, next: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  return readFileSync(join(root, 'gate/masuk.html'), 'utf8')
    .replace('{{ERROR}}', esc(galat))
    .replace('{{USER}}', esc(user))
    .replace('{{NEXT}}', esc(tujuanAman(next)))
}

/** Gerbang login kustom (form HTML + kuki sesi bertanda tangan), pengganti popup Basic Auth. */
function gerbang(): Plugin {
  return {
    name: 'lamarkerja-gate',
    configureServer(server) {
      const gagal = new Map<string, number[]>()
      const kenaBatas = (ip: string): boolean => {
        const kini = Date.now()
        const cap = (gagal.get(ip) ?? []).filter((t) => kini - t < 5 * 60_000)
        gagal.set(ip, cap)
        return cap.length >= 6
      }
      const badan = (req: import('http').IncomingMessage) =>
        new Promise<string>((ok) => {
          let s = ''
          req.on('data', (c: Buffer) => { if (s.length < 4096) s += c.toString('utf8') })
          req.on('end', () => ok(s))
        })
      const kirimHalaman = (res: import('http').ServerResponse, code: number, galat: string, user: string, next: string) => {
        res.statusCode = code
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.setHeader('referrer-policy', 'no-referrer')
        res.end(halamanMasuk(server.config.root, galat, user, next))
      }
      /** Kuki sesi valid → nama pengguna, kalau tidak null. exp 0 = sesi browser saja. */
      const kukiSesi = (req: import('http').IncomingMessage): string | null => {
        const raw = (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${NAMA_KUKI}=`))
        if (!raw) return null
        const [user, exp, sig] = decodeURIComponent(raw.slice(NAMA_KUKI.length + 1)).split('.')
        const e = Number(exp)
        if (!user || !sig || !Number.isFinite(e) || (e > 0 && e < Date.now())) return null
        return cocok(sig, tandaSesi(user, e)) ? user : null
      }
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://lokal')

        // Tombol "Keluar" di app selalu mengarah ke sini; tanpa gate pun jawab redirect, jangan lempar index.html.
        if (url.pathname === '/__keluar') {
          res.statusCode = 303
          res.setHeader('set-cookie', `${NAMA_KUKI}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
          res.setHeader('location', akunGate().size ? '/__masuk' : '/')
          return res.end()
        }

        const akun = akunGate()
        if (!akun.size) return next()

        // Sudah login? Kuki sesi ATAU Basic auth (script curl lama tetap jalan).
        // Navigasi browser nolak Basic: setelah "Keluar", browser masih menyimpan
        // kredensial popup lama dan akan mengirimnya otomatis — kalau diterima,
        // tombol keluar jadi tidak berfungsi (langsung balik ke beranda).
        const navBrowser = (req.headers['sec-fetch-mode'] ?? '') === 'navigate'
        let user = kukiSesi(req)
        if (!user && !navBrowser) {
          const h = req.headers.authorization ?? ''
          if (h.startsWith('Basic ')) {
            const [u, ...sisa] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':')
            const harap = akun.get(u)
            if (harap && cocok(sisa.join(':'), harap)) user = u
          }
        }
        if (user && url.pathname !== '/__masuk') return next()

        if (url.pathname === '/__masuk') {
          if (req.method === 'GET') {
            if (user) {
              res.statusCode = 303
              res.setHeader('location', '/')
              return res.end()
            }
            return kirimHalaman(res, 200, '', '', url.searchParams.get('next') ?? '')
          }
          if (req.method === 'POST') {
            const ip = req.socket.remoteAddress ?? '?'
            if (kenaBatas(ip)) return kirimHalaman(res, 429, 'Terlalu banyak percobaan. Coba lagi 5 menit lagi.', '', '')
            const p = new URLSearchParams(await badan(req))
            const u = (p.get('user') ?? '').trim()
            const harap = akun.get(u)
            if (harap && cocok(p.get('pass') ?? '', harap)) {
              const exp = p.get('ingat') ? Date.now() + 30 * 86_400_000 : 0
              // Tunnel (host bukan localhost) → wajib Secure; akses lokal http tetap boleh.
              const aman = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/.test(String(req.headers.host ?? '')) ? '' : '; Secure'
              gagal.delete(ip)
              res.statusCode = 303
              res.setHeader('set-cookie', `${NAMA_KUKI}=${encodeURIComponent(`${u}.${exp}.${tandaSesi(u, exp)}`)}; Path=/; HttpOnly; SameSite=Lax${exp ? '; Max-Age=2592000' : ''}${aman}`)
              res.setHeader('location', tujuanAman(p.get('next') ?? ''))
              return res.end()
            }
            gagal.set(ip, [...(gagal.get(ip) ?? []), Date.now()])
            return kirimHalaman(res, 401, 'Nama pengguna atau kata sandi salah.', u, p.get('next') ?? '')
          }
          return next()
        }

        // Belum login: navigasi browser → halaman login; aset/API → 401 polos.
        const navigasi = (req.headers['sec-fetch-mode'] ?? '') === 'navigate' || (req.headers.accept ?? '').includes('text/html')
        if (navigasi) {
          res.statusCode = 303
          res.setHeader('location', `/__masuk?next=${encodeURIComponent(tujuanAman(url.pathname + url.search))}`)
          return res.end()
        }
        res.statusCode = 401
        res.end('Butuh login.')
      })
    },
  }
}

/**
 * /api/cari?platform=&q=&halaman= — panen hasil pencarian satu platform.
 * /api/status?url= — perkiraan status buka/tutup dari halaman detail.
 */
function cariProxy(): Plugin {
  return {
    name: 'lamarkerja-cari-proxy',
    configureServer(server) {
      const kirim = (res: import('http').ServerResponse, code: number, obj: unknown) => {
        res.statusCode = code
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(obj))
      }
      server.middlewares.use('/api/cari', async (req, res) => {
        const p = new URL(req.url ?? '', 'http://local').searchParams
        const id = (p.get('platform') ?? '') as PlatformId
        const q = (p.get('q') ?? '').trim()
        const halaman = Math.max(1, Number(p.get('halaman') ?? 1) || 1)
        const cfg = PLATFORM[id]
        if (!cfg) return kirim(res, 400, { error: { message: 'Platform tidak dikenal.' } })
        if (q.length < 2) return kirim(res, 400, { error: { message: 'Kata kunci minimal 2 huruf.' } })
        try {
          const mentah = await evalBrowser(cfg.alamat(q, halaman), cfg.skrip, cfg.tunggu ?? 30_000)
          const loker = normalkan(id, mentah)
          kirim(res, 200, { platform: id, label: cfg.label, catatan: cfg.catatan ?? '', jumlah: loker.length, loker })
        } catch (e) {
          const pesan = `${cfg.label}: ${(e as Error).message}`
          // Kegagalan platform (mis. ditahan Cloudflare) bukan error server: balas kosong + catatan
          // supaya mode "auto" tetap menggabungkan platform lain.
          if (/browser tidak bisa dijalankan|tab gagal dibuka/.test(pesan)) kirim(res, 502, { error: { message: pesan } })
          else kirim(res, 200, { platform: id, label: cfg.label, catatan: pesan, jumlah: 0, loker: [] })
        }
      })
      server.middlewares.use('/api/status', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://local').searchParams.get('url') ?? ''
        if (!/^https?:\/\//.test(url)) return kirim(res, 400, { error: { message: 'URL tidak valid.' } })
        try {
          const m = await evalBrowser(url, SKRIP_STATUS, 20_000)
          kirim(res, 200, { url, status: statusDari(m), tanda: (m as { cuplik?: string })?.cuplik ?? '' })
        } catch (e) {
          kirim(res, 502, { error: { message: (e as Error).message } })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [gerbang(), react(), jobProxy(), aiProxy(), cariProxy()],
  server: { allowedHosts: ['kuylamar.serasii.my.id', 'autocv.serasii.my.id'] },
})
