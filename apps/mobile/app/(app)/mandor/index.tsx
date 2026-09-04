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
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/**
 * Ringkasan mandor — **OBJEK KPI, bukan larik**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR INI KOSONG SEJAK DIBUAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, membuka layarnya lewat peramban: **114 karakter** —
 * judul "Mandor" plus label bilah tab. Nol isi.
 *
 * Tiga cacat menumpuk, dan tiap satunya cukup untuk mengosongkan layar:
 *
 *   1. `/mandor/summary` memulangkan OBJEK `{ pendingReports,
 *      approvedAmount, activeWorkersThisMonth, totalWorkersAll,
 *      activeKasbons, activeKasbonAmount }`. Layar menyimpannya ke
 *      `useState<MandorSummary[]>` lalu memanggil `.map()` — pada objek,
 *      `.length` undefined, jadi blok ringkasan tak pernah dirender.
 *
 *   2. `/mandor/wage-reports` memulangkan `{ reports, total, limit,
 *      offset }` dengan **51 baris**. Layar membaca `data?.data` — kunci
 *      yang tak pernah ada. Daftar upah selalu kosong.
 *
 *   3. `try/finally` TANPA `catch`. Kalau kedua permintaan gagal, tak ada
 *      yang tahu: `Promise.allSettled` menelan penolakan, dan layar
 *      menampilkan "Belum ada data mandor".
 *
 * Ketiganya saling menutupi. (1) dan (2) memastikan tak ada data, (3)
 * memastikan tak ada yang bertanya kenapa — dan pesan kosongnya terbaca
 * seperti keadaan yang wajar untuk perusahaan yang belum punya mandor.
 *
 * `tsc` hijau selama itu karena `res.data` bertipe `any` dari axios.
 */
interface RingkasanMandor {
  pendingReports?: number;
  approvedAmount?: number;
  activeWorkersThisMonth?: number;
  totalWorkersAll?: number;
  activeKasbons?: number;
  activeKasbonAmount?: number;
}

/**
 * Satu laporan upah.
 *
 * Nama medannya diukur langsung dari balasan rute, bukan ditebak — versi
 * sebelumnya membaca `total_amount`, `mandors.name`, dan `projects.name`;
 * ketiganya tak ada. Yang benar: `net_amount`, `assignment.mandor.name`,
 * `assignment.project.name`.
 */
interface LaporanUpah {
  id: string;
  week_start?: string;
  week_end?: string;
  status: string;
  net_amount?: number;
  subtotal?: number;
  total_deduction?: number;
  assignment?: {
    mandor?: { name?: string };
    project?: { name?: string };
  };
  scope?: { scope_name?: string };
}

const ambilKunci = (r: LaporanUpah) => r.id;

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

/**
 * Satu kartu laporan upah — ter-`memo`.
 *
 * `wage-reports` memulangkan **51 baris** dan tumbuh tiap minggu kerja.
 * Pedoman stack `react-native` severity High: memoize list item components.
 */
