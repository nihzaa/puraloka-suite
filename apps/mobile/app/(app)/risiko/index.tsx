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
  RISIKO — register lintas proyek, NATIVE.

  Menggantikan modul WebView `risiko`.

  ── Rutenya BARU, dibangun untuk layar ini

  Sebelumnya hanya ada `/api/v1/proyek/:id/risiko` — per proyek. Di web
  itu cukup: orang membuka proyeknya dulu, lalu tab risikonya.

  Di HP urutan itu terbalik. Yang dibawa ke lapangan bukan "risiko proyek
  X" melainkan "risiko mana yang paling mendesak" — pertanyaan yang tak
  menyebut proyek sama sekali.

  `/api/v1/risiko` ditambahkan 2026-09-11 (`risiko-proyek.ts`), diurut
  skor menurun.

  ── SKOR, bukan dampak atau kemungkinan sendiri-sendiri

  Matriks risiko 5×5: skor = dampak × kemungkinan. Menampilkan keduanya
  terpisah menuntut pembacanya mengalikan sendiri untuk membandingkan dua
  baris — dan skor 16 (4×4) lebih mendesak daripada 15 (5×3) meski
  dampaknya lebih kecil.

  Ambang "tinggi" (>= 15) dihitung SERVER dan dipakai di ringkasan;
  kartu memakai ambang yang sama supaya angka dan warna tak bertentangan.
*/

interface Pemilik {
  id?: string;
  name?: string;
}

interface Risiko {
  id: string;
  project_id: string | null;
  proyek_nama: string | null;
  kode: string | null;
  judul: string | null;
  kategori: string | null;
  dampak: number | null;
  kemungkinan: number | null;
  skor: number | null;
  strategi: string | null;
  status: string | null;
  tenggat_tinjau: string | null;
  pemilik?: Pemilik | null;
}

interface Ringkasan {
  total: number;
  terbuka: number;
  tinggi: number;
  terjadi: number;
}

const ambilKunci = (r: Risiko) => r.id;

const LABEL_STATUS: Record<string, string> = {
  terpantau: 'Terpantau',
  terjadi: 'Terjadi',
  tertutup: 'Tertutup',
  ditutup: 'Tertutup',
  baru: 'Baru',
};

const LABEL_STRATEGI: Record<string, string> = {
  hindari: 'Dihindari',
  kurangi: 'Dikurangi',
  alihkan: 'Dialihkan',
  terima: 'Diterima',
};

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

/**
 * Skor → varian lencana.
 *
 * Ambang 15 disamakan dengan `risiko-proyek.ts` yang menghitung
 * `ringkasan.tinggi`. Dua ambang berbeda membuat kartu bertanda merah
 * tak cocok dengan angka "3 tinggi" di atasnya — dua hitungan yang
 * keduanya benar menurut aturannya sendiri.
 */
function varianSkor(skor: number | null): 'danger' | 'warning' | 'default' {
  const s = Number(skor) || 0;
  if (s >= 15) return 'danger';
  if (s >= 8) return 'warning';
  return 'default';
}

