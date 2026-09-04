import { router, type Href } from 'expo-router';
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';
import { PenandaAntrean } from '@/components/PenandaAntrean';

/*
  Apakah WebView benar-benar bisa dipakai?

  Dua belas modul kantor di daftar ini semuanya menuju layar WebView. Kalau
  `react-native-webview` tak terpasang, layar itu sudah menangani
  ketiadaannya dengan pesan yang menyebut perintah pemasangannya — tapi orang
  baru tahu SESUDAH menekan, dan daftar yang menampilkan dua belas pintu yang
  semuanya buntu mengajari orang bahwa aplikasinya tak bisa dipercaya.

  Diperiksa SEKALI saat modul dimuat, bukan tiap render: `require` yang gagal
  itu mahal, dan hasilnya tak berubah selama aplikasi hidup.

  Keadaannya DIPERIKSA, bukan ditulis sebagai konstanta yang harus diingat
  seseorang untuk diubah — jadi begitu paketnya ada, penanda hilang sendiri.

  ── Yang TIDAK bisa dibuktikan dari luar aplikasi

  `require` ini hanya berhasil di bawah Metro. Paketnya menunjuk
  `"react-native": "src/index.ts"` sebagai entry, sementara Node memakai
  `"main": "index.js"` yang meminta `lib/WebView` — berkas yang hanya ada
  sebagai `WebView.android.js` / `WebView.ios.js` dan diselesaikan Metro
  lewat ekstensi platform.

  Artinya menjalankan pemeriksaan ini di Node SELALU memulangkan false,
  bahkan saat paketnya terpasang benar (diukur 2026-08-31: terpasang
  14.0.1, `require` dari Node gagal dengan "Cannot find module …
  lib/WebView"). Jadi jangan memakai skrip Node untuk membuktikan penanda
  ini bekerja — yang membuktikannya cuma menjalankan aplikasinya.
*/
const WEBVIEW_SIAP = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return !!require('react-native-webview')?.WebView;
  } catch {
    return false;
  }
})();

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
  /*
    Bertipe `Href`, bukan `string`.

    expo-router menghasilkan gabungan literal dari berkas rute yang
    BENAR-BENAR ada, dan `router.push()` menuntutnya. `string` membuat
    `tsc` merah di tempat pakai — bukan di tempat salahnya.

    Yang lebih penting daripada `tsc`: dengan `Href`, jalur ke layar yang
    dihapus atau di-rename memerahkan tipe SAAT ITU JUGA. Sebagai
    `string`, ia lolos build dan baru gagal di HP, sebagai layar kosong.
  */
  nativeJalur?: Href;
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
  /* Menuju `/sdm/timesheet`, bukan `/sdm` — yang terakhir tak punya halaman
     indeks dan menuju 404. Izinnya disamakan dengan yang dituntut halaman
     itu di `menu_items` (`sdm:timesheet:view`); sebelumnya
     `sdm:pegawai:view`, yang membuat entri tampil bagi orang yang justru
     ditolak halamannya. */
  { kunci: 'sdm', judul: 'Absensi & Timesheet', ringkas: 'Jam kerja pegawai', emoji: '👥', izin: 'sdm:timesheet:view' },
  { kunci: 'laporan', judul: 'Laporan', ringkas: 'Laporan progres & keuangan', emoji: '📊', izin: 'reports:view' },

  /*
    Lima modul LAPANGAN, ditambahkan 2026-08-31. Izinnya diambil dari kolom
    `required_permissions` tabel `menu_items` — sumber yang sama dengan menu
    web, bukan dikarang ulang di sini. Kalau tenant mengubah izin sebuah
    menu, web dan mobile ikut berubah bersama.

    Diukur terhadap `get_role_permissions()` — siapa yang benar-benar
    melihatnya:

        /lapangan   (terbuka)          semua yang sudah masuk
        /k3         k3:inspeksi:view   mandor Y · pm Y
        /proyek     projects:view      mandor Y · pm n
        /kalender   projects:view      mandor Y · pm n
        /risiko     risiko:view        mandor n · pm Y

    `pm` nol pada tiga di antaranya — itu bukan cacat entri ini melainkan
    gejala R-017 di RATIFIKASI (PM kehilangan 183 izin). Begitu founder
    memutuskan, entri ini ikut terbuka sendiri tanpa perubahan kode.
  */
  /*
    Izin `projects:view` DIAMBIL DARI GERBANG RUTENYA
    (`/api/v1/lapangan/ringkasan`, `requirePermission('projects:view')`),
    bukan dari `menu_items` yang mengosongkannya.

    Diukur 2026-08-31: 88 dari 163 menu web tak punya `required_permissions`,
    dan sidebar web memperlakukan daftar kosong sebagai "tampilkan ke semua"
    (`length === 0 → return true`). Klien yang cuma punya 8 izin karena itu
    melihat 88 menu yang hampir semuanya buntu. Datanya AMAN — API-nya
    berpagar — tetapi pintu yang tampil lalu menolak mengajari orang bahwa
    aplikasinya suka gagal.

    Mobile tak mewarisi cacat itu: entri di sini disaring izin yang
    BENAR-BENAR menjaga rutenya. Klien tetap melihat entri ini — ia memang
    memegang `projects:view`, dan isi halamannya (punch, ncr, inspeksi,
    submittal) semuanya izin yang klien punya.
  */
  { kunci: 'lapangan', judul: 'Lapangan', ringkas: 'Harian, inspeksi, punch list, serah terima', emoji: '🏗️', izin: 'projects:view' },
  { kunci: 'k3', judul: 'K3', ringkas: 'Inspeksi, insiden, JSA, RK3K', emoji: '🦺', izin: 'k3:inspeksi:view' },
  { kunci: 'proyek', judul: 'Proyek', ringkas: 'Daftar proyek & baseline', emoji: '📁', izin: 'projects:view' },
  { kunci: 'kalender', judul: 'Kalender', ringkas: 'Jadwal kerja', emoji: '📅', izin: ['projects:view', 'mandor:view'] },
  { kunci: 'risiko', judul: 'Risiko', ringkas: 'Register risiko, izin, sengketa', emoji: '⚠️', izin: 'risiko:view' },
];

