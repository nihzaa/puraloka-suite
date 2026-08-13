#!/usr/bin/env node
/**
 * MEMBANGUN WORKFLOW n8n DARI KATALOG — dan mendaftarkan `n8n_id`-nya balik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP, BUKAN DIKLIK SATU-SATU DI UI n8n
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Workflow yang dibuat lewat klik hanya hidup di `database.sqlite` mesin ini.
 * Kalau folder itu hilang — atau kalau tenant kedua perlu workflow yang sama —
 * tak ada satu pun cara memulihkannya selain mengklik ulang dari ingatan.
 *
 * Yang di-versi-kan di sini adalah RESEPNYA, bukan isi workflow-nya. Ini
 * berbeda dari TJS (43 berkas JSON workflow di repo), dan bedanya disengaja —
 * alasannya sudah ditulis di kepala `lib/otomasi-n8n.ts`: menyalin isi
 * workflow ke repo berarti dua sumber kebenaran yang harus dijaga sinkron,
 * dan yang basi tak akan menyatakan dirinya basi.
 *
 * Resep tetap satu sumber: ia MEMBUAT, bukan MENYALIN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * IDEMPOTEN — dijalankan dua kali tidak menghasilkan workflow ganda
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dicocokkan berdasarkan NAMA. Workflow bernama sama diperbarui, bukan
 * ditambah. Tanpa ini, menjalankan ulang skrip menghasilkan dua workflow
 * dengan jadwal sama — dan penerima mendapat pesan dobel setiap hari tanpa
 * ada yang tahu sebabnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WORKFLOW DIBUAT NONAKTIF — DAN ITU KEPUTUSAN, BUKAN KELALAIAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `active: false` saat dibuat. Menyalakannya menuntut dua hal yang belum
 * terpenuhi saat skrip ini ditulis:
 *
 *   1. Nomor WhatsApp Puraloka BELUM terpasang (`ownerJid: null`, status
 *      "connecting" — instance ada, ponselnya belum dipindai).
 *   2. Nomor tujuan tiap peran belum ditetapkan founder.
 *
 * Workflow aktif yang mengirim ke nomor yang salah tak bisa ditarik kembali.
 * Yang nonaktif dan terlihat di UI bisa diperiksa dulu, lalu dinyalakan.
 *
 * Pakai:
 *   node scripts/n8n/bangun-alur.mjs            # buat/perbarui semua
 *   node scripts/n8n/bangun-alur.mjs --daftar   # lihat saja, tak menulis
 */
// `_koneksi.mjs` DIPAKAI ULANG, bukan ditulis ulang. Ia sudah menangani dua
// jebakan yang tercatat di CLAUDE.md §7: BOM di kepala `.env` dan nilai yang
// dibungkus tanda kutip. Ia juga me-resolve `pg` dari `apps/api` — dari root
// repo, `import pg` gagal ERR_MODULE_NOT_FOUND.
import { buatClient } from '../db/_koneksi.mjs'

const HANYA_DAFTAR = process.argv.includes('--daftar')

