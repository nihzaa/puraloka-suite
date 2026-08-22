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

/**
 * ── ALUR BERPEMICU PERISTIWA (webhook), bukan jadwal ────────────────────────
 *
 * Bentuknya lebih pendek dari alur jadwal: TIGA simpul, bukan empat. Tak ada
 * "Ambil umpan" karena datanya sudah datang bersama pemicunya — `createNotifications()`
 * mengirim jenis, judul, pesan, dan id proyek lewat `utils/terbit-peristiwa.ts`.
 *
 * Kenapa tak mengambil umpan juga: peristiwa ini terjadi SEKALI dan spesifik
 * ("kasbon nomor sekian diajukan"), sementara umpan menjawab pertanyaan
 * berulang ("kasbon apa saja yang tertahan"). Memanggil umpan di sini berarti
 * mengirim daftar lengkap tiap kali satu hal terjadi.
 *
 * `kode` = `path` webhook = `otomasi_alur.kode`, dan nilainya HARUS sama
 * dengan yang ada di `PETA_PERISTIWA` (`utils/terbit-peristiwa.ts`). Dijaga
 * `audit-peristiwa-punya-alur.mjs`.
 */
const RESEP_PERISTIWA = [
  {
    kode: 'teruskan-kasbon-diajukan',
    nama: 'Puraloka — Kasbon Diajukan',
    judul: 'KASBON BARU DIAJUKAN',
  },
  {
    kode: 'teruskan-laporan-upah',
    nama: 'Puraloka — Laporan Upah Diajukan',
    judul: 'LAPORAN UPAH DIAJUKAN',
  },
  {
    kode: 'konfirmasi-invoice-dibayar',
    nama: 'Puraloka — Invoice Dibayar',
    judul: 'PEMBAYARAN DITERIMA',
  },
  {
    kode: 'lapor-status-proyek-berubah',
    nama: 'Puraloka — Status Proyek Berubah',
    judul: 'STATUS PROYEK BERUBAH',
  },
  {
    kode: 'peringatan-stok-menipis',
    nama: 'Puraloka — Stok Menipis',
    judul: 'STOK MATERIAL MENIPIS',
  },
]

/**
 * Simpul alur peristiwa: Webhook → Susun pesan → Kirim WA.
 *
 * Pesannya memakai judul & pesan yang SUDAH disusun aplikasi, bukan disusun
 * ulang di sini. Alasannya sama dengan kenapa umpan tak dipanggil: aplikasi
 * yang tahu konteksnya, dan menyusunnya dua kali berarti dua kalimat berbeda
 * untuk kejadian yang sama — satu di lonceng notifikasi, satu di WhatsApp.
 */
function simpulPeristiwa(resep, cfg) {
  // cfg tak lagi dipakai di sini — parameter dipertahankan agar tanda tangan
  // tetap stabil untuk pemanggilnya.
  return [
    {
      parameters: {
        httpMethod: 'POST',
        path: resep.kode,
        responseMode: 'onReceived',
        options: {},
      },
      id: 'pemicu',
      name: 'Pemicu peristiwa',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: resep.kode,
    },
    {
      parameters: {
        jsCode: `
const d = $input.first().json;
const isi = d.body || d;
if (!isi || !isi.pesan) { return []; }
// Tag tenant_id eksplisit untuk audit lintas eksekusi (spec §5.1/§3.4.2).
const tenantId = isi.companyId || 'tak-diketahui';
const teks = '*${resep.judul}*\\n\\n' + isi.pesan +
  '\\n\\n_Puraloka Suite · ${resep.kode} · tenant:' + tenantId + '_';
return [{ json: { teks, wa: isi.wa || {}, companyId: tenantId } }];
`.trim(),
      },
      id: 'susun',
      name: 'Susun pesan',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
    },
    {
      parameters: {
        method: 'POST',
        // BUKAN dipatok — $json.wa.* datang dari payload webhook,
        // dibaca aplikasi lewat ambilKredensialTanpaRequest() per tenant
        // (lihat terbit-peristiwa.ts, muatanWaPeristiwa()).
        url: '={{ $json.wa.url }}/message/sendText/{{ $json.wa.instance }}',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'apikey', value: '={{ $json.wa.apiKey }}' }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ number: $json.wa.nomorTujuan, text: $json.teks }) }}',
        options: { timeout: 30000 },
      },
      id: 'kirim',
      name: 'Kirim WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 0],
    },
  ]
}

