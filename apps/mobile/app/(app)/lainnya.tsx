import { router, type Href } from 'expo-router';
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';
import { PenandaAntrean } from '@/components/PenandaAntrean';
import { KepalaLayar } from '@/components/ui/KepalaLayar';

/*
  ══════════════════════════════════════════════════════════════════════════
  TIDAK ADA WEBVIEW LAGI — keputusan founder 2026-09-11
  ══════════════════════════════════════════════════════════════════════════

  "saya gamau ada webview lagi, suka gagal dan ga nampil"

  Diukur ke produksi hari itu, dan keluhannya benar — SEMUA modul, bukan
  sebagian:

      app.puraloka-suite.duckdns.org/keuangan      307 → /login
      …procurement · gudang · mutu · k3            307 → /login

  ── Kenapa penjaga hijau selama itu

  `audit-sesi-webview-nyambung.mjs` memeriksa bahwa NAMA cookie yang ditulis
  WebView sama dengan yang dibaca middleware — dan itu memang benar. Batas
  itu tertulis di kepalanya sendiri: "ini sambungan NAMA, bukan bukti sesi
  hidup". Penjaga yang mengukur sambungan nama tak akan pernah bisa
  membuktikan halamannya tampil.

  ── Kenapa arsitekturnya memang rapuh

  Tiga lapis yang masing-masing BENAR sendiri: penanaman token di klien,
  gerbang cookie di `middleware.ts`, dan SSR Next.js yang berjalan di server
  sebelum satu baris JS halaman ada. Yang patah cuma sambungannya — dan
  bentuk kegagalan itu tak menghasilkan galat di lapisan mana pun.

  Layar native tak punya lapis itu sama sekali. Ia memanggil API dengan
  header `Authorization` yang sama seperti layar native lain yang sudah
  terbukti bekerja setiap hari.

  ── Yang menggantikannya, dan yang BELUM

  Modul ber-`nativeJalur` membuka layar native. Yang belum punya
  ditampilkan sebagai baris MATI — tak bisa ditekan, dengan sebabnya
  tertulis.

  Baris mati sengaja tidak dihapus dari daftar. Menghilangkannya membuat
  orang yang tahu modulnya ada menyimpulkan aplikasinya kehilangan fitur,
  lalu mencari-cari. Yang terlihat-tapi-belum-ada lebih jujur daripada yang
  hilang tanpa penjelasan — dan daftarnya sendiri jadi peta pekerjaan yang
  tersisa.
*/

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
  { kunci: 'approval', judul: 'Persetujuan', ringkas: 'Yang menunggu keputusan Anda', emoji: '✅', izin: null, nativeJalur: '/persetujuan' },
  { kunci: 'keuangan', judul: 'Keuangan', ringkas: 'Invoice, kas, piutang', emoji: '💰', izin: 'finance:view' },
  { kunci: 'akuntansi', judul: 'Akuntansi', ringkas: 'Jurnal & buku besar', emoji: '📒', izin: 'gl:view' },
  { kunci: 'estimasi', judul: 'Estimasi', ringkas: 'RAB, AHSP, harga satuan', emoji: '📐', izin: 'cecep:price:view' },
  { kunci: 'procurement', judul: 'Pengadaan', ringkas: 'PO, permintaan material, vendor', emoji: '🚚', izin: 'procurement:view' },
  { kunci: 'gudang', judul: 'Gudang', ringkas: 'Stok & pergerakan material', emoji: '📦', izin: 'gudang:view', nativeJalur: '/gudang' },
  { kunci: 'kontrak', judul: 'Kontrak', ringkas: 'Kontrak, addendum, klaim', emoji: '📄', izin: 'projects:view' },
  { kunci: 'jadwal', judul: 'Jadwal', ringkas: 'Milestone & kurva S', emoji: '🗓️', izin: 'projects:view' },
  { kunci: 'mutu', judul: 'Mutu & K3', ringkas: 'NCR, inspeksi, dokumen kepatuhan', emoji: '🔍', izin: 'ncr:view', nativeJalur: '/mutu' },
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
  { kunci: 'lapangan', judul: 'Lapangan', ringkas: 'Progres, milestone, temuan proyek', emoji: '🏗️', izin: 'projects:view', nativeJalur: '/lapangan' },
  { kunci: 'proyek', judul: 'Proyek', ringkas: 'Daftar proyek & baseline', emoji: '📁', izin: 'projects:view', nativeJalur: '/proyek' },
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
      <KepalaLayar
        judul="Lainnya"
        penjelas="Modul kantor — dibuka di dalam aplikasi, sesi Anda ikut"
      />

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
        terlihat.map((m) => {
          const siap = Boolean(m.nativeJalur);

          /*
            Modul tanpa layar native TIDAK BISA DITEKAN — bukan ditekan
            lalu memunculkan pesan.

            Sebelumnya barisnya tetap hidup dan membuka WebView yang gagal.
            Menekan sesuatu yang tak pernah berhasil, berulang, adalah cara
            tercepat mengajari orang bahwa aplikasinya tak bisa dipercaya —
            dan itu persis keluhan yang menghapus WebView.

            `disabled` + `accessibilityState.disabled` supaya pembaca layar
            mengumumkannya juga; tanpa itu TalkBack menyebutnya tombol biasa
            dan penggunanya menekan tanpa tahu.
          */
          if (!siap) {
            return (
              <View
                key={m.kunci}
                style={[s.baris, s.barisMati]}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${m.judul}, belum tersedia di aplikasi`}
              >
                <Text style={[s.emoji, s.emojiMati]}>{m.emoji}</Text>
                <View style={s.teks}>
                  <Text style={[s.barisJudul, s.barisJudulMati]}>{m.judul}</Text>
                  <Text style={s.barisBelumSiap}>
                    Belum ada di aplikasi — buka lewat komputer
                  </Text>
                </View>
              </View>
            );
          }

          return (
            <Pressable
              key={m.kunci}
              style={({ pressed }) => [s.baris, pressed && s.barisTekan]}
              onPress={() => router.push(m.nativeJalur as Href)}
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
          );
        })
      )}
    </ScrollView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: 16, paddingBottom: 32 },
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
    /*
      Baris MATI: diredupkan, tanpa panah, tanpa latar hover.

      Redup lewat opacity BUKAN lewat warna teks kelabu — kelabu di atas
      putih gagal kontras WCAG (`audit-kontras-mobile.mjs`, ambang 4.5:1);
      satu kelabu yang "terlihat wajar" tercatat di berkas itu hanya 2,54:1.
      Opacity menurunkan teks dan latarnya bersama-sama, jadi rasio di
      antara keduanya tetap.

      ⚠ Nilai hex-nya sengaja TIDAK ditulis di sini: `audit-warna-mobile-
      bertoken.mjs` memindai TEKS, jadi menyebut hex untuk menerangkan
      kenapa ia dihindari tetap terhitung sebagai pemakaian. Penjaga itu
      merah atas komentar ini pada percobaan pertama (CLAUDE.md §8a.2).

      Panah SENGAJA tak digambar: panah adalah janji bahwa ada tujuan.
    */
    barisMati: { opacity: 0.55 },
    emojiMati: { opacity: 0.7 },
    barisJudulMati: { color: c.textSecondary },
    emoji: { fontSize: 22, marginRight: 12 },
    teks: { flex: 1 },
    barisJudul: { fontSize: 15, fontFamily: FONT.isiTebal, color: c.textPrimary },
    barisRingkas: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    /* Bukan merah: ini bukan galat melainkan keadaan yang wajar pada build
       tertentu. Merah di dua belas baris sekaligus membuat layar terbaca
       seperti rusak. */
    barisBelumSiap: { fontSize: 12, color: c.warning, marginTop: 2 },
    panah: { fontSize: 22, color: c.textSecondary, marginLeft: 8 },
    kosong: { paddingVertical: 40, alignItems: 'center' },
    kosongJudul: { fontSize: 15, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 6 },
    kosongIsi: { fontSize: 13, color: c.textSecondary, textAlign: 'center', lineHeight: 19 },
  });
}