export default function Lainnya() {
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const s = React.useMemo(() => gaya(c), [c]);
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
            onPress={() => router.push(m.nativeJalur ?? (`/web/${m.kunci}` as Href))}
            accessibilityRole="button"
            accessibilityLabel={`Buka ${m.judul}`}
          >
            <Text style={s.emoji}>{m.emoji}</Text>
            <View style={s.teks}>
              <Text style={s.barisJudul}>{m.judul}</Text>
              <Text style={m.nativeJalur || WEBVIEW_SIAP ? s.barisRingkas : s.barisBelumSiap}>
                {m.nativeJalur || WEBVIEW_SIAP
                  ? m.ringkas
                  : 'Belum tersedia di aplikasi — buka lewat browser'}
              </Text>
            </View>
            <Text style={s.panah}>›</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: 16, paddingBottom: 32 },
    judulHalaman: { fontSize: 22, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 4 },
    keterangan: { fontSize: 13, color: c.textSecondary, marginBottom: 18, lineHeight: 19 },
    baris: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceRaised,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    barisTekan: { backgroundColor: c.surfaceHover },
    emoji: { fontSize: 22, marginRight: 12 },
    teks: { flex: 1 },
    barisJudul: { fontSize: 15, fontFamily: FONT.isiTebal, color: c.textPrimary },
    barisRingkas: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    /* Bukan merah: ini bukan galat melainkan keadaan yang wajar pada build
       tertentu. Merah di dua belas baris sekaligus membuat layar terbaca
       seperti rusak. */
    barisBelumSiap: { fontSize: 12, color: '#92400E', marginTop: 2 },
    panah: { fontSize: 22, color: c.textSecondary, marginLeft: 8 },
    kosong: { paddingVertical: 40, alignItems: 'center' },
    kosongJudul: { fontSize: 15, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 6 },
    kosongIsi: { fontSize: 13, color: c.textSecondary, textAlign: 'center', lineHeight: 19 },
  });
}