// ── Resep alur ─────────────────────────────────────────────────────────────
//
// `umpan` menunjuk jenis di `/api/v1/otomasi/umpan/:jenis`. Alur tanpa umpan
// (pemicu webhook) TIDAK dibuat di sini — pemicunya peristiwa dari aplikasi,
// dan jalur itu belum ada. Menyertakannya berarti workflow yang menunggu
// panggilan yang tak pernah datang, dan itu tampak "siap" padahal mati.
const RESEP = [
  {
    kode: 'eskalasi-invoice-terlambat',
    nama: 'Puraloka — Eskalasi Invoice Terlambat',
    umpan: 'invoice-terlambat',
    cron: '0 9 * * 1-6',
    judul: 'INVOICE LEWAT JATUH TEMPO',
    baris: (r) =>
      `• ${r.nomor} — ${r.proyek ?? 'tanpa proyek'}\n` +
      `  Rp ${new Intl.NumberFormat('id-ID').format(r.sisa || r.nominal)} · telat ${r.umur_hari} hari · eskalasi: ${r.tingkat}`,
  },
  {
    kode: 'ingatkan-persetujuan-tertahan',
    nama: 'Puraloka — Persetujuan Tertahan',
    umpan: 'persetujuan-tertahan',
    cron: '0 10 * * 1-5',
    judul: 'MENUNGGU PUTUSAN ANDA',
    baris: (r) =>
      `• Kasbon Rp ${new Intl.NumberFormat('id-ID').format(r.nominal)} — ${r.proyek ?? 'tanpa proyek'}\n` +
      `  ${r.keperluan ?? '-'} · tertahan ${r.tertahan_hari} hari`,
  },
  {
    kode: 'eskalasi-ncr-belum-ditutup',
    nama: 'Puraloka — NCR Belum Ditutup',
    umpan: 'ncr-belum-ditutup',
    cron: '30 9 * * 1-6',
    judul: 'TEMUAN MUTU LEWAT TENGGAT',
    baris: (r) =>
      `• ${r.nomor} — ${r.judul}\n` +
      `  ${r.proyek ?? 'tanpa proyek'} · ${r.keparahan ?? '-'} · lewat ${r.lewat_hari} hari · eskalasi: ${r.tingkat}`,
  },
  {
    kode: 'eskalasi-milestone-terlambat',
    nama: 'Puraloka — Milestone Terlambat',
    umpan: 'milestone-terlambat',
    cron: '15 7 * * *',
    judul: 'MILESTONE LEWAT TENGGAT',
    baris: (r) =>
      `• ${r.judul} — ${r.proyek ?? 'tanpa proyek'}\n` +
      `  lewat ${r.lewat_hari} hari · status: ${r.status} · eskalasi: ${r.tingkat}`,
  },
  {
    kode: 'ringkasan-harian-pemilik',
    nama: 'Puraloka — Ringkasan Harian Pemilik',
    umpan: 'ringkasan-harian',
    cron: '0 18 * * 1-6',
    judul: 'RINGKASAN HARI INI',
    baris: (r) =>
      `Laporan progres : ${r.laporan_progres}\n` +
      `Kasbon diajukan : ${r.kasbon_diajukan}\n` +
      `Temuan mutu baru: ${r.temuan_mutu_baru}`,
  },
]

/**
 * Simpul n8n untuk satu alur: Jadwal → Ambil umpan → Susun pesan → Kirim WA.
 *
 * Simpul "Susun pesan" memakai Code, bukan rangkaian Set/IF. Alasannya:
 * memformat daftar panjang jadi satu pesan menuntut perulangan, dan
 * merangkainya dari simpul visual menghasilkan sepuluh kotak yang tak
 * seorang pun bisa baca ulang enam bulan lagi.
 *
 * `jml === 0` menghentikan alur SEBELUM kirim — pesan "tidak ada apa-apa"
 * yang datang tiap hari melatih orang mengabaikan seluruh pesannya.
 */
