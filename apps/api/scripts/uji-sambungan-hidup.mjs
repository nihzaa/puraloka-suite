#!/usr/bin/env node
// ============================================================================
// Uji SAMBUNGAN lewat rute sungguhan — bukan lewat test.
// ============================================================================
//
// Sesi ini sudah tiga kali menemukan cacat yang tak satu pun test-nya
// tangkap, dan ketiganya ditemukan dengan cara yang sama: MENJALANKAN rutenya.
//
//   - `satuan-beli.ts` yang tak pernah dipanggil (36 test hijau)
//   - profil WF ditampilkan "Ulir (BjTS) D200"
//   - `rekap-volume` runtuh HTTP 500 oleh elemen kayu
//
// Test memanggil fungsi. Rute memanggil fungsi LEWAT dispatcher, batasan
// CHECK basis, lapis izin, dan penyimpanan — dan semuanya bisa salah sambil
// fungsinya benar. Migrasi 470 yang lupa dijalankan, misalnya, membuat elemen
// TERTOLAK oleh basis meski kodenya sempurna.
//
// ── Jalur yang ditiru
//
// Tak ada endpoint hitung tanpa-simpan: elemen DIBUAT lebih dulu, lalu
// GET /struktur/:id yang menjalankan analisanya. Penguji ini mengikuti jalur
// itu apa adanya, lalu MENGHAPUS elemen yang dibuatnya.
//
// Pakai: UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \
//          node scripts/uji-sambungan-hidup.mjs
// ============================================================================

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3017'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL/UJI_SANDI (atau LAYAR_EMAIL/LAYAR_SANDI) wajib diisi.')
  console.error('   Kredensial akun uji ada di apps/web/.env.local — CLAUDE.md §8a.3.\n')
  process.exit(1)
}

/*
  Token diambil dari COOKIE, bukan badan balasan — `/auth/login` menaruhnya di
  cookie HttpOnly (`puraloka_token`). Penguji ini meniru BROWSER, dan itu justru
  jalur yang dipakai sungguhan.
*/
const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))

if (!masuk.ok) {
  console.error(`\n❌ Gagal masuk (${masuk.status || 'tak terhubung'}) ke ${BASIS}.`)
  if (masuk._err) console.error(`   ${masuk._err.message}`)
  console.error('   UKUR portnya — CLAUDE.md §7.\n')
  process.exit(1)
}

const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c))
  .join('; ')

if (!cookie) {
  console.error('\n❌ Masuk berhasil tetapi tak ada cookie `puraloka_token`.\n')
  process.exit(1)
}

const H = { 'content-type': 'application/json', cookie }

/*
  DELETE dikirim TANPA `content-type`. Dengan header itu tetapi tanpa badan,
  Fastify menolaknya HTTP 400 sebelum handler dijalankan — dan pesannya tak
  menyebut header, jadi terbaca seperti rute DELETE yang cacat. Diukur:
  `curl -X DELETE` tanpa header itu menjawab 200.
*/
const H_HAPUS = { cookie }

/** Penanda jalan, supaya kode elemen uji tak bentrok dengan jalan sebelumnya. */
const JALAN = (process.hrtime.bigint() % 100000n).toString(36)

// ── Proyek mana pun yang terlihat oleh akun ini ──────────────────────────────
const dp = await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: H })
if (!dp.ok) {
  console.error(`\n❌ Tak bisa mengambil daftar proyek (HTTP ${dp.status}).\n`)
  process.exit(1)
}
const jp = await dp.json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) {
  console.error('\n❌ Akun ini tak melihat satu pun proyek — tak ada tempat menaruh elemen uji.\n')
  process.exit(1)
}
console.log(`══ Sambungan lewat rute hidup: ${BASIS}`)
console.log(`   proyek uji: ${proyek.name ?? proyek.nama ?? proyek.id}\n`)

