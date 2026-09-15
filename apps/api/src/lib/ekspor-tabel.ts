/**
 * EKSPOR TABEL — satu susunan data, empat format keluaran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU TEMPAT, BUKAN EMPAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-17, repo ini sudah punya EMPAT cara mengekspor:
 *
 *     reports.ts        pdfkit + `pdfHeader()`
 *     laporan/page.tsx  XLSX.writeFile di sisi KLIEN
 *     ekspor-bupot.ts   CSV rakitan sendiri
 *     ekspor-efaktur.ts CSV rakitan sendiri
 *
 * Empat cara berarti empat perilaku yang akan berbeda suatu hari — dan yang
 * pertama berbeda biasanya hal kecil yang mahal: pembulatan rupiah, tanda
 * pemisah ribuan, atau BOM yang lupa dipasang sehingga nama berubah di Excel.
 *
 * Berkas ini bukan pengganti keempatnya (ekspor pajak punya SKEMA WAJIB dari
 * DJP yang tak boleh diseragamkan). Ia dasar untuk ekspor BARU — jurnal
 * akuntansi, mutasi bank, dan apa pun yang menyusul.
 *
 * ── Kenapa PDF ikut, padahal CSV lebih berguna untuk diolah
 *
 * Founder memintanya, dan alasannya sah: CSV untuk MESIN, PDF untuk MANUSIA.
 * Jurnal yang dikirim ke akuntan lewat WhatsApp tak berguna sebagai CSV —
 * ia dibuka di HP, dan yang dibutuhkan halaman yang bisa dibaca apa adanya.
 *
 * ── Kenapa kop PDF memakai identitas TENANT
 *
 * `pdfHeader()` di `reports.ts` memaku tulisan "Puraloka Suite" di kop tiap
 * laporan. Untuk aplikasi satu perusahaan itu benar; untuk SaaS multi-tenant
 * itu berarti PT lain menerima laporan berkop nama pesaingnya.
 *
 * Di sini nama tenant DIKIRIM pemanggil. Kalau kosong, yang tercetak
 * "Laporan" — bukan nama siapa pun.
 */
import PDFDocument from 'pdfkit'
import * as XLSX from 'xlsx'

/** Format yang bisa diminta. Sengaja daftar TERTUTUP — `format` datang dari
 *  query string, dan nilai bebas di sana adalah jalan masuk yang tak perlu. */
export const FORMAT_EKSPOR = ['csv', 'xlsx', 'pdf', 'json'] as const
export type FormatEkspor = (typeof FORMAT_EKSPOR)[number]

export function formatSah(v: unknown): FormatEkspor | null {
  return FORMAT_EKSPOR.includes(v as FormatEkspor) ? (v as FormatEkspor) : null
}

export interface KolomEkspor {
  kunci: string
  judul: string
  /** Angka rata KANAN di PDF/XLSX — itu yang membuat digit bisa dibandingkan. */
  angka?: boolean
  lebar?: number
}

export interface OpsiEkspor {
  judul: string
  /** Nama tenant untuk kop. Kosong → "Laporan", bukan nama siapa pun. */
  tenant?: string | null
  keterangan?: string | null
  kolom: KolomEkspor[]
  baris: Array<Record<string, unknown>>
}

export interface HasilTabel {
  isi: Buffer
  tipeKonten: string
  ekstensi: string
}

/** Sel CSV. Koma/kutip/baris-baru dibungkus — nama seperti `PT Maju, Tbk`
 *  akan memecah barisnya kalau tidak. */
