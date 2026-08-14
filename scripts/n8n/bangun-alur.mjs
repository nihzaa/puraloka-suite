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

  // ── Tiga resep berikut ditambahkan 2026-08-14 ────────────────────────────
  //
  // Ketiganya ADA di `otomasi_alur` sejak awal tetapi tak pernah punya
  // `n8n_id` — tercatat di daftar, tak pernah terpasang. Yang menghalanginya
  // bukan resepnya melainkan UMPANNYA: `otomasi-umpan.ts` hanya menyediakan
  // lima jenis, dan alur tanpa umpan adalah workflow yang menunggu data yang
  // tak pernah datang.
  //
  // Ketiga umpannya ditambahkan hari ini juga (`invoice-jatuh-tempo`,
  // `milestone-mendekat`, `rekap-mingguan-proyek`), jadi resep-resep ini
  // sekarang punya sumbernya.
  //
  // `cron` disalin dari baris DB-nya masing-masing, bukan dikarang ulang —
  // jadwal yang berbeda antara DB dan n8n adalah dua kebenaran yang tak
  // pernah menyatakan dirinya berbeda.
  {
    kode: 'tagih-invoice-jatuh-tempo',
    nama: 'Puraloka — Invoice Mendekati Jatuh Tempo',
    umpan: 'invoice-jatuh-tempo',
    cron: '0 8 * * 1-6',
    judul: 'INVOICE JATUH TEMPO PEKAN INI',
    baris: (r) =>
      `• ${r.nomor} — ${r.proyek ?? 'tanpa proyek'}\n` +
      `  Rp ${new Intl.NumberFormat('id-ID').format(r.sisa || r.nominal)} · ` +
      `jatuh tempo ${r.jatuh_tempo} (${r.sisa_hari} hari lagi)`,
  },
  {
    kode: 'peringatan-milestone-mendekat',
    nama: 'Puraloka — Milestone Mendekat',
    umpan: 'milestone-mendekat',
    cron: '10 7 * * *',
    judul: 'MILESTONE JATUH TEMPO 3 HARI LAGI',
    baris: (r) =>
      `• ${r.judul} — ${r.proyek ?? 'tanpa proyek'}\n` +
      `  target ${r.jatuh_tempo} (${r.sisa_hari} hari lagi) · status: ${r.status}`,
  },
  {
    kode: 'laporan-mingguan-klien',
    nama: 'Puraloka — Rekap Mingguan Proyek',
    umpan: 'rekap-mingguan-proyek',
    cron: '0 16 * * 6',
    judul: 'REKAP PEKAN INI',
    // ⚠ Tanpa nominal apa pun. Alur ini bernama "laporan mingguan KLIEN", dan
    // laporan ke klien yang memuat angka internal (kasbon, upah mandor) adalah
    // kebocoran yang tak bisa ditarik kembali. Umpannya pun sudah tak
    // mengirim uang — dua lapis, karena satu lapis bisa lupa.
    baris: (r) =>
      `• ${r.proyek}\n` +
      `  progres ${r.progres_pct}% · ${r.laporan_pekan_ini} laporan pekan ini` +
      (r.target_selesai ? ` · target selesai ${r.target_selesai}` : ''),
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
    /*
      PEMICU KEDUA: webhook, sejajar dengan jadwal.

      ── Kenapa perlu, ditemukan 2026-08-14

      n8n public API TIDAK punya endpoint eksekusi manual — `/execute` dan
      `/run` sama-sama membalas 405. Yang tersedia hanya `/activate`.

      Akibatnya `jalankanAlur()` di `lib/otomasi-n8n.ts` memanggil `/activate`
      untuk alur berjadwal, lalu melaporkan `ok: true`. Itu benar secara
      teknis (n8n menerima permintaannya) dan MENYESATKAN secara makna:
      tombol "Jalankan sekarang" di halaman Alur Otomasi sebenarnya cuma
      MENYALAKAN alurnya. Diukur: sesudah `ok:true`, riwayat eksekusi n8n
      tetap NOL.

      Dengan webhook sejajar, `jalankanAlur` mengambil cabang `jalur_webhook`
      (yang memang sudah ada di kodenya) dan alurnya benar-benar berjalan.

      ── Kenapa dua pemicu, bukan mengganti jadwal dengan webhook

      Jadwal tetap yang menjalankannya tiap hari tanpa siapa pun menekan apa
      pun — itu inti otomasi. Webhook hanya menambah jalan masuk kedua untuk
      menguji dan memicu di luar jadwal. Menggantinya berarti alur yang hanya
      jalan kalau ada yang mengklik, dan itu bukan otomasi lagi.

      Keduanya menyambung ke simpul yang SAMA (lihat `SAMBUNG`), jadi tak ada
      dua jalur logika yang bisa menyimpang.
    */
    {
      parameters: {
        httpMethod: 'POST',
        path: resep.kode,
        /*
          `onReceived`, BUKAN `lastNode`.

          Dengan `lastNode`, n8n membalas HTTP 500 ketika alur berhenti
          sebelum simpul terakhir — dan alur ini MEMANG berhenti kalau
          `jml === 0` (pesan "tidak ada apa-apa" tiap hari melatih orang
          mengabaikan seluruh pesannya).

          Diukur 2026-08-14: dua alur membalas 500 padahal riwayat
          eksekusinya `success`. Tidak-ada-data terbaca sebagai gagal, dan
          siapa pun yang memantau lewat kode HTTP akan mengejar kegagalan
          yang tak pernah terjadi.

          `onReceived` membalas 200 begitu pemicunya diterima; hasil
          sebenarnya tetap terbaca di riwayat eksekusi n8n, tempat yang
          memang untuk itu.
        */
        responseMode: 'onReceived',
        options: {},
      },
      id: 'pemicu-manual',
      name: 'Pemicu manual',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 180],
      webhookId: resep.kode,
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
  const kodeSusun = `
const d = $input.first().json;
const isi = d.body || d;
if (!isi || !isi.pesan) { return []; }
const teks = '*${resep.judul}*\\n\\n' + isi.pesan +
  (isi.judul ? '\\n\\n_' + isi.judul + '_' : '') +
  '\\n\\n_Puraloka Suite · ${resep.kode}_';
return [{ json: { teks } }];
`.trim()

  return [
    {
      parameters: {
        httpMethod: 'POST',
        path: resep.kode,
        // `onReceived`: aplikasi yang memanggil ini TIDAK menunggu hasilnya
        // (fire-and-forget), jadi membalas cepat lebih benar daripada
        // membalas lengkap. Lihat catatan yang sama di alur jadwal.
        responseMode: 'onReceived',
        options: {},
      },
      id: 'pemicu',
      name: 'Peristiwa',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: resep.kode,
    },
    {
      parameters: { jsCode: kodeSusun },
      id: 'susun',
      name: 'Susun pesan',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
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
      position: [440, 0],
    },
  ]
}

