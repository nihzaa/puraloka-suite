/**
 * ARUS KAS 30/60/90 HARI — katalog 2.4, dan rekomendasi bayar 8.3.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG MENENTUKAN PERUSAHAAN HIDUP ATAU TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Bulan depan kas saya cukup tidak?" adalah pertanyaan yang jawabannya
 * menentukan apakah gaji terbayar. Hari ini ia dijawab dengan membuka empat
 * halaman lalu menghitung di kepala — dan hitungan di kepala tak pernah
 * memasukkan yang terlupa.
 *
 * Diukur 2026-08-16 sebelum ditulis:
 *
 *   cash_accounts      5 rekening · saldo Rp 222.475.000
 *   termin pending    15 · Rp 1.079.250.000   ← masuk
 *   invoices belum lunas 3 · Rp 100.395.000   ← masuk
 *   supplier_invoices  5 · Rp 50.485.000      ← keluar
 *
 * Keempatnya punya tanggal, jadi proyeksinya bukan tebakan melainkan
 * penjumlahan yang dijadwalkan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INI PROYEKSI, BUKAN RAMALAN — DAN BEDANYA HARUS DINYATAKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang dihitung: uang yang SUDAH punya dokumen dan tanggal. Yang TIDAK
 * dihitung: proyek yang belum ditandatangani, biaya rutin yang tak pernah
 * dicatat, dan keterlambatan bayar yang sudah jadi kebiasaan klien.
 *
 * Angka yang disebut "proyeksi kas" tanpa keterangan itu akan dipakai untuk
 * memutuskan meminjam atau tidak. Karena itu keluarannya menyebutkan apa yang
 * ikut dan apa yang tidak — bukan sebagai basa-basi, melainkan supaya yang
 * membacanya tahu di mana ia boleh bersandar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TERMIN `pending` BUKAN UANG YANG PASTI MASUK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ia baru jadwal tagih — belum ditagih, apalagi dibayar. Karena itu ia
 * dihitung TERPISAH dari invoice yang sudah terbit, dan disebut dengan nama
 * yang berbeda. Menjumlahkan keduanya jadi satu angka "piutang" membuat
 * Rp 1,08 M terlihat seperti uang yang tinggal ditunggu.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

/** Jendela proyeksi. Lebih jauh dari 90 hari, dokumennya belum ada. */
const JENDELA = [30, 60, 90] as const

interface BarisJatuh {
  amount?: unknown
  amount_due?: unknown
  due_date?: string | null
  target_date?: string | null
  invoice_number?: string | null
  label?: string | null
  status?: string | null
}

/** Selisih hari dari sekarang; negatif berarti sudah lewat. */
function hariLagi(tanggal: string | null | undefined): number | null {
  if (!tanggal) return null
  const t = new Date(tanggal)
  if (Number.isNaN(t.getTime())) return null
  return Math.floor((t.getTime() - Date.now()) / 86_400_000)
}

