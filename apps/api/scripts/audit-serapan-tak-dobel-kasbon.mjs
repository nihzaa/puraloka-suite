#!/usr/bin/env node
// ============================================================================
// Kasbon TIDAK boleh dijumlahkan bersama `project_expenses` — ia sudah di sana.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Trigger basis `trg_kasbon_approved_create_expense` menyisipkan satu baris
// `project_expenses` (ref_type='kasbon', ref_id=<id kasbon>) untuk SETIAP
// kasbon yang mencapai status `approved`. Kode yang menjumlahkan kasbon
// sebagai sumber uang keluar TERPISAH karena itu menghitung uang yang sama
// dua kali.
//
// Diukur ke basis 2026-09-15, seluruh tabel, DUA ARAH:
//
//   kasbons status IN (approved, settled)         55 baris  Rp 550.600.000
//   project_expenses ref_type='kasbon'            55 baris  Rp 550.600.000
//   kasbon approved/settled TANPA baris expense    0 baris
//   expense ref kasbon yang kasbonnya bukan itu    0 baris
//
// Angka yang identik di kedua sisi, dan nol yatim di kedua arah: uang yang
// sama, dua tempat.
//
// ── Kenapa ia tak pernah bergejala
//
// Tiga cacat ditemukan dalam satu sesi, dan ketiganya HIJAU di seluruh alat:
//
//   lib/ai-tool-serapan-biaya.ts   serapan + kasbon         → dua kali lipat
//   routes/v1/kurva-s.ts           AC + kasbon              → CPI palsu
//   routes/v1/reports.ts           totalOutflow + kasbon    → "Total Keluar"
//
// Kedua query berhasil. Kedua angkanya sah sendiri-sendiri. `tsc` hijau,
// test hijau, tak satu pun galat di lapisan mana pun — yang salah hanya
// JUMLAHNYA, dan tak ada di sistem ini yang tahu berapa seharusnya.
//
// Dampak terukurnya bukan pembulatan: "Renovasi Toko Pak Rudi — Sukajadi"
// dilaporkan menyerap 73,1% nilai kontrak; yang benar 36,6%. Di layar yang
// dipakai memutuskan, dan ke arah yang membuat proyek sehat terlihat boros.
//
// ── Apa yang DIBACA penjaga ini
//
// Berkas yang membaca `project_expenses` DAN membaca `kasbons`, lalu
// MENJUMLAHKAN keduanya ke satu akumulator. Yang dicari BENTUKNYA, bukan
// namanya: penjumlahan kasbon dikenali dari pembacaan `amount` kasbon yang
// mengalir ke `+`/`+=`/`.reduce`, di berkas yang di saat yang sama
// menjumlahkan `total_amount` milik `project_expenses`.
//
// ⚠ MENAMPILKAN kasbon TIDAK dilarang — `reports.ts` tetap mengirim
// `totalKasbon` supaya layar bisa memerinci "berapa yang lewat jalur
// kasbon". Yang dilarang MENJUMLAHKANNYA ke total uang keluar. Penjaga yang
// melarang kedua-duanya akan merah atas kode yang benar, lalu diabaikan
// seluruh keluarannya (CLAUDE.md §8a.2).
//
// ── Batas, yang wajib dinyatakan
//
// Yang dibaca KEPUTUSAN DI KODE, bukan angka yang benar-benar dihasilkan.
// Penjaga ini tak tahu apakah totalnya BENAR — hanya bahwa kasbon tak
// dijumlahkan dua kali di berkas yang sama. Rekonsiliasi angkanya ada di
// `src/lib/__tests__/ai-tool-serapan-biaya.test.ts`, yang menghitung ulang
// lewat SQL ke basis nyata.
//
// Ambang NOL.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = dirname(dirname(fileURLToPath(import.meta.url)))
const AKAR_SRC = join(AKAR_API, 'src')

