import { router } from 'expo-router';
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { PenandaAntrean } from '@/components/PenandaAntrean';

/*
  ══════════════════════════════════════════════════════════════════════════
  LAINNYA — pintu ke modul kantor
  ══════════════════════════════════════════════════════════════════════════

  Keputusan founder 2026-08-31: layar LAPANGAN native, modul KANTOR lewat
  WebView. Halaman ini daftarnya.

  ── Kenapa disaring IZIN, bukan peran

  ADR-004 dan CLAUDE.md §5.1: literal peran dilarang sebagai gerbang
  otorisasi. Tenant yang membuat peran sendiri lewat UI (`direktur`,
  `kepala_proyek`) akan kehilangan menunya tanpa satu pun galat — persis
  cacat yang sudah diperbaiki di `_layout.tsx`, dan mengulanginya di sini
  berarti membangun kembali lubang yang sama.

  Kunci izin diambil dari tabel `permissions`, BUKAN dikarang.
  `audit-izin-benar-ada` merahkan CI untuk kunci hantu — dan kunci hantu
  menolak SEMUA orang tanpa gejala.

  ── Kenapa yang tak berhak DISEMBUNYIKAN, bukan ditampilkan lalu ditolak

  Menampilkan menu yang berujung 403 mengajari orang bahwa aplikasinya suka
  gagal. Yang tak berhak tak melihat pintunya sama sekali — dan penyaringan
  sungguhannya tetap di API, karena menyembunyikan tombol bukan keamanan.
*/

type Modul = {
  kunci: string;
  judul: string;
  ringkas: string;
  emoji: string;
  /**
   * Izin yang dibutuhkan. `null` = terbuka untuk semua yang sudah masuk.
   *
   * Array berarti SALAH SATU cukup, bukan semuanya. Dibutuhkan oleh layar
   * yang menyatukan beberapa jenis: "Pekerjaan Saya" berguna bagi yang
   * hanya punya `ncr:view`, dan menuntut `punch:view` juga akan
   * menyembunyikannya dari orang yang seharusnya melihatnya. Layarnya
   * sendiri menyaring lagi per jenis, jadi tak ada yang bocor.
   */
  izin: string | string[] | null;
  /**
   * Jalur NATIVE di dalam aplikasi. Kalau diisi, item ini membuka layar
   * React Native — bukan WebView.
   *
   * Layar lapangan yang tak muat di bilah tab tinggal di sini: bilah sudah
   * memuat delapan, dan yang kesembilan membuat tiap ikon menyempit sampai
   * sulit ditekan dengan ibu jari kotor di lapangan.
   */
  nativeJalur?: string;
};

const MODUL: Modul[] = [
  /* Layar LAPANGAN (native) di atas — yang paling sering dipakai orang yang
     membuka daftar ini dari lokasi, bukan dari kantor. */
  {
    kunci: 'pekerjaan', judul: 'Pekerjaan Saya', ringkas: 'Nasib temuan, NCR, dan izin yang Anda kirim',
    emoji: '📋', izin: ['punch:view', 'ncr:view', 'k3:permit:view'], nativeJalur: '/pekerjaan',
  },
  {
    kunci: 'punch', judul: 'Lapor Temuan', ringkas: 'Catat cacat di lokasi',
    emoji: '📌', izin: 'punch:manage', nativeJalur: '/punch/lapor',
  },
  {
    kunci: 'ncr', judul: 'Lapor NCR', ringkas: 'Pekerjaan menyimpang dari spesifikasi',
    emoji: '⚠️', izin: 'ncr:manage', nativeJalur: '/ncr/lapor',
  },
  {
    kunci: 'izin-kerja', judul: 'Izin Kerja', ringkas: 'Ajukan izin pekerjaan berbahaya',
    emoji: '🦺', izin: 'k3:permit:manage', nativeJalur: '/izin-kerja/ajukan',
  },
  { kunci: 'approval', judul: 'Persetujuan', ringkas: 'Yang menunggu keputusan Anda', emoji: '✅', izin: null },
  { kunci: 'keuangan', judul: 'Keuangan', ringkas: 'Invoice, kas, piutang', emoji: '💰', izin: 'finance:view' },
  { kunci: 'akuntansi', judul: 'Akuntansi', ringkas: 'Jurnal & buku besar', emoji: '📒', izin: 'gl:view' },
  { kunci: 'estimasi', judul: 'Estimasi', ringkas: 'RAB, AHSP, harga satuan', emoji: '📐', izin: 'cecep:price:view' },
  { kunci: 'procurement', judul: 'Pengadaan', ringkas: 'PO, permintaan material, vendor', emoji: '🚚', izin: 'procurement:view' },
  { kunci: 'gudang', judul: 'Gudang', ringkas: 'Stok & pergerakan material', emoji: '📦', izin: 'gudang:view' },
  { kunci: 'kontrak', judul: 'Kontrak', ringkas: 'Kontrak, addendum, klaim', emoji: '📄', izin: 'projects:view' },
  { kunci: 'jadwal', judul: 'Jadwal', ringkas: 'Milestone & kurva S', emoji: '🗓️', izin: 'projects:view' },
  { kunci: 'mutu', judul: 'Mutu', ringkas: 'NCR, inspeksi, uji', emoji: '🔍', izin: 'ncr:view' },
  { kunci: 'aset', judul: 'Aset', ringkas: 'Alat, sewa, penyusutan', emoji: '🏗️', izin: 'assets:view' },
  { kunci: 'sdm', judul: 'SDM', ringkas: 'Pegawai, cuti, timesheet', emoji: '👥', izin: 'sdm:pegawai:view' },
  { kunci: 'laporan', judul: 'Laporan', ringkas: 'Laporan progres & keuangan', emoji: '📊', izin: 'reports:view' },
];

