/**
 * TOOL PENYIAPAN — asisten MENYIAPKAN tulisan, manusia yang menuliskannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * I-1 TETAP UTUH: TAK SATU PUN TOOL DI SINI MENULIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-10 memilih "CRUD terbatas + token konfirmasi", dan itu
 * MELAMPAUI TJS — yang 38 tool-nya nol `create`/`update`/`delete` (diukur;
 * tujuh tool tulisnya semua `preview_approve_*`).
 *
 * Godaan terbesarnya: membuat tool yang benar-benar `INSERT`. Ditolak, dan
 * bukan karena kehati-hatian berlebihan. `audit-tool-ai-read-only` menuliskan
 * sendiri titik lemah I-1:
 *
 *   "Pertahanan itu punya satu titik lemah, dan bukan pada modelnya: SESI
 *    BERIKUTNYA MENAMBAHKAN TOOL YANG MENULIS karena kelihatannya berguna.
 *    'Sekalian bisa update status' adalah kalimat yang wajar, tak ada test
 *    yang merah karenanya, dan pertahanan I-1 lenyap dalam satu commit."
 *
 * Kalau saya menambahkan satu tool yang menulis, kalimat itu jadi ramalan
 * yang saya penuhi sendiri — dan penjaganya harus dilemahkan untuk
 * mengizinkannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * JADI BAGAIMANA CRUD-NYA BEKERJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tool di sini hanya MENYIAPKAN: ia memvalidasi maksud, menghitung apa yang
 * akan berubah, dan menerbitkan TOKEN. Tulisannya baru terjadi saat manusia
 * memanggil `POST /api/v1/ai/tulis` dengan token itu — permintaan yang lahir
 * dari KLIK, bukan dari kalimat model.
 *
 * Bedanya menentukan. Injeksi lewat dokumen bisa membuat model MEMANGGIL tool
 * penyiapan; ia tak bisa membuat manusia menekan tombol. Dan token yang tak
 * pernah diklaim tak mengubah apa pun — ia kedaluwarsa dalam 15 menit.
 *
 * Pola ini sama persis dengan TJS-E1 (preview → token → setujui) yang sudah
 * terbukti, jadi ia bukan mekanisme baru yang harus dipercaya sendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DAFTAR PUTIH, DAN NOL DELETE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hanya entitas berisiko-rendah yang bisa disiapkan, dan tiap entitas
 * didaftarkan SADAR di `ENTITAS_TULIS`. Yang tak terdaftar tak bisa disentuh
 * — bukan karena ditolak, melainkan karena tak ada jalannya.
 *
 * `delete` tak ada sama sekali, di jenis apa pun. Menghapus lewat kalimat
 * adalah operasi yang tak punya jejak niat: yang menyesal tak bisa
 * membuktikan ia tak bermaksud, dan yang berniat tak bisa dibedakan dari
 * yang keliru.
 */

import type { DefinisiToolAi, KonteksTool } from './ai-tool-dasar.js'
import { bungkusData } from './ai-tool-dasar.js'
// `TabelViaProject`, bukan `TabelTerklasifikasi`: entitas yang bisa ditulis
// lewat asisten WAJIB kategori C (tenancy lewat project_id). Tipe yang lebih
// longgar membuat `accounts` atau `users` bisa masuk daftar putih dan gagal
// baru saat dijalankan — di sini ia gagal COMPILE.
import type { TabelViaProject } from '../utils/tenant-db.js'
import type { TabelTerklasifikasi } from '../utils/tenant-map.generated.js'

