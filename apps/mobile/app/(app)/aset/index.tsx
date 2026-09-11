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
import { Badge } from '@/components/ui/Badge';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/*
  ASET — register alat & kendaraan, NATIVE. Gelombang 2b.

  Menggantikan modul WebView `aset`.

  ── Rutenya SUDAH ADA, dan itu koreksi terhadap rencana

  `MOBILE-NATIVE-G2` di QUEUE menempatkan `aset` di G2b — "butuh rute
  ikhtisar lebih dulu". Survei ulang 2026-09-11 membuktikan itu salah:
  `/api/v1/assets` sudah memulangkan `{ data, meta }` lengkap dengan
  akumulasi penyusutan dan nilai buku per aset.

  Yang keliru bukan surveinya melainkan CARA menyurveinya — saya mencari
  berkas bernama `aset.ts`, sementara rutenya ada di `assets.ts`. Nama
  berkas Inggris, modulnya Indonesia. Dicatat supaya gelombang berikutnya
  mencari lewat DAFTAR RUTE, bukan tebakan nama berkas.

  ── Yang dicari orang di lapangan

  "Alat ini punya kita atau sewa?", "kondisinya masih baik?", "sekarang di
  proyek mana?". Ketiganya tentang SATU aset yang sedang dipegang — bukan
  tentang total nilai buku perusahaan.

  Karena itu pencarian dan penyaring kondisi ada di depan, sementara
  `meta` (nilai perolehan, nilai buku) diringkas jadi dua angka saja.
*/

interface Aset {
  id: string;
  asset_code: string;
  name: string;
  category: string | null;
  ownership: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string | null;
  condition: string | null;
  current_project_id: string | null;
  purchase_price: number | string | null;
  akumulasi_penyusutan: number | string | null;
  nilai_buku: number | string | null;
  sudah_disusutkan: boolean;
}

interface Meta {
  total: number;
  milik: number;
  sewa: number;
  nilai_perolehan: number;
  nilai_buku: number;
  dipakai: number;
  perawatan: number;
}

const ambilKunci = (a: Aset) => a.id;