/** Berkas yang memang BOLEH menjumlahkan kasbon: penjaga & test cacat ini. */
const DIKECUALIKAN = [
  // Test yang sengaja membangun angka dobel untuk membuktikan ia ditolak.
  /__tests__[/\\]serapan-tak-dobel-kasbon\.test\.ts$/,
]

function berkasTs(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama)
    if (statSync(jalur).isDirectory()) {
      if (nama === 'node_modules' || nama === 'dist') continue
      berkasTs(jalur, keluar)
    } else if (nama.endsWith('.ts')) {
      keluar.push(jalur)
    }
  }
  return keluar
}

/** Buang komentar — komentar yang MENERANGKAN cacat ini tak boleh terhitung
 *  sebagai pelanggarannya (CLAUDE.md §8a.2: penjelasan benar, keadaan salah). */
function tanpaKomentar(isi) {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const pelanggaran = []

for (const jalur of berkasTs(AKAR_SRC)) {
  const rel = relative(AKAR_API, jalur).replace(/\\/g, '/')
  if (DIKECUALIKAN.some((re) => re.test(jalur))) continue

  const mentah = readFileSync(jalur, 'utf8')
  const kode = tanpaKomentar(mentah)

  // Syarat 1: berkas ini membaca project_expenses.
  const bacaExpenses = /['"`]project_expenses['"`]/.test(kode)
  if (!bacaExpenses) continue

  /*
   * Syarat 2: berkas ini juga MENYENTUH kasbon.
   *
   * ⚠ Sengaja LEBIH LUAS daripada tabelnya. Versi pertama menuntut string
   * `'kasbons'` ada di berkas, dan uji mutasi membuktikan itu lubang: begitu
   * `kurva-s.ts` diperbaiki, nama tabelnya lenyap dari berkas — lalu mutasi
   * yang menyuntikkan `for (const k of (kasbonRes.data ?? []))` kembali TAK
   * TERDETEKSI, sebab berkasnya sudah dilewati di syarat ini sebelum
   * pendeteksinya sempat jalan.
   *
   * Penjaga yang berhenti menjaga persis SESUDAH cacatnya diperbaiki adalah
   * penjaga yang hanya mengesahkan keadaan hari ini. Yang dicari karena itu
   * jejak kasbon dalam rupa apa pun — nama tabel, variabel, maupun kolom
   * `kasbon_date` — sebab kasbon bisa masuk lewat join atau alias.
   */
  const bacaKasbon = /kasbon/i.test(kode)
  if (!bacaKasbon) continue

  /*
   * Syarat 3 — yang menentukan: nilai kasbon MENGALIR ke akumulator yang
   * JUGA menerima uang `project_expenses`.
   *
   * ── Kenapa bukan sekadar "ada kata kasbon dekat penjumlahan"
   *
   * Versi pertama penjaga ini mencari variabel yang NAMANYA bernuansa kasbon
   * di dekat `+=`/`.push(`. Diuji lewat mutasi: ia BUTA terhadap cacat asli
   * yang melahirkannya. Bentuk nyatanya di `ai-tool-serapan-biaya.ts`:
   *
   *     const { data: kb } = await db.from('kasbons')…
   *     for (const k of (kb ?? []) …) {
   *       perProyek.set(id, (perProyek.get(id) ?? 0) + (Number(k.amount) || 0))
   *
   * Tak ada kata "kasbon" di baris penjumlahannya, dan akumulatornya `Map`
   * lewat `.set()` — bukan `+=`, bukan `.push(`. Penjaga yang hijau atas
   * cacat yang melahirkannya adalah hiasan (CLAUDE.md §8a.2).
   *
   * Yang dilacak sekarang RANTAI DATANYA:
   *   1. variabel hasil query `kasbons`  (`kb`, `kasbonRes`, `kasbons`, …)
   *   2. variabel loop yang mengiterasinya (`k`, `b`, …)
   *   3. akumulator yang menerima `.amount` variabel itu
   *   4. apakah akumulator yang SAMA juga menerima `total_amount`
   *
   * Hanya bila keempatnya terpenuhi ia merah — jadi kasbon yang dijumlahkan
   * ke embernya SENDIRI (mis. `advance_outstanding` di finance.ts, yang
   * sengaja di luar `total_cost`) tetap hijau, dan memang seharusnya.
   */
  const baris = kode.split('\n')
  const temuan = []

  // (1) Variabel yang MEMEGANG hasil query kasbons.
  const varKasbon = new Set()
  for (let i = 0; i < baris.length; i++) {
    if (!/['"`]kasbons['"`]/.test(baris[i])) continue
    // Cari deklarasi dalam 3 baris ke ATAS: `const { data: kb } = …` /
    // `const kasbonRes = …` / `let kasbonQ = …`
    for (let j = Math.max(0, i - 3); j <= i; j++) {
      const d =
        /const\s*\{\s*data\s*:\s*([\w$]+)/.exec(baris[j])?.[1] ??
        /(?:const|let|var)\s+([\w$]+)\s*=/.exec(baris[j])?.[1]
      if (d) varKasbon.add(d)
    }
  }
  // Nama yang memang bernuansa kasbon, di mana pun ia dideklarasikan.
  for (const m of kode.matchAll(/(?:const|let|var)\s+([\w$]*[Kk]asbon[\w$]*)\s*=/g)) {
    varKasbon.add(m[1])
  }

  /** Apakah akumulator `nama` juga menerima uang project_expenses? */
  const emberBersama = (nama) => {
    if (!nama) return true // tak teridentifikasi → jangan diam-diam lolos
    const ujung = nama.split('.').pop().replace(/\[[^\]]*\]/g, '')
    if (!ujung) return true
    const lolos = ujung.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return (
      new RegExp(String.raw`\b${lolos}\b[^\n]*(?:\.push\(|\+=|\.set\()[^\n]*total_amount`).test(kode) ||
      new RegExp(String.raw`total_amount[^\n]*\b${lolos}\b`).test(kode)
    )
  }

  /** Akumulator yang menerima nilai pada sepotong kode. */
  const namaAkumulator = (teks) =>
    /([\w$]+(?:\[[^\]]+\])?(?:\.[\w$]+)*)\s*\.(?:push|set)\(/.exec(teks)?.[1] ??
    /([\w$]+(?:\[[^\]]+\])?(?:\.[\w$]+)*)\s*\+=/.exec(teks)?.[1] ??
    /([\w$]+(?:\[[^\]]+\])?(?:\.[\w$]+)*)\s*=\s*[^=]/.exec(teks)?.[1]

  /*
   * Apakah penjumlahan di baris `i` DIPAGARI supaya tak pernah terjadi
   * bersamaan dengan penjumlahan `project_expenses`?
   *
   * Bentuk sah yang dipakai `finance.ts` (arus kas ber-`typeFilter`):
   *
   *     if (!typeFilter.includes('expense')) {
   *       for (const row of kasbonRes.data) add(row.kasbon_date, 0, …amount)
   *     }
   *
   * Di sana kedua sumber SALING MENIADAKAN, jadi tak ada yang dihitung dua
   * kali — dan kasbon tetap perlu ditambahkan saat pengguna menyaring hanya
   * kasbon, kalau tidak grafiknya kosong (salah ke arah sebaliknya).
   *
   * Dicari pagar `if (!…expense…)` dalam 6 baris ke atas. Sengaja sempit:
   * pagar yang tak menyebut `expense` bukan pagar anti-dobel.
   */
  const dipagariAntiDobel = (i) => {
    for (let j = Math.max(0, i - 6); j < i; j++) {
      if (/if\s*\(\s*![^)]*expense/i.test(baris[j])) return true
    }
    return false
  }

  const catat = (n, teks) => {
    if (!temuan.some((t) => Math.abs(t.n - n) <= 5)) temuan.push({ n, t: teks.trim() })
  }

  for (let i = 0; i < baris.length; i++) {
    const b = baris[i]

    // (b) Variabel total kasbon ikut dalam penjumlahan dengan total lain.
    //     `totalOutflow: totalExpense + totalKasbon` → merah.
    //     `const totalKasbon = kasbons.reduce(…)`    → bukan.
    if (
      /\+/.test(b) &&
      /\b(total|sum|jml)[Kk]asbon\b/i.test(b) &&
      /(total|sum)(Expense|Outflow|Out|Biaya|Keluar|Pengeluaran)/i.test(b) &&
      !/reduce/.test(b)
    ) {
      catat(i + 1, b)
      continue
    }

    // (2)+(3) Loop atas variabel hasil kasbon → akumulator.
    const loop = /for\s*\(\s*const\s+([\w$]+)\s+of\s+([^)]*)\)/.exec(b)
    if (loop) {
      const [, varLoop, sumber] = loop
      const dariKasbon =
        /kasbon/i.test(sumber) || [...varKasbon].some((v) => new RegExp(String.raw`\b${v}\b`).test(sumber))
      if (dariKasbon) {
        const potongan = baris.slice(i, i + 6).join('\n')
        const pakaiAmount = new RegExp(String.raw`\b${varLoop}\b[^\n]*\.amount|amount[^\n]*\b${varLoop}\b`).test(potongan)
        if (pakaiAmount && emberBersama(namaAkumulator(potongan)) && !dipagariAntiDobel(i)) {
          catat(i + 1, b)
        }
      }
      continue
    }

    // (c) `.push(`/`.set(`/`+=` satu baris yang jelas membawa nilai kasbon.
    if (/\.push\(|\.set\(|\+=/.test(b) && /amount/i.test(b) && /kasbon/i.test(b)) {
      if (emberBersama(namaAkumulator(b))) catat(i + 1, b)
      continue
    }

    // (d) `.reduce` langsung atas variabel kasbon yang hasilnya dijumlahkan
    //     ke total biaya di baris yang sama.
    if (/reduce\(/.test(b) && /amount/i.test(b)) {
      const sumberR = /([\w$]+)\s*(?:\?\?[^.]*)?\.reduce\(/.exec(b)?.[1]
      if (sumberR && (/kasbon/i.test(sumberR) || varKasbon.has(sumberR))) {
        if (/(total|sum)(Expense|Outflow|Out|Biaya|Keluar|Pengeluaran)/i.test(b)) catat(i + 1, b)
      }
    }
  }


  if (temuan.length > 0) pelanggaran.push({ rel, temuan })
}

if (pelanggaran.length === 0) {
  console.log('✅ nol berkas menjumlahkan kasbon bersama project_expenses.')
  console.log('   (kasbon sudah masuk project_expenses lewat trigger basis)')
  process.exit(0)
}

console.error('❌ KASBON DIHITUNG DUA KALI — ia sudah ada di `project_expenses`.\n')
console.error('   Trigger `trg_kasbon_approved_create_expense` membuat baris')
console.error('   project_expenses (ref_type=\'kasbon\') untuk tiap kasbon approved.')
console.error('   Menjumlahkannya lagi melipatgandakan uang keluar yang dilaporkan.\n')

for (const p of pelanggaran) {
  console.error(`  ${p.rel}`)
  for (const t of p.temuan) console.error(`    baris ${t.n}: ${t.t}`)
  console.error('')
}

console.error(`Total: ${pelanggaran.length} berkas. Ambang NOL.`)
console.error('Perbaikannya: baca uang keluar dari `project_expenses` SAJA.')
console.error('Menampilkan kasbon terpisah tetap boleh — yang dilarang MENJUMLAHKAN.')
process.exit(1)
