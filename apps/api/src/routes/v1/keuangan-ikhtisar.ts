/**
 * KEUANGAN — ikhtisar LINTAS-PROYEK untuk dashboard modul.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU HAL YANG SENGAJA TIDAK DIPAKAI: RAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi BuildAxis "Cost Reports & Analytics" membangun hampir seluruh
 * layarnya di atas anggaran: "Total Project Cost", "Budget Spent", "Remaining
 * Budget", donat Cost Breakdown, dan garis Budget vs Actual.
 *
 * Kita TIDAK bisa menirunya dari RAB, dan itu keputusan berdasar pengukuran —
 * bukan kemalasan. Diaudit 2026-08-09:
 *
 *   RAB ada di           2 dari 15 proyek
 *   nilainya             5,5x nilai kontraknya sendiri
 *                        (kontrak Rp 285jt vs RAB Rp 1,58 M — impor dari
 *                         proyek lain yang tak pernah dibersihkan)
 *   total_price          banyak NULL
 *   menjumlah semua level = HITUNG GANDA (induk + anak): 11,4 M vs 5,2 M daun
 *
 * Menggambar donat anggaran di atas data itu menghasilkan grafik yang rapi
 * dan salah — jenis kebohongan paling berbahaya karena terlihat meyakinkan.
 *
 * Founder memutuskan (2026-08-09): **RAB jangan disentuh**, dashboard dibangun
 * dari data yang sudah sehat. Jadi setiap angka di endpoint ini berasal dari
 * invoice, pembayaran, nilai kontrak, dan kasbon — empat sumber yang barisnya
 * lengkap dan konsisten.
 *
 * ── Penggantinya, dan kenapa ia menjawab pertanyaan yang sama
 *
 *   REFERENSI                     DI SINI
 *   Cost Breakdown (donat)   →    kasbon per TUJUAN (upah · alat · makan ·
 *                                 operasional). Ini memang komposisi uang
 *                                 keluar yang nyata di lapangan.
 *   Budget vs Actual (garis) →    TAGIHAN vs PEMBAYARAN per bulan. Bukan
 *                                 rencana-vs-realisasi, melainkan
 *                                 janji-vs-uang-masuk — pertanyaan yang
 *                                 justru lebih mendesak bagi kontraktor.
 *   Total/Spent/Remaining    →    nilai kontrak · tertagih · terbayar · sisa
 *
 * Nama fieldnya sengaja TIDAK memakai kata "budget"/"anggaran". Kalau kelak
 * RAB dibereskan dan grafik anggaran sungguhan dibangun, keduanya harus bisa
 * hidup berdampingan tanpa ada yang mengira sudah tergantikan.
 *
 * ── Tenancy & galat: pola yang sama dengan `lapangan.ts`
 *
 * Tabel kategori C lewat `db.unsafe(tabel, ALASAN)` + `.in('project_id', …)`.
 * Galat diperiksa `if (x.error)` eksplisit satu per satu — `audit-kegagalan-
 * senyap.mjs` membacanya statis dan buta terhadap loop.
 *
 * ── Uang tetap `numeric`
 *
 * Nominal dijumlahkan sebagai Number di sini karena Postgres mengirimnya
 * sebagai string dan agregasi di JS memang butuh angka. Yang TIDAK dilakukan:
 * mengirimnya kembali sebagai float mentah. Semua nominal keluar sebagai
 * string lewat `.toFixed(2)` — presisi rupiah utuh, dan klien tak pernah
 * menerima 0.1+0.2 (§5.4).
 */
import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'

const ALASAN =
  'ikhtisar keuangan lintas-proyek milik company; seluruh query disaring .in("project_id", idProyek) dari db.projectIds()'

/** Jumlahkan kolom numeric yang datang sebagai string, aman terhadap null. */
function jumlah(baris: Array<Record<string, unknown>>, kolom: string): number {
  let n = 0
  for (const b of baris) {
    const v = Number(b[kolom])
    if (Number.isFinite(v)) n += v
  }
  return n
}

/** Rupiah keluar sebagai STRING — jangan pernah kirim float mentah (§5.4). */
const rp = (n: number): string => n.toFixed(2)

/** Label tujuan kasbon → kata yang dibaca orang, bukan kunci enum. */
const LABEL_TUJUAN: Record<string, string> = {
  gaji_tukang: 'Upah tukang',
  uang_makan: 'Uang makan',
  pembelian_alat: 'Pembelian alat',
  operasional: 'Operasional',
  lain_lain: 'Lain-lain',
}

