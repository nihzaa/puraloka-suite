import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!
// Kunci publik — dipakai klien ber-token pengguna (lihat `klienUntukToken`).
const kunciPublik = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

// Auth client: used only for auth.getUser() token verification
export const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Admin client: service role with explicit Authorization header to bypass RLS.
// We force the service-role key in every request so that even if the auth state
// from supabaseAuth.getUser() bleeds into shared memory, our data queries always
// present the service-role key to the database.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${supabaseKey}` },
  },
})

// ============================================================================
// KLIEN PER-PERMINTAAN — memakai TOKEN PENGGUNA, bukan service_role
// ============================================================================
//
// Klien `supabase` di atas memakai kunci service_role, yang di sisi basis
// berperan `service_role` dengan `bypassrls = true`. Artinya seluruh 775 policy
// RLS TAK PERNAH DIEVALUASI untuk permintaan aplikasi — isolasi antar-tenant
// bergantung sepenuhnya pada penyaringan di lapis aplikasi (`request.db`).
//
// Untuk satu perusahaan itu memadai. Begitu ada pelanggan kedua, satu rute yang
// lupa memakai `request.db` berarti data PT A terlihat oleh PT B, TANPA satu pun
// galat — halaman yang menampilkan data perusahaan lain seolah miliknya sendiri.
//
// Klien ini menutup celah itu dengan meneruskan token pengguna ke PostgREST,
// sehingga koneksi berperan `authenticated` dan RLS BENAR-BENAR berjalan.
// Penyaringan aplikasi tetap ada; yang bertambah adalah lapis kedua yang
// dijamin basis data.
//
// ── Kenapa kunci publik, bukan service_role, yang dipakai di sini
//
// Kunci service_role di header `apikey` sudah cukup membuat PostgREST memakai
// peran istimewa — meneruskan token pengguna di `Authorization` TIDAK
// membatalkannya. Jadi kunci publiklah yang harus dipakai sebagai `apikey`,
// dan token pengguna yang menentukan identitas.
//
// ── Diukur sebelum dipasang (2026-08-28)
//
// Terhadap 115 tabel ber-RLS yang berisi data:
//
//     klien ber-token pengguna terbaca : 114 dari 115
//     peran ditukar TANPA token        :   3 dari 115   ← aplikasi mati
//
// Dan terhadap 100 tabel berisi data SAH milik tenant si pengguna, jumlah
// barisnya sama dengan service_role pada 99 tabel. Satu-satunya selisih adalah
// `notifications` (1.393 dari 6.426) — dan itu BENAR: policy
// `notifications_own_select` memang membatasi tiap orang pada notifikasinya
// sendiri. Itu privasi yang bekerja, bukan fitur yang hilang.
//
// ── Kenapa dibuat per-permintaan, bukan sekali di awal
//
// Token berbeda tiap pengguna dan kedaluwarsa. Klien yang di-cache lintas
// permintaan akan memakai identitas pengguna SEBELUMNYA — kebocoran yang jauh
// lebih buruk daripada yang sedang ditutup.
export function klienUntukToken(token: string): SupabaseClient {
  if (!kunciPublik) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY (atau SUPABASE_ANON_KEY) kosong. Tanpa kunci publik, ' +
        'klien ber-token tak bisa dibuat, dan memakai service_role sebagai gantinya ' +
        'akan MELEWATI RLS diam-diam — persis yang hendak ditutup.'
    )
  }
  return createClient(supabaseUrl, kunciPublik, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
