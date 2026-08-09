/**
 * DERET MODUL — data grafik untuk halaman ikhtisar yang belum punya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU ENDPOINT UNTUK EMPAT HALAMAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-09 terhadap ciri referensi (KPI · grafik · rail · kartu):
 *
 *   /keuangan /lapangan /gudang   4/4  ← sudah dikerjakan
 *   /kas /procurement             3/4  ← kurang grafik
 *   /proyek /kontrak /aset        2/4  ← kurang grafik
 *   /mandor                       2/4  ← kurang grafik DAN rail
 *
 * Yang paling sering hilang GRAFIK: cuma 3 dari 11 halaman ikhtisar punya,
 * sementara referensi BuildAxis selalu punya minimal satu per halaman.
 *
 * Empat modul membutuhkan bentuk data yang sama — deret waktu + komposisi —
 * hanya sumbernya berbeda. Membuat empat endpoint berarti empat tempat yang
 * harus diperbaiki setiap kali aturan tenancy berubah, dan empat tempat yang
 * bisa menyimpang cara menghitung bulannya.
 *
 * Jadi satu endpoint dengan parameter `modul`. Bukan penggabungan malas:
 * keempatnya benar-benar menjawab pertanyaan berbentuk sama ("bagaimana
 * angka ini bergerak, dan terdiri dari apa"), dan bentuk jawabannya identik
 * sehingga satu komponen grafik bisa melayani semuanya.
 *
 * ── Yang TIDAK dilakukan
 *
 * Tak ada modul yang bergantung `rab_items`. RAB di basis ini rusak (2 dari
 * 15 proyek, nilainya 5,5× kontrak — audit 2026-08-09), dan founder
 * memutuskan tak menyentuhnya. Grafik apa pun di atasnya akan rapi dan salah.
 *
 * ── Tenancy & galat: pola yang sama dengan `lapangan.ts`/`keuangan-ikhtisar.ts`
 */
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../plugins/auth.js'

const ALASAN =
  'deret grafik lintas-proyek milik company; disaring .in("project_id", idProyek) dari db.projectIds()'

const rp = (n: number): string => n.toFixed(2)

/** `YYYY-MM` dari nilai tanggal apa pun bentuknya. Null bila tak terbaca. */
function bulanDari(v: unknown): string | null {
  if (!v) return null
  const s = String(v)
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null
}

/**
 * Menyusun deret bulanan LENGKAP — bulan tanpa data diisi nol.
 *
 * Ini yang membedakan grafik yang bisa dibaca dari yang menyesatkan: tanpa
 * bulan kosong, dua titik yang berjauhan enam bulan digambar bersebelahan dan
 * garisnya terlihat mulus padahal ada jeda panjang.
 */
function deretPenuh(
  peta: Map<string, number>, jumlahBulan: number,
): Array<{ bulan: string; nilai: string }> {
  const keluar: Array<{ bulan: string; nilai: string }> = []
  const kini = new Date()
  for (let i = jumlahBulan - 1; i >= 0; i--) {
    const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    keluar.push({ bulan: k, nilai: rp(peta.get(k) ?? 0) })
  }
  return keluar
}

/** Hitung komposisi berdasar satu kolom, urut menurun. */
function komposisi(
  baris: Array<Record<string, unknown>>, kolom: string, nilaiKolom?: string,
): Array<{ nama: string; nilai: string; jumlah: number }> {
  const m = new Map<string, { nilai: number; jumlah: number }>()
  for (const b of baris) {
    const k = String(b[kolom] ?? 'lainnya')
    const s = m.get(k) ?? { nilai: 0, jumlah: 0 }
    s.nilai += nilaiKolom ? (Number(b[nilaiKolom]) || 0) : 1
    s.jumlah += 1
    m.set(k, s)
  }
  return [...m.entries()]
    .map(([nama, s]) => ({ nama, nilai: rp(s.nilai), jumlah: s.jumlah }))
    .sort((a, b) => Number(b.nilai) - Number(a.nilai))
}

const MODUL = ['proyek', 'kas', 'procurement', 'mandor'] as const
type Modul = (typeof MODUL)[number]