const KartuUpah = React.memo(function KartuUpah({
  r,
  s,
  c,
}: {
  r: LaporanUpah;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const tgl = (iso?: string, tahun = false) =>
    iso
      ? new Date(iso).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          ...(tahun ? { year: 'numeric' } : {}),
        })
      : '';

  return (
    <Card style={s.wageCard}>
      <View style={s.wageTop}>
        <View style={{ flex: 1 }}>
          {/*
            `assignment.mandor.name`, bukan `mandors.name`.

            Versi sebelumnya membaca `r.mandors?.name` — kunci yang tak
            pernah ada di balasan, jadi tiap kartu menampilkan "—" untuk
            SEMUA laporan. `?.` menelannya tanpa galat.
          */}
          <Text style={s.wageMandor}>{r.assignment?.mandor?.name ?? '—'}</Text>
          <Text style={s.wagePeriod}>
            {tgl(r.week_start)}
            {r.week_end ? ` – ${tgl(r.week_end, true)}` : ''}
          </Text>
        </View>
        <Badge label={statusLabel(r.status)} variant={statusVariant(r.status)} />
      </View>

      {/*
        `net_amount`, bukan `total_amount`. Yang lama tak ada, jadi
        `?? 0` membuat SETIAP laporan upah tampil sebagai Rp 0 — angka
        yang sah-sah saja terlihat, dan justru itu bahayanya.
      */}
      <Text style={s.wageAmount}>{fmt(r.net_amount ?? 0)}</Text>

      {r.assignment?.project?.name ? (
        <View style={s.metaBaris}>
          <Ionicons
            name="business-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.wageMeta} numberOfLines={2}>
            {r.assignment.project.name}
          </Text>
        </View>
      ) : null}

      {r.scope?.scope_name ? (
        <View style={s.metaBaris}>
          <Ionicons
            name="layers-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.wageMeta} numberOfLines={1}>
            {r.scope.scope_name}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

export default function MandorScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);
  const [ringkasan, setRingkasan] = useState<RingkasanMandor | null>(null);
  const [wageReports, setWageReports] = useState<LaporanUpah[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [ringkasanRes, wageRes] = await Promise.allSettled([
        api.get('/api/v1/mandor/summary'),
        api.get('/api/v1/mandor/wage-reports'),
      ]);

      /*
        ⚠ `Promise.allSettled` menelan penolakan — itu memang gunanya, dan
        justru itu yang membuat versi sebelumnya buta.

        `try/finally` tanpa `catch` di sekelilingnya tak menolong sama
        sekali: `allSettled` TIDAK melempar, jadi `catch` pun tak akan
        terpanggil. Yang perlu diperiksa adalah `status` tiap hasilnya.

        Tanpa ini, kedua permintaan bisa gagal 500 dan layar menampilkan
        "Belum ada data mandor" — kalimat yang terbaca seperti keadaan
        wajar bagi perusahaan yang memang belum punya mandor.
      */
      const gagal: string[] = [];
      if (ringkasanRes.status === 'fulfilled') {
        setRingkasan(ringkasanRes.value.data ?? null);
      } else {
        gagal.push('ringkasan');
      }
      if (wageRes.status === 'fulfilled') {
        /*
          `data.reports`, bukan `data.data`.

          API memulangkan `{ reports, total, limit, offset }` dengan 51
          baris. Versi sebelumnya membaca `data?.data` — kunci yang tak
          pernah ada, jadi daftar upah SELALU kosong.
        */
        setWageReports(wageRes.value.data?.reports ?? []);
      } else {
        gagal.push('laporan upah');
      }

      setGalat(
        gagal.length
          ? `Bagian ${gagal.join(' dan ')} gagal dimuat. Tarik ke bawah untuk mencoba lagi.`
          : ''
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const renderKartu = useCallback(
    ({ item }: { item: LaporanUpah }) => <KartuUpah r={item} s={styles} c={c} />,
    [styles, c]
  );

  /*
    Kepala daftar: KPI ringkasan.

    Enam angka yang datang dari `/mandor/summary`, dan tak satu pun pernah
    tampil sebelum hari ini. Disusun berpasangan supaya tiap baris punya
    satu angka jumlah dan satu angka rupiah — mata membaca "berapa banyak"
    dan "berapa nilainya" bersamaan, bukan berpindah-pindah.
  */
  const kepala = useMemo(() => {
    if (!ringkasan) return galat ? <Galat judul="Data mandor tidak lengkap" pesan={galat} /> : null;
    const sel = (label: string, nilai: string, tekan = false) => (
      <View style={styles.kpiSel}>
        <Text style={tekan ? styles.kpiNilaiKecil : styles.kpiNilai}>{nilai}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    );
    return (
      <>
        {galat ? <Galat judul="Data mandor tidak lengkap" pesan={galat} /> : null}
        <Card style={styles.kpiKartu}>
          <View style={styles.kpiBaris}>
            {sel('Laporan menunggu', String(ringkasan.pendingReports ?? 0))}
            {sel('Sudah disetujui', fmt(ringkasan.approvedAmount ?? 0), true)}
          </View>
          <View style={styles.kpiPemisah} />
          <View style={styles.kpiBaris}>
            {sel('Tukang aktif bulan ini', String(ringkasan.activeWorkersThisMonth ?? 0))}
            {sel('Total tukang', String(ringkasan.totalWorkersAll ?? 0))}
          </View>
          <View style={styles.kpiPemisah} />
          <View style={styles.kpiBaris}>
            {sel('Kasbon berjalan', String(ringkasan.activeKasbons ?? 0))}
            {sel('Nilai kasbon', fmt(ringkasan.activeKasbonAmount ?? 0), true)}
          </View>
        </Card>
        {wageReports.length > 0 ? (
          <Text style={styles.sectionTitle}>Laporan Upah Terbaru</Text>
        ) : null}
      </>
    );
  }, [ringkasan, galat, wageReports.length, styles]);

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
        <Text style={styles.title}>Mandor</Text>
      </View>
      {/*
        `FlatList` — 51 laporan upah hari ini, dan tumbuh tiap minggu kerja
        (`total: 51` dari rutenya sendiri). Ambang virtualisasi 50.

        Versi sebelumnya `.slice(0, 10)` di dalam `.map()`: ia memotong
        daftar jadi 10 tanpa memberi tahu bahwa ada 41 lagi. Batas yang
        tak disebutkan terbaca sebagai "cuma segitu yang ada".
      */}
      <FlatList
        data={wageReports}
        keyExtractor={ambilKunci}
        renderItem={renderKartu}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={kepala}
        ListEmptyComponent={
          ringkasan || galat ? null : (
            <Kosong
              ikon="people-outline"
              judul="Belum ada data mandor"
              petunjuk="Ringkasan dan laporan upah muncul setelah ada mandor yang ditugaskan ke proyek. Hubungi admin perusahaan bila Anda seharusnya melihat data di sini."
            />
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
    header: { paddingHorizontal: SPASI.lg, paddingTop: SPASI.lg, paddingBottom: SPASI.sm },
    title: { fontSize: 22, fontFamily: FONT.judul, color: c.textPrimary },
    container: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    sectionTitle: {
      fontSize: HURUF.base, fontFamily: FONT.isiTebal,
      color: c.textPrimary, marginTop: 4,
    },

    /*
      KPI ringkasan — enam angka yang tak satu pun pernah tampil sebelum
      hari ini (layar menyimpan objek ke state bertipe larik).

      Disusun berpasangan: tiap baris satu angka JUMLAH dan satu angka
      RUPIAH. Mata membaca "berapa banyak" dan "berapa nilainya"
      bersamaan, bukan berpindah-pindah antar-kartu.

      Garis pemisah antar-baris, bukan kartu terpisah: tiga kartu untuk
      enam angka membuat layar penuh sebelum daftar upahnya muncul sama
      sekali.
    */
    kpiKartu: { gap: SPASI.md },
    kpiBaris: { flexDirection: 'row' },
    kpiSel: { flex: 1, gap: 2 },
    kpiPemisah: { height: 1, backgroundColor: c.border },
    /*
      `tabular-nums` pada keduanya: angka jumlah dan rupiah berdampingan
      di kolom, dan digit berlebar beda membuat baris kedua tak sejajar
      dengan baris pertama.
    */
    kpiNilai: {
      fontSize: 22, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    kpiNilaiKecil: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    kpiLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    wageCard: { gap: 6 },
    wageTop: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', gap: SPASI.sm,
    },
    wageMandor: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal, color: c.textPrimary,
    },
    wagePeriod: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 2,
    },
    wageAmount: {
      fontSize: HURUF.lg - 1, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    metaBaris: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    wageMeta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: HURUF.base, fontFamily: FONT.isi, color: c.textSecondary },
  });
}
