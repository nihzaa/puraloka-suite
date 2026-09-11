import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { labelKeperluan } from '@/lib/label';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RAPAT, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/*
  PERSETUJUAN — antrean keputusan, NATIVE.

  ══════════════════════════════════════════════════════════════════════════
  KENAPA LAYAR INI ADA, DAN KENAPA BUKAN WEBVIEW
  ══════════════════════════════════════════════════════════════════════════

  Keputusan founder 2026-09-11: **tidak ada WebView lagi** — "suka gagal dan
  ga nampil".

  Diukur ke produksi hari itu, dan keluhannya benar:

      https://app.puraloka-suite.duckdns.org/keuangan     307 → /login
      …procurement · gudang · mutu · k3                   307 → /login

  SEMUA modul, bukan sebagian. Dan `audit-sesi-webview-nyambung.mjs` HIJAU
  sepanjang itu — ia memeriksa bahwa NAMA cookie yang ditulis WebView sama
  dengan yang dibaca middleware, dan itu memang benar. Yang tak bisa ia
  lihat: apakah sesinya diterima. Penjaga yang mengukur sambungan nama tak
  pernah bisa membuktikan sesi hidup, dan batas itu tertulis di kepalanya
  sendiri.

  Bentuk kegagalan WebView yang membuatnya tak layak dipertahankan: TIGA
  lapis yang masing-masing benar sendiri (penanaman token di klien, gerbang
  cookie di middleware, SSR Next.js yang berjalan sebelum JS halaman ada),
  dan yang patah cuma sambungannya. Layar native tak punya lapis itu sama
  sekali — ia memanggil API dengan header `Authorization` yang sama seperti
  layar native lain yang sudah terbukti bekerja.

  ── Kenapa modul INI yang pertama

  Gelombang 1 dipilih dari "dipakai sambil berdiri di proyek", dan
  persetujuan adalah yang paling murni begitu: keputusannya diambil di
  jalan, di mobil, di lokasi — bukan di depan komputer. Menundanya berarti
  keputusan uang menunggu sampai seseorang kembali ke kantor.

  ── Yang layar ini TIDAK lakukan, dan itu disengaja

  Ia **tidak menyetujui apa pun**. Hanya menampilkan antrean, mengelompokkan
  per jenis, dan membuka detailnya.

  Alasannya bukan kekurangan waktu: tiap jenis approval punya endpoint
  keputusannya sendiri dengan aturan sendiri (SoD, level berjenjang, cek
  `pm_id`), dan `audit-approval-satu-pintu.mjs` menuntut seluruh keputusan
  lewat `utils/approval.ts`. Tombol "Setujui" yang menebak endpoint akan
  gagal diam-diam pada sebagian jenis — dan pada layar keputusan uang,
  kegagalan diam adalah bentuk terburuk.
*/

interface BarisInbox {
  jenis: string;
  label: string;
  id: string;
  judul: string | null;
  nomor: string | null;
  nominal: number | null;
  pengaju_id: string | null;
  dibuat_pada: string | null;
  project_id: string | null;
  level_selesai: number;
  jalur_ui: string;
  /** Pengaju tak boleh menyetujui pengajuannya sendiri (SoD). */
  saya_pengajunya: boolean;
}

interface Balasan {
  data: BarisInbox[];
  total: number;
  ringkas: Record<string, number>;
  /*
    Non-kosong berarti sebagian antrean TIDAK terbaca — dan itu WAJIB
    tampil. `approval-inbox.ts` menjelaskannya sendiri: tanpa ini "kosong"
    terbaca sebagai "tak ada pekerjaan", padahal artinya "saya gagal
    membaca sebagian". Untuk antrean keputusan, selisih itu menentukan.
  */
  dilewati: Array<{ jenis: string; sebab: string }>;
}

const ambilKunci = (b: BarisInbox) => `${b.jenis}:${b.id}`;