/**
 * Entitas yang boleh DISIAPKAN tulisannya.
 *
 * Daftar putih, bukan daftar hitam: jenis baru tak otomatis bisa ditulis, ia
 * harus ditambahkan di sini dan penambahannya terlihat di diff.
 *
 * Kriteria masuk daftar — ketiganya wajib:
 *
 *   1. RENDAH RISIKO — salah isi bisa diperbaiki tanpa konsekuensi uang atau
 *      hukum. Catatan lapangan bisa diedit; invoice tidak.
 *   2. PUNYA PEMILIK JELAS — barisnya terikat ke satu proyek/scope, jadi
 *      tenancy-nya tak ambigu.
 *   3. BUKAN GERBANG — tak ada keputusan approval, pembayaran, atau status
 *      kontraktual yang bergantung padanya.
 *
 * `progress_logs` masuk: mandor mengisinya tiap hari, salah ketik lazim
 * diperbaiki, dan tak ada uang yang berpindah karenanya.
 *
 * `punch_items` masuk: temuan lapangan yang memang lahir dari pengamatan,
 * dan menambahkannya lewat WhatsApp saat berdiri di lokasi adalah persis
 * kegunaan yang founder minta.
 *
 * Yang SENGAJA TIDAK masuk, dan alasannya: `invoices` (uang + hukum),
 * `change_orders` (mengubah nilai kontrak), `ncr_items` (jadi dasar klaim ke
 * subkon, dan tak punya trigger penomor — nomornya harus dibuat manual dan
 * itu rentan tabrakan), `izin_kerja` (gerbang keselamatan — izin yang terbit
 * karena salah paham bisa membuat orang bekerja di tempat berbahaya).
 *
 * ── `kasbons` DULU tidak masuk, sekarang masuk (2026-08-15)
 *
 * Baris di atas semula menyebut `kasbons` sebagai yang dikecualikan karena
 * "uang". Founder memintanya secara eksplisit, dan alasan pengecualiannya
 * ternyata tak bertahan saat diperiksa:
 *
 *   · kasbon LAHIR berstatus `pending` dan tetap lewat rantai approval yang
 *     sama dengan pengajuan lewat halaman — asisten tak melewati satu pun
 *     gerbang, ia cuma mengisi formulirnya
 *   · yang benar-benar menggerakkan uang adalah PERSETUJUANNYA, dan itu tetap
 *     butuh manusia menekan tombol di inbox approval
 *   · `project_expenses` sudah masuk lebih dulu dengan alasan yang sama, dan
 *     ia pun menyentuh uang
 *
 * Yang tetap dijaga: batas nominal per kanal (`BATAS_KASBON_SIAP` di
 * `ai-tulis.ts`), karena salah ketik nol lewat percakapan tetap kekeliruan
 * termudah yang bisa terjadi.
 */
/**
 * Tabel kategori B yang BOLEH ditulis lewat asisten — daftar putih EKSPLISIT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DAFTAR TANGAN, BUKAN `kategori extends 'B'`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder meminta pengajuan kasbon lewat WhatsApp. `kasbons` kategori B
 * (punya `company_id` sendiri), sementara `TabelViaProject` sengaja hanya
 * menerima kategori C — dan pagar itu BENAR, terbukti saat diukur:
 *
 *     kategori B berisi 110 tabel, termasuk
 *     `accounts` · `app_credentials` · `api_key` · `ai_token_tulis`
 *
 * Melonggarkan tipe jadi `extends 'B'` akan membuat keempatnya bisa masuk
 * daftar putih lewat satu baris yang terlihat wajar — dan `app_credentials`
 * yang bisa ditulis asisten berarti injeksi lewat dokumen bisa menanam kunci
 * API tenant lain.
 *
 * Jadi yang diperluas bukan ATURANNYA melainkan daftar pengecualiannya, satu
 * nama pada satu waktu, dengan alasan tertulis. Menambah nama ke sini adalah
 * keputusan sadar; melonggarkan tipe adalah kecelakaan yang menunggu.
 *
 * Tetap `TabelTerklasifikasi`, bukan `string`: salah ketik nama tabel tetap
 * gagal COMPILE.
 */
export type TabelKategoriBDiizinkan = Extract<TabelTerklasifikasi, 'kasbons'>

export interface EntitasTulis {
  jenis: string
  label: string
  tabel: TabelViaProject | TabelKategoriBDiizinkan
  /**
   * Jalur tenancy tabelnya — menentukan cara menulisnya.
   *
   *   'C'  lewat `viaProject()`, WAJIB menyebut project_id
   *   'B'  lewat `from()`, `company_id` disisipkan wrapper
   *
   * Ditulis eksplisit alih-alih diturunkan dari peta: rute penulisannya harus
   * memilih jalur SEBELUM tahu nama tabelnya, dan menebak salah satunya
   * berarti menulis ke tempat yang tak tersaring tenant.
   */
  tenancy: 'B' | 'C'
  /** Hanya `buat` dan `ubah`. Tak ada `hapus`, di mana pun. */
  aksi: ReadonlyArray<'buat' | 'ubah'>
  izin: string
  /** Field yang boleh diisi — sisanya diabaikan, bukan ditolak diam-diam. */
  field: ReadonlyArray<{ nama: string; wajib: boolean; keterangan: string }>
}

