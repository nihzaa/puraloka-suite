/**
 * TOOL KONSTRUKSI — perluasan katalog asisten (S5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA 9 TAMBAHAN, BUKAN 33
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-10: TJS punya 38 tool, Puraloka 5. Terukur, dan benar.
 *
 * Tapi dari 31 tool BACA milik TJS, sebagian besar milik dunia dagang dan
 * manufaktur yang tak punya padanan di sini: `list_sales_orders`,
 * `list_rma_cases`, `list_delivery_orders`, `list_payroll`,
 * `list_commissions`, `get_investor_kpi`.
 *
 * Menirunya berarti membuat tool yang membaca tabel yang TIDAK ADA — dan tool
 * yang selalu menjawab "tak ada data" lebih buruk daripada tak ada tool sama
 * sekali: model tetap memanggilnya, tetap membakar satu ronde, dan jawabannya
 * jadi lebih lambat tanpa jadi lebih benar.
 *
 * Yang ditambahkan hanya yang tabelnya BERISI. Diukur 2026-08-10:
 *
 *   invoices 26 · kasbons 56 · milestones 39 · progress_logs 271
 *   punch_items 40 · absensi_harian 1.279 · purchase_orders 8
 *   change_orders 2 · suppliers 5
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KATEGORI C: MODEL TAK PERNAH MENYEBUT project_id
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebagian besar tabel di atas kategori C — tenancy-nya lewat `project_id`,
 * bukan `company_id`.
 *
 * Godaannya: minta model mengirim `project_id` sebagai argumen tool. Itu
 * ditolak, dan alasannya bukan kerapian: model AKAN mengarangnya. UUID
 * karangan yang kebetulan cocok dengan proyek tenant lain adalah pintu ke
 * data mereka — dan hasilnya tetap terlihat masuk akal, jadi tak ada yang
 * melaporkannya.
 *
 * Semua tool di sini memakai `idProyek()`: daftar proyek milik tenant,
 * diresolusi DI DALAM tool lewat `db.from('projects')` yang sadar tenant.
 * Penyaringan per-proyek dilakukan lewat NAMA yang dicocokkan ke daftar itu.
 */

import type { DefinisiToolAi, KonteksTool } from './ai-tool-dasar.js'
import { angka, bungkusData, potong, rupiah } from './ai-tool-dasar.js'

/**
 * Id proyek milik tenant, opsional disaring nama yang diketik model.
 *
 * Pencocokan dilakukan DI APLIKASI, bukan lewat `.ilike()`: nama proyek yang
 * model karang bisa memuat karakter yang jadi wildcard PostgREST, dan teks
 * yang model karang tak boleh menyusun sintaks filter.
 */
async function idProyek(
  db: KonteksTool['db'],
  cariNama?: unknown,
): Promise<{ ids: string[]; nama: Map<string, string> }> {
  const { data } = await db.from('projects').select('id, name')
  const semua = (data ?? []) as unknown as Array<{ id: string; name: string }>
  const nama = new Map(semua.map((p) => [p.id, p.name]))

  const cari = typeof cariNama === 'string' ? cariNama.trim().toLowerCase() : ''
  if (!cari) return { ids: semua.map((p) => p.id), nama }

  const cocok = semua.filter((p) => (p.name ?? '').toLowerCase().includes(cari))
  return { ids: cocok.map((p) => p.id), nama }
}

const argProyek = {
  proyek: {
    type: 'string',
    description: 'Nama proyek (sebagian nama boleh). Kosongkan untuk SEMUA proyek perusahaan.',
  },
}

/** Umur hari dari sebuah tanggal; negatif berarti belum lewat. */
function umurHari(tanggal: string | null): number | null {
  if (!tanggal) return null
  return Math.floor((Date.now() - new Date(tanggal).getTime()) / 86_400_000)
}

