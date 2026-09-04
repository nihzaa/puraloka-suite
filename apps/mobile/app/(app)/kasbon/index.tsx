import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PenandaAntrean } from '@/components/PenandaAntrean';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

interface Kasbon {
  id: string;
  amount: number;
  purpose: string;
  status: string;
  created_at: string;
  kasbon_date?: string;
  notes?: string;
  /*
    `project`, BUKAN `projects`.

    API meng-alias-kan relasinya: `project:projects!kasbons_project_id_fkey`
    (kasbons.ts:27). Versi sebelumnya berkas ini membaca `k.projects` —
    selalu undefined, jadi nama proyek TAK PERNAH tampil di kartu kasbon.
    Tak ada galat: `?.` menelannya, dan barisnya sekadar tak dirender.
  */
  project?: { id?: string; name?: string };
}

/*
  `keyExtractor` memakai `id` BASIS, bukan indeks larik.

  Pedoman stack `react-native`, severity High: indeks sebagai kunci
  membuat React memasangkan ulang baris yang salah begitu daftarnya
  diurut, disaring, atau di-refresh — keadaan yang terlihat sebagai
  "status kasbon tiba-tiba pindah ke baris lain".
*/
const ambilKunci = (k: Kasbon) => k.id;

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: 'Gaji Tukang',
  uang_makan: 'Uang Makan',
  pembelian_alat: 'Pembelian Alat',
  operasional: 'Operasional',
  lain_lain: 'Lain-lain',
};

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Satu kartu kasbon — komponen SENDIRI dan ter-`memo`.
 *
 * Bukan gaya penulisan: `FlatList` merender ulang `renderItem` tiap kali
 * induknya berubah (refresh, galat, keadaan muat). Tanpa `memo`, 67 kartu
 * dirakit ulang setiap kali — di HP kelas menengah itu terasa sebagai
 * gulir yang tersendat.
 *
 * Pedoman stack `react-native` menandainya severity **High**:
 * "Memoize list item components — React.memo for list items".
 */