export const toolArusKas: DefinisiToolAi = {
  nama: 'proyeksi_arus_kas',
  label: 'Proyeksi arus kas',
  keterangan:
    'Proyeksi arus kas 30/60/90 hari: saldo sekarang, uang masuk terjadwal (invoice + termin), ' +
    'dan uang keluar (tagihan supplier). Pakai untuk "kas bulan depan cukup?", "kapan kas ' +
    'menipis", "berapa yang akan masuk". Angkanya hanya memuat yang SUDAH berdokumen — ' +
    'sampaikan itu, jangan disebut ramalan.',
  izin: 'finance:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    // ── Saldo sekarang ────────────────────────────────────────────────────
    const { data: kas, error: errKas } = await db
      .from('cash_accounts')
      .select('name, balance, is_active')
      .limit(100)

    if (errKas) {
      return { isi: `Gagal membaca saldo kas: ${errKas.message}`, isError: true, entitas: [] }
    }

    const rekening = ((kas ?? []) as unknown as Array<{
      name: string; balance: unknown; is_active: boolean | null
    }>).filter((r) => r.is_active !== false)

    const saldo = rekening.reduce((s, r) => s + (Number(r.balance) || 0), 0)

    /*
     * ── `invoices` & `termin_schedules` kategori C ──────────────────────────
     *
     * Keduanya mewarisi tenancy lewat proyek, dan wrapper MENOLAK `.from()`
     * untuk keduanya — dengan benar: tanpa saringan proyek, arus kas tenant
     * lain ikut terjumlah, dan angkanya tetap terlihat masuk akal.
     *
     * Yang dipakai: `unsafe()` dengan alasan tertulis, disaring
     * `.in('project_id', …)` ke daftar proyek milik tenant ini — pola yang
     * sama dengan seluruh tool konstruksi.
     */
    const { data: proyek } = await db.from('projects').select('id').limit(500)
    const idProyek = ((proyek ?? []) as unknown as Array<{ id: string }>).map((p) => p.id)

    if (idProyek.length === 0) {
      return {
        isi: bungkusData('proyeksi_arus_kas', 'Belum ada proyek — arus kas tak bisa diproyeksikan.'),
        isError: false,
        entitas: [],
      }
    }

    // ── Masuk: invoice yang SUDAH terbit ──────────────────────────────────
    const { data: inv, error: errInv } = await db
      .unsafe('invoices', 'tool AI: proyeksi arus kas lintas proyek milik tenant, disaring project_id')
      .select('invoice_number, amount_due, due_date, status')
      .in('project_id', idProyek)
      .neq('status', 'paid')
      .limit(500)

    if (errInv) {
      return { isi: `Gagal membaca invoice: ${errInv.message}`, isError: true, entitas: [] }
    }

    // ── Masuk: termin yang BELUM ditagih — dihitung TERPISAH ───────────────
    const { data: trm, error: errTrm } = await db
      .unsafe('termin_schedules', 'tool AI: termin lintas proyek milik tenant, disaring project_id')
      .select('label, amount, target_date, status')
      .in('project_id', idProyek)
      .eq('status', 'pending')
      .limit(500)

    if (errTrm) {
      return { isi: `Gagal membaca termin: ${errTrm.message}`, isError: true, entitas: [] }
    }

    // ── Keluar: tagihan supplier ──────────────────────────────────────────
    const { data: sup, error: errSup } = await db
      .from('supplier_invoices')
      .select('invoice_number, amount_due, due_date, status')
      .neq('status', 'paid')
      .limit(500)

    if (errSup) {
      return { isi: `Gagal membaca hutang supplier: ${errSup.message}`, isError: true, entitas: [] }
    }

    const invoices = (inv ?? []) as unknown as BarisJatuh[]
    const termin = (trm ?? []) as unknown as BarisJatuh[]
    const hutang = (sup ?? []) as unknown as BarisJatuh[]

    /*
     * Yang JATUH TEMPO dalam N hari — termasuk yang sudah LEWAT.
     *
     * Yang lewat tempo justru paling penting: ia uang yang seharusnya sudah
     * ada. Mengeluarkannya dari proyeksi membuat kas terlihat lebih sehat
     * daripada kenyataannya, dan itu arah kesalahan yang paling berbahaya.
     */
    const dalam = (baris: BarisJatuh[], hari: number, kolomTgl: 'due_date' | 'target_date') =>
      baris.filter((b) => {
        const n = hariLagi(b[kolomTgl])
        return n !== null && n <= hari
      })

    const jml = (baris: BarisJatuh[], kolom: 'amount' | 'amount_due') =>
      baris.reduce((s, b) => s + (Number(b[kolom]) || 0), 0)

    const bagian: string[] = [
      `Saldo kas sekarang: ${rupiah(saldo)} (${rekening.length} rekening aktif).`,
      '',
    ]

    for (const hari of JENDELA) {
      const masukInv = jml(dalam(invoices, hari, 'due_date'), 'amount_due')
      const masukTrm = jml(dalam(termin, hari, 'target_date'), 'amount')
      const keluar = jml(dalam(hutang, hari, 'due_date'), 'amount_due')

      /*
       * Termin TIDAK dijumlahkan ke proyeksi utama.
       *
       * Ia baru jadwal tagih — belum ditagih, apalagi dibayar. Memasukkannya
       * membuat Rp 1,08 M terlihat seperti uang yang tinggal ditunggu.
       */
      const proyeksi = saldo + masukInv - keluar

      bagian.push(
        `${hari} hari:` +
          ` masuk dari invoice ${rupiah(masukInv)}` +
          ` · keluar ${rupiah(keluar)}` +
          ` → perkiraan saldo ${rupiah(proyeksi)}` +
          (proyeksi < 0 ? '  ⚠ MINUS' : ''),
      )
      if (masukTrm > 0) {
        bagian.push(
          `   (+ ${rupiah(masukTrm)} termin yang BELUM ditagih — belum tentu masuk` +
            ' di jendela ini)',
        )
      }
    }

    // ── Yang sudah LEWAT tempo, disebut satu per satu ─────────────────────
    const lewatMasuk = invoices.filter((b) => (hariLagi(b.due_date) ?? 1) < 0)
    const lewatKeluar = hutang.filter((b) => (hariLagi(b.due_date) ?? 1) < 0)

    if (lewatMasuk.length > 0) {
      const { data: tampil, dipotong } = potong(lewatMasuk)
      bagian.push(
        '',
        `LEWAT TEMPO — belum diterima (${lewatMasuk.length}, ${rupiah(jml(lewatMasuk, 'amount_due'))}):`,
        ...tampil.map(
          (b) => `· ${b.invoice_number ?? '-'}: ${rupiah(Number(b.amount_due) || 0)}` +
            ` (${Math.abs(hariLagi(b.due_date) ?? 0)} hari lewat)`,
        ),
        ...(dipotong > 0 ? [`  … dan ${dipotong} lagi.`] : []),
      )
    }

    if (lewatKeluar.length > 0) {
      const { data: tampil, dipotong } = potong(lewatKeluar)
      bagian.push(
        '',
        `LEWAT TEMPO — belum dibayar (${lewatKeluar.length}, ${rupiah(jml(lewatKeluar, 'amount_due'))}):`,
        ...tampil.map(
          (b) => `· ${b.invoice_number ?? '-'}: ${rupiah(Number(b.amount_due) || 0)}` +
            ` (${Math.abs(hariLagi(b.due_date) ?? 0)} hari lewat)`,
        ),
        ...(dipotong > 0 ? [`  … dan ${dipotong} lagi.`] : []),
      )
    }

    bagian.push(
      '',
      'Yang IKUT dihitung: saldo rekening aktif, invoice terbit, tagihan supplier.',
      'Yang TIDAK: proyek yang belum diteken, biaya rutin tak tercatat, dan kebiasaan',
      'klien telat bayar. Ini proyeksi dari dokumen yang ada — bukan ramalan.',
    )

    return {
      isi: bungkusData('proyeksi_arus_kas', bagian.join('\n')),
      isError: false,
      entitas: [],
    }
  },
}