const SAMBUNG_PERISTIWA = {
  Peristiwa: { main: [[{ node: 'Susun pesan', type: 'main', index: 0 }]] },
  'Susun pesan': { main: [[{ node: 'Kirim WhatsApp', type: 'main', index: 0 }]] },
}

const SAMBUNG = {
  Jadwal: { main: [[{ node: 'Ambil umpan', type: 'main', index: 0 }]] },
  // Pemicu manual masuk ke simpul yang SAMA dengan jadwal — satu rantai
  // logika, dua jalan masuk. Kalau ia punya cabang sendiri, yang diuji lewat
  // tombol bukan lagi yang berjalan tiap pagi.
  'Pemicu manual': { main: [[{ node: 'Ambil umpan', type: 'main', index: 0 }]] },
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
  /*
    `127.0.0.1`, BUKAN `localhost` — dan ini bukan gaya penulisan.

    ── Diukur 2026-08-14, sesudah alur pertama gagal

    Alur berjalan, lalu simpul "Ambil umpan" membalas *"The service refused
    the connection - perhaps it is offline"* — padahal API-nya hidup dan
    `curl` dari shell yang sama membalas 200.

    Sebabnya terlihat begitu interface-nya diperiksa:

        API  0.0.0.0:3007          ← IPv4 saja
        n8n  0.0.0.0:5680 + [::]   ← ikut IPv6

    n8n me-resolve `localhost` ke `::1` lebih dulu, dan di sana port 3007
    memang kosong. Dibuktikan langsung:

        http://127.0.0.1:3007/... = 200
        http://[::1]:3007/...     = 000 (gagal)

    Galat "refused" tak menyebut IPv6 sama sekali, jadi tebakan pertama
    selalu salah alamat: server dikira mati, port dikira salah, kredensial
    dikira kedaluwarsa. Menulis alamat IPv4 secara eksplisit menutup seluruh
    kelas kekeliruan itu.

    `WA_URL` di bawah dibiarkan memakai default `localhost` karena Evolution
    mendengarkan di keduanya — tapi kalau ia pernah gagal dengan pesan yang
    sama, ini tempat pertama yang harus diperiksa.
  */
  apiUrl: (process.env.PURALOKA_API_URL || 'http://127.0.0.1:3007').replace(/\/$/, ''),
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

// Dua keluarga resep, satu daftar kerja. `jenis` menentukan bentuk simpulnya —
// alur jadwal punya "Ambil umpan", alur peristiwa tidak (datanya ikut pemicu).
const SEMUA = [
  ...RESEP.map((r) => ({ ...r, jenis: 'jadwal' })),
  ...RESEP_PERISTIWA.map((r) => ({ ...r, jenis: 'peristiwa' })),
]

console.log(
  `n8n: ${peta.size} workflow terpasang · resep: ${SEMUA.length} ` +
  `(${RESEP.length} jadwal + ${RESEP_PERISTIWA.length} peristiwa)`,
)
if (HANYA_DAFTAR) {
  for (const r of SEMUA) {
    console.log(`  ${peta.has(r.nama) ? '[ada] ' : '[baru]'} ${r.jenis.padEnd(9)} ${r.nama}`)
  }
  await client.end()
  process.exit(0)
}

for (const resep of SEMUA) {
  const peristiwa = resep.jenis === 'peristiwa'
  const badan = {
    name: resep.nama,
    nodes: peristiwa ? simpulPeristiwa(resep, cfg) : simpul(resep, cfg),
    connections: peristiwa ? SAMBUNG_PERISTIWA : SAMBUNG,
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