export default function Lainnya() {
  const { izin } = useAuth();

  const boleh = (m: Modul) => {
    if (m.izin === null) return true;
    const perlu = Array.isArray(m.izin) ? m.izin : [m.izin];
    return perlu.some((k) => izin?.has(k));
  };
  const terlihat = MODUL.filter(boleh);

  return (
    <ScrollView style={s.wadah} contentContainerStyle={s.isi}>
      <Text style={s.judulHalaman}>Lainnya</Text>
      <Text style={s.keterangan}>
        Modul kantor. Dibuka di dalam aplikasi — sesi Anda ikut, tak perlu masuk lagi.
      </Text>

      {/*
        Penanda antrean — ditaruh di sini karena "Lainnya" adalah tempat
        KEMBALI dari tiga layar lapangan yang dibuka darinya (temuan, NCR,
        izin kerja): ketiganya `router.back()` sesudah simpan, dan pendaratan
        itulah kesempatan pertama memberi tahu bahwa kirimannya masih di HP.

        Sebelumnya penanda hanya ada di dashboard dan daftar kasbon. Mandor
        yang melapor dari lokasi lalu menutup aplikasi tak pernah melewati
        keduanya — jadi ia tak pernah tahu ada yang tertahan, dan yang ragu
        akan MENGISI ULANG. Isian ulang punya kunci idempotensi berbeda, jadi
        gerbang di server tak bisa menahannya: antrean yang tak terlihat
        menghasilkan duplikat yang justru hendak dicegahnya.
      */}
      <PenandaAntrean />

      {terlihat.length === 0 ? (
        /*
          Keadaan kosong yang MENJELASKAN, bukan sekadar "tak ada data".
          Daftar yang kosong karena izin terlihat sama dengan daftar yang
          kosong karena rusak — dan yang kedua membuat orang melapor, yang
          pertama tidak.
        */
        <View style={s.kosong}>
          <Text style={s.kosongJudul}>Tidak ada modul yang bisa dibuka</Text>
          <Text style={s.kosongIsi}>
            Peran Anda belum diberi akses ke modul kantor. Hubungi admin bila ini keliru.
          </Text>
        </View>
      ) : (
        terlihat.map((m) => (
          <Pressable
            key={m.kunci}
            style={({ pressed }) => [s.baris, pressed && s.barisTekan]}
            onPress={() => router.push(m.nativeJalur ?? `/web/${m.kunci}`)}
            accessibilityRole="button"
            accessibilityLabel={`Buka ${m.judul}`}
          >
            <Text style={s.emoji}>{m.emoji}</Text>
            <View style={s.teks}>
              <Text style={s.barisJudul}>{m.judul}</Text>
              <Text style={s.barisRingkas}>{m.ringkas}</Text>
            </View>
            <Text style={s.panah}>›</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wadah: { flex: 1, backgroundColor: '#F8FAFC' },
  isi: { padding: 16, paddingBottom: 32 },
  judulHalaman: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  keterangan: { fontSize: 13, color: '#5A616B', marginBottom: 18, lineHeight: 19 },
  baris: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  barisTekan: { backgroundColor: '#F3F4F6' },
  emoji: { fontSize: 22, marginRight: 12 },
  teks: { flex: 1 },
  barisJudul: { fontSize: 15, fontWeight: '600', color: '#111827' },
  barisRingkas: { fontSize: 12, color: '#5A616B', marginTop: 2 },
  panah: { fontSize: 22, color: '#9CA3AF', marginLeft: 8 },
  kosong: { paddingVertical: 40, alignItems: 'center' },
  kosongJudul: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 6 },
  kosongIsi: { fontSize: 13, color: '#5A616B', textAlign: 'center', lineHeight: 19 },
});