export const ENTITAS_TULIS: EntitasTulis[] = [
  {
    jenis: 'catatan_progres',
    label: 'Catatan progres lapangan',
    tabel: 'progress_logs',
    tenancy: 'C',
    aksi: ['buat'],
    izin: 'projects:view',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'persen', wajib: true, keterangan: 'Progres fisik 0-100.' },
      { nama: 'catatan', wajib: false, keterangan: 'Keterangan singkat pekerjaan hari ini.' },
    ],
  },
  {
    jenis: 'temuan_punch',
    label: 'Temuan punch list',
    tabel: 'punch_items',
    tenancy: 'C',
    aksi: ['buat'],
    izin: 'projects:view',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'judul', wajib: true, keterangan: 'Apa yang ditemukan, satu kalimat.' },
      { nama: 'lokasi', wajib: false, keterangan: 'Di mana temuannya.' },
      { nama: 'severity', wajib: false, keterangan: 'ringan | sedang | berat | kritis.' },
    ],
  },
  {
    /*
      ── Automation 1.1 — pencatatan keuangan lewat percakapan (2026-08-15)

      Katalog menyebutnya *"Financial Recording via WhatsApp: catat transaksi
      (kasbon, expense) lewat teks/voice tanpa buka app"*, dan menandainya
      Agentic — jadi ia terbaca seperti menunggu kemampuan AI yang belum ada.

      Diukur, dan prasyaratnya justru SUDAH LENGKAP: pesan WhatsApp masuk
      sampai ke asisten (`wa-webhook.ts` memanggil `jalankanGiliranAi`), sesi
      dan ingatan ada, dan kunci model terpasang. Yang kurang cuma satu hal —
      asisten tak punya cara menyiapkan pencatatan uang.

      ── Kenapa `project_expenses`, dan kenapa BUKAN kasbon

      Tebakan pertama saya kasbon — nominal, keperluan, sumber dana; paling
      sedikit kolom wajibnya. Tipe yang menolaknya:

          Type '"kasbons"' is not assignable to type 'TabelViaProject'

      `kasbons` kategori **B** (punya `company_id` langsung), sementara tipe di
      berkas ini SENGAJA dibatasi ke kategori C. Komentarnya menjelaskan
      kenapa: tipe yang lebih longgar membuat `accounts` atau `users` bisa
      masuk daftar putih dan gagal baru saat dijalankan.

      Jadi pagar itu menangkap saya, dan menangkapnya di waktu yang tepat —
      saat compile, bukan saat seseorang mencoba menyiapkan tulisan ke tabel
      yang salah. Melonggarkan tipenya untuk meloloskan kasbon berarti
      membongkar pagar itu untuk semua orang sesudahnya.

      `project_expenses` kategori C, dan justru itu yang katalog sebut
      (*"catat transaksi (kasbon, expense)"*).

      Kolom wajibnya lebih banyak, tetapi diukur ke `information_schema` —
      sebagian besar punya DEFAULT: `expense_source`, `expense_date`, `qty`,
      `status`, `billed_amount`. Yang benar-benar harus diisi cuma lima, dan
      semuanya bisa dikatakan orang dalam satu kalimat.

      `category_id` dicocokkan dari NAMA, sama seperti proyek — sepuluh
      kategori di basis bernama jelas ("Beton & Semen", "Listrik & MEP"), jadi
      asisten memilih dari yang ada, bukan mengarang.

      ── I-1 TETAP UTUH

      Tool ini TIDAK menulis. Ia menyiapkan dan menerbitkan token;
      pengeluarannya lahir saat manusia menekan tombol di `POST /ai/tulis`.
      Itu penting justru di sini: ini satu-satunya jenis penyiapan yang
      menyentuh UANG, dan satu-satunya pertahanan terhadap injeksi lewat
      dokumen adalah bahwa model tak bisa menekan tombol.

      Status awalnya `draft` (bawaan kolom), jadi ia tetap lewat rantai
      approval `project_expense` yang sudah ada — penyiapan lewat AI tak
      melewati satu pun gerbang yang berlaku untuk pengajuan biasa.
    */
    jenis: 'pengeluaran',
    label: 'Pengeluaran proyek',
    tabel: 'project_expenses',
    tenancy: 'C',
    aksi: ['buat'],
    /*
      `cash:expense:create`, bukan `projects:view`: menyiapkan pengeluaran uang
      menuntut izin yang sama dengan mengajukannya lewat halaman biasa.

      Nilainya DIUKUR ke tabel `permissions`, bukan dikarang. Tebakan pertama
      saya `expenses:create` — tak ada di basis, dan akibatnya bukan galat
      melainkan DIAM: `requirePermission` untuk kunci yang tak pernah dimiliki
      siapa pun menolak semua orang, dan penyiapan pengeluaran akan gagal 403
      selamanya tanpa satu pun petunjuk bahwa kuncinyalah yang salah.

      Keluarga yang benar `cash:expense:*` — sama dengan yang menjaga rute
      pengeluaran sungguhan di `cash.ts`.
    */
    izin: 'cash:expense:create',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'jumlah', wajib: true, keterangan: 'Nominal rupiah, angka saja.' },
      { nama: 'keperluan', wajib: true, keterangan: 'Untuk apa — mis. "semen 20 sak untuk lantai 2".' },
      { nama: 'kategori', wajib: false, keterangan: 'Nama kategori (sebagian nama boleh). Kosong = dicocokkan dari keperluan.' },
    ],
  },
  {
    /*
      ── Permintaan material lewat percakapan (2026-08-15)

      Founder: *"mau po material dan lain lain"*.

      Yang dibuat MR (`material_requests`), BUKAN PO langsung — dan itu bukan
      penyederhanaan melainkan urutan yang benar:

        MR  "saya butuh 50 sak semen di proyek A"    ← yang tahu orang lapangan
        PO  "beli dari supplier X, harga Y, kirim Z" ← yang tahu tim pengadaan

      Orang di lapangan tahu apa yang kurang; ia tak tahu supplier mana yang
      stoknya ada atau harga mana yang sedang berlaku. Meminta asisten membuat
      PO dari kalimat berarti menebak `supplier_id` dan `total_amount` —
      dokumen pengadaan berisi angka yang tak seorang pun putuskan.

      MR-nya lalu mengalir ke jalur pengadaan yang sudah ada: approval, RFQ,
      PO. Automation 4.10 (`gr-matching`) dan gerbang approval PO yang dibangun
      kemarin tetap berlaku penuh.

      `mr_number` TIDAK diisi di sini — `trg_generate_mr_number` mengisinya
      (diukur ke `pg_trigger`). Menghitungnya sendiri akan menabrak nomor yang
      masih terpakai, dan galatnya muncul sebagai "gagal menyimpan" yang tak
      menyebut sebabnya.
    */
    jenis: 'permintaan_material',
    label: 'Permintaan material (MR)',
    tabel: 'material_requests',
    tenancy: 'C',
    aksi: ['buat'],
    // Sama dengan gerbang rute MR sungguhan di `procurement.ts`.
    izin: 'procurement:mr:manage',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'kebutuhan', wajib: true, keterangan: 'Apa yang dibutuhkan — mis. "50 sak semen untuk cor lantai 2".' },
      { nama: 'dibutuhkan_tanggal', wajib: false, keterangan: 'Kapan dibutuhkan (YYYY-MM-DD). Kosong = tak ditentukan.' },
    ],
  },
  {
    /*
      ── Pengajuan kasbon lewat percakapan (2026-08-15)

      Founder memintanya eksplisit. Satu-satunya entri kategori B di daftar
      ini, dan satu-satunya yang menuntut perluasan tipe — lihat
      `TabelKategoriBDiizinkan` di atas untuk kenapa perluasannya berupa daftar
      nama, bukan pelonggaran aturan.

      ── Kenapa ini AMAN meski menyentuh uang

      Diukur ke `pg_trigger`, bukan diasumsikan:

          trg_kasbon_approved_create_expense
          trg_update_cash_on_kasbon_approved

      Keduanya berjalan saat kasbon DISETUJUI, bukan saat dibuat. Jadi kasbon
      yang lahir dari percakapan tak menggerakkan satu rupiah pun — ia masuk
      antrean `pending` dan menunggu manusia menekan tombol di inbox approval,
      persis seperti pengajuan lewat halaman.

      Asisten mengisi formulirnya; ia tidak melewati satu pun gerbang.

      `company_id` juga tak diisi di sini — `trg_kasbons_isi_company`
      mengisinya. Menuliskannya sendiri berarti dua sumber untuk satu nilai
      tenancy, dan yang satu pasti akan menyimpang.

      ── Yang tetap dijaga

      Batas nominal per KANAL (`BATAS_KASBON_SIAP`, `ai-tulis.ts`). Bukan batas
      kasbon — itu urusan rantai approval per tenant. Ini batas kepercayaan
      pada percakapan: salah ketik nol adalah kekeliruan termudah lewat
      WhatsApp, dan asisten tak bisa membedakannya dari maksud sungguhan.
    */
    jenis: 'kasbon',
    label: 'Pengajuan kasbon',
    tabel: 'kasbons',
    tenancy: 'B',
    aksi: ['buat'],
    /*
      `mandor:kasbon:create` — DIUKUR ke tabel `permissions`, bukan dikarang.

      Tebakan pertama saya `kasbon:create`; tak ada di basis. Kedua kalinya
      hari ini saya mengarang kunci izin, dan kedua kalinya
      `audit-izin-benar-ada` yang menangkapnya sebelum sempat masuk — kunci
      hantu menolak SEMUA orang dengan 403 yang terbaca seperti "Anda tak
      punya izin", bukan seperti "kuncinya salah ketik".
    */
    izin: 'mandor:kasbon:create',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'jumlah', wajib: true, keterangan: 'Nominal rupiah, angka saja.' },
      { nama: 'keperluan', wajib: true, keterangan: 'Untuk apa — mis. "gaji tukang minggu ini".' },
      {
        nama: 'sumber_dana',
        wajib: false,
        // Nilai DIUKUR dari `pg_enum` (`kasbon_fund_source`), bukan diingat.
        keterangan: 'owner_advance (talangan pemilik) | client_fund (dana klien). Kosong = owner_advance.',
      },
    ],
  },
]