function simpul(resep, cfg) {
  const kodeSusun = `
const d = $input.first().json;
if (!d || !d.jml) { return []; }
const baris = d.baris.map((r) => (${resep.baris.toString()})(r)).join('\\n');
const teks = '*${resep.judul}*\\n\\n' + baris + '\\n\\n_Puraloka Suite · ${resep.kode}_';
return [{ json: { teks, jml: d.jml } }];
`.trim()

  return [
    {
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: resep.cron }] } },
      id: 'jadwal',
      name: 'Jadwal',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
    },
    {
      parameters: {
        url: `${cfg.apiUrl}/api/v1/otomasi/umpan/${resep.umpan}`,
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'X-API-Key', value: cfg.apiKey }] },
        options: { timeout: 30000 },
      },
      id: 'umpan',
      name: 'Ambil umpan',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [220, 0],
    },
    {
      parameters: { jsCode: kodeSusun },
      id: 'susun',
      name: 'Susun pesan',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [440, 0],
    },
    {
      parameters: {
        method: 'POST',
        url: `${cfg.waUrl}/message/sendText/${cfg.waInstance}`,
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'apikey', value: cfg.waApiKey }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ number: "${cfg.nomorTujuan}", text: $json.teks }) }}`,
        options: { timeout: 30000 },
      },
      id: 'kirim',
      name: 'Kirim WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [660, 0],
    },
  ]
}

const SAMBUNG = {
  Jadwal: { main: [[{ node: 'Ambil umpan', type: 'main', index: 0 }]] },
  'Ambil umpan': { main: [[{ node: 'Susun pesan', type: 'main', index: 0 }]] },
  'Susun pesan': { main: [[{ node: 'Kirim WhatsApp', type: 'main', index: 0 }]] },
}

async function n8nApi(cfg, jalur, opsi = {}) {
  const r = await fetch(`${cfg.n8nUrl}${jalur}`, {
    method: opsi.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'X-N8N-API-KEY': cfg.n8nKey },
    body: opsi.body ? JSON.stringify(opsi.body) : undefined,
  })
  const teks = await r.text()
  if (!r.ok) throw new Error(`n8n ${r.status}: ${teks.slice(0, 300)}`)
  return teks ? JSON.parse(teks) : null
}

// ── Jalan ──────────────────────────────────────────────────────────────────
const client = buatClient()
await client.connect()

const { rows: comp } = await client.query(
  'SELECT id FROM companies WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = companies.id) LIMIT 1',
)
const companyId = comp[0]?.id
if (!companyId) throw new Error('tak ada company beranggota')

const cfg = {
  n8nUrl: (process.env.N8N_URL || 'http://localhost:5680').replace(/\/$/, ''),
  n8nKey: process.env.N8N_KEY || '',
  apiUrl: (process.env.PURALOKA_API_URL || 'http://localhost:3007').replace(/\/$/, ''),
  apiKey: process.env.PURALOKA_API_KEY || '',
  waUrl: (process.env.WA_URL || 'http://localhost:8081').replace(/\/$/, ''),
  waApiKey: process.env.WA_KEY || '',
  waInstance: process.env.WA_INSTANCE || 'puraloka-bot',
  nomorTujuan: process.env.WA_TUJUAN || '',
}
for (const k of ['n8nKey', 'apiKey', 'waApiKey', 'nomorTujuan']) {
  if (!cfg[k]) {
    console.error(`[x] ${k} kosong. Setel lewat env sebelum menjalankan skrip ini.`)
    console.error('    N8N_KEY, PURALOKA_API_KEY, WA_KEY, WA_TUJUAN')
    process.exit(2)
  }
}

const adaSekarang = await n8nApi(cfg, '/api/v1/workflows?limit=250')
const peta = new Map((adaSekarang.data ?? []).map((w) => [w.name, w.id]))

console.log(`n8n: ${peta.size} workflow terpasang · resep: ${RESEP.length}`)
if (HANYA_DAFTAR) {
  for (const r of RESEP) console.log(`  ${peta.has(r.nama) ? '[ada]' : '[baru]'} ${r.nama}`)
  await client.end()
  process.exit(0)
}

for (const resep of RESEP) {
  const badan = {
    name: resep.nama,
    nodes: simpul(resep, cfg),
    connections: SAMBUNG,
    settings: { executionOrder: 'v1' },
  }

  const idLama = peta.get(resep.nama)
  const hasil = idLama
    ? await n8nApi(cfg, `/api/v1/workflows/${idLama}`, { method: 'PUT', body: badan })
    : await n8nApi(cfg, '/api/v1/workflows', { method: 'POST', body: badan })

  const n8nId = hasil?.id ?? idLama
  // Katalog Puraloka menunjuk balik ke n8n. Tanpa ini, halaman /otomasi/alur
  // tetap menampilkan "BELUM TERSAMBUNG" meski workflow-nya sudah ada.
  await client.query(
    `UPDATE otomasi_alur SET n8n_id=$1, diperbarui_pada=now() WHERE company_id=$2 AND kode=$3`,
    [String(n8nId), companyId, resep.kode],
  )
  console.log(`  ${idLama ? 'diperbarui' : 'dibuat'}: ${resep.nama} → n8n_id=${n8nId}`)
}

await client.end()
console.log('\nSelesai. Workflow dibuat NONAKTIF — nyalakan dari UI n8n sesudah diperiksa.')