export const toolInvoiceBelumLunas: DefinisiToolAi = {
  nama: 'invoice_belum_lunas',
  label: 'Invoice belum lunas',
  keterangan:
    'Invoice yang belum lunas beserta umur tunggakannya. Pakai untuk pertanyaan piutang, ' +
    'tagihan lewat tempo, dan uang yang seharusnya sudah masuk.',
  izin: 'finance:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('invoice', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('invoices', 'tool AI: invoice lintas proyek milik tenant, disaring project_id')
      .select('invoice_number, project_id, total_amount, amount_paid, status, due_date')
      .in('project_id', ids)
      .neq('status', 'paid')
      .order('due_date')

    if (error) return { isi: `Gagal membaca invoice: ${error.message}`, isError: true, entitas: [] }

    type B = {
      invoice_number: string
      project_id: string
      total_amount: unknown
      amount_paid: unknown
      status: string
      due_date: string | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('invoice', 'Semua invoice sudah lunas.'), isError: false, entitas: [] }
    }

    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map((b) => {
      const sisa = angka(b.total_amount) - angka(b.amount_paid)
      const lewat = umurHari(b.due_date)
      const tanda = lewat !== null && lewat > 0 ? ` — LEWAT ${lewat} hari` : ''
      return `${b.invoice_number} (${nama.get(b.project_id) ?? '?'}): sisa ${rupiah(sisa)}, ${b.status}${tanda}`
    })

    const total = baris.reduce((n, b) => n + (angka(b.total_amount) - angka(b.amount_paid)), 0)
    return {
      isi: bungkusData(
        'invoice_belum_lunas',
        `Total belum tertagih: ${rupiah(total)} dari ${baris.length} invoice.\n\n${teks.join('\n')}`,
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.invoice_number),
    }
  },
}

export const toolKasbon: DefinisiToolAi = {
  nama: 'kasbon',
  label: 'Kasbon mandor',
  keterangan:
    'Kasbon mandor: menunggu persetujuan, disetujui, atau belum dipertanggungjawabkan. ' +
    'Pakai untuk pertanyaan uang muka kerja dan pertanggungjawaban mandor.',
  izin: 'cash:view',
  skema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        // enum DINYATAKAN, bukan hanya dijelaskan — pelajaran dari
        // `daftar_proyek`: model membaca nama field lebih dulu dan mengarang
        // nilai yang "masuk akal", lalu Postgres menolaknya dan satu ronde
        // terbuang.
        enum: ['pending', 'approved', 'rejected', 'settled'],
        description: 'Saring status. Kosongkan untuk semua.',
      },
    },
  },
  async jalan({ db }, argumen) {
    let q = db.from('kasbons').select('amount, status, purpose, kasbon_date')
    const status = typeof argumen.status === 'string' ? argumen.status.trim() : ''
    if (status) q = q.eq('status', status)

    const { data, error } = await q.order('kasbon_date', { ascending: false })
    if (error) return { isi: `Gagal membaca kasbon: ${error.message}`, isError: true, entitas: [] }

    type B = { amount: unknown; status: string; purpose: string | null; kasbon_date: string | null }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('kasbon', 'Tidak ada kasbon yang cocok.'), isError: false, entitas: [] }
    }

    const total = baris.reduce((n, b) => n + angka(b.amount), 0)
    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map(
      (b) => `${rupiah(angka(b.amount))} — ${b.status}${b.purpose ? ` · ${b.purpose}` : ''}`,
    )
    return {
      isi: bungkusData(
        'kasbon',
        `${baris.length} kasbon, total ${rupiah(total)}.\n\n${teks.join('\n')}`,
        dipotong,
      ),
      isError: false,
      entitas: [],
    }
  },
}

export const toolMilestone: DefinisiToolAi = {
  nama: 'milestone',
  label: 'Milestone proyek',
  keterangan:
    'Milestone proyek beserta tenggat dan keterlambatannya. Pakai untuk pertanyaan jadwal, ' +
    'tenggat, dan pekerjaan yang meleset dari janji ke klien.',
  izin: 'projects:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('milestone', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('milestones', 'tool AI: milestone lintas proyek milik tenant, disaring project_id')
      .select('title, project_id, target_date, completed_at, status')
      .in('project_id', ids)
      .order('target_date')

    if (error) return { isi: `Gagal membaca milestone: ${error.message}`, isError: true, entitas: [] }

    type B = {
      title: string
      project_id: string
      target_date: string | null
      completed_at: string | null
      status: string | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('milestone', 'Belum ada milestone.'), isError: false, entitas: [] }
    }

    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map((b) => {
      const telat = b.completed_at ? null : umurHari(b.target_date)
      const tanda = telat !== null && telat > 0 ? ` — TERLAMBAT ${telat} hari` : ''
      const selesai = b.completed_at ? ' (selesai)' : ''
      return `${b.title} (${nama.get(b.project_id) ?? '?'}): target ${b.target_date ?? '—'}${selesai}${tanda}`
    })

    return {
      isi: bungkusData('milestone', teks.join('\n'), dipotong),
      isError: false,
      entitas: tampil.map((b) => b.title),
    }
  },
}

