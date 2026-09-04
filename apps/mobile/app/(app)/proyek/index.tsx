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
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { Tekan } from '@/components/ui/Tekan';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

interface Project {
  id: string;
  name: string;
  location: string;
  status: string;
  progress_pct: number;
  contract_value: number;
  /*
    `clients.contact_person` — diukur ke rutenya (`projects.ts:28`), bukan
    ditebak. Versi sebelumnya membacanya lewat `(p.clients as any)`, yang
    membuat salah nama medan lolos tsc tanpa gejala; tipenya sekarang
    dinyatakan, jadi salah ketik jadi galat.
  */
  clients?: { contact_person?: string } | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

/*
  `keyExtractor` dari `id` basis. Pedoman stack `react-native`, severity
  High — dan di layar ini ia menjaga hal yang konkret: menyentuh satu kartu
  membuka `/proyek/[id]`, dan indeks sebagai kunci pada daftar yang
  di-refresh bisa membuka proyek yang SALAH.
*/
const ambilKunci = (p: Project) => p.id;

/**
 * Satu kartu proyek — ter-`memo`.
 *
 * 19 proyek hari ini; diukur dari basis, 11 di antaranya bertambah dalam
 * 30 hari terakhir. Daftar ini punya arah tumbuh, dan `FlatList` +
 * `React.memo` dipasang sebelum ia melewati ambang, bukan sesudah.
 */
const KartuProyek = React.memo(function KartuProyek({
  p,
  s,
  c,
  onBuka,
}: {
  p: Project;
  s: ReturnType<typeof gaya>;
  c: Palet;
  onBuka: (id: string) => void;
}) {
  const persen = Math.max(0, Math.min(100, p.progress_pct ?? 0));
  return (
    <Tekan
      onPress={() => onBuka(p.id)}
      accessibilityRole="button"
      accessibilityLabel={`Buka proyek ${p.name}, progres ${persen} persen`}
    >
      <Card style={s.card}>
        <View style={s.cardTop}>
          <Text style={s.projName} numberOfLines={2}>
            {p.name}
          </Text>
          <Badge label={statusLabel(p.status)} variant={statusVariant(p.status)} />
        </View>

        {/*
          Ikon vektor menggantikan emoji 📍 dan 👤 — alasan yang sama
          dengan bilah tab dan kartu kasbon: rupanya berbeda di tiap HP,
          sebagian Android lama menggambar kotak kosong, dan warnanya tak
          bisa mengikuti tema.
        */}
        {p.location ? (
          <View style={s.metaBaris}>
            <Ionicons
              name="location-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.location} numberOfLines={2}>
              {p.location}
            </Text>
          </View>
        ) : null}

        {p.clients?.contact_person ? (
          <View style={s.metaBaris}>
            <Ionicons
              name="person-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.client} numberOfLines={1}>
              {p.clients.contact_person}
            </Text>
          </View>
        ) : null}

        <View style={s.progressRow}>
          {/*
            `progress_pct` DIJEPIT ke 0-100 sebelum dipakai sebagai lebar.

            Nilai di luar rentang membuat bar meluber keluar kartunya —
            dan `Infinity%` pernah benar-benar muncul di batang kekuatan
            halaman struktur web (CLAUDE.md §1). Yang menahannya di sana
            adalah potret, bukan test.
          */}
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${persen}%` }]} />
          </View>
          <Text style={s.progressPct}>{persen}%</Text>
        </View>

        <Text style={s.contractValue}>{fmt(p.contract_value ?? 0)}</Text>
      </Card>
    </Tekan>
  );
});

export default function ProyekListScreen() {
  const router = useRouter();
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/projects');
      setProjects(res.data?.projects ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'daftar proyek'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const onRefresh = () => { setRefreshing(true); fetchProjects(); };

  const bukaProyek = useCallback(
    (id: string) => router.push(`/(app)/proyek/${id}`),
    [router]
  );

  const renderKartu = useCallback(
    ({ item }: { item: Project }) => (
      <KartuProyek p={item} s={styles} c={c} onBuka={bukaProyek} />
    ),
    [styles, c, bukaProyek]
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
        <Text style={styles.title}>Proyek</Text>
        <Text style={styles.count}>{projects.length} proyek</Text>
      </View>
      {/*
        `FlatList` — 19 proyek hari ini, 11 di antaranya bertambah dalam 30
        hari terakhir (diukur dari basis). Di bawah ambang 50, tetapi
        daftarnya punya arah tumbuh, dan memasangnya sekarang jauh lebih
        murah daripada memindahkannya saat sudah 158.
      */}
      <FlatList
        data={projects}
        keyExtractor={ambilKunci}
        renderItem={renderKartu}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          galat ? <Galat judul="Proyek tidak bisa dimuat" pesan={galat} /> : null
        }
        ListEmptyComponent={
          galat ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Belum ada proyek</Text>
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
    count: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },
    list: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    card: { gap: SPASI.sm },
    cardTop: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: SPASI.sm,
    },
    projName: {
      flex: 1, fontSize: HURUF.base, fontFamily: FONT.isiTebal,
      color: c.textPrimary, lineHeight: 21,
    },
    metaBaris: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    location: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    client: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPASI.sm },
    progressBar: {
      flex: 1, height: 6, backgroundColor: c.surfaceHover,
      borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: c.navy, borderRadius: 3 },
    /*
      `width: 34` dan `tabular-nums`: persentase berkisar 0-100, jadi
      lebarnya berubah 1-3 digit. Tanpa lebar tetap dan digit selebar sama,
      batang progres di kartu berurutan berakhir di titik yang berbeda-beda
      — mata membaca panjang batang sebagai perbandingan, dan ujung yang
      bergeser merusak perbandingan itu.
    */
    progressPct: {
      fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.textPrimary,
      width: 34, textAlign: 'right', fontVariant: ['tabular-nums'],
    },
    contractValue: {
      fontSize: HURUF.sm, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: HURUF.base, fontFamily: FONT.isi, color: c.textSecondary },
  });
}
