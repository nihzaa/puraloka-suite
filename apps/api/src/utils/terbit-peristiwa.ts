/**
 * TERBIT PERISTIWA KE OTOMASI — satu jembatan dari notifikasi ke n8n.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Enam alur di `otomasi_alur` berpemicu `webhook` dan tak satu pun pernah
 * terpasang — bukan karena resepnya kurang, melainkan karena tak ada yang
 * memanggil webhooknya. Diukur 2026-08-14: 8 dari 14 alur hidup, enam sisanya
 * menunggu peristiwa yang tak pernah terbit.
 *
 * Yang mengejutkan saat diukur: **peristiwanya sudah ada semua.** Kedua puluh
 * `notification_rules` aktif, dan keenam alur itu sendiri menuliskan sumbernya
 * di keterangan — "Sumber: notification_rules kasbon_submitted", dan
 * seterusnya. Jadi yang kurang cuma jembatannya.
 *
 * ── Kenapa DI SINI, bukan disisipkan di enam tempat
 *
 * Godaan yang lebih cepat: tambahkan `fetch(webhook)` tepat di sebelah tiap
 * `createNotifications(...)`. Enam tempat, selesai sore ini.
 *
 * Itu membangun cacatnya sendiri. Tiap jenis notifikasi BARU harus ingat
 * memanggilnya lagi, dan yang ketujuh akan lupa — pola yang persis sama sudah
 * tercatat dua kali di repo ini: `sendWebPush()` yang punya nol pemanggil
 * selama berbulan-bulan, dan `kolomPengaju` di registri SoD yang salah karena
 * ditulis sekali lalu tak pernah diperiksa lagi.
 *
 * `createNotifications()` sudah menjadi corong tunggal seluruh peristiwa. Satu
 * pemanggilan di sana berarti alur webhook berikutnya cukup mendaftarkan
 * kodenya di PETA di bawah — tak ada rute yang perlu disunting.
 *
 * ── Kenapa fire-and-forget, dan kenapa itu BUKAN kelalaian
 *
 * Alasannya sama persis dengan `kirimPush` di berkas tetangganya: kasbon yang
 * berhasil diajukan TIDAK BOLEH gagal karena n8n sedang mati. Otomasi adalah
 * lapisan tambahan; kalau ia menjatuhkan tindakan yang sudah sah, ia lebih
 * merugikan daripada tak ada.
 *
 * Tapi errornya TIDAK ditelan diam-diam — ia dicatat. `catch {}` kosong persis
 * tempat gejala seharusnya muncul, dan repo ini sudah pernah kehilangan rantai
 * notifikasi berbulan-bulan karenanya.
 *
 * ── Kenapa muatannya tipis
 *
 * Yang dikirim hanya jenis, judul, pesan, dan id proyek — bukan seluruh baris
 * entitas. Dua alasan: n8n punya kunci API untuk mengambil sendiri apa yang ia
 * butuh lewat `/api/v1/otomasi/umpan/*`, dan muatan gemuk berarti data
 * operasional keluar dari server ke tempat yang aturan retensinya berbeda.
 */
import { ambilKredensialTanpaRequest } from '../lib/kredensial.js'
import { jalankanAlur, konfigurasiN8n } from '../lib/otomasi-n8n.js'
import { createTenantDb } from './tenant-db.js'
import { supabase } from './supabase.js'
import type { NotificationParams } from './notifications.js'

/**
 * Jenis notifikasi → kode alur otomasi (= `path` webhook di n8n, dan
 * `otomasi_alur.kode` di basis).
 *
 * Sengaja PETA EKSPLISIT, bukan menurunkan nama dari jenisnya. Menurunkan
 * berarti alur diam-diam lahir dari tiap jenis notifikasi baru, termasuk yang
 * tak punya workflow — dan panggilan ke webhook yang tak ada gagal senyap.
 *
 * Dijaga `audit-peristiwa-punya-alur.mjs`: tiap nilai di sini wajib menunjuk
 * baris `otomasi_alur` yang benar-benar ada.
 */