function fmtTanggal(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const KartuRisiko = React.memo(function KartuRisiko({
  r,
  s,
  c,
}: {
  r: Risiko;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const tinjau = fmtTanggal(r.tenggat_tinjau);
  const lewat =
    r.tenggat_tinjau != null &&
    String(r.tenggat_tinjau).slice(0, 10) < new Date().toISOString().slice(0, 10);
  const tertutup = r.status === 'tertutup' || r.status === 'ditutup';

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={[s.judulKartu, tertutup && s.pudar]} numberOfLines={2}>
          {r.judul ?? r.kode ?? 'Tanpa judul'}
        </Text>
        {/*
          SKOR sebagai lencana, bukan teks biasa.

          Ia angka yang menentukan urutan seluruh daftar — dan lencana
          berwarna membuatnya bisa dipindai tanpa membaca angkanya satu
          per satu.
        */}
        <Badge label={`Skor ${r.skor ?? '—'}`} variant={varianSkor(r.skor)} />
      </View>

      {r.proyek_nama ? (
        <View style={s.metaItem}>
          <Ionicons
            name="business-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta} numberOfLines={2}>
            {r.proyek_nama}
          </Text>
        </View>
      ) : null}

      <View style={s.metaBaris}>
        {/*
          Dampak × kemungkinan DITAMPILKAN di sebelah skor.

          Skor 16 bisa berarti 4×4 atau 8×2 — dan keduanya menuntut
          penanganan berbeda: yang kemungkinannya tinggi butuh
          pencegahan, yang dampaknya besar butuh rencana darurat.
        */}
        {r.dampak != null && r.kemungkinan != null ? (
          <View style={s.metaItem}>
            <Ionicons
              name="grid-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>
              Dampak {r.dampak} × kemungkinan {r.kemungkinan}
            </Text>
          </View>
        ) : null}

        <View style={s.metaItem}>
          <Ionicons
            name="shield-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>
            {label(LABEL_STATUS, r.status)}
            {r.strategi ? ` · ${label(LABEL_STRATEGI, r.strategi)}` : ''}
          </Text>
        </View>

        {tinjau ? (
          <View style={s.metaItem}>
            <Ionicons
              name="time-outline"
              size={13}
              color={lewat && !tertutup ? c.danger : c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[s.meta, lewat && !tertutup && s.metaBahaya]}>
              {lewat && !tertutup ? `Tinjauan lewat ${tinjau}` : `Tinjau ${tinjau}`}
            </Text>
          </View>
        ) : null}

        {r.pemilik?.name ? (
          <View style={s.metaItem}>
            <Ionicons
              name="person-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta} numberOfLines={1}>
              {r.pemilik.name}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

type Saring = 'terbuka' | 'tinggi' | 'semua';

export default function RisikoScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [risiko, setRisiko] = useState<Risiko[]>([]);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [saring, setSaring] = useState<Saring>('terbuka');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data?.risiko` — `risiko-proyek.ts` mengirim `{ risiko, ringkasan }`. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/risiko');
      setRisiko(res.data?.risiko ?? []);
      setRingkasan(res.data?.ringkasan ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'register risiko'));
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
    Bawaan "Terbuka", bukan "Semua".

    Risiko yang sudah ditutup adalah riwayat — berguna saat menelusuri,
    tak berguna saat memutuskan. Membuka layar langsung ke daftar
    lengkap membuat yang tertutup bercampur dengan yang menuntut
    tindakan.
  */
  const terlihat = useMemo(() => {
    if (saring === 'tinggi') {
      return risiko.filter(
        (r) => (Number(r.skor) || 0) >= 15 && r.status !== 'tertutup' && r.status !== 'ditutup'
      );
    }
    if (saring === 'terbuka') {
      return risiko.filter((r) => r.status !== 'tertutup' && r.status !== 'ditutup');
    }
    return risiko;
  }, [risiko, saring]);

  const render = useCallback(
    ({ item }: { item: Risiko }) => <KartuRisiko r={item} s={styles} c={c} />,
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
        judul="Risiko"
        penjelas={
          ringkasan
            ? `${ringkasan.terbuka} terbuka · ${ringkasan.tinggi} berisiko tinggi`
            : 'Register risiko lintas proyek'
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
            {galat ? <Galat judul="Register risiko tidak bisa dimuat" pesan={galat} /> : null}

            {/*
              Risiko yang sudah TERJADI diberi peringatan tersendiri.

              Ia bukan lagi risiko melainkan kejadian — dan yang membuka
              layar ini perlu tahu sebelum menggulir mencarinya.
            */}
            {ringkasan && ringkasan.terjadi > 0 ? (
              <View style={styles.awasKotak}>
                <Ionicons
                  name="flash-outline"
                  size={16}
                  color={c.danger}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={styles.awasTeks}>
                  {ringkasan.terjadi} risiko sudah TERJADI — bukan lagi potensi
                </Text>
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipBaris}
            >
              <Chip
                label="Terbuka"
                n={ringkasan?.terbuka ?? 0}
                aktif={saring === 'terbuka'}
                onPress={() => setSaring('terbuka')}
                s={styles}
              />
              {(ringkasan?.tinggi ?? 0) > 0 ? (
                <Chip
                  label="Tinggi"
                  n={ringkasan?.tinggi ?? 0}
                  aktif={saring === 'tinggi'}
                  onPress={() => setSaring('tinggi')}
                  s={styles}
                />
              ) : null}
              <Chip
                label="Semua"
                n={risiko.length}
                aktif={saring === 'semua'}
                onPress={() => setSaring('semua')}
                s={styles}
              />
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          galat ? null : saring !== 'semua' ? (
            <Kosong
              ikon="shield-checkmark-outline"
              judul={saring === 'tinggi' ? 'Tidak ada risiko tinggi' : 'Tidak ada risiko terbuka'}
              petunjuk="Ketuk “Semua” di atas untuk melihat termasuk yang sudah ditutup."
            />
          ) : (
            <Kosong
              ikon="shield-outline"
              judul="Belum ada risiko terdaftar"
              petunjuk="Risiko yang dicatat akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
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
      accessibilityLabel={`${l}, ${n} risiko${aktif ? ', terpilih' : ''}`}
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

    awasKotak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.dangerBg,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      borderRadius: 10,
      padding: SPASI.sm,
      marginBottom: SPASI.sm,
    },
    awasTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.danger, flex: 1 },

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
    /* Yang tertutup diredupkan, bukan dicoret — coretan mengurangi
       keterbacaan teks yang sudah 15px. */
    pudar: { color: c.textSecondary },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    metaBahaya: { color: c.danger },
  });
}