export default async function keuanganIkhtisarRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/keuangan/ikhtisar
   *
   * Satu permintaan untuk seluruh dashboard modul Keuangan.
   */
  app.get('/api/v1/keuangan/ikhtisar', {
    /*
      `finance:view:all`, BUKAN `finance:view`.

      Keduanya ada di tabel permissions — diperiksa, bukan ditebak (pelajaran
      dari `projects:read` yang saya karang di endpoint lapangan dan berujung
      403). Yang membedakan: akhiran `:all` berarti LINTAS-PROYEK, dan itu
      persis yang endpoint ini kerjakan. `finance:view` dipegang orang yang
      hanya boleh melihat keuangan proyek yang ditugaskan kepadanya.

      Memberi endpoint ini `finance:view` berarti membuka angka seluruh
      portofolio kepada peran yang sengaja dibatasi per-proyek — kebocoran
      yang tak akan terlihat sampai ada yang memeriksa daftar perannya.
    */
    preHandler: [authenticate, requirePermission('finance:view:all')],
  }, async (request, reply) => {
    const db = request.db!
    const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

    // 12 bulan: cukup untuk melihat musim (proyek konstruksi punya siklus
    // hujan/kemarau), dan tak terlalu panjang sampai sumbu grafiknya padat.
    const sejak = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

    const idProyek = await db.projectIds()

    if (idProyek.length === 0) {
      return reply.send({
        kpi: {
          nilai_kontrak: '0.00', tertagih: '0.00', terbayar: '0.00',
          piutang: '0.00', kasbon_beredar: '0.00',
          invoice_lewat_tempo: 0, proyek_aktif: 0,
        },
        bulanan: [], komposisi_kasbon: [], umur_piutang: [],
        per_proyek: [], invoice_tertunggak: [],
      })
    }

    const [proyek, invoice, bayar, kasbon] = await Promise.all([
      db.from('projects')
        .select('id, name, status, contract_value, progress_pct, end_date')
        .eq('is_deleted', false),

      db.unsafe('invoices', ALASAN)
        .select('id, project_id, invoice_number, invoice_type, total_amount, amount_paid, amount_due, issued_date, due_date, status')
        .neq('status', 'cancelled')
        .in('project_id', idProyek),

      /*
        `payments` TIDAK punya `project_id` — ia tergantung invoice. Jadi
        saringan tenant-nya lewat `invoice_id`, bukan project.

        Kolomnya `amount_paid` dan `paid_at`, BUKAN `amount`/`payment_date`.
        Percobaan pertama audit saya memakai `amount` dan langsung ditolak
        Postgres — nama kolom di repo ini tak bisa ditebak dari tabel
        tetangga.
      */
      db.unsafe('payments', ALASAN)
        .select('id, invoice_id, amount_paid, paid_at')
        .gte('paid_at', sejak),

      // Kategori B — punya company_id sendiri, `db.from()` sudah cukup.
      db.from('kasbons').select('id, project_id, amount, purpose, status, kasbon_date'),
    ])

    if (proyek.error) throw proyek.error
    if (invoice.error) throw invoice.error
    if (bayar.error) throw bayar.error
    if (kasbon.error) throw kasbon.error

    const barisProyek = (proyek.data ?? []) as Array<Record<string, unknown>>
    const barisInvoice = (invoice.data ?? []) as Array<Record<string, unknown>>
    const barisKasbon = (kasbon.data ?? []) as Array<Record<string, unknown>>

    /*
      Pembayaran disaring ULANG di sini terhadap invoice milik company.

      `payments` tak punya project_id, jadi query di atas tak bisa menyaring
      tenant sendirian — `.gte('paid_at', …)` saja akan menarik pembayaran
      SELURUH company. Saringan sebenarnya terjadi di baris ini, dan itulah
      sebabnya ia tak boleh dihapus sebagai "optimasi".
    */
    const idInvoice = new Set(barisInvoice.map((i) => String(i.id)))
    const barisBayar = ((bayar.data ?? []) as Array<Record<string, unknown>>)
      .filter((p) => idInvoice.has(String(p.invoice_id)))

    const aktif = barisProyek.filter((p) => p.status === 'active')

    // ── Bulanan: tagihan vs pembayaran ───────────────────────────────────
    const perBulan = new Map<string, { tagih: number; bayar: number }>()
    const catat = (kunci: string, medan: 'tagih' | 'bayar', nilai: number) => {
      const s = perBulan.get(kunci) ?? { tagih: 0, bayar: 0 }
      s[medan] += nilai
      perBulan.set(kunci, s)
    }
    for (const i of barisInvoice) {
      const t = i.issued_date ? String(i.issued_date).slice(0, 7) : null
      if (t && t >= sejak.slice(0, 7)) catat(t, 'tagih', Number(i.total_amount) || 0)
    }
    for (const p of barisBayar) {
      const t = p.paid_at ? String(p.paid_at).slice(0, 7) : null
      if (t) catat(t, 'bayar', Number(p.amount_paid) || 0)
    }
    const bulanan = [...perBulan.entries()]
      .map(([bulan, s]) => ({ bulan, tagih: rp(s.tagih), bayar: rp(s.bayar) }))
      .sort((a, b) => a.bulan.localeCompare(b.bulan))

    // ── Komposisi kasbon: pengganti donat "Cost Breakdown" ───────────────
    //
    // Hanya yang BEREDAR (approved, belum settled) + yang sudah settled —
    // keduanya uang yang benar-benar keluar. `pending` dikecualikan: ia belum
    // disetujui, jadi memasukkannya berarti menghitung uang yang mungkin tak
    // pernah keluar.
    const kasbonNyata = barisKasbon.filter(
      (k) => k.status === 'approved' || k.status === 'settled')
    const perTujuan = new Map<string, { nilai: number; n: number }>()
    for (const k of kasbonNyata) {
      const key = String(k.purpose ?? 'lain_lain')
      const s = perTujuan.get(key) ?? { nilai: 0, n: 0 }
      s.nilai += Number(k.amount) || 0
      s.n += 1
      perTujuan.set(key, s)
    }
    const komposisiKasbon = [...perTujuan.entries()]
      .map(([kunci, s]) => ({
        kunci, nama: LABEL_TUJUAN[kunci] ?? kunci.replace(/_/g, ' '),
        nilai: rp(s.nilai), jumlah: s.n,
      }))
      .sort((a, b) => Number(b.nilai) - Number(a.nilai))

    // ── Umur piutang ─────────────────────────────────────────────────────
    const EMBER = [
      { nama: 'Belum jatuh tempo', uji: (h: number) => h < 0 },
      { nama: '1–30 hari', uji: (h: number) => h >= 0 && h <= 30 },
      { nama: '31–60 hari', uji: (h: number) => h > 30 && h <= 60 },
      { nama: '60+ hari', uji: (h: number) => h > 60 },
    ]
    const umur = EMBER.map((e) => ({ nama: e.nama, nilai: 0, jumlah: 0 }))
    const belumLunas = barisInvoice.filter((i) => (Number(i.amount_due) || 0) > 0)
    for (const i of belumLunas) {
      if (!i.due_date) continue
      const lewat = Math.floor(
        (Date.parse(hariIni) - Date.parse(String(i.due_date).slice(0, 10))) / 86_400_000)
      const idx = EMBER.findIndex((e) => e.uji(lewat))
      if (idx >= 0) {
        umur[idx].nilai += Number(i.amount_due) || 0
        umur[idx].jumlah += 1
      }
    }
    const umurPiutang = umur.map((u) => ({ ...u, nilai: rp(u.nilai) }))

    // ── Per proyek ───────────────────────────────────────────────────────
    const invoicePerProyek = new Map<string, { tagih: number; bayar: number; sisa: number }>()
    for (const i of barisInvoice) {
      const k = String(i.project_id)
      const s = invoicePerProyek.get(k) ?? { tagih: 0, bayar: 0, sisa: 0 }
      s.tagih += Number(i.total_amount) || 0
      s.bayar += Number(i.amount_paid) || 0
      s.sisa += Number(i.amount_due) || 0
      invoicePerProyek.set(k, s)
    }

    const perProyek = barisProyek
      .filter((p) => p.status !== 'cancelled')
      .map((p) => {
        const s = invoicePerProyek.get(String(p.id)) ?? { tagih: 0, bayar: 0, sisa: 0 }
        const kontrak = Number(p.contract_value) || 0
        return {
          id: String(p.id),
          nama: String(p.name),
          status: String(p.status),
          kontrak: rp(kontrak),
          tertagih: rp(s.tagih),
          terbayar: rp(s.bayar),
          piutang: rp(s.sisa),
          /*
            Persen tertagih terhadap NILAI KONTRAK — bukan terhadap RAB.
            Nol-per-nol dijaga: proyek tanpa nilai kontrak (draft) akan
            menghasilkan NaN, dan "NaN%" di tabel keuangan adalah cacat yang
            langsung terlihat pemakai pertama.
          */
          pct_tertagih: kontrak > 0 ? Math.round((s.tagih / kontrak) * 100) : 0,
          progres: Number(p.progress_pct) || 0,
        }
      })
      .sort((a, b) => Number(b.piutang) - Number(a.piutang))

    // ── Invoice tertunggak, paling lama di atas ──────────────────────────
    const namaProyek = new Map(barisProyek.map((p) => [String(p.id), String(p.name)]))
    const tertunggak = belumLunas
      .filter((i) => i.due_date && String(i.due_date).slice(0, 10) < hariIni)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
      .slice(0, 8)
      .map((i) => ({
        id: String(i.id),
        nomor: String(i.invoice_number),
        proyek: namaProyek.get(String(i.project_id)) ?? null,
        jatuh_tempo: String(i.due_date).slice(0, 10),
        hari_lewat: Math.floor(
          (Date.parse(hariIni) - Date.parse(String(i.due_date).slice(0, 10))) / 86_400_000),
        sisa: rp(Number(i.amount_due) || 0),
      }))

    return reply.send({
      kpi: {
        nilai_kontrak: rp(jumlah(barisProyek, 'contract_value')),
        tertagih: rp(jumlah(barisInvoice, 'total_amount')),
        terbayar: rp(jumlah(barisInvoice, 'amount_paid')),
        piutang: rp(jumlah(barisInvoice, 'amount_due')),
        kasbon_beredar: rp(jumlah(
          barisKasbon.filter((k) => k.status === 'approved'), 'amount')),
        invoice_lewat_tempo: tertunggak.length,
        proyek_aktif: aktif.length,
      },
      bulanan,
      komposisi_kasbon: komposisiKasbon,
      umur_piutang: umurPiutang,
      per_proyek: perProyek,
      invoice_tertunggak: tertunggak,
    })
  })
}
