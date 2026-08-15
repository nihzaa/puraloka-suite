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
 * Yang SENGAJA TIDAK masuk, dan alasannya: `kasbons` (uang), `invoices`
 * (uang + hukum), `change_orders` (mengubah nilai kontrak), `ncr_items`
 * (jadi dasar klaim ke subkon), `izin_kerja` (gerbang keselamatan — izin
 * yang terbit karena salah paham bisa membuat orang bekerja di tempat
 * berbahaya).
 */
export interface EntitasTulis {
  jenis: string
  label: string
  tabel: TabelViaProject
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