const KartuKasbon = React.memo(function KartuKasbon({
  k,
  s,
  c,
}: {
  k: Kasbon;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  return (
    <Card style={s.card}>
      {/*
        Susunan kepala kartu: NOMINAL + STATUS berdampingan, keperluan di
        baris penuh di bawahnya.

        ⚠ Ini iterasi KEDUA, dan yang pertama saya perbaiki lewat potret —
        percobaan itu ditulis di sini supaya tak diulang.

        Percobaan 1 memindahkan lencana turun agar sejajar keperluan.
        Alasannya benar (nominal jadi lega, hierarki per baris), tapi
        hasilnya lebih buruk: keperluan yang membungkus dua baris berhenti
        TEPAT sebelum lencana, dan mata membaca "…sewa alat bor & genset"
        bersambung ke "Ditolak" sebagai satu kalimat.

        Yang bekerja: lencana kembali sejajar NOMINAL. Keduanya pendek,
        tingginya seragam, dan tak ada teks membungkus yang bisa
        menabraknya. Keperluan lalu dapat lebar penuh — yang justru
        dibutuhkannya, karena itu bagian terpanjang di kartu ini.

        Pelajarannya bukan soal tata letak: **alasan yang benar bisa
        menghasilkan penerapan yang salah, dan hanya melihat hasilnya yang
        bisa membedakan.**
      */}
      <View style={s.barisLabel}>
        <Text style={s.amount}>{fmt(k.amount)}</Text>
        <Badge label={statusLabel(k.status)} variant={statusVariant(k.status)} />
      </View>
      <Text style={s.purpose}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</Text>
      {/*
        Ikon vektor menggantikan emoji dua tempat di kartu ini.

        Alasan yang sama dengan bilah tab: rupanya berbeda di tiap HP,
        sebagian Android lama menggambar kotak kosong, dan warnanya tak
        bisa mengikuti tema. `ui-ux-pro-max` menyebutnya anti-pattern
        eksplisit ("Emoji as icons", prioritas 4).

        `accessibilityElementsHidden` + `importantForAccessibility`:
        ikonnya dekoratif — teks di sebelahnya sudah menyebutkan isinya,
        jadi pembaca layar tak perlu mengumumkannya dua kali.
      */}
      {k.project?.name ? (
        <View style={s.metaBaris}>
          <Ionicons
            name="business-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {/*
            DUA baris, bukan satu.

            Terlihat dari potret: "[UJI] Renovasi Fasad Kantor CV Makmur —
            Ciha…" terpotong padahal masih ada ruang vertikal di kartunya.
            Nama proyek di repo ini memuat lokasi setelah tanda pisah, dan
            justru bagian itu yang membedakan dua proyek bernama mirip.

            `ui-ux-pro-max` §6 `truncation-strategy`: "Prefer wrapping over
            truncation". Di layar tanpa tooltip, teks terpotong berarti
            informasinya HILANG — bukan disembunyikan.

            Batasnya tetap DUA baris, bukan tanpa batas: nama proyek yang
            sangat panjang akan mendorong tanggal keluar dari kartu, dan
            tanggal adalah yang dipakai mandor mencocokkan dengan catatannya
            sendiri.
          */}
          <Text style={s.meta} numberOfLines={2}>
            {k.project.name}
          </Text>
        </View>
      ) : null}
      {/*
        `kasbon_date` = tanggal kasbonnya, `created_at` = kapan barisnya
        dibuat. Keduanya bisa berbeda (pengajuan mundur), dan yang relevan
        bagi mandor adalah tanggal kasbon. API mengurutkan dengan kolom itu
        juga, jadi memakai created_at membuat tanggal yang tampil tak
        sejalan dengan urutan daftarnya.
      */}
      <View style={s.metaBaris}>
        <Ionicons
          name="calendar-outline"
          size={13}
          color={c.textSecondary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={s.meta}>{fmtDate(k.kasbon_date ?? k.created_at)}</Text>
      </View>
      {k.notes ? <Text style={s.notes}>{k.notes}</Text> : null}
    </Card>
  );
});

export default function KasbonListScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);
  const router = useRouter();
  const [kasbons, setKasbons] = useState<Kasbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [galat, setGalat] = useState('');

  /*
    ══════════════════════════════════════════════════════════════════════
    TIGA CACAT SEKALIGUS DI PEMANGGILAN INI — semuanya gagal TANPA SUARA
    ══════════════════════════════════════════════════════════════════════

    1. RUTENYA TAK ADA. Sebelumnya `/api/v1/mandor/kasbons`. Disisir seluruh
       apps/api/src/routes/v1: yang ada hanya `/api/v1/kasbons` dan
       `/api/v1/mandor/worker-kasbons` (kasbon TUKANG milik mandor — entitas
       lain sama sekali). Jadi tiap muat dibalas 404.

    2. BENTUK BALASANNYA SALAH. API memulangkan `{ kasbons: [...] }`
       (kasbons.ts:59), bukan array telanjang. `res.data ?? []` menyimpan
       OBJEK ke dalam state bertipe array — `.map()` di bawah lalu meledak
       atau merender kosong.

    3. GALATNYA DITELAN. `catch {}` kosong membuat 404 tampil sebagai
       "Belum ada kasbon" — layar yang meyakinkan mandor bahwa pengajuannya
       HILANG. Untuk layar uang, itu lebih buruk daripada pesan galat.

    Ketiganya saling menutupi: (1) memastikan tak ada data, (3) memastikan
    tak ada yang bertanya kenapa. Cacat kelas inilah yang dijaga
    `audit-catch-senyap.mjs` di sisi API — apps/mobile tak pernah tercakup.

    Penyaringan "hanya milik mandor ini" TIDAK perlu dikirim dari sini:
    kasbons.ts:44-56 sudah membatasi ke proyek tempat mandor ber-assignment
    DAN `requested_by = user.id`. Menyaring ulang di klien hanya akan
    menduplikasi aturan yang bisa menyimpang diam-diam.
  */
  const fetchKasbons = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/kasbons');
      setKasbons(res.data?.kasbons ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'kasbon'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchKasbons(); }, [fetchKasbons]);

  const onRefresh = () => { setRefreshing(true); fetchKasbons(); };

  /*
    `useCallback`: `FlatList` membandingkan prop-nya secara dangkal, jadi
    fungsi baru tiap render membatalkan seluruh manfaat `React.memo` pada
    kartunya. Pedoman stack menyebutnya dua kali — "useCallback for
    handlers" dan "Avoid anonymous functions in JSX".
  */
  const renderKartu = useCallback(
    ({ item }: { item: Kasbon }) => <KartuKasbon k={item} s={styles} c={c} />,
    [styles, c]
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
      <View style={styles.header}>
        <Text style={styles.title}>Kasbon</Text>
        <Button
          title="+ Ajukan"
          onPress={() => router.push('/(app)/kasbon/ajukan')}
          style={styles.ajukanBtn}
        />
      </View>
      {/*
        `FlatList`, bukan `ScrollView` + `.map()`.

        Diukur 2026-09-04 langsung ke API produksi: **67 kasbon**. Ambang
        virtualisasi adalah 50 (pedoman stack `react-native`, severity
        High), dan yang memakai layar ini HP kelas menengah milik mandor —
        bukan perangkat penguji.

        `ScrollView` merakit dan menahan SELURUH 67 kartu di memori
        sekaligus, termasuk yang tak pernah tergulir. Tak ada galat; yang
        muncul cuma gulir tersendat dan pemakaian memori yang naik seiring
        bertambahnya data — gejala yang paling mudah disalahkan pada
        "HP-nya sudah tua".

        Nol `FlatList` di SELURUH aplikasi sebelum hari ini (14 layar).

        `removeClippedSubviews` sengaja TIDAK dipasang: ia dikenal
        memunculkan baris kosong di Android saat tinggi item bervariasi,
        dan kartu di sini memang bervariasi (catatan bisa ada/tiada).
        Keuntungannya kecil; risikonya baris yang hilang tanpa gejala.
      */}
      <FlatList
        data={kasbons}
        keyExtractor={ambilKunci}
        renderItem={renderKartu}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            <PenandaAntrean />
            {/*
              Galat MUAT dan keadaan KOSONG dipisah — persis disiplin yang
              ditegakkan `uji-galat-muat-terpisah.mjs` di apps/web. "Belum
              ada kasbon" pada layar yang sebenarnya GAGAL MEMUAT adalah
              kebohongan yang tenang: mandor menyimpulkan pengajuannya
              lenyap, lalu mengajukan ulang.
            */}
            {galat ? <Galat judul="Kasbon tidak bisa dimuat" pesan={galat} /> : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Belum ada kasbon</Text>
              <Text style={styles.emptyPetunjuk}>
                Pengajuan yang Anda buat akan muncul di sini.
              </Text>
            </View>
          )
        }
        initialNumToRender={8}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSubtle,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: SPASI.lg, paddingTop: SPASI.lg, paddingBottom: SPASI.sm,
    },
    title: { fontSize: 22, fontFamily: FONT.judul, color: c.textPrimary },
    /*
      Tetap navy solid — ini SATU-SATUNYA aksi di layar, jadi ia memang CTA
      primer (`ui-ux-pro-max` §4 `primary-action`: satu CTA primer per
      layar). Yang dikoreksi cuma bobotnya: dari potret, tombol setinggi 48px
      di sebelah judul 22px membuat tombolnya terbaca lebih penting daripada
      isi layarnya.

      `minHeight` diturunkan ke SENTUH_MIN (44) — batas Apple HIG, masih di
      atas ambang dan tak lagi mendominasi. Bukan di bawah itu: tombol ini
      ditekan dengan ibu jari bersarung.
    */
    ajukanBtn: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      minHeight: SENTUH_MIN,
    },
    list: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    card: { gap: 6 },
    /*
      `alignItems: 'flex-start'` supaya lencana sejajar BARIS PERTAMA
      keperluan, bukan terpusat terhadap dua baris. Keperluan yang membungkus
      ke baris kedua ("upah mingguan tukang borongan") akan menarik lencana
      turun ke tengah kalau dipusatkan — dan lencana yang melayang di tengah
      teks terbaca seperti bagian dari kalimatnya.
    */
    /*
      `alignItems: 'center'` — nominal dan lencana keduanya satu baris dan
      tingginya berbeda (22px vs 12px). Dipusatkan, garis optiknya sejajar;
      `flex-start` membuat lencana menempel ke atas dan terlihat melayang.
    */
    barisLabel: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', gap: SPASI.sm,
    },
    /*
      Nominal memakai `FONT.judul` dan angka bertabular.

      `fontVariant: ['tabular-nums']` membuat tiap digit selebar sama, jadi
      kolom rupiah di kartu berurutan tak bergeser-geser — `number-tabular`
      di `ui-ux-pro-max` (prioritas 6). Pada daftar uang itu bukan
      kehalusan: mata membandingkan besaran dari panjang angka, dan digit
      berlebar beda merusak perbandingan itu.
    */
    amount: {
      fontSize: HURUF.lg, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    purpose: {
      fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary,
      marginTop: 2, lineHeight: 19,
    },
    metaBaris: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    notes: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c.textSecondary, fontStyle: 'italic',
    },
    empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
    emptyText: {
      fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.textPrimary,
    },
    emptyPetunjuk: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c.textSecondary, textAlign: 'center',
    },
  });
}