function fmtRupiah(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtTanggal(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Umur pengajuan dalam hari — angka yang paling menentukan urutan kerja.
 *
 * Antrean approval tanpa umur terbaca seperti daftar tugas yang semuanya
 * sama mendesaknya. Yang mengendap sembilan hari dan yang masuk pagi ini
 * butuh perlakuan berbeda, dan tanggal mentah menuntut pembacanya
 * menghitung sendiri.
 */
function umurHari(s: string | null): number | null {
  if (!s) return null;
  const ms = Date.now() - new Date(s).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/**
 * Satu kartu antrean — komponen SENDIRI dan ter-`memo`.
 *
 * Sama seperti `kasbon/index.tsx`: `FlatList` merender ulang `renderItem`
 * tiap kali induknya berubah, dan tanpa `memo` seluruh kartu dirakit ulang
 * pada tiap refresh. Pedoman stack `react-native` menandainya severity
 * High.
 */
const KartuAntrean = React.memo(function KartuAntrean({
  b,
  s,
  c,
  onBuka,
  indeks,
}: {
  b: BarisInbox;
  s: ReturnType<typeof gaya>;
  c: Palet;
  onBuka: (b: BarisInbox) => void;
  /**
   * Urutan baris - diteruskan ke `Card` supaya kartu MASUK bertahap
   * (2026-09-12, kandidat C).
   *
   * Diambil dari `renderItem` FlatList, bukan dihitung sendiri: FlatList
   * MELEPAS kartu di luar jendela render dan memasangnya kembali saat
   * tergulir balik, jadi indeks yang dihitung lokal akan salah begitu
   * daftarnya panjang.
   */
  indeks: number;
}) {
  const umur = umurHari(b.dibuat_pada);
  const tanggal = fmtTanggal(b.dibuat_pada);

  return (
    <Tekan
      onPress={() => onBuka(b)}
      accessibilityRole="button"
      accessibilityLabel={`${b.label}${b.judul ? `, ${labelKeperluan(b.judul)}` : ''}${
        b.nominal != null ? `, ${fmtRupiah(b.nominal)}` : ''
      }. Buka detail.`}
    >
      <Card style={s.card} indeks={indeks} menonjol={umur != null && umur > 7}>
        {/*
          BATANG TEPI menggantikan lencana umur (2026-09-12, kandidat C).

          Sebelumnya umur tampil sebagai pil berwarna di sebelah pil jenis
          - dan dua pil berdampingan adalah cacat yang sudah tercatat
          (CLAUDE.md 8a.3: "dua pil merah berdampingan; keduanya benar
          sendiri-sendiri, yang salah artinya BERSAMA"). Dengan nominal
          yang kini memimpin pada 38px, dua pil di atasnya membuat tiga
          hal bersaing di satu kartu.

          Batang 3px membawa tingkat mendesak TANPA menambah satu objek
          pun ke layar.

          Ambangnya TIDAK berubah - tetap >7 hari, sama dengan otomasi
          pengingat (`ipc-mengendap-draf`, `cuti-belum-diputus`). Dua
          sumber yang menyimpang membuat mandor melihat "biasa" pada baris
          yang sudah ditandai sistem sebagai terlambat.
        */}
        <View
          style={[
            s.tepiUmur,
            umur != null && umur > 7
              ? { backgroundColor: c.danger }
              : umur != null && umur > 3
                ? { backgroundColor: c.warning }
                : null,
          ]}
        />
        <View style={s.isiKartu}>
        <View style={s.barisAtas}>
          <Text style={s.jenisLabel}>{b.label.toUpperCase()}</Text>
          {/*
            Umur tetap TERTULIS, bukan hanya diwarnai - WCAG 1.4.1, aturan
            yang sama dengan halaman aset & lapangan. Beranda dibuka di HP
            di bawah sinar matahari, tempat merah dan kuning praktis sama.
          */}
          {umur != null ? (
            <Text
              style={[
                s.umurTeks,
                umur > 7
                  ? { color: c.danger }
                  : umur > 3
                    ? { color: c.warning }
                    : null,
              ]}
            >
              {umur === 0 ? 'Hari ini' : `${umur} hari`}
            </Text>
          ) : null}
        </View>

        {/*
          Judul dibiarkan MEMBUNGKUS dua baris, bukan dipotong.

          `ui-ux-pro-max` §6 `truncation-strategy`: "Prefer wrapping over
          truncation". Di layar tanpa tooltip, teks terpotong berarti
          informasinya HILANG — dan judul approval di repo ini memuat
          pembeda justru di belakang (nama proyek, termin ke berapa).
        */}
        {/*
          `judul` dilewatkan `labelKeperluan()`.

          Terlihat dari potret: kartu kasbon berbunyi `gaji_tukang` —
          kunci mentah ber-underscore, di layar tempat orang memutuskan
          pengeluaran dua juta rupiah. API meneruskan kolom `purpose` apa
          adanya (`approval-inbox.ts` memetakan `judul` dari kolom sumber
          tiap jenis), jadi perapiannya memang tugas sisi tampil.

          Fungsinya dari `lib/label.ts`, BUKAN peta lokal: `kasbon/index.tsx`
          sudah punya peta yang sama, dan dua salinan yang menyimpang
          membuat satu baris basis tampil dengan dua nama berbeda di dua
          layar — tanpa galat, dan tak seorang pun tahu mana yang benar.
        */}
        <Text style={s.judul} numberOfLines={2}>
          {b.judul ? labelKeperluan(b.judul) : (b.nomor ?? 'Tanpa judul')}
        </Text>

        {/*
          `numberOfLines={1}`: nominal TAK BOLEH membungkus. Diukur di
          `kasbon/index.tsx` 2026-09-12 — angka yang pecah dua baris
          terbaca "Rp 1.200.00" lalu "0", dan itu angka yang berbeda.
          Di sini nominal berdiri di barisnya sendiri jadi belum pernah
          pecah; dipasang sebagai pagar, bukan tambalan.
        */}
        {b.nominal != null ? (
          <Text style={s.nominal} numberOfLines={1}>
            {fmtRupiah(b.nominal)}
          </Text>
        ) : null}

        <View style={s.metaBaris}>
          {b.nomor ? (
            <View style={s.metaItem}>
              <Ionicons
                name="document-text-outline"
                size={13}
                color={c.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={s.meta}>{b.nomor}</Text>
            </View>
          ) : null}
          {tanggal ? (
            <View style={s.metaItem}>
              <Ionicons
                name="calendar-outline"
                size={13}
                color={c.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={s.meta}>{tanggal}</Text>
            </View>
          ) : null}
        </View>

        {/*
          SoD ditandai di KARTU, bukan hanya saat keputusan ditolak.

          Pengaju tak boleh menyetujui pengajuannya sendiri. Kalau tanda itu
          baru muncul sesudah dibuka dan ditolak server, mandor membuka baris
          yang tak pernah bisa ia kerjakan — berulang, tiap kali antrean
          dibuka. Menandainya di sini membuat antreannya jujur sejak pandangan
          pertama.
        */}
        {b.saya_pengajunya ? (
          <View style={s.sodBaris}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={c.warning}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.sodTeks}>Pengajuan Anda — diputuskan orang lain</Text>
          </View>
        ) : null}
      </View>
      </Card>
    </Tekan>
  );
});

export default function PersetujuanScreen() {
  const router = useRouter();
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [baris, setBaris] = useState<BarisInbox[]>([]);
  const [ringkas, setRingkas] = useState<Record<string, number>>({});
  const [dilewati, setDilewati] = useState<Balasan['dilewati']>([]);
  const [jenisAktif, setJenisAktif] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    `res.data?.data` — BERSARANG, dan itu diperiksa ke sumbernya.

    `approval-inbox.ts:276` mengirim `{ data, total, ringkas, dilewati }`.
    Membaca `res.data` langsung akan menyimpan OBJEK ke state bertipe array,
    dan `FlatList` merender kosong TANPA GALAT — persis cacat dashboard
    2026-09-04 yang menampilkan "Rp 0" atas Rp 7,14 M, dan yang melahirkan
    `audit-bentuk-balasan-mobile.mjs`.

    `res.data` bertipe `any` dari axios, jadi `tsc` tak bisa menolongnya.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/approval/inbox');
      setBaris(res.data?.data ?? []);
      setRingkas(res.data?.ringkas ?? {});
      setDilewati(res.data?.dilewati ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'antrean persetujuan'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const onRefresh = () => {
    setRefreshing(true);
    muat();
  };

  /*
    Penyaring jenis dibangun dari `ringkas` milik SERVER, bukan dari
    menghitung `baris` di klien.

    Keduanya biasanya sama, dan justru itu bahayanya: kalau suatu saat API
    membatasi jumlah baris yang dikirim, hitungan klien akan diam-diam
    menyimpang dari kenyataan — dan angka di chip adalah yang dipakai orang
    memutuskan mana yang dikerjakan lebih dulu.
  */
  const jenisTersedia = useMemo(() => {
    const dariRingkas = Object.entries(ringkas)
      .filter(([, n]) => n > 0)
      .map(([jenis, n]) => ({
        jenis,
        n,
        label: baris.find((b) => b.jenis === jenis)?.label ?? jenis,
      }));
    return dariRingkas.sort((a, b) => b.n - a.n);
  }, [ringkas, baris]);

  const terlihat = useMemo(
    () => (jenisAktif ? baris.filter((b) => b.jenis === jenisAktif) : baris),
    [baris, jenisAktif]
  );

  /*
    `jalur_ui` sengaja TIDAK dipakai untuk navigasi di sini.

    Ia jalur HALAMAN WEB (`audit-inbox-jalur-nyata.mjs` menjaganya menunjuk
    halaman yang ada), dan aplikasi ini tak lagi punya WebView untuk
    membukanya. Mengarahkan ke sana berarti menghidupkan kembali persis
    cacat yang keputusan founder hapus.

    Sampai layar detail tiap jenis dibangun (gelombang berikutnya), kartu
    membuka detail PROYEK-nya — satu-satunya tujuan native yang pasti ada
    dan relevan. Baris tanpa `project_id` tidak bisa ditekan, dan itu
    dinyatakan lewat `accessibilityState`, bukan dibiarkan diam.
  */
  const buka = useCallback(
    (b: BarisInbox) => {
      if (b.project_id) router.push(`/(app)/proyek/${b.project_id}`);
    },
    [router]
  );

  const renderKartu = useCallback(
    ({ item, index }: { item: BarisInbox; index: number }) => (
      <KartuAntrean b={item} s={styles} c={c} onBuka={buka} indeks={index} />
    ),
    [styles, c, buka]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar
        judul="Persetujuan"
        penjelas={
          baris.length > 0
            ? `${baris.length} menunggu keputusan Anda`
            : 'Antrean keputusan yang masuk ke Anda'
        }
      />

      <FlatList
        data={terlihat}
        keyExtractor={ambilKunci}
        renderItem={renderKartu}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {/*
              Galat MUAT dan keadaan KOSONG dipisah — disiplin yang
              ditegakkan `uji-galat-muat-terpisah.mjs` di apps/web.
              "Tidak ada yang menunggu" pada layar yang GAGAL MEMUAT adalah
              kebohongan yang tenang, dan di antrean keputusan ia membuat
              orang pulang dengan pekerjaan yang belum dilihat.
            */}
            {galat ? <Galat judul="Antrean tidak bisa dimuat" pesan={galat} /> : null}

            {/*
              `dilewati` ditampilkan SEBAGAI PERINGATAN, bukan disembunyikan.

              API sengaja mengirimnya (`approval-inbox.ts:281`), dengan
              alasan yang ditulis di sana: supaya "kosong" tak pernah
              terbaca sebagai "tak ada pekerjaan". Klien yang membuangnya
              membatalkan seluruh maksud itu.
            */}
            {dilewati.length > 0 ? (
              <View style={styles.dilewati}>
                <View style={styles.dilewatiKepala}>
                  <Ionicons
                    name="warning-outline"
                    size={16}
                    color={c.warning}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <Text style={styles.dilewatiJudul}>
                    {dilewati.length} jenis tidak terbaca
                  </Text>
                </View>
                <Text style={styles.dilewatiIsi}>
                  Daftar di bawah belum lengkap. Buka Persetujuan di komputer
                  untuk memastikan, atau hubungi admin bila berulang.
                </Text>
              </View>
            ) : null}

            {/*
              Chip penyaring hanya muncul bila ADA yang bisa disaring.

              Satu jenis saja berarti chip-nya tak pernah mengubah apa pun —
              kontrol yang hadir tanpa pernah berguna mengajari orang
              mengabaikan barisnya.
            */}
            {jenisTersedia.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipBaris}
              >
                <Chip
                  label="Semua"
                  n={baris.length}
                  aktif={jenisAktif === null}
                  onPress={() => setJenisAktif(null)}
                  s={styles}
                />
                {jenisTersedia.map((j) => (
                  <Chip
                    key={j.jenis}
                    label={j.label}
                    n={j.n}
                    aktif={jenisAktif === j.jenis}
                    onPress={() => setJenisAktif(j.jenis)}
                    s={styles}
                  />
                ))}
              </ScrollView>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : jenisAktif ? (
            <Kosong
              ikon="funnel-outline"
              judul="Tidak ada di jenis ini"
              petunjuk="Ketuk “Semua” di atas untuk melihat seluruh antrean."
            />
          ) : (
            <Kosong
              ikon="checkmark-done-outline"
              judul="Tidak ada yang menunggu"
              petunjuk="Tarik layar ke bawah untuk memeriksa lagi. Pengajuan baru akan muncul di sini."
            />
          )
        }
        initialNumToRender={8}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function Chip({
  label,
  n,
  aktif,
  onPress,
  s,
}: {
  label: string;
  n: number;
  aktif: boolean;
  onPress: () => void;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <Tekan
      onPress={onPress}
      accessibilityRole="button"
      /*
        `selected`, bukan hanya warna. Pembaca layar tak melihat warna —
        tanpa state ini, chip aktif dan tak-aktif diumumkan sama persis.
      */
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={`${label}, ${n} pengajuan${aktif ? ', terpilih' : ''}`}
      style={[s.chip, aktif && s.chipAktif]}
    >
      {/*
        Label dan angka DIPISAH jadi dua `Text`.

        Satu `Text` berisi "Pengeluaran Proyek 5" akan memotong dari
        belakang — dan yang di belakang justru angkanya. Dipisah, elipsis
        hanya memakan label; `flexShrink: 0` menahan angka tetap utuh.
      */}
      <Text style={[s.chipTeks, aktif && s.chipTeksAktif]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.chipAngka, aktif && s.chipTeksAktif]}>{n}</Text>
    </Tekan>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceSubtle,
    },
    list: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    /*
      `padding: 0` + `flexDirection: row` supaya BATANG TEPI menempel penuh
      dari tepi atas ke tepi bawah kartu. Isian pindah ke `isiKartu`;
      tanpa itu batangnya melayang di dalam padding milik `Card`.

      `overflow: hidden` memotong batang mengikuti radius sudut kartu.
    */
    card: { padding: 0, flexDirection: 'row', overflow: 'hidden' },
    isiKartu: { flex: 1, padding: SPASI.lg, gap: 6 },

    barisAtas: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPASI.sm,
    },

    judul: {
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      lineHeight: HURUF.base * 1.35,
    },

    /*
      Nominal memakai `tabular-nums` supaya digit sejajar antar-kartu —
      mata membandingkan besaran tanpa membaca angkanya satu per satu.

      ⚠ Risiko iOS tercatat di QUEUE `MOBILE-TABULAR-IOS`: `fontVariant`
      tak diterapkan pada font kustom expo-font (expo/expo#20048), dan
      gagalnya SENYAP. Di Android — yang dipakai mandor — ia bekerja sejak
      react-native#27006. Dipakai karena kalau gagal, hasilnya sekadar
      kembali seperti sekarang: tak ada yang rusak, cuma tak sejajar.
    */
    /*
      TINGKAT DISPLAY, bukan `lg` (2026-09-12, kandidat C).

      Sebelumnya 17px - hanya dua piksel di atas teks isi (15px), sehingga
      nominal tak pernah benar-benar memimpin kartunya. Diukur terhadap
      tiga sistem yang dibaca mahal:

          JANGKAUAN SKALA (terbesar / terkecil)
            Puraloka (lama)   2,50x
            Linear            6,00x
            Ramp              6,40x

      Pada 2,5x tak ada yang bisa memimpin, jadi hierarki jatuh ke warna
      dan kotak. Itu sebab kerataan yang founder sebut "kaku".

      `RAPAT.display` menyertainya: pada ukuran besar jarak antar-huruf
      tampak MELEBAR sendiri, jadi tracking negatif mengembalikannya ke
      rapat yang terbaca disengaja. Revolut memakai -2,72px pada headline
      136px - otoritas dari ukuran dan tracking, bukan dari ketebalan.

      `lineHeight` dipaku ~1,1x ukuran: bawaan RN memberi ruang berlebih,
      dan angka besar lalu tampak melayang alih-alih memimpin blok di
      bawahnya. Linear memakai line-height 1,00 di seluruh tingkat display.
    */
    /*
      Batang tepi kiri. Kartu memakai `overflow: hidden` + `padding: 0`
      pada gaya `card` supaya batang menempel penuh dari atas ke bawah;
      isian dipindahkan ke `isiKartu`.
    */
    tepiUmur: { width: 3, backgroundColor: 'transparent' },
    /*
      Jenis approval sebagai LABEL KAPITAL, bukan pil berwarna.

      Tiga dari empat baris di layar ini berbunyi "Kasbon" - memberinya
      kotak berwarna justru menonjolkan hal yang paling TIDAK membedakan
      satu baris dari baris lain, sambil memakan perhatian yang dibutuhkan
      nominalnya.

      `RAPAT.labelKapital` meregangkannya: huruf besar tak punya
      ascender/descender yang memberi ritme, jadi tanpa regangan ia
      terbaca sebagai blok padat - salah satu penanda paling cepat dari
      UI murah. Ramp memakai +0,018em pada label kapital 10px.
    */
    jenisLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      letterSpacing: RAPAT.labelKapital,
      color: c.textMuted,
    },
    umurTeks: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    nominal: {
      fontSize: HURUF.display,
      fontFamily: FONT.judul,
      letterSpacing: RAPAT.display,
      lineHeight: 42,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },

    metaBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: SPASI.md, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    sodBaris: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    sodTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.warning, flex: 1 },

    dilewati: {
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: 10,
      padding: SPASI.md,
      gap: 4,
      marginBottom: SPASI.md,
    },
    dilewatiKepala: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dilewatiJudul: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.warning },
    dilewatiIsi: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    /*
      Chip TIDAK memanjang mengikuti labelnya.

      Terlihat dari potret 360dp: "Pengeluaran Proyek 5" terpotong di tepi
      kanan, dan potongannya jatuh persis di angkanya — chip yang gunanya
      menyebutkan JUMLAH justru kehilangan jumlahnya.

      Percobaan pertama menambah `paddingRight` supaya ada ruang di ujung.
      Alasannya benar (daftar mendatar butuh isyarat "ada lagi"), tetapi
      tak menyelesaikan apa pun: chip ketiga memang LEBIH LEBAR daripada
      sisa layar, jadi ia tetap terpotong — cuma bergeser sedikit.

      Yang bekerja: `maxWidth` pada chip-nya. Label panjang dipotong dengan
      elipsis di TENGAH label, dan angkanya — yang berada di elemen
      terpisah — selalu utuh. Labelnya boleh tak terbaca penuh; angkanya
      tidak boleh.

      Pelajarannya sama dengan kartu kasbon yang tercatat di berkas lain:
      alasan yang benar bisa menghasilkan penerapan yang salah, dan hanya
      melihat hasilnya yang bisa membedakan.
    */
    chipBaris: {
      gap: SPASI.sm,
      paddingBottom: SPASI.md,
      paddingRight: SPASI.lg,
    },
    /*
      `minHeight: SENTUH_MIN` — chip adalah sasaran sentuh, bukan label.
      44px batas Apple HIG, dan yang menekannya ibu jari bersarung di
      lokasi proyek.
    */
    chip: {
      minHeight: SENTUH_MIN,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      /*
        240 dipilih dari lebar layar terkecil yang didukung (360dp) dikurangi
        padding daftar: satu chip tak boleh memakan seluruh baris, sebab
        chip yang memenuhi layar tak terbaca sebagai bagian dari DERETAN.
      */
      maxWidth: 240,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipAktif: { backgroundColor: c.navyLight, borderColor: c.navy },
    chipTeks: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      flexShrink: 1,
    },
    /* Angka TAK BOLEH menyusut — ia alasan chip ini ada. */
    chipAngka: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      color: c.textSecondary,
      flexShrink: 0,
      fontVariant: ['tabular-nums'],
    },
    chipTeksAktif: { color: c.navy, fontFamily: FONT.isiTebal },
  });
}