export const toolProgresLapangan: DefinisiToolAi = {
  nama: 'progres_lapangan',
  label: 'Progres lapangan',
  keterangan:
    'Progres fisik terakhir dari lapangan. Pakai untuk pertanyaan "sudah berapa persen", ' +
    'kemajuan pekerjaan, dan kabar terbaru dari proyek.',
  izin: 'projects:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('progres', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('progress_logs', 'tool AI: progres lintas proyek milik tenant, disaring project_id')
      .select('project_id, pct_overall, logged_at, notes')
      .in('project_id', ids)
      .order('logged_at', { ascending: false })

    if (error) return { isi: `Gagal membaca progres: ${error.message}`, isError: true, entitas: [] }

    type B = { project_id: string; pct_overall: unknown; logged_at: string; notes: string | null }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('progres', 'Belum ada laporan progres.'), isError: false, entitas: [] }
    }

    /*
     * Satu baris TERAKHIR per proyek — bukan 271 baris riwayat.
     *
     * Pertanyaan "sudah berapa persen" dijawab keadaan SEKARANG. Mengirim
     * seluruh sejarah melampaui jendela konteks, dan yang gagal bukan tool
     * ini melainkan panggilan berikutnya.
     */
    const terakhir = new Map<string, B>()
    for (const b of baris) if (!terakhir.has(b.project_id)) terakhir.set(b.project_id, b)

    const { data: tampil, dipotong } = potong([...terakhir.values()])
    const teks = tampil.map(
      (b) =>
        `${nama.get(b.project_id) ?? '?'}: ${angka(b.pct_overall)}% per ${(b.logged_at ?? '').slice(0, 10)}` +
        `${b.notes ? ` — ${b.notes.slice(0, 120)}` : ''}`,
    )
    return {
      isi: bungkusData('progres_lapangan', teks.join('\n'), dipotong),
      isError: false,
      entitas: tampil.map((b) => nama.get(b.project_id) ?? b.project_id),
    }
  },
}

export const toolPunchItem: DefinisiToolAi = {
  nama: 'punch_item',
  label: 'Daftar perbaikan (punch list)',
  keterangan:
    'Punch list — temuan pekerjaan yang harus diperbaiki. Pakai untuk pertanyaan cacat mutu, ' +
    'perbaikan tertunda, dan kesiapan serah terima.',
  izin: 'projects:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('punch', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('punch_items', 'tool AI: punch item lintas proyek milik tenant, disaring project_id')
      .select('judul, project_id, status, severity, target_selesai')
      .in('project_id', ids)
      .order('target_selesai')

    if (error) return { isi: `Gagal membaca punch item: ${error.message}`, isError: true, entitas: [] }

    type B = {
      judul: string
      project_id: string
      status: string | null
      severity: string | null
      target_selesai: string | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('punch', 'Tidak ada punch item.'), isError: false, entitas: [] }
    }

    // Yang BELUM selesai didahulukan: itu yang menuntut tindakan. Kalau semua
    // sudah selesai, daftar penuh tetap ditampilkan supaya jawabannya bukan
    // "tidak ada" yang menyesatkan.
    const belum = baris.filter((b) => b.status !== 'closed' && b.status !== 'selesai')
    const { data: tampil, dipotong } = potong(belum.length > 0 ? belum : baris)
    const teks = tampil.map(
      (b) =>
        `${b.judul} (${nama.get(b.project_id) ?? '?'}): ${b.status ?? '—'}` +
        `${b.severity ? ` · ${b.severity}` : ''}${b.target_selesai ? ` · tenggat ${b.target_selesai}` : ''}`,
    )
    return {
      isi: bungkusData(
        'punch_item',
        `${belum.length} belum selesai dari ${baris.length} total.\n\n${teks.join('\n')}`,
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.judul),
    }
  },
}