export default async function deretModulRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/deret/:modul
   *
   * Bentuk jawaban SELALU sama apa pun modulnya:
   *   { deret: [{bulan, nilai}], komposisi: [{nama, nilai, jumlah}],
   *     label_deret, label_komposisi, satuan }
   *
   * Keseragaman itu disengaja: satu komponen grafik di web melayani keempat
   * halaman, jadi menambah modul kelima kelak tak menyentuh UI sama sekali.
   */
  app.get<{ Params: { modul: string } }>('/api/v1/deret/:modul', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const modul = request.params.modul as Modul
    if (!MODUL.includes(modul)) {
      return reply.status(404).send({ error: `Modul tidak dikenal: ${modul}` })
    }

    const db = request.db!
    const BULAN = 12
    const sejak = new Date(Date.now() - 366 * 86_400_000).toISOString().slice(0, 10)
    const idProyek = await db.projectIds()

    const kosong = {
      deret: deretPenuh(new Map(), BULAN),
      komposisi: [],
      label_deret: '', label_komposisi: '', satuan: 'rupiah' as const,
    }
    if (idProyek.length === 0) return reply.send(kosong)

    // ── PROYEK: nilai kontrak per bulan mulai + komposisi status ──────────
    if (modul === 'proyek') {
      const r = await db.from('projects')
        .select('id, name, status, contract_value, start_date')
        .eq('is_deleted', false)
      if (r.error) throw r.error

      const baris = (r.data ?? []) as Array<Record<string, unknown>>
      const peta = new Map<string, number>()
      for (const p of baris) {
        const b = bulanDari(p.start_date)
        if (!b) continue
        peta.set(b, (peta.get(b) ?? 0) + (Number(p.contract_value) || 0))
      }
      return reply.send({
        deret: deretPenuh(peta, BULAN),
        komposisi: komposisi(baris, 'status', 'contract_value'),
        label_deret: 'Nilai kontrak proyek dimulai',
        label_komposisi: 'Nilai kontrak per status',
        satuan: 'rupiah',
      })
    }

    // ── KAS: pengeluaran per bulan + komposisi kategori ───────────────────
    if (modul === 'kas') {
      /*
        `project_expenses` KOSONG di basis ini (diukur: 0 baris), jadi
        sumbernya `kasbons` — uang yang benar-benar keluar ke lapangan.
        Memakai tabel kosong akan menghasilkan grafik datar nol yang terbaca
        sebagai "tak ada pengeluaran", bukan "belum dicatat di sini".
      */
      const r = await db.from('kasbons')
        .select('id, amount, purpose, status, kasbon_date')
        .in('status', ['approved', 'settled'])
      if (r.error) throw r.error

      const baris = (r.data ?? []) as Array<Record<string, unknown>>
      const peta = new Map<string, number>()
      for (const k of baris) {
        const b = bulanDari(k.kasbon_date)
        if (!b) continue
        peta.set(b, (peta.get(b) ?? 0) + (Number(k.amount) || 0))
      }
      return reply.send({
        deret: deretPenuh(peta, BULAN),
        komposisi: komposisi(baris, 'purpose', 'amount'),
        label_deret: 'Kasbon dicairkan per bulan',
        label_komposisi: 'Kasbon per tujuan',
        satuan: 'rupiah',
      })
    }

    // ── PROCUREMENT: nilai PO per bulan + komposisi status ────────────────
    if (modul === 'procurement') {
      const r = await db.unsafe('purchase_orders', ALASAN)
        .select('id, total_amount, status, order_date')
        .in('project_id', idProyek)
        .gte('order_date', sejak)
      if (r.error) throw r.error

      const baris = (r.data ?? []) as Array<Record<string, unknown>>
      const peta = new Map<string, number>()
      for (const po of baris) {
        const b = bulanDari(po.order_date)
        if (!b) continue
        peta.set(b, (peta.get(b) ?? 0) + (Number(po.total_amount) || 0))
      }
      return reply.send({
        deret: deretPenuh(peta, BULAN),
        komposisi: komposisi(baris, 'status', 'total_amount'),
        label_deret: 'Nilai pesanan pembelian per bulan',
        label_komposisi: 'Nilai PO per status',
        satuan: 'rupiah',
      })
    }

    // ── MANDOR: upah dibayar per bulan + komposisi status laporan ─────────
    const idScope = await db.workScopeIds()
    if (idScope.length === 0) return reply.send(kosong)

    /*
      ⚠️ Kolomnya `scope_id` dan `net_amount` — BUKAN `work_scope_id`/
      `total_amount`. Diperiksa ke schema sebelum menulis, dan tebakan awal
      saya salah pada keduanya.

      `net_amount` (bukan `subtotal`) memang yang benar: itu upah bersih
      sesudah potongan, yaitu uang yang benar-benar keluar. Menggambar
      `subtotal` akan menunjukkan angka lebih besar daripada yang dibayar.
    */
    const r = await db.unsafe('weekly_wage_reports', ALASAN)
      .select('id, net_amount, status, week_start')
      .in('scope_id', idScope)
    if (r.error) throw r.error

    const baris = (r.data ?? []) as Array<Record<string, unknown>>
    const peta = new Map<string, number>()
    for (const w of baris) {
      const b = bulanDari(w.week_start)
      if (!b) continue
      peta.set(b, (peta.get(b) ?? 0) + (Number(w.net_amount) || 0))
    }
    return reply.send({
      deret: deretPenuh(peta, BULAN),
      komposisi: komposisi(baris, 'status', 'net_amount'),
      label_deret: 'Upah mandor per bulan',
      label_komposisi: 'Upah per status laporan',
      satuan: 'rupiah',
    })
  })
}