function selCsv(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Angka untuk DIBACA MANUSIA (PDF).
 *
 * ⚠ Sengaja TIDAK dipakai untuk CSV/XLSX. Pemisah ribuan membuat angka jadi
 * TEKS di Excel — dan kolom yang jadi teks tak bisa dijumlahkan, yang persis
 * merusak gunanya diekspor.
 */
function angkaBaca(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return v === null || v === undefined ? '' : String(v)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
}

function csv(o: OpsiEkspor): Buffer {
  const judul = o.kolom.map((k) => selCsv(k.judul)).join(',')
  const isi = o.baris.map((b) => o.kolom.map((k) => selCsv(b[k.kunci])).join(','))
  // BOM UTF-8 WAJIB: tanpanya Excel di Windows membaca CSV sebagai ANSI dan
  // "Ø12mm" berubah jadi "Ã˜12mm" sebelum sempat dipakai.
  return Buffer.from('﻿' + [judul, ...isi].join('\r\n') + '\r\n', 'utf8')
}

function xlsx(o: OpsiEkspor): Buffer {
  // Angka dikirim sebagai ANGKA, bukan string terformat — kolom yang jadi
  // teks tak bisa dijumlahkan, dan itu justru gunanya XLSX dibanding PDF.
  const data = o.baris.map((b) => {
    const r: Record<string, unknown> = {}
    for (const k of o.kolom) {
      const v = b[k.kunci]
      r[k.judul] = k.angka && v !== null && v !== undefined && Number.isFinite(Number(v))
        ? Number(v) : v ?? ''
    }
    return r
  })
  const ws = XLSX.utils.json_to_sheet(data, { header: o.kolom.map((k) => k.judul) })
  ws['!cols'] = o.kolom.map((k) => ({ wch: k.lebar ?? Math.max(12, k.judul.length + 2) }))
  const wb = XLSX.utils.book_new()
  // Nama sheet dibatasi 31 karakter oleh Excel, dan `:\/?*[]` dilarang —
  // judul laporan yang memuatnya membuat berkasnya gagal dibuka.
  XLSX.utils.book_append_sheet(wb, ws, o.judul.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Data')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

async function pdf(o: OpsiEkspor): Promise<Buffer> {
  const M = 36
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, autoFirstPage: true })
  const potongan: Buffer[] = []
  doc.on('data', (c: Buffer) => potongan.push(c))
  const selesai = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(potongan))))

  const lebarIsi = doc.page.width - M * 2

  // Kop memakai identitas TENANT, bukan nama produk yang dipaku.
  doc.rect(0, 0, doc.page.width, 62).fill('#003366')
  doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold')
    .text(o.tenant?.trim() || 'Laporan', M, 14, { width: lebarIsi })
  doc.fontSize(10).font('Helvetica').text(o.judul, M, 34, { width: lebarIsi })
  if (o.keterangan) {
    doc.fontSize(8).fillColor('#93C5FD').text(o.keterangan, M, 48, { width: lebarIsi })
  }
  doc.fillColor('#111827')

  let y = 78
  const total = o.kolom.reduce((s, k) => s + (k.lebar ?? 12), 0)
  const lebar = o.kolom.map((k) => ((k.lebar ?? 12) / total) * lebarIsi)

  const gambarJudul = () => {
    doc.rect(M, y, lebarIsi, 18).fill('#F1F5F9').fillColor('#111827')
    let x = M
    doc.font('Helvetica-Bold').fontSize(8)
    o.kolom.forEach((k, i) => {
      doc.text(k.judul, x + 4, y + 5, { width: lebar[i] - 8, align: k.angka ? 'right' : 'left' })
      x += lebar[i]
    })
    y += 18
    doc.font('Helvetica').fontSize(8)
  }

  gambarJudul()

  for (const b of o.baris) {
    // Halaman baru DIULANG judul kolomnya. Tabel yang berlanjut tanpa judul
    // memaksa pembaca membolak-balik halaman untuk tahu kolom mana ini.
    if (y > doc.page.height - M - 20) {
      doc.addPage()
      y = M
      gambarJudul()
    }
    let x = M
    o.kolom.forEach((k, i) => {
      const v = b[k.kunci]
      doc.text(k.angka ? angkaBaca(v) : String(v ?? ''), x + 4, y + 4,
        { width: lebar[i] - 8, align: k.angka ? 'right' : 'left', lineBreak: false })
      x += lebar[i]
    })
    y += 15
    doc.moveTo(M, y - 3).lineTo(M + lebarIsi, y - 3).lineWidth(0.3).strokeColor('#E5E7EB').stroke()
  }

  if (o.baris.length === 0) {
    // Halaman kosong tanpa kalimat terbaca sebagai "gagal cetak". Yang
    // dinyatakan: berkasnya benar, datanya yang tak ada.
    doc.fontSize(9).fillColor('#6B7280')
      .text('Tidak ada baris untuk periode ini.', M, y + 8, { width: lebarIsi })
  }

  doc.end()
  return selesai
}

/**
 * Menyusun berkas ekspor menurut format yang diminta.
 *
 * `json` disertakan bukan sebagai pelengkap: ia satu-satunya format yang
 * membawa tipe apa adanya, jadi ia yang dipakai saat ekspornya dikonsumsi
 * sistem lain — dan itulah bentuk "integrasi" yang paling murah.
 */
