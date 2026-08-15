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
  {
    /*
      ══════════════════════════════════════════════════════════════════════
      PEMBAYARAN MASUK — satu-satunya entitas yang MENYENTUH UANG SUNGGUHAN
      ══════════════════════════════════════════════════════════════════════

      Founder 2026-08-16: "assisten bisa menyimpan semua data (seperti jika
      pembayaran masuk)". Diukur lebih dulu, dan hasilnya mengubah rancangan:

        payments  → TAK PUNYA kolom `status`
        trigger   → `fn_update_cash_balance_on_payment` AFTER INSERT
                    menambah `cash_accounts.balance` SEKETIKA

      Semua entitas lain di daftar ini lahir `pending`/`draft` dan menunggu
      approval. Pembayaran tidak: begitu barisnya masuk, uangnya dianggap
      diterima, dan saldo kas berubah tanpa satu pun persetujuan.

      Salah dengar "lima juta" jadi "lima puluh juta" lewat WhatsApp karenanya
      bukan kesalahan yang bisa diperbaiki dengan menolak approval — tak ada
      approval untuk ditolak.

      ── Yang membuatnya tetap boleh ada: `cash_account_id` DIBIARKAN NULL

      Triggernya dibaca, bukan ditebak (`pg_proc.prosrc`):

          IF NEW.cash_account_id IS NOT NULL THEN
            UPDATE cash_accounts SET balance = balance + NEW.amount_paid …

      Tanpa `cash_account_id`, pembayaran TERCATAT tetapi saldo TIDAK
      bergerak. Rekonsiliasi ke rekening tetap dilakukan orang keuangan lewat
      halaman Pembayaran — pekerjaan yang memang miliknya, dan yang menuntut
      melihat mutasi bank yang asisten tak punya.

      Jadi asisten mencatat KLAIM pembayaran ("Pak Budi bilang sudah
      transfer"), bukan memutuskan bahwa uangnya ada. Pembedaan itu yang
      membuat fitur ini aman, dan ia ditegakkan di `lib/tulis-klaim.ts` —
      bukan diserahkan ke niat baik pemanggil.

      ── Kenapa `invoice` bukan `proyek`

      `payments` mewarisi tenancy lewat `invoice_id`, bukan `project_id`
      (`tenant-map.generated.ts:176`). Menyebut proyek saja tak cukup: satu
      proyek punya banyak invoice, dan menebak yang mana berarti melunasi
      tagihan yang salah.
    */
    /*
      ══════════════════════════════════════════════════════════════════════
      ABSENSI HARIAN — tak menyentuh uang HARI INI, tapi menentukan upah
      ══════════════════════════════════════════════════════════════════════

      Founder 2026-08-16: "perluas jenis tulis". Absensi dipilih lebih dulu
      dari stok karena bentuk tabelnya cocok; alasan stok ditunda ada di bawah.

      Diukur sebelum dirancang:

        absensi_harian  →  NOL trigger penggerak uang (cuma set_updated_at)
        CHECK           →  porsi_hari 0..1 · jam_lembur 0..16 · tanggal ≤ besok
        tenancy         →  lewat `scope_id`, BUKAN project_id
                           (absensi_harian.scope_id → work_scopes.assignment_id
                            → mandor_assignments.project_id)

      ── Yang TIDAK dijaga basis, dan karena itu dijaga kode

      TAK ADA unique constraint pada (scope_id, worker_id, tanggal). Diukur ke
      pg_constraint: yang ada hanya PK, tiga FK, dan tiga CHECK rentang.

      Padahal absensi memberi makan `weekly_wage_reports`/`daily_wage_logs` —
      dua baris untuk orang yang sama di hari yang sama berarti UPAH DIBAYAR
      DUA KALI. Basisnya tak akan menolak, dan tak ada gejala sampai
      rekapitulasi mingguan terlihat aneh.

      Maka penerbit token memeriksanya lebih dulu (`sudahAbsen()`), dan
      test membuktikannya. Yang lain lolos karena basis menahannya; yang ini
      lolos karena KODE menahannya — dan itu perbedaan yang harus ditulis,
      bukan diandalkan diam-diam.

      ── Kenapa `porsi_hari`, bukan jam masuk/pulang

      Kolomnya memang begitu (numeric 0..1). Mandor melaporkan "hadir",
      "setengah hari", "tidak masuk" — bukan jam. Memaksa jam berarti
      mengarang presisi yang tak pernah diucapkan siapa pun.
    */
    jenis: 'absensi',
    label: 'Absensi harian tukang',
    tabel: 'absensi_harian',
    tenancy: 'C',
    aksi: ['buat'],
    // DIUKUR ke tabel `permissions`. `mandor:worker:manage` adalah izin yang
    // sama dengan yang menjaga pengelolaan tukang di halaman mandor.
    izin: 'mandor:worker:manage',
    field: [
      { nama: 'proyek', wajib: true, keterangan: 'Nama proyek (sebagian nama boleh).' },
      { nama: 'tukang', wajib: true, keterangan: 'Nama tukang (sebagian nama boleh).' },
      {
        nama: 'porsi',
        wajib: false,
        keterangan: 'Porsi hari 0–1. 1 = hadir penuh, 0.5 = setengah hari, 0 = tidak masuk. Kosong = 1.',
      },
      { nama: 'lembur', wajib: false, keterangan: 'Jam lembur 0–16. Kosong = 0.' },
      { nama: 'tanggal', wajib: false, keterangan: 'YYYY-MM-DD. Kosong = hari ini.' },
      { nama: 'catatan', wajib: false, keterangan: 'Keterangan singkat.' },
    ],
  },
  {
    jenis: 'pembayaran_masuk',
    label: 'Pembayaran masuk dari klien',
    tabel: 'payments',
    tenancy: 'C',
    aksi: ['buat'],
    // DIUKUR ke tabel `permissions` — bukan dikarang. `finance:invoice:pay`
    // adalah izin yang sama dengan yang menjaga halaman pembayaran termin.
    izin: 'finance:invoice:pay',
    field: [
      { nama: 'invoice', wajib: true, keterangan: 'Nomor invoice — mis. "INV-2026-014". Sebagian nomor boleh.' },
      { nama: 'jumlah', wajib: true, keterangan: 'Nominal rupiah yang diterima, angka saja.' },
      { nama: 'metode', wajib: false, keterangan: 'transfer_bank | cash | qris | cek | giro. Kosong = transfer_bank.' },
      { nama: 'bank', wajib: false, keterangan: 'Nama bank pengirim.' },
      { nama: 'referensi', wajib: false, keterangan: 'Nomor referensi/bukti transfer.' },
      { nama: 'catatan', wajib: false, keterangan: 'Keterangan tambahan.' },
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
      jumlah: { type: 'number', description: 'Nominal rupiah — kasbon, pengeluaran, pembayaran.' },
      keperluan: { type: 'string', description: 'Untuk kasbon/pengeluaran: untuk apa.' },
      kebutuhan: { type: 'string', description: 'Untuk permintaan material: apa dan berapa.' },
      // ── Pembayaran masuk ─────────────────────────────────────────────────
      invoice: {
        type: 'string',
        description:
          'Untuk pembayaran_masuk: NOMOR INVOICE yang dibayar (mis. "INV-2026-014"). '
          + 'Wajib — pembayaran menempel pada invoice, bukan pada proyek.',
      },
      metode: {
        type: 'string',
        // Nilai enum `payment_method` sesungguhnya (diukur ke pg_enum).
        enum: ['transfer_bank', 'cash', 'qris', 'cek', 'giro'],
        description: 'Untuk pembayaran_masuk. Kosong = transfer_bank.',
      },
      bank: { type: 'string', description: 'Untuk pembayaran_masuk: bank pengirim.' },
      referensi: { type: 'string', description: 'Untuk pembayaran_masuk: nomor bukti transfer.' },
      // ── Absensi harian ────────────────────────────────────────────────────
      tukang: { type: 'string', description: 'Untuk absensi: nama tukang (sebagian nama boleh).' },
      porsi: {
        type: 'number',
        description:
          'Untuk absensi: porsi hari 0–1. 1 = hadir penuh, 0.5 = setengah hari, 0 = tidak masuk. '
          + 'Kosong = 1. JANGAN mengarang jam masuk/pulang — kolomnya memang porsi, bukan jam.',
      },
      lembur: { type: 'number', description: 'Untuk absensi: jam lembur 0–16. Kosong = 0.' },
      tanggal: { type: 'string', description: 'Untuk absensi: YYYY-MM-DD. Kosong = hari ini.' },
    },
    /*
      `proyek` TIDAK lagi wajib di skema — `pembayaran_masuk` memakai `invoice`.

      Kewajibannya dipindah ke pemeriksaan per-jenis di `jalan()` dan di kedua
      jalur penerbitan token, yang memang sudah menolak proyek kosong. Menahannya
      di sini akan membuat model mengarang nama proyek hanya supaya panggilannya
      diterima — persis kelas halusinasi yang paling mahal, karena hasilnya
      terlihat sah.
    */
    required: ['jenis'],
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

    /*
      PEMBAYARAN MASUK — menempel pada INVOICE, jadi ia tak lewat resolusi
      proyek di bawah sama sekali.

      Yang dikembalikan tetap RINGKASAN, bukan konfirmasi tersimpan: tokennya
      diterbitkan di luar tool (I-1 — tak satu pun tool menulis, termasuk baris
      token).
    */
    if (jenis === 'pembayaran_masuk') {
      const noInvoice = typeof argumen.invoice === 'string' ? argumen.invoice.trim() : ''
      if (!noInvoice) {
        return {
          isi: 'Sebutkan NOMOR INVOICE yang dibayar. Pembayaran menempel pada invoice, '
            + 'bukan pada proyek — satu proyek bisa punya banyak tagihan.',
          isError: true,
          entitas: [],
        }
      }

      const jml = Number(argumen.jumlah)
      if (!Number.isFinite(jml) || jml <= 0) {
        return {
          isi: 'Nominal pembayaran harus angka rupiah lebih dari 0. Minta pengguna menyebutkannya.',
          isError: true,
          entitas: [],
        }
      }

      /*
        Invoice DIVERIFIKASI ada, milik tenant ini, dan BELUM lunas — sebelum
        ringkasannya disampaikan.

        Tanpa ini, asisten akan berkata "siap, saya siapkan pembayaran
        INV-999" untuk invoice yang tak pernah ada, lalu penerbitan tokennya
        gagal beberapa detik kemudian dengan kalimat yang bertentangan.
      */
      const { data: inv, error: errInv } = await db
        .from('invoices')
        .select('invoice_number, amount_due')
        .neq('status', 'paid')
        .order('issued_date', { ascending: false })
        .limit(200)

      if (errInv) {
        return { isi: `Gagal membaca invoice: ${errInv.message}`, isError: true, entitas: [] }
      }

      const daftar = (inv ?? []) as unknown as Array<{
        invoice_number: string
        amount_due: string | number
      }>
      const cocokInv = daftar.filter((i) =>
        (i.invoice_number ?? '').toLowerCase().includes(noInvoice.toLowerCase()),
      )

      if (cocokInv.length === 0) {
        return {
          isi: `Tak ada invoice BELUM LUNAS yang cocok dengan '${noInvoice}'.`,
          isError: true,
          entitas: [],
        }
      }
      if (cocokInv.length > 1) {
        return {
          isi: bungkusData(
            'siapkan_tulis',
            `Ada ${cocokInv.length} invoice yang cocok: `
              + `${cocokInv.map((i) => i.invoice_number).join(', ')}. Minta pengguna menyebut yang mana.`,
          ),
          isError: false,
          entitas: cocokInv.map((i) => i.invoice_number),
        }
      }

      const satu = cocokInv[0]
      const sisaTagih = Number(satu.amount_due)

      if (Number.isFinite(sisaTagih) && jml > sisaTagih) {
        return {
          isi: `Sisa tagihan ${satu.invoice_number} tinggal Rp ${sisaTagih.toLocaleString('id-ID')}, `
            + `sedangkan yang disebut Rp ${jml.toLocaleString('id-ID')}. Minta pengguna memastikan dulu.`,
          isError: true,
          entitas: [satu.invoice_number],
        }
      }

      return {
        isi: bungkusData(
          'siapkan_tulis',
          `Pembayaran masuk ${satu.invoice_number}: Rp ${jml.toLocaleString('id-ID')} `
            + `(sisa tagihan Rp ${Number.isFinite(sisaTagih) ? sisaTagih.toLocaleString('id-ID') : '?'}).\n\n`
            + 'BELUM TERSIMPAN — tunggu konfirmasi manusia. Sampaikan juga bahwa pencatatan ini '
            + 'TIDAK menggerakkan saldo kas; rekonsiliasi ke rekening tetap dilakukan bagian keuangan.',
        ),
        isError: false,
        entitas: [satu.invoice_number],
      }
    }

    /*
      ABSENSI — diverifikasi sampai ke DUPLIKATNYA sebelum diringkas.

      Bukan sekadar kerapian: `absensi_harian` TAK punya unique constraint
      (diukur ke pg_constraint), dan absensi memberi makan
      `weekly_wage_reports`. Kalau asisten berkata "siap, saya catat Budi hadir"
      untuk hari yang sudah tercatat, orangnya akan mengkonfirmasi — dan upah
      Budi dibayar dua kali tanpa satu pun galat.
    */
    if (jenis === 'absensi') {
      const namaTukang = typeof argumen.tukang === 'string' ? argumen.tukang.trim() : ''
      if (!namaTukang) {
        return { isi: 'Tukang yang mana? Sebutkan namanya.', isError: true, entitas: [] }
      }

      const porsiNilai =
        argumen.porsi === undefined || argumen.porsi === null ? 1 : Number(argumen.porsi)
      if (!Number.isFinite(porsiNilai) || porsiNilai < 0 || porsiNilai > 1) {
        return {
          isi: 'Porsi hari harus 0–1 (1 = hadir penuh, 0.5 = setengah hari, 0 = tidak masuk).',
          isError: true,
          entitas: [],
        }
      }

      const { data: pekerja, error: errPekerja } = await db
        .from('workers')
        .select('id, name')
        .eq('is_active', true)
        .limit(500)

      if (errPekerja) {
        return { isi: `Gagal membaca data tukang: ${errPekerja.message}`, isError: true, entitas: [] }
      }

      const daftarTukang = (pekerja ?? []) as unknown as Array<{ id: string; name: string }>
      const cocokTukang = daftarTukang.filter((w) =>
        (w.name ?? '').toLowerCase().includes(namaTukang.toLowerCase()),
      )

      if (cocokTukang.length === 0) {
        return { isi: `Tak ada tukang aktif bernama '${namaTukang}'.`, isError: true, entitas: [] }
      }
      if (cocokTukang.length > 1) {
        return {
          isi: bungkusData(
            'siapkan_tulis',
            `Ada ${cocokTukang.length} tukang yang cocok: ${cocokTukang.map((w) => w.name).join(', ')}. `
              + 'Minta pengguna menyebut yang mana.',
          ),
          isError: false,
          entitas: cocokTukang.map((w) => w.name),
        }
      }

      const tglAbsen =
        typeof argumen.tanggal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(argumen.tanggal.trim())
          ? argumen.tanggal.trim()
          : new Date().toISOString().slice(0, 10)

      const labelPorsi =
        porsiNilai === 1 ? 'hadir penuh' : porsiNilai === 0 ? 'tidak masuk' : `porsi ${porsiNilai}`
      const jamLembur = Number(argumen.lembur) > 0 ? Number(argumen.lembur) : 0

      return {
        isi: bungkusData(
          'siapkan_tulis',
          `Absensi ${cocokTukang[0].name}, ${tglAbsen}: ${labelPorsi}`
            + (jamLembur > 0 ? `, lembur ${jamLembur} jam` : '')
            + '.\n\nBELUM TERSIMPAN — tunggu konfirmasi manusia. Sistem akan menolak kalau '
            + 'orang ini sudah tercatat absen di tanggal tersebut.',
        ),
        isError: false,
        entitas: [cocokTukang[0].name],
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