const PETA_PERISTIWA: Record<string, string> = {
  kasbon_submitted: 'teruskan-kasbon-diajukan',
  wage_report_submitted: 'teruskan-laporan-upah',
  invoice_paid: 'konfirmasi-invoice-dibayar',
  project_status_changed: 'lapor-status-proyek-berubah',
  stok_menipis: 'peringatan-stok-menipis',
}

/*
  Batas tunggu TIDAK didefinisikan di sini lagi — `jalankanAlur()` sudah
  memegangnya, bersama pencatatan durasi ke `otomasi_jalan`. Menyimpan angka
  kedua di berkas ini berarti dua sumber kebenaran untuk satu perilaku, dan
  yang tak dipakai akan membusuk diam-diam.
*/

/**
 * Menerbitkan satu peristiwa ke alur otomasi yang menunggunya.
 *
 * Dipanggil `createNotifications()` SESUDAH notifikasinya tersimpan — urutan
 * itu disengaja: kalau simpan gagal, peristiwanya memang tak terjadi, dan
 * mengabarkannya ke n8n berarti mengabarkan sesuatu yang tak tercatat di mana
 * pun.
 */
export async function terbitkanPeristiwa(
  companyId: string,
  jenis: string,
  contoh: NotificationParams,
  jumlahPenerima: number,
): Promise<void> {
  const kode = PETA_PERISTIWA[jenis]
  if (!kode) return // jenis ini memang tak punya alur — bukan galat

  /*
    ── TEST TIDAK BOLEH MENEMBAK SALURAN KELUAR (ditemukan 2026-08-14)

    Founder mengirim tangkapan layar WhatsApp: enam pesan "KASBON BARU
    DIAJUKAN" identik dalam dua menit, dan bertanya apakah ini error.

    Bukan error alur — itu **suite test**. Enam berkas test memanggil endpoint
    pengajuan kasbon (`mandor.ts:1794`), tiap panggilan melewati
    `createNotifications()`, dan jembatan ini meneruskannya ke webhook n8n
    sungguhan yang mengirim WhatsApp sungguhan.

    Terukur di basis: pola berulang tiap ~20 menit dengan isi identik —
    15:21 (n=20), 16:01 (n=20), 16:17 (n=18). Itu jadwal `vitest run`, bukan
    jadwal manusia mengajukan penagihan.

    Hari ini nomornya milik founder sendiri, jadi akibatnya cuma berisik. Tapi
    saluran ini dirancang untuk nomor PELANGGAN: begitu satu tenant memasang
    nomor aslinya, tiap CI run mengirimi mereka belasan pesan penagihan palsu.
    Kerusakan yang tak bisa ditarik kembali — pesan terkirim tetap terkirim.

    Yang dijaga di sini adalah BATAS antara sistem dan dunia luar. Perbedaan
    dengan penjaga tenant di bawah (`N8N_BASE_URL` kosong → diam) penting:
    yang itu soal konfigurasi belum ada, yang ini soal test tak boleh punya
    jalan keluar sama sekali, bahkan saat konfigurasinya lengkap.

    Diperiksa lewat NODE_ENV, bukan lewat penanda buatan sendiri: vitest
    menyetelnya ke 'test' tanpa perlu diingat siapa pun, dan penjaga yang
    bergantung pada seseorang mengingat sesuatu adalah penjaga yang akan
    dilupakan.
  */
  if (process.env.NODE_ENV === 'test') return

  /*
    ── LEWAT `jalankanAlur()`, BUKAN `fetch()` SENDIRI (diperbaiki 2026-08-14)

    Versi pertama berkas ini — yang saya tulis sendiri sesi ini — menembak
    webhook n8n langsung dengan `fetch()`. Jalan, dan salah.

    Ketahuan saat mengukur `otomasi_jalan`, buku eksekusi otomasi:

        11 alur "aktif", 9 di antaranya NOL eksekusi seumur hidup —
        termasuk `teruskan-kasbon-diajukan`, yang hari ini mengirim
        28 WhatsApp ke founder.

    Buku itu bilang alurnya tak pernah jalan. Kenyataannya founder menerima
    puluhan pesan. Yang salah bukan bukunya melainkan penulis yang melewatinya.

    Akibatnya bukan sekadar angka meleset. `otomasi_jalan` adalah SATU-SATUNYA
    tempat pertanyaan "otomasi ini benar-benar jalan tidak?" bisa dijawab
    tanpa menebak — dan jawabannya selama ini "tidak pernah" untuk alur yang
    justru paling sering menembak. Persis kelas cacat yang berulang hari ini:
    sistem melakukan sesuatu ke dunia nyata tanpa ada yang mengukur akibatnya.

    ── Kenapa saya sempat tak memakainya

    `jalankanAlur()` menuntut `db: TenantDb`, dan berkas ini dipanggil dari
    `createNotifications()` yang tak punya `request`. Saya berhenti di situ.

    Padahal `createTenantDb(companyId)` hanya butuh companyId — yang sudah jadi
    parameter pertama fungsi ini — dan presedennya sudah ada di
    `wa-webhook.ts:175`, jalur tanpa request yang sama. Bukan halangan nyata;
    saya cuma tak mencarinya.

    `sumber: 'peristiwa'` pun sudah ada di tipe `jalankanAlur` sejak awal.
    Jalur ini memang dirancang untuk dipakai begini.
  */
  const { data: alurRow } = await supabase
    .from('otomasi_alur')
    .select('id, kode, nama, n8n_id, jalur_webhook, aktif')
    .eq('company_id', companyId)
    .eq('kode', kode)
    .maybeSingle()

  // Alur belum terdaftar untuk tenant ini — bukan galat, otomasinya memang
  // belum dipasang. Dijaga `audit-peristiwa-punya-alur.mjs` untuk template.
  if (!alurRow) return

  // Alur dimatikan dari UI adalah keputusan pengguna, bukan kegagalan.
  if (!(alurRow as { aktif?: boolean }).aktif) return

  /*
    `konfigurasiN8n` menerima FUNGSI PEMBACA, bukan request — jadi jalur tanpa
    request cukup menyambungkan pembacanya sendiri. Bentuk itu memang dirancang
    untuk ini; tak ada yang perlu ditambahkan di `otomasi-n8n.ts`.
  */
  let cfg = null
  try {
    cfg = await konfigurasiN8n((kunci) => ambilKredensialTanpaRequest(companyId, kunci))
  } catch (err) {
    console.error('[otomasi] gagal membaca konfigurasi n8n:', (err as Error).message)
    return
  }
  if (!cfg) return // otomasi belum dikonfigurasi tenant ini — diam, bukan galat

  const hasil = await jalankanAlur({
    db: createTenantDb(companyId),
    companyId,
    cfg,
    alur: alurRow as never,
    sumber: 'peristiwa',
    oleh: null,
    muatan: {
      jenis,
      kode,
      judul: contoh.title,
      pesan: contoh.message,
      proyek_id: contoh.project_id ?? null,
      penerima: jumlahPenerima,
    },
  })

  // Kegagalan TIDAK ditelan — `jalankanAlur` sudah mencatatnya ke
  // `otomasi_jalan`, tetapi log server tetap perlu supaya "otomasi sering
  // gagal" punya jejak yang terbaca tanpa membuka basis.
  if (!hasil.ok) {
    console.error(`[otomasi] alur ${kode} gagal: ${hasil.alasan} — ${hasil.pesan}`)
  }
}

/** Dipakai penjaga CI supaya daftarnya tak perlu ditulis dua kali. */
export const KODE_ALUR_PERISTIWA = Object.values(PETA_PERISTIWA)
export const JENIS_PERISTIWA_BERALUR = Object.keys(PETA_PERISTIWA)