export async function susunEkspor(
  format: FormatEkspor,
  o: OpsiEkspor,
): Promise<HasilTabel> {
  switch (format) {
    case 'csv':
      return { isi: csv(o), tipeKonten: 'text/csv; charset=utf-8', ekstensi: 'csv' }
    case 'xlsx':
      return {
        isi: xlsx(o),
        tipeKonten: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ekstensi: 'xlsx',
      }
    case 'pdf':
      return { isi: await pdf(o), tipeKonten: 'application/pdf', ekstensi: 'pdf' }
    case 'json':
      return {
        isi: Buffer.from(JSON.stringify({
          judul: o.judul, tenant: o.tenant ?? null, keterangan: o.keterangan ?? null,
          kolom: o.kolom, baris: o.baris,
        }, null, 2), 'utf8'),
        tipeKonten: 'application/json; charset=utf-8',
        ekstensi: 'json',
      }
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AMBIL SELURUHNYA — dan kenapa `.limit(BATAS + 1)` TIDAK PERNAH bekerja
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Empat rute ekspor memakai idiom yang sama untuk mendeteksi pemotongan:
 *
 *     const BATAS = 5000
 *     … .limit(BATAS + 1)                 // minta satu lebih dari batas
 *     const terpotong = semua.length > BATAS   // kalau dapat 5001 → terpotong
 *
 * Idiomnya sah secara logika dan salah secara kenyataan: **PostgREST
 * memotong di 1.000 baris, KERAS.** `.limit(5001)` tidak memulangkan 5.001
 * baris; ia memulangkan 1.000. Maka `semua.length > 5000` bernilai `false`
 * SELAMANYA, dan tiga akibat mengikutinya sekaligus:
 *
 *   • berkas ekspor diam-diam berhenti di 1.000 baris;
 *   • header `x-ekspor-terpotong` selalu `'0'` — tanda yang dipasang justru
 *     untuk memperingatkan hal ini tak pernah menyala;
 *   • dan yang paling mahal: TOTAL UANG (`totalTagih`, `totalBelum`, total
 *     kasbon, total PO) dijumlahkan dari 1.000 baris itu lalu dicetak di
 *     keterangan berkas seolah jumlah lengkap. Angka yang terlalu KECIL
 *     terbaca persis seperti kabar baik.
 *
 * Diukur 2026-09-15 lewat PostgREST sungguhan:
 *
 *     notifications  11.863 baris → .limit(5001) memulangkan  1.000
 *     audit_logs    102.363 baris → .limit(5001) memulangkan  1.000
 *     .range(0, 4999)             → memulangkan  1.000
 *     .range(1000, 1999)          → memulangkan  1.000 baris LAIN
 *
 * Baris terakhir itu jalan keluarnya: `.range()` tidak bisa MEMPERBESAR satu
 * respons, tetapi bisa MENGGESER jendelanya. Jadi diambil bertahap per 1.000
 * sampai satu halaman memulangkan kurang dari ukuran halaman — pola yang
 * sudah dipakai `routes/v1/ahsp.ts` (daftar analisa) dan
 * `utils/role-guard.ts` (fetchRoleStates).
 *
 * ── Kenapa helper, bukan empat salinan loop
 *
 * Cacat ini lahir persis dari penyalinan: satu idiom yang salah, disalin
 * empat kali, dengan komentar meyakinkan di tiap salinannya. Loop paging
 * yang disalin empat kali akan menua dengan cara yang sama.
 *
 * ── Batas yang JUJUR
 *
 * `batas` tetap ada, tetapi artinya berubah: ia bukan lagi tebakan yang tak
 * pernah tercapai melainkan pagar sungguhan. Bila data melewatinya,
 * `terpotong` bernilai `true` KARENA MEMANG TERPOTONG — dan kali ini
 * nilainya terukur, bukan diandaikan.
 *
 * @param bangun  pembuat query BARU tiap halaman. Harus fungsi, bukan satu
 *                builder: builder Supabase sekali pakai — memanggil
 *                `.range()` dua kali pada objek yang sama menimpa jendelanya,
 *                bukan mengambil halaman berikutnya.
 */
export const HALAMAN_POSTGREST = 1000

/**
 * Bentuk MINIMAL yang dibutuhkan dari builder PostgREST: hanya `.range()`.
 *
 * Sengaja `any` pada `data`, dan itu keputusan yang perlu alasannya tertulis.
 * Tipe hasil `.select()` Supabase menyatakan embed relasi sebagai ARRAY
 * (`projects: { name: any }[]`) sementara PostgREST memulangkan OBJEK untuk
 * relasi to-one. Ketaksesuaian itu sudah ada di repo ini SEBELUM helper ini —
 * keempat pemanggil lama menutupnya dengan `as unknown as Array<…>`.
 *
 * Menuntut bentuk yang tepat di sini hanya memindahkan `as never` ke tiap
 * pemanggil, dan itu LEBIH buruk: cast yang tersebar tak bisa diberi alasan
 * satu kali. Jadi ketaksesuaian dinyatakan di SATU tempat, di sini.
 */
interface BuilderBerjendela {
  range: (dari: number, sampai: number) => PromiseLike<{
    data: any[] | null
    error: { message: string } | null
  }>
}

export async function ambilSeluruhnya<T>(
  bangun: () => BuilderBerjendela,
  batas: number,
): Promise<{ baris: T[]; terpotong: boolean; galat: string | null }> {
  const kumpul: T[] = []

  for (let mulai = 0; mulai <= batas; mulai += HALAMAN_POSTGREST) {
    // Diminta SATU lebih dari batas pada halaman yang melewatinya, supaya
    // "tepat `batas` baris" bisa dibedakan dari "lebih dari `batas`".
    const akhir = Math.min(mulai + HALAMAN_POSTGREST, batas + 1) - 1
    if (akhir < mulai) break

    const { data, error } = await bangun().range(mulai, akhir)
    if (error) return { baris: [], terpotong: false, galat: error.message }

    const bagian = data ?? []
    kumpul.push(...bagian)

    // Halaman yang tak penuh berarti sumbernya habis — berhenti, jangan
    // menembak halaman kosong berikutnya.
    if (bagian.length < akhir - mulai + 1) break
  }

  const terpotong = kumpul.length > batas
  return { baris: terpotong ? kumpul.slice(0, batas) : kumpul, terpotong, galat: null }
}
