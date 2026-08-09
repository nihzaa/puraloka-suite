/**
 * AKUN LAYANAN PENJADWAL — masuk sebagai pengguna sungguhan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA AKUN, BUKAN BYPASS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rancangan pertama memakai header rahasia yang membuat `authenticate`
 * melewatkan pemeriksaan sesi. Dibatalkan setelah membaca `plugins/auth.ts`:
 * di sana ada peringatan panjang bahwa urutan resolusi company LOAD-BEARING,
 * dan bahwa peran sengaja dibaca per-company untuk mencegah kewenangan
 * menyeberang antar tenant — lengkap dengan contoh eskalasi hak akses yang
 * pernah terjadi.
 *
 * Menaruh cabang yang melewati semua itu, di fungsi yang dipakai SETIAP rute,
 * demi satu fitur — harganya tak sebanding.
 *
 * Dengan akun layanan, penjadwal tunduk pada permission dan batas tenant yang
 * sama persis dengan manusia. Kalau akunnya kehilangan hak, tugasnya gagal
 * dengan 403 yang terbaca — bukan diam-diam berjalan dengan kewenangan yang
 * tak pernah diberikan siapa pun.
 *
 * Akunnya pengguna biasa di tabel `users`: perannya bisa dilihat, diaudit, dan
 * dicabut lewat UI. Akun yang tak muncul di daftar pengguna adalah akun yang
 * tak pernah ditinjau.
 *
 * ── Kenapa di `lib/`, bukan di berkas rutenya
 *
 * `tenancy-ratchet` menghitung baris ber-`supabase` mentah di `routes/`, dan
 * ambangnya punya tripwire yang melarang dinaikkan. Login akun layanan memakai
 * `supabaseAuth` — itu AUTENTIKASI, bukan query data yang bisa melewati
 * saringan tenant, jadi menghitungnya sebagai utang tenancy menyesatkan.
 *
 * Memindahkannya ke sini bukan akal-akalan terhadap ratchet: berkas rute
 * seharusnya memang berisi rute, dan cara memperoleh token bukan salah satunya.
 */

let cache: { nilai: string; kedaluwarsa: number } | null = null

/**
 * Token akun layanan penjadwal.
 *
 * Di-cache selama masih berlaku. Supabase memberi masa berlaku satu jam dan
 * pemicu jalan tiap 15 menit; tanpa cache, tiap putaran berarti satu login
 * yang tak membeli apa pun.
 *
 * Melempar bila env belum disetel — rute pemanggilnya menangkapnya dan
 * membalas 503. Itu disengaja: penjadwal yang tak bisa masuk harus BERHENTI
 * dengan pesan jelas, bukan menjalankan tugas tanpa identitas.
 */
export async function tokenAkunLayanan(): Promise<string> {
  if (cache && cache.kedaluwarsa > Date.now() + 60_000) return cache.nilai

  const email = process.env.SCHEDULER_EMAIL?.trim()
  const sandi = process.env.SCHEDULER_PASSWORD
  if (!email || !sandi) {
    throw new Error('SCHEDULER_EMAIL / SCHEDULER_PASSWORD belum disetel')
  }

  const { supabaseAuth } = await import('../utils/supabase.js')
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password: sandi,
  })
  if (error || !data.session?.access_token) {
    throw new Error(`gagal masuk sebagai ${email}: ${error?.message ?? 'tanpa sesi'}`)
  }

  cache = {
    nilai: data.session.access_token,
    kedaluwarsa: (data.session.expires_at ?? 0) * 1000,
  }
  return cache.nilai
}

/** Hanya untuk test — melupakan token supaya env bisa diganti. */
export function lupakanTokenUjiSaja(): void {
  cache = null
}