export const toolPurchaseOrder: DefinisiToolAi = {
  nama: 'purchase_order',
  label: 'Purchase order',
  keterangan:
    'Purchase order ke pemasok beserta statusnya. Pakai untuk pertanyaan pembelian, ' +
    'pesanan material, dan komitmen ke vendor.',
  izin: 'procurement:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('po', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('purchase_orders', 'tool AI: PO lintas proyek milik tenant, disaring project_id')
      .select('po_number, project_id, status, total_amount, order_date')
      .in('project_id', ids)
      .order('order_date', { ascending: false })

    if (error) return { isi: `Gagal membaca PO: ${error.message}`, isError: true, entitas: [] }

    type B = {
      po_number: string
      project_id: string
      status: string | null
      total_amount: unknown
      order_date: string | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('po', 'Belum ada purchase order.'), isError: false, entitas: [] }
    }

    const total = baris.reduce((n, b) => n + angka(b.total_amount), 0)
    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map(
      (b) =>
        `${b.po_number} (${nama.get(b.project_id) ?? '?'}): ${rupiah(angka(b.total_amount))}` +
        ` · ${b.status ?? '—'}${b.order_date ? ` · ${b.order_date}` : ''}`,
    )
    return {
      isi: bungkusData(
        'purchase_order',
        `${baris.length} PO, total ${rupiah(total)}.\n\n${teks.join('\n')}`,
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.po_number),
    }
  },
}

export const toolChangeOrder: DefinisiToolAi = {
  nama: 'change_order',
  label: 'Change order',
  keterangan:
    'Change order — perubahan lingkup yang mengubah nilai kontrak. Pakai untuk pertanyaan ' +
    'pekerjaan tambah-kurang dan perubahan nilai kontrak.',
  izin: 'projects:view',
  skema: { type: 'object', properties: { ...argProyek } },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)
    if (ids.length === 0) {
      return { isi: bungkusData('co', 'Tak ada proyek yang cocok.'), isError: false, entitas: [] }
    }

    const { data, error } = await db
      .unsafe('change_orders', 'tool AI: CO lintas proyek milik tenant, disaring project_id')
      .select('co_number, project_id, status, total_amount_delta, title')
      .in('project_id', ids)

    if (error) return { isi: `Gagal membaca change order: ${error.message}`, isError: true, entitas: [] }

    type B = {
      co_number: string | null
      project_id: string
      status: string | null
      total_amount_delta: unknown
      title: string | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('co', 'Belum ada change order.'), isError: false, entitas: [] }
    }

    const delta = baris.reduce((n, b) => n + angka(b.total_amount_delta), 0)
    const { data: tampil, dipotong } = potong(baris)
    const teks = tampil.map(
      (b) =>
        `${b.co_number ?? '(tanpa nomor)'} (${nama.get(b.project_id) ?? '?'}): ` +
        `${rupiah(angka(b.total_amount_delta))} · ${b.status ?? '—'}` +
        `${b.title ? ` — ${b.title}` : ''}`,
    )
    return {
      isi: bungkusData(
        'change_order',
        `${baris.length} CO, dampak bersih ${rupiah(delta)}.\n\n${teks.join('\n')}`,
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.co_number ?? '(tanpa nomor)'),
    }
  },
}

export const toolPemasok: DefinisiToolAi = {
  nama: 'pemasok',
  label: 'Pemasok',
  keterangan: 'Daftar pemasok/vendor terdaftar. Pakai untuk pertanyaan siapa vendornya.',
  izin: 'procurement:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    const { data, error } = await db
      .from('suppliers')
      .select('name, contact_person, is_active')

    if (error) return { isi: `Gagal membaca pemasok: ${error.message}`, isError: true, entitas: [] }

    type B = { name: string; contact_person: string | null; is_active: boolean | null }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('pemasok', 'Belum ada pemasok terdaftar.'), isError: false, entitas: [] }
    }

    const { data: tampil, dipotong } = potong(baris)
    return {
      isi: bungkusData(
        'pemasok',
        tampil
          .map(
            (b) =>
              `${b.name}${b.contact_person ? ` · ${b.contact_person}` : ''}` +
              `${b.is_active === false ? ' (nonaktif)' : ''}`,
          )
          .join('\n'),
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.name),
    }
  },
}