/**
 * 8.3 — REKOMENDASI PRIORITAS BAYAR saat kas terbatas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MENGURUTKAN, BUKAN MEMUTUSKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang dilakukan tool ini: mengurutkan tagihan menurut seberapa lama ia sudah
 * lewat tempo, lalu menunjukkan sampai mana saldo menutupinya.
 *
 * Yang TIDAK dilakukan: memutuskan siapa yang dibayar. Urutan bayar menyentuh
 * hubungan dagang — supplier yang selalu dibayar terakhir akan menaikkan
 * harga atau berhenti mengirim, dan itu tak terbaca dari `due_date`.
 *
 * Karena itu keluarannya berupa urutan + batas kemampuan, dan kalimat
 * penutupnya menyerahkan keputusan ke manusia secara eksplisit.
 */
export const toolPrioritasBayar: DefinisiToolAi = {
  nama: 'prioritas_bayar',
  label: 'Prioritas pembayaran',
  keterangan:
    'Urutan tagihan supplier yang paling mendesak dibayar, dan sampai mana saldo kas ' +
    'menutupinya. Pakai untuk "kas terbatas, bayar siapa dulu", "tagihan mana yang paling ' +
    'mendesak". Tool ini MENGURUTKAN, tidak memutuskan — sampaikan bahwa keputusannya ' +
    'tetap di tangan pengguna.',
  izin: 'finance:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    const { data: kas } = await db
      .from('cash_accounts')
      .select('balance, is_active')
      .limit(100)

    const saldo = ((kas ?? []) as unknown as Array<{ balance: unknown; is_active: boolean | null }>)
      .filter((r) => r.is_active !== false)
      .reduce((s, r) => s + (Number(r.balance) || 0), 0)

    const { data, error } = await db
      .from('supplier_invoices')
      .select('invoice_number, amount_due, due_date, status, suppliers(name)')
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
      .limit(200)

    if (error) {
      return { isi: `Gagal membaca tagihan: ${error.message}`, isError: true, entitas: [] }
    }

    type B = {
      invoice_number: string | null; amount_due: unknown; due_date: string | null
      suppliers?: { name?: string } | null
    }
    const tagihan = ((data ?? []) as unknown as B[]).filter((b) => (Number(b.amount_due) || 0) > 0)

    if (tagihan.length === 0) {
      return {
        isi: bungkusData('prioritas_bayar', 'Tak ada tagihan supplier yang belum dibayar.'),
        isError: false,
        entitas: [],
      }
    }

    /*
     * Diurut TERLAMA LEWAT TEMPO dulu — bukan terbesar.
     *
     * Nominal besar yang belum jatuh tempo tak mendesak; nominal kecil yang
     * sudah 60 hari lewat adalah hubungan dagang yang sedang rusak.
     */
    const urut = [...tagihan].sort(
      (a, b) => (hariLagi(a.due_date) ?? 9999) - (hariLagi(b.due_date) ?? 9999),
    )

    let kumulatif = 0
    let tertutup = 0
    const baris: string[] = []

    for (const t of urut) {
      const n = Number(t.amount_due) || 0
      kumulatif += n
      const muat = kumulatif <= saldo
      if (muat) tertutup++

      const lewat = hariLagi(t.due_date)
      baris.push(
        `${muat ? '✓' : '·'} ${t.suppliers?.name ?? 'supplier'} — ` +
          `${t.invoice_number ?? '-'}: ${rupiah(n)}` +
          (lewat !== null && lewat < 0 ? ` (${Math.abs(lewat)} hari LEWAT)` : '') +
          (lewat !== null && lewat >= 0 ? ` (jatuh tempo ${lewat} hari lagi)` : ''),
      )
    }

    const total = tagihan.reduce((s, b) => s + (Number(b.amount_due) || 0), 0)
    const { data: tampil, dipotong } = potong(baris)

    return {
      isi: bungkusData(
        'prioritas_bayar',
        `Saldo kas ${rupiah(saldo)} · total tagihan ${rupiah(total)}.\n` +
          (total > saldo
            ? `Kas TIDAK menutup semuanya — kurang ${rupiah(total - saldo)}.\n`
            : 'Kas menutup seluruh tagihan.\n') +
          `Tanda ✓ = masih tertutup saldo kalau dibayar berurutan (${tertutup} dari ${urut.length}).\n\n` +
          tampil.join('\n') +
          '\n\nIni URUTAN menurut jatuh tempo, bukan keputusan. Hubungan dagang dan ' +
          'kesepakatan pembayaran tak terbaca dari tanggal — keputusannya tetap di ' +
          'tangan pengguna.',
        dipotong,
      ),
      isError: false,
      entitas: [],
    }
  },
}

export const TOOL_ARUS_KAS: DefinisiToolAi[] = [toolArusKas, toolPrioritasBayar]