function rpRingkas(s: string | number | null) {
  const n = Number(s) || 0;
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n)}`;
}

const LABEL_KONDISI: Record<string, string> = {
  baik: 'Baik',
  cukup: 'Cukup',
  buruk: 'Buruk',
  rusak: 'Rusak',
};

const LABEL_STATUS: Record<string, string> = {
  tersedia: 'Tersedia',
  dipakai: 'Dipakai',
  perawatan: 'Perawatan',
  dijual: 'Dijual',
  hilang: 'Hilang',
};

function varianKondisi(k: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (!k) return 'default';
  if (k === 'baik') return 'success';
  if (k === 'cukup') return 'warning';
  if (k === 'buruk' || k === 'rusak') return 'danger';
  return 'default';
}

/**
 * Label jatuhan: rapikan kunci, JANGAN tampilkan mentah dan jangan '—'.
 *
 * Nilai baru harus terlihat supaya bisa ditambahkan ke peta. Pelajaran
 * yang sama dengan lencana "submitted" yang ditemukan memotret layar
 * mandor, dan yang melahirkan `audit-status-mobile-berlabel.mjs`.
 */
function label(peta: Record<string, string>, k: string | null): string {
  if (!k) return '—';
  return (
    peta[k] ??
    k
      .split(/[_-]+/)
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(' ')
  );
}

const KartuAset = React.memo(function KartuAset({
  a,
  s,
  c,
}: {
  a: Aset;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const sewa = a.ownership !== 'milik';
  const merek = [a.brand, a.model].filter(Boolean).join(' ');

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {a.name}
        </Text>
        <Badge
          label={label(LABEL_KONDISI, a.condition)}
          variant={varianKondisi(a.condition)}
        />
      </View>

      {/*
        MEREK + MODEL diberi barisnya sendiri, bukan digabung ke nama.

        Di lapangan orang mengenali alat dari mereknya ("Honda GX160"),
        bukan dari nama katalognya ("Genset 5 kVA"). Menggabungkannya ke
        judul membuat judul panjang dan terpotong; memisahkannya membuat
        keduanya terbaca.
      */}
      {merek ? (
        <Text style={s.merek} numberOfLines={1}>
          {merek}
        </Text>
      ) : null}

      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="pricetag-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{a.asset_code}</Text>
        </View>

        <View style={s.metaItem}>
          <Ionicons
            name={sewa ? 'swap-horizontal-outline' : 'home-outline'}
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>
            {sewa ? 'Sewa' : 'Milik sendiri'} · {label(LABEL_STATUS, a.status)}
          </Text>
        </View>

        {/*
          Nilai buku hanya untuk aset MILIK.

          Aset sewa tak punya nilai buku — ia bukan milik perusahaan, dan
          `purchase_price`-nya nol. Menampilkan "Rp 0" di kartu sewa
          terbaca sebagai aset tak bernilai, bukan sebagai aset yang
          memang bukan miliknya.
        */}
        {!sewa && Number(a.purchase_price) > 0 ? (
          <View style={s.metaItem}>
            <Ionicons
              name="trending-down-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>
              Nilai buku {rpRingkas(a.nilai_buku)}
              {a.sudah_disusutkan ? '' : ' (belum disusutkan)'}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

export default function AsetScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [aset, setAset] = useState<Aset[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saring, setSaring] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    `res.data?.data` — BERSARANG. `assets.ts:170` mengirim `{ data, meta }`.

    Bentuk KELIMA yang berbeda di antara modul yang dibangun dua hari ini:
    `.data` (approval, assets) · datar (mutu) · `.material_requests` ·
    `.purchase_orders` · `.kontrak`. Masing-masing dibaca ke rutenya.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/assets');
      setAset(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'register aset'));
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
    Penyaring dibangun dari DATA, bukan daftar tetap.

    Daftar kategori yang dipaku menampilkan chip untuk kategori yang tak
    dimiliki tenant ini, dan MELEWATKAN kategori baru yang ditambahkan
    kelak. Sama seperti penyaring jenis di layar Kontrak.
  */
  const saringTersedia = useMemo(() => {
    const hitung = new Map<string, number>();
    for (const a of aset) {
      const k = a.category ?? 'lainnya';
      hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    return [...hitung.entries()]
      .map(([k, n]) => ({ kunci: k, n, label: label({}, k) }))
      .sort((x, y) => y.n - x.n);
  }, [aset]);

  const terlihat = useMemo(
    () => (saring ? aset.filter((a) => (a.category ?? 'lainnya') === saring) : aset),
    [aset, saring]
  );

  const render = useCallback(
    ({ item }: { item: Aset }) => <KartuAset a={item} s={styles} c={c} />,
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
      <KepalaLayar
        judul="Aset"
        penjelas={
          meta ? `${meta.total} alat · ${meta.milik} milik, ${meta.sewa} sewa` : 'Alat, kendaraan, dan nilainya'
        }
      />

      <FlatList
        data={terlihat}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {galat ? <Galat judul="Register aset tidak bisa dimuat" pesan={galat} /> : null}

            {meta ? (
              <View style={styles.kpiKotak}>
                <View style={styles.kpiBaris}>
                  <KpiSel label="Dipakai" nilai={String(meta.dipakai)} s={styles} />
                  <KpiSel
                    label="Perawatan"
                    nilai={String(meta.perawatan)}
                    nada={meta.perawatan > 0 ? 'awas' : undefined}
                    s={styles}
                  />
                  <KpiSel label="Nilai buku" nilai={rpRingkas(meta.nilai_buku)} s={styles} />
                </View>
              </View>
            ) : null}

            {saringTersedia.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipBaris}
              >
                <Chip
                  label="Semua"
                  n={aset.length}
                  aktif={saring === null}
                  onPress={() => setSaring(null)}
                  s={styles}
                />
                {saringTersedia.map((k) => (
                  <Chip
                    key={k.kunci}
                    label={k.label}
                    n={k.n}
                    aktif={saring === k.kunci}
                    onPress={() => setSaring(k.kunci)}
                    s={styles}
                  />
                ))}
              </ScrollView>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : saring ? (
            <Kosong
              ikon="funnel-outline"
              judul="Tidak ada di kategori ini"
              petunjuk="Ketuk “Semua” di atas untuk melihat seluruh aset."
            />
          ) : (
            <Kosong
              ikon="construct-outline"
              judul="Belum ada aset terdaftar"
              petunjuk="Alat dan kendaraan yang didaftarkan akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function KpiSel({
  label: l,
  nilai,
  s,
  nada,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
  nada?: 'awas';
}) {
  return (
    <View style={s.kpi1}>
      <Text style={[s.kpiNilai, nada === 'awas' && s.kpiAwas]}>{nilai}</Text>
      <Text style={s.kpiLabel} numberOfLines={2}>
        {l}
      </Text>
    </View>
  );
}

function Chip({
  label: l,
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
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={`${l}, ${n} aset${aktif ? ', terpilih' : ''}`}
      style={[s.chip, aktif && s.chipAktif]}
    >
      <Text style={[s.chipTeks, aktif && s.chipTeksAktif]} numberOfLines={1}>
        {l}
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
    card: { gap: 4 },

    kpiKotak: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: SPASI.md,
      marginBottom: SPASI.sm,
    },
    kpiBaris: { flexDirection: 'row' },
    kpi1: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
    kpiNilai: {
      fontSize: HURUF.xl,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    kpiAwas: { color: c.warning },
    kpiLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
    },

    chipBaris: { gap: SPASI.sm, paddingBottom: SPASI.md, paddingRight: SPASI.lg },
    chip: {
      minHeight: SENTUH_MIN,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
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
    chipAngka: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      color: c.textSecondary,
      flexShrink: 0,
      fontVariant: ['tabular-nums'],
    },
    chipTeksAktif: { color: c.navy, fontFamily: FONT.isiTebal },

    barisAtas: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPASI.sm,
    },
    judulKartu: {
      flex: 1,
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      lineHeight: HURUF.base * 1.35,
    },
    merek: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
  });
}