export const toolKlien: DefinisiToolAi = {
  nama: 'klien',
  label: 'Klien',
  keterangan: 'Daftar klien beserta kontaknya. Pakai untuk pertanyaan siapa pemilik proyek.',
  izin: 'clients:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    const { data, error } = await db
      .from('clients')
      .select('contact_person, phone, client_type, is_active')

    if (error) return { isi: `Gagal membaca klien: ${error.message}`, isError: true, entitas: [] }

    type B = {
      contact_person: string
      phone: string | null
      client_type: string | null
      is_active: boolean | null
    }
    const baris = (data ?? []) as unknown as B[]
    if (baris.length === 0) {
      return { isi: bungkusData('klien', 'Belum ada klien terdaftar.'), isError: false, entitas: [] }
    }

    const { data: tampil, dipotong } = potong(baris)
    return {
      isi: bungkusData(
        'klien',
        // Nomor telepon SENGAJA tak ikut: jawaban asisten bisa sampai ke
        // WhatsApp dan tersimpan di riwayat chat di luar kendali kita. Yang
        // butuh nomornya membukanya di aplikasi, tempat haknya diperiksa.
        tampil
          .map(
            (b) =>
              `${b.contact_person}${b.client_type ? ` · ${b.client_type}` : ''}` +
              `${b.is_active === false ? ' (nonaktif)' : ''}`,
          )
          .join('\n'),
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.contact_person),
    }
  },
}

/**
 * MEMINTA GRAFIK — tool yang tak menggambar apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TOOL INI HANYA MEMILIH PROYEK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Perenderan terjadi DI LUAR katalog tool, sama seperti penulisan (I-1). Yang
 * dikembalikan tool ini cuma id proyek yang sudah diresolusi dan diverifikasi
 * milik tenant — pemanggilnya (`wa-webhook.ts` / `ai-chat.ts`) yang memutuskan
 * mengirim gambar.
 *
 * Alasannya sama dengan `siapkan_tulis`: tool berjalan di dalam loop model,
 * dan apa pun yang ia hasilkan masuk kembali ke prompt. Mengembalikan PNG
 * base64 ke dalam percakapan berarti membakar puluhan ribu token untuk gambar
 * yang tak bisa "dibaca" model — dan biayanya ditanggung tiap ronde
 * berikutnya, karena riwayat dikirim ulang.
 *
 * ── Ambiguitas DINYATAKAN, bukan ditebak
 *
 * Grafik proyek yang salah lebih berbahaya daripada tak ada grafik: ia
 * terlihat resmi, dan yang membacanya tak punya alasan curiga.
 */
export const toolGrafik: DefinisiToolAi = {
  nama: 'grafik_kurva_s',
  label: 'Grafik kurva S',
  keterangan:
    'Menyiapkan GRAFIK kurva S (rencana vs realisasi) satu proyek. Pakai untuk permintaan ' +
    'grafik, kurva, chart, atau "kirim gambarnya". Tool ini tidak menggambar — sistem yang ' +
    'mengirim gambarnya setelah Anda menyebut proyeknya. Jangan mengarang angka dari grafik; ' +
    'sebutkan saja bahwa grafiknya menyusul.',
  izin: 'projects:view',
  skema: { type: 'object', properties: { ...argProyek }, required: ['proyek'] },
  async jalan({ db }, argumen) {
    const { ids, nama } = await idProyek(db, argumen.proyek)

    if (ids.length === 0) {
      return {
        isi: bungkusData('grafik', `Tak ada proyek yang cocok dengan '${String(argumen.proyek ?? '')}'.`),
        isError: true,
        entitas: [],
      }
    }
    if (ids.length > 1) {
      const daftar = ids.slice(0, 8).map((i) => nama.get(i) ?? i)
      return {
        isi: bungkusData(
          'grafik',
          `Ada ${ids.length} proyek yang cocok: ${daftar.join(', ')}. Minta pengguna menyebut yang mana.`,
        ),
        isError: false,
        entitas: daftar,
      }
    }

    const namaProyek = nama.get(ids[0]) ?? ids[0]
    return {
      isi: bungkusData(
        'grafik',
        `SIAP: grafik kurva S untuk "${namaProyek}" akan dikirim sistem sebagai gambar.\n` +
          `PROYEK_ID=${ids[0]}\n` +
          'Sampaikan singkat bahwa grafiknya menyusul. JANGAN menyebut angka apa pun dari ' +
          'grafik ini — Anda belum melihatnya.',
      ),
      isError: false,
      entitas: [namaProyek],
    }
  },
}

/** Semua tool konstruksi — dirakit di `ai-tool.ts`. */
export const TOOL_KONSTRUKSI: DefinisiToolAi[] = [
  toolGrafik,
  toolInvoiceBelumLunas,
  toolKasbon,
  toolMilestone,
  toolProgresLapangan,
  toolPunchItem,
  toolPurchaseOrder,
  toolChangeOrder,
  toolPemasok,
  toolKlien,
]