export function entitasTulis(jenis: string): EntitasTulis | undefined {
  return ENTITAS_TULIS.find((e) => e.jenis === jenis)
}

/**
 * Memeriksa apakah nilai persen masuk akal.
 *
 * Dipisah supaya bisa diuji tanpa basis. Model mengarang angka dengan
 * percaya diri — "sekitar 85" untuk pekerjaan yang baru dimulai — dan angka
 * di luar 0-100 adalah tanda paling murah bahwa ia menebak.
 */
export function persenSah(n: unknown): n is number {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) && v >= 0 && v <= 100
}

/**
 * Tool: MENYIAPKAN catatan/temuan, tak menulisnya.
 *
 * Ia mengembalikan RINGKASAN yang akan ditulis plus penanda bahwa manusia
 * harus mengonfirmasi. Token sesungguhnya diterbitkan rute
 * `POST /api/v1/ai/siapkan-tulis` — bukan di sini, karena tool tak boleh
 * menulis apa pun, termasuk baris token.
 */
export const toolSiapkanTulis: DefinisiToolAi = {
  nama: 'siapkan_tulis',
  label: 'Menyiapkan catatan untuk dikonfirmasi',
  keterangan:
    'Menyiapkan pencatatan baru (catatan progres atau temuan punch list) untuk DIKONFIRMASI ' +
    'manusia. Tool ini TIDAK menyimpan apa pun — ia hanya menyusun dan memeriksa isinya. ' +
    'Pakai saat pengguna minta mencatat sesuatu, lalu sampaikan bahwa ia perlu menekan ' +
    'tombol konfirmasi di aplikasi.',
  izin: 'projects:view',
  skema: {
    type: 'object',
    properties: {
      jenis: {
        type: 'string',
        // enum DINYATAKAN — model membaca nama field lebih dulu dan mengarang
        // nilai yang "masuk akal" (pelajaran `daftar_proyek`).
        enum: ENTITAS_TULIS.map((e) => e.jenis),
        description: 'Jenis catatan yang akan dibuat.',
      },
      proyek: { type: 'string', description: 'Nama proyek (sebagian nama boleh).' },
      persen: { type: 'number', description: 'Untuk catatan progres: 0-100.' },
      catatan: { type: 'string', description: 'Keterangan singkat.' },
      judul: { type: 'string', description: 'Untuk temuan punch: apa yang ditemukan.' },
      lokasi: { type: 'string', description: 'Untuk temuan punch: di mana.' },
      severity: {
        type: 'string',
        // Nilai enum `punch_severity` sesungguhnya (diukur). Model membaca
        // daftar ini; daftar yang salah membuatnya mengirim nilai yang
        // ditolak basis SESUDAH token terpakai.
        enum: ['ringan', 'sedang', 'berat', 'kritis'],
        description: 'Untuk temuan punch.',
      },
    },
    required: ['jenis', 'proyek'],
  },
  async jalan({ db }: KonteksTool, argumen) {
    const jenis = typeof argumen.jenis === 'string' ? argumen.jenis.trim() : ''
    const meta = entitasTulis(jenis)
    if (!meta) {
      return {
        isi:
          `Jenis '${jenis}' tak bisa dicatat lewat asisten. ` +
          `Yang tersedia: ${ENTITAS_TULIS.map((e) => e.jenis).join(', ')}.`,
        isError: true,
        entitas: [],
      }
    }

    // Proyek DIRESOLUSI dari nama, bukan diterima sebagai id. Model akan
    // mengarang UUID, dan UUID karangan yang kebetulan cocok adalah pintu ke
    // proyek tenant lain.
    const cari = typeof argumen.proyek === 'string' ? argumen.proyek.trim().toLowerCase() : ''
    const { data, error } = await db.from('projects').select('id, name')
    if (error) {
      return { isi: `Gagal membaca proyek: ${error.message}`, isError: true, entitas: [] }
    }
    const semua = (data ?? []) as unknown as Array<{ id: string; name: string }>
    const cocok = semua.filter((p) => (p.name ?? '').toLowerCase().includes(cari))

    if (cocok.length === 0) {
      return {
        isi: `Tak ada proyek yang cocok dengan '${argumen.proyek}'.`,
        isError: true,
        entitas: [],
      }
    }
    if (cocok.length > 1) {
      // AMBIGU dinyatakan, bukan ditebak. Menulis ke proyek yang salah karena
      // namanya mirip adalah kesalahan yang baru ketahuan berminggu kemudian.
      return {
        isi: bungkusData(
          'siapkan_tulis',
          `Ada ${cocok.length} proyek yang cocok: ${cocok.map((p) => p.name).join(', ')}. ` +
            `Minta pengguna menyebut yang mana.`,
        ),
        isError: false,
        entitas: cocok.map((p) => p.name),
      }
    }

    const proyek = cocok[0]

    if (jenis === 'catatan_progres') {
      if (!persenSah(argumen.persen)) {
        return {
          isi: 'Persen progres harus angka 0-100. Minta pengguna menyebutkannya.',
          isError: true,
          entitas: [],
        }
      }
    }

    if (jenis === 'temuan_punch') {
      const judul = typeof argumen.judul === 'string' ? argumen.judul.trim() : ''
      if (judul.length < 5) {
        return {
          isi: 'Judul temuan terlalu pendek. Minta pengguna menjelaskan apa yang ditemukan.',
          isError: true,
          entitas: [],
        }
      }
    }

    /*
     * Yang dikembalikan RINGKASAN, bukan konfirmasi bahwa sesuatu tersimpan.
     *
     * Kalimatnya sengaja menyebut "BELUM tersimpan" secara eksplisit: model
     * yang menerima hasil tool tanpa penegasan itu cenderung melaporkan
     * "sudah saya catat" — dan pengguna yang percaya lalu tak menekan
     * tombolnya kehilangan catatannya tanpa tahu.
     */
    const ringkas =
      jenis === 'catatan_progres'
        ? `Catatan progres untuk ${proyek.name}: ${Number(argumen.persen)}%` +
          (typeof argumen.catatan === 'string' && argumen.catatan.trim()
            ? ` — ${argumen.catatan.trim()}`
            : '')
        : `Temuan punch untuk ${proyek.name}: ${String(argumen.judul).trim()}` +
          (typeof argumen.lokasi === 'string' && argumen.lokasi.trim()
            ? ` (${argumen.lokasi.trim()})`
            : '')

    return {
      isi: bungkusData(
        'siapkan_tulis',
        `${ringkas}\n\n` +
          `BELUM TERSIMPAN. Sampaikan kepada pengguna bahwa ia perlu menekan tombol ` +
          `konfirmasi di aplikasi untuk menyimpannya. Asisten tidak bisa menyimpan sendiri.`,
      ),
      isError: false,
      entitas: [proyek.name],
    }
  },
}

/** Tool penyiapan — dirakit di `ai-tool.ts`. */
export const TOOL_SIAPKAN: DefinisiToolAi[] = [toolSiapkanTulis]