const SAMBUNG_PERISTIWA = {
  'Pemicu peristiwa': { main: [[{ node: 'Susun pesan', type: 'main', index: 0 }]] },
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
}
for (const k of ['n8nKey']) {
  if (!cfg[k]) {
    console.error(`[x] ${k} kosong. Setel lewat env sebelum menjalankan skrip ini.`)
    console.error('    N8N_KEY')
    process.exit(2)
  }
}

const adaSekarang = await n8nApi(cfg, '/api/v1/workflows?limit=250')
const peta = new Map((adaSekarang.data ?? []).map((w) => [w.name, w.id]))

// Dulu dua keluarga resep (jadwal + peristiwa), satu daftar kerja. Keluarga
// `jadwal` (`RESEP`, dan `simpul()`/`SAMBUNG` yang menyusun simpulnya)
// dipensiunkan 2026-08-22 (spec §5.5, lihat CLAUDE.md) — hanya
// `RESEP_PERISTIWA` tersisa. Angka `jadwal` di baris log tetap dituliskan
// sebagai `0` literal (bukan dihitung dari array yang sudah tak ada) supaya
// operator yang membaca output skrip tahu keluarga itu memang kosong by
// design, bukan diam-diam hilang dari perhitungan.
const SEMUA = RESEP_PERISTIWA.map((r) => ({ ...r, jenis: 'peristiwa' }))

console.log(
  `n8n: ${peta.size} workflow terpasang · resep: ${SEMUA.length} ` +
  `(0 jadwal + ${RESEP_PERISTIWA.length} peristiwa)`,
)
if (HANYA_DAFTAR) {
  for (const r of SEMUA) {
    console.log(`  ${peta.has(r.nama) ? '[ada] ' : '[baru]'} ${r.jenis.padEnd(9)} ${r.nama}`)
  }
  await client.end()
  process.exit(0)
}

for (const resep of SEMUA) {
  // Satu-satunya keluarga tersisa adalah `peristiwa` — keluarga `jadwal`
  // dipensiunkan bersama `simpul()`/`SAMBUNG` di atas.
  const badan = {
    name: resep.nama,
    nodes: simpulPeristiwa(resep, cfg),
    connections: SAMBUNG_PERISTIWA,
    settings: { executionOrder: 'v1' },
  }

  const idLama = peta.get(resep.nama)
  const hasil = idLama
    ? await n8nApi(cfg, `/api/v1/workflows/${idLama}`, { method: 'PUT', body: badan })
    : await n8nApi(cfg, '/api/v1/workflows', { method: 'POST', body: badan })

  const n8nId = hasil?.id ?? idLama
  // Katalog Puraloka menunjuk balik ke n8n. Tanpa ini, halaman /otomasi/alur
  // tetap menampilkan "BELUM TERSAMBUNG" meski workflow-nya sudah ada.
  // `jalur_webhook` ikut ditulis — tanpa ini `jalankanAlur()` jatuh ke cabang
  // `/activate` yang hanya MENYALAKAN alur, lalu melaporkan ok:true tanpa satu
  // pun eksekusi terjadi (diukur 2026-08-14: riwayat eksekusi n8n NOL sesudah
  // "berhasil"). Nilainya = `resep.kode`, sama dengan `path` simpul webhook.
  await client.query(
    `UPDATE otomasi_alur SET n8n_id=$1, jalur_webhook=$4, diperbarui_pada=now() WHERE company_id=$2 AND kode=$3`,
    [String(n8nId), companyId, resep.kode, resep.kode],
  )
  console.log(`  ${idLama ? 'diperbarui' : 'dibuat'}: ${resep.nama} → n8n_id=${n8nId}`)
}

await client.end()
console.log('\nSelesai. Workflow dibuat NONAKTIF — nyalakan dari UI n8n sesudah diperiksa.')