const KASUS = [
  {
    jenis: 'sambungan_kayu',
    label: 'paku kuda-kuda — jumlah yang MEMANG cukup',
    /*
      ══════════════════════════════════════════════════════════════════════
      Angka jumlah paku di sini SUDAH DIKOREKSI, dan koreksinya berharga.

      Versi pertama memakai 8 paku untuk gaya 6 kN — angka yang saya tulis
      karena terdengar seperti praktik biasa. Rutenya menjawab 139% TERPAKAI,
      dan saya sempat mencurigai modulnya.

      Diukur: kapasitas per paku 540 N, tepat di rentang lapangan
      (0,5–1,2 kN). Modulnya BENAR; contoh sayalah yang optimistis. Sambungan
      6 kN dengan paku 4,1 mm butuh SEKITAR DUA BELAS paku, bukan delapan —
      dan itu justru pelajaran yang membuat modul ini perlu ada.

      Dibiarkan 14 (bukan pas 12) supaya kasus ini menjadi garis dasar yang
      LULUS, sehingga kasus jarak-ujung di bawah benar-benar menguji jaraknya,
      bukan kekurangan paku.

      Dan jaraknya pun ikut naik 45 → 65 mm, karena empat belas paku pada
      jarak 45 mm melanggar jarak antar alat sambung. Itu justru hal yang
      dijaga modul ini: menambah paku pada baris yang sudah rapat TIDAK
      menguatkan sambungan — keempat belasnya menekan serat yang sama dan
      justru membelah kayunya. Dua koreksi berturut-turut pada satu contoh
      "praktik biasa" adalah alasan modul ini ditulis.
      ══════════════════════════════════════════════════════════════════════
    */
    input: {
      alat: 'paku', diameterMm: 4.1, jumlahAlat: 14,
      tebalUtamaMm: 60, tebalSisiMm: 30, penetrasiMm: 45,
      kelas: 'II', durasi: 'tetap', kadarAir: 'kering',
      gayaKn: 6,
      jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25, jarakAntarAlatMm: 65,
    },
    wajibSemuaLulus: true,
  },
  {
    jenis: 'sambungan_kayu',
    label: 'baut — moda leleh yang berbeda',
    input: {
      alat: 'baut', diameterMm: 12, jumlahAlat: 4,
      tebalUtamaMm: 80, tebalSisiMm: 40, penetrasiMm: 40,
      kelas: 'I', durasi: 'sepuluh_menit', kadarAir: 'basah',
      gayaKn: 25,
      jarakTepiSejajarMm: 100, jarakTepiTegakMm: 60, jarakAntarAlatMm: 60,
    },
  },
  {
    jenis: 'sambungan_kayu',
    label: 'JARAK UJUNG DILANGGAR — wajib GAGAL, bukan diam',
    input: {
      alat: 'paku', diameterMm: 4.1, jumlahAlat: 8,
      tebalUtamaMm: 60, tebalSisiMm: 30, penetrasiMm: 45,
      kelas: 'II', durasi: 'tetap', kadarAir: 'kering',
      gayaKn: 6,
      jarakTepiSejajarMm: 20, jarakTepiTegakMm: 25, jarakAntarAlatMm: 45,
    },
    wajibGagalNama: 'Jarak ke ujung kayu',
  },
  {
    jenis: 'sekrup_baja_ringan',
    label: 'sekrup rangka atap C75',
    input: {
      diameterMm: 4.8, jumlahSekrup: 4, tebal1Mm: 0.75, tebal2Mm: 1,
      fuMpa: 550, gayaGeserKn: 3, gayaTarikKn: 1.2, jarakTepiMm: 15,
    },
  },
  {
    jenis: 'sekrup_baja_ringan',
    label: 'HISAPAN ANGIN besar — pull-over wajib menahan',
    input: {
      diameterMm: 4.8, jumlahSekrup: 2, tebal1Mm: 0.45, tebal2Mm: 0.75,
      fuMpa: 550, gayaGeserKn: 0.5, gayaTarikKn: 4, jarakTepiMm: 15,
    },
    wajibAdaGagal: true,
  },
]

let gagal = 0
const dibuat = []

