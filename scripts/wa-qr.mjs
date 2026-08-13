#!/usr/bin/env node
/**
 * HALAMAN QR WHATSAPP — pengganti Manager Evolution yang tak ikut terpasang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `http://localhost:8081/manager` menjawab:
 *
 *     ENOENT: no such file or directory, stat '…/evolution-api/manager/dist/index.html'
 *
 * Foldernya ADA tetapi KOSONG — UI Manager tak pernah ikut terpasang, dan tak
 * ada sumbernya di repo untuk di-build. Itu bukan kerusakan: Evolution
 * memisahkan Manager dari API, dan yang dipasang di sini hanya API-nya.
 *
 * Yang benar-benar dibutuhkan cuma satu hal — memindai QR sekali supaya nomor
 * WhatsApp Puraloka tersambung. Itu tak menuntut seluruh Manager.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENYEGARKAN SENDIRI TIAP 20 DETIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * QR WhatsApp kedaluwarsa sekitar 60 detik. Menyimpan satu berkas PNG lalu
 * membukanya berarti berpacu dengan waktu, dan QR yang basi GAGAL DIAM —
 * ponsel hanya berkata "tidak valid" tanpa menyebut sebabnya, dan orang
 * mengira sambungannya yang rusak.
 *
 * Halaman ini meminta QR baru sebelum yang lama mati, dan berhenti sendiri
 * begitu status berubah jadi `open`.
 *
 * Pakai:  node scripts/wa-qr.mjs      → buka http://localhost:8099
 */
import { createServer } from 'node:http'
import { buatClient, bacaEnv } from './db/_koneksi.mjs'

// `apps/api/.env` dimuat EKSPLISIT ke `process.env`.
//
// `bukaNilai()` membaca `CREDENTIAL_ENCRYPTION_KEY` dari `process.env`, dan
// skrip di luar `apps/api` tak pernah memuat berkas itu sendiri. Tanpa ini
// galatnya menyesatkan: ia berkata kuncinya "belum disetel" padahal ada —
// yang belum terjadi hanyalah pemuatannya.
//
// Dipakai `bacaEnv()` milik repo, BUKAN `dotenv`. Dari root repo `dotenv`
// tak bisa di-resolve (ERR_MODULE_NOT_FOUND), dan `bacaEnv` sudah menangani
// BOM + tanda kutip yang jadi jebakan berkas `.env` di repo ini.
for (const [k, v] of Object.entries(bacaEnv())) {
  if (!(k in process.env)) process.env[k] = v
}

const PORT = Number(process.env.QR_PORT || 8099)

// Kredensial dibaca dari basis, bukan ditulis di sini. Menyalin apikey ke
// berkas yang bisa ter-commit adalah cara paling mudah membocorkannya.
const db = buatClient()
await db.connect()
const { rows } = await db.query(
  `SELECT kunci, nilai_enc FROM app_credentials WHERE kunci IN ('WA_BASE_URL','WA_API_KEY','WA_INSTANCE')`,
)
await db.end()

const { bukaNilai } = await import('../apps/api/src/lib/kredensial-sandi.ts')
  .catch(() => ({ bukaNilai: null }))

if (!bukaNilai) {
  console.error('[x] Tak bisa memuat modul sandi. Jalankan lewat: npx tsx scripts/wa-qr.mjs')
  process.exit(2)
}

const kred = {}
for (const r of rows) kred[r.kunci] = bukaNilai(r.nilai_enc)

const BASE = (kred.WA_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const APIKEY = kred.WA_API_KEY
const INSTANCE = kred.WA_INSTANCE || 'puraloka-bot'

if (!APIKEY) {
  console.error('[x] WA_API_KEY kosong di app_credentials.')
  process.exit(2)
}

async function evo(jalur) {
  const r = await fetch(`${BASE}${jalur}`, { headers: { apikey: APIKEY } })
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { _mentah: t.slice(0, 300) } }
}

const HALAMAN = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Sambungkan WhatsApp Puraloka</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100vh; margin: 0; background: #0b0e11; color: #e6e9ee; }
  .kartu { text-align: center; padding: 32px; border-radius: 16px;
           background: #151a21; border: 1px solid #232a34; max-width: 420px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p  { font-size: 13px; color: #9aa4b2; margin: 0 0 20px; line-height: 1.6; }
  img { width: 300px; height: 300px; background: #fff; padding: 12px; border-radius: 12px; }
  .st { margin-top: 16px; font-size: 13px; font-weight: 600; }
  .ok { color: #34d399; } .tunggu { color: #fbbf24; }
  ol { text-align: left; font-size: 12px; color: #9aa4b2; line-height: 1.8; }
</style></head><body>
<div class="kartu">
  <h1>Sambungkan WhatsApp Puraloka</h1>
  <p>Instance <b>${INSTANCE}</b> · QR diperbarui otomatis tiap 20 detik</p>
  <img id="qr" alt="Kode QR WhatsApp">
  <div class="st tunggu" id="st">memuat…</div>
  <ol>
    <li>Buka WhatsApp di ponsel</li>
    <li>Setelan → Perangkat tertaut → Tautkan perangkat</li>
    <li>Pindai kode di atas</li>
  </ol>
  <p style="margin-top:16px;color:#f87171">Pakai nomor yang BERBEDA dari TJS —
  satu nomor tak bisa terhubung ke dua instance.</p>
</div>
<script>
async function segarkan() {
  const r = await fetch('/qr').then(x => x.json()).catch(() => null);
  if (!r) return;
  const st = document.getElementById('st');
  if (r.state === 'open') {
    st.textContent = '✓ Tersambung' + (r.nomor ? ' — ' + r.nomor : '');
    st.className = 'st ok';
    document.getElementById('qr').style.display = 'none';
    return; // berhenti menyegarkan
  }
  if (r.base64) document.getElementById('qr').src = r.base64;
  st.textContent = 'menunggu dipindai… (' + (r.state || '?') + ')';
  setTimeout(segarkan, 20000);
}
segarkan();
</script></body></html>`

createServer(async (req, res) => {
  if (req.url === '/qr') {
    const st = await evo(`/instance/connectionState/${INSTANCE}`)
    const state = st?.instance?.state ?? 'tak diketahui'

    if (state === 'open') {
      const daftar = await evo('/instance/fetchInstances')
      const milik = Array.isArray(daftar)
        ? daftar.find((x) => x.name === INSTANCE)
        : null
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ state, nomor: milik?.ownerJid ?? null }))
    }

    const q = await evo(`/instance/connect/${INSTANCE}`)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ state, base64: q?.base64 ?? null }))
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(HALAMAN)
}).listen(PORT, () => {
  console.log(`\n  QR WhatsApp Puraloka → http://localhost:${PORT}\n`)
  console.log(`  Evolution : ${BASE}`)
  console.log(`  Instance  : ${INSTANCE}`)
  console.log(`\n  Ctrl+C untuk berhenti.\n`)
})
