import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Membongkar company uji — MENONAKTIFKAN, bukan menghapus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HELPER INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-14. Tiga berkas test membongkar tenant ujinya begini:
 *
 *     await supabase.from('companies').delete().eq('id', companyId)
 *
 * Dan ketiganya **tak pernah berhasil**. Trigger `fn_company_no_casual_delete`
 * (migrasi 126 §8) menolak penghapusan company:
 *
 *     Company "…" tidak boleh dihapus. Nonaktifkan (is_active=false) atau
 *     jalankan prosedur off-boarding tenant.
 *
 * Alasan trigger itu tertulis di migrasinya, dan ia BENAR: *"untuk tenant,
 * penghapusan harus jadi keputusan sadar, bukan efek samping"*. Pembersih
 * test adalah persis "efek samping" yang dimaksud.
 *
 * ── Kenapa tak ada yang tahu selama ini
 *
 * Galatnya DITELAN. `supabase-js` memulangkan `{ error }` alih-alih melempar,
 * dan ketiga pemanggilan itu tak pernah memeriksanya. Jadi teardown-nya
 * "berhasil" dengan tenang, tiap jalan suite menambah satu tenant AKTIF, dan
 * tak satu pun test yang menyebutkannya.
 *
 * Gejalanya muncul di berkas LAIN, berbulan-bulan kemudian:
 *
 *     t9-kelola-badan-usaha : "ada akar grup tanpa pemilik: expected 3 to be 0"
 *
 * Tenant-tenant itu dibuat tanpa `owner_user_id` (setup-nya memang tak
 * membutuhkannya), jadi tiap sisa menambah satu akar grup yatim. Yang merah
 * berkas yang tak pernah membuat satu pun dari mereka.
 *
 * Kelas yang sama dengan `audit-catch-senyap.mjs` jaga di kode produksi —
 * hanya saja ini di test, tempat tak ada penjaga yang melihat.
 *
 * ── Kenapa MENONAKTIFKAN sudah cukup
 *
 * Yang merugikan bukan barisnya melainkan **keaktifannya**: fixture di
 * seluruh repo memilih tenant lewat `LIMIT 1` atas company AKTIF (CLAUDE.md
 * §7), dan `t9` hanya menghitung akar yang AKTIF. Tenant nonaktif tak lagi
 * mengganggu keduanya.
 *
 * Menghapusnya sungguhan butuh prosedur off-boarding tenant — dan itu bukan
 * pekerjaan teardown test.
 *
 * ⚠ Melempar bila gagal. Teardown yang diam saat gagal adalah cara cacat ini
 * lahir; helper yang mengulangi kesalahannya tak memperbaiki apa pun.
 */
export async function bongkarCompanyUji(
  supabase: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .update({ is_active: false })
    .eq('id', companyId)

  if (error) {
    throw new Error(
      `Gagal menonaktifkan company uji ${companyId}: ${error.message}. ` +
        'Sisa tenant AKTIF membuat fixture berkas LAIN mengundi tenant sampah.',
    )
  }
}
