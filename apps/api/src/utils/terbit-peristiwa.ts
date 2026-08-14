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

/** Batas tunggu — n8n lambat tak boleh menahan respons rute. */
const TIMEOUT_MS = 5_000

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

  let basis: string | null = null
  try {
    basis = await ambilKredensialTanpaRequest(companyId, 'N8N_BASE_URL')
  } catch (err) {
    console.error('[otomasi] gagal membaca N8N_BASE_URL:', (err as Error).message)
    return
  }
  if (!basis) return // otomasi belum dikonfigurasi tenant ini — diam, bukan galat

  /*
    `127.0.0.1`, bukan `localhost`, bila nilainya menyebut localhost.

    Diukur 2026-08-14: n8n mendengarkan IPv4+IPv6 sementara API hanya IPv4,
    jadi `localhost` dari sisi n8n mendarat di `::1` yang kosong. Di sini
    arahnya terbalik (API → n8n), tapi kelas kekeliruannya sama dan galatnya
    sama-sama tak menyebut IPv6. Normalisasi menutupnya di kedua arah.
  */
  const url =
    `${basis.replace(/\/$/, '').replace('//localhost', '//127.0.0.1')}` +
    `/webhook/${kode}`

  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jenis,
        kode,
        judul: contoh.title,
        pesan: contoh.message,
        proyek_id: contoh.project_id ?? null,
        penerima: jumlahPenerima,
        pada: new Date().toISOString(),
      }),
      signal: kendali.signal,
    })
    if (!r.ok) {
      // 404 berarti workflow-nya belum dipasang/diaktifkan di n8n — keadaan
      // yang WAJAR selama alur belum dinyalakan, dan tak perlu berisik.
      const tingkat = r.status === 404 ? 'info' : 'error'
      if (tingkat === 'error') {
        console.error(`[otomasi] webhook ${kode} membalas ${r.status}`)
      }
    }
  } catch (err) {
    const e = err as Error
    // Abort = n8n lambat, bukan salah kita. Tetap dicatat supaya "otomasi
    // sering telat" punya jejak, bukan cuma firasat.
    console.error(`[otomasi] webhook ${kode} gagal: ${e.name === 'AbortError' ? 'timeout' : e.message}`)
  } finally {
    clearTimeout(jam)
  }
}

/** Dipakai penjaga CI supaya daftarnya tak perlu ditulis dua kali. */
export const KODE_ALUR_PERISTIWA = Object.values(PETA_PERISTIWA)
export const JENIS_PERISTIWA_BERALUR = Object.keys(PETA_PERISTIWA)
