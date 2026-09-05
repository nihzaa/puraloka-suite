import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, type Palet } from '@/lib/tema';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

/**
 * Warna lencana, diambil dari palet aktif.
 *
 * ⚠ Satu pasangan lama GAGAL WCAG AA, dan justru yang paling sering
 * muncul. DIHITUNG (teks di atas latarnya sendiri):
 *
 *     success  #15803D di #DCFCE7   4.57:1   lolos tipis
 *     warning  #D97706 di #FEF3C7   2.86:1   ❌ GAGAL
 *     danger   #B91C1C di #FEE2E2   5.30:1   lolos
 *     info     #1D4ED8 di #DBEAFE   5.49:1   lolos
 *     default  #374151 di #F3F4F6   9.37:1   lolos
 *
 * `warning` adalah lencana "Menunggu" dan "Ditunda" — status yang paling
 * banyak hadir di daftar approval, dan satu-satunya yang menuntut
 * tindakan. Yang paling perlu terbaca justru yang paling sulit dibaca.
 *
 * Token gelap yang menggantikan, dihitung di atas latar campurannya:
 * success 6.25:1 · warning 6.60:1 · danger 6.01:1 · info 5.60:1.
 *
 * Kenapa `audit-kontras-mobile.mjs` tak menangkapnya: warna ini hidup di
 * `Record` lalu dipasang saat render, bukan sebagai `color:` di gaya.
 * Bentuk yang sama dengan peta keparahan di `pekerjaan.tsx` dan
 * `placeholderTextColor` di `Input.tsx` — tiga tempat, satu kelas cacat.
 */
function warna(c: Palet, v: BadgeVariant): { bg: string; teks: string } {
  switch (v) {
    case 'success': return { bg: c.successBg, teks: c.success };
    case 'warning': return { bg: c.warningBg, teks: c.warning };
    case 'danger': return { bg: c.dangerBg, teks: c.danger };
    case 'info': return { bg: c.infoBg, teks: c.info };
    default: return { bg: c.surfaceHover, teks: c.textPrimary };
  }
}

export function Badge({ label, variant = 'default' }: { label: string; variant?: BadgeVariant }) {
  const { c } = useTema();
  const { bg, teks } = warna(c, variant);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: teks }]}>{label}</Text>
    </View>
  );
}

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active': return 'info';
    case 'completed': return 'success';
    case 'on_hold': return 'warning';
    case 'cancelled': return 'danger';
    case 'approved': return 'success';
    case 'rejected': return 'danger';
    case 'pending': return 'warning';
    case 'paid': return 'success';
    case 'unpaid': return 'danger';
    case 'overdue': return 'danger';
    /*
      Tiga status yang HILANG sampai 2026-09-04, ditemukan dari memotret
      layar mandor: lencananya menampilkan "submitted" apa adanya.

      `statusLabel` memakai `map[status] ?? status`, jadi kunci yang tak
      terdaftar MUNCUL MENTAH di layar — kata Inggris teknis di aplikasi
      berbahasa Indonesia untuk pengguna yang justru tak paham istilah
      teknis. Kelas yang dijaga `audit-jenis-tulis-punya-label.mjs` di
      sisi web; mobile tak pernah tercakup.

      Diukur dari data produksi, sepuluh status yang benar-benar ada:
      active · approved · completed · draft · on_hold · paid · pending ·
      rejected · settled · submitted
    */
    case 'draft': return 'default';
    case 'submitted': return 'info';
    case 'settled': return 'success';
    default: return 'default';
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Aktif',
    completed: 'Selesai',
    on_hold: 'Ditunda',
    cancelled: 'Dibatalkan',
    planning: 'Perencanaan',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    pending: 'Menunggu',
    paid: 'Lunas',
    unpaid: 'Belum Lunas',
    /*
      Bahasa Indonesia, dan dipilih dari kosakata yang dipakai di lapangan
      — bukan terjemahan harfiah.

      `submitted` → "Diajukan", bukan "Dikirim": yang dikirim adalah
      laporannya, tapi yang dimaksud adalah PENGAJUANNYA menunggu
      keputusan.

      `settled` → "Diselesaikan", bukan "Ditutup": kasbon yang settled
      sudah dipertanggungjawabkan, bukan sekadar tak aktif lagi.
    */
    draft: 'Draf',
    submitted: 'Diajukan',
    settled: 'Diselesaikan',
    overdue: 'Jatuh Tempo',
    harian: 'Harian',
    borongan: 'Borongan',
    progress_pct: 'Progress %',
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm - 2,
    alignSelf: 'flex-start',
  },
  label: {
    /*
      12px, bukan 11.

      Diukur lewat potret 2026-09-04: lencana ini menyumbang sebagian besar
      dari 75 teks di bawah 12px pada layar kasbon dan 27 pada layar proyek.
      Ia dipakai untuk STATUS ("Menunggu", "Disetujui", "Jatuh Tempo") —
      justru kata yang menentukan apakah pengguna perlu bertindak.

      Di bawah 12px teks tak terbaca di bawah matahari langsung, dan layar
      ini dibuka di lokasi proyek.
    */
    fontSize: HURUF.xs,
    fontFamily: FONT.isiTebal,
  },
});