for (const [i, k] of KASUS.entries()) {
  /*
    Kode dibuat UNIK per jalan. Versi pertama memakai `UJI-SAMB-1` tetap, dan
    jalan kedua ditolak HTTP 409 "kode sudah dipakai" — kegagalan yang terbaca
    seperti cacat rute padahal sisa jalan sebelumnya. Penguji yang tak bisa
    dijalankan dua kali berturut-turut adalah penguji yang tak akan dijalankan.
  */
  const kode = `UJI-SAMB-${i + 1}-${JALAN}`

  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      kode, nama: k.label, jenis: k.jenis, jumlah: 1, input: k.input,
      catatan: 'dibuat oleh uji-sambungan-hidup.mjs — dihapus otomatis',
    }),
  })

  if (!buat.ok) {
    console.error(`\n❌ ${k.jenis} — ${k.label}`)
    console.error(`   BUAT gagal HTTP ${buat.status}: ${(await buat.text()).slice(0, 240)}`)
    /*
      HTTP 500 dengan pesan `struktur_elemen_jenis_check` di sini berarti
      migrasi 470 belum dijalankan di basis yang dipakai API — kode benar,
      basis yang tertinggal.
    */
    gagal++
    continue
  }

  const jb = await buat.json()
  const el = jb.data ?? jb
  const id = el?.id
  if (!id) {
    console.error(`\n❌ ${k.label}: balasan BUAT tak memuat id`)
    gagal++
    continue
  }
  dibuat.push(id)

  const baca = await fetch(`${BASIS}/api/v1/struktur/${id}`, { headers: H })
  if (!baca.ok) {
    console.error(`\n❌ ${k.label}: BACA gagal HTTP ${baca.status}`)
    console.error(`   ${(await baca.text()).slice(0, 240)}`)
    gagal++
    continue
  }

  const h = await baca.json()
  const hasil = h.hasil ?? h.data?.hasil ?? h
  const periksa = hasil.periksa ?? []
  const adaGagal = periksa.some((p) => !p.aman)

  console.log(`▸ ${k.jenis} — ${k.label}`)
  for (const p of periksa) {
    const tanda = p.aman ? '✓' : '✗'
    const r = typeof p.rasio === 'number' ? ` (${(p.rasio * 100).toFixed(0)}%)` : ''
    console.log(`    ${tanda} ${p.nama}${r}`)
  }
  for (const c of hasil.catatan ?? []) console.log(`    · ${c}`)

  if (!periksa.length) {
    console.error('   ❌ NOL pemeriksaan — rute menjawab 200 tanpa memeriksa apa pun')
    gagal++
  }
  /*
    Garis dasar yang diam-diam GAGAL adalah penguji yang tak menguji apa pun:
    kalau semua kasus merah, kasus yang "wajib merah" tak membuktikan bahwa
    yang diperiksanya benar-benar yang menahan.
  */
  if (k.wajibSemuaLulus && adaGagal) {
    const yg = periksa.filter((p) => !p.aman).map((p) => p.nama).join(', ')
    console.error(`   ❌ garis dasar seharusnya LULUS seluruhnya, tetapi gagal: ${yg}`)
    gagal++
  }
  if (k.wajibAdaGagal && !adaGagal) {
    console.error('   ❌ dirancang untuk GAGAL, tetapi seluruh pemeriksaan lulus')
    gagal++
  }
  if (k.wajibGagalNama
      && !periksa.some((p) => p.nama === k.wajibGagalNama && !p.aman)) {
    console.error(`   ❌ "${k.wajibGagalNama}" tak muncul sebagai GAGAL`)
    gagal++
  }
  console.log('')
}

// ── Bersihkan: elemen uji tak boleh tertinggal di proyek sungguhan ──────────
for (const id of dibuat) {
  const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: H_HAPUS })
  if (!d.ok) {
    console.error(`⚠ elemen uji ${id} TAK terhapus (HTTP ${d.status}) — hapus manual`)
    gagal++
  }
}
console.log(`(${dibuat.length} elemen uji dibuat dan dihapus kembali)`)

if (gagal) {
  console.error(`\n❌ ${gagal} masalah pada jalur hidup`)
  process.exit(1)
}
console.log(`\n✅ ${KASUS.length} kasus — sambungan berjalan lewat rute sungguhan`)
