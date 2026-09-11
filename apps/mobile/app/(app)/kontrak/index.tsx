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
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
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
  KONTRAK — daftar kontrak & addendum, NATIVE. Gelombang 2a.

  Menggantikan modul WebView `kontrak` (6 halaman web).

  ── Kenapa ADDENDUM ditandai, bukan disembunyikan

  `kontrak` menyimpan kontrak induk DAN turunannya (addendum, amandemen)
  dalam satu tabel, dibedakan `kontrak_induk_id`. Menampilkan semuanya
  sebagai daftar rata membuat addendum senilai Rp 50 juta terlihat
  sederajat dengan kontrak induk Rp 2 miliar.

  Yang berbahaya bukan urutannya: orang yang mencari "nilai kontrak proyek
  ini" lalu membaca angka addendum sebagai nilai kontraknya.

  Karena itu turunan diberi penanda induknya secara eksplisit — API
  mengirim relasi `induk` (nomor + judul), dan itu ditampilkan.

  ── Penyaring JENIS, bukan status

  Status kontrak sebagian besar 'aktif'; menyaringnya tak memisahkan apa
  pun. Yang benar-benar membagi daftarnya adalah JENIS (kontrak klien vs
  subkontraktor vs supplier) — dan itu pertanyaan yang orang bawa:
  "kontrak dengan siapa".
*/

interface Relasi {
  id?: string;
  name?: string;
  company_name?: string;
  contact_person?: string;
  contract_value?: number | string | null;
}

interface Induk {
  id?: string;
  nomor?: string;
  judul?: string;
}

interface Kontrak {
  id: string;
  jenis: string | null;
  nomor: string | null;
  judul: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  nilai: number | string | null;
  retensi_pct: number | string | null;
  status: string | null;
  project_id: string | null;
  kontrak_induk_id: string | null;
  proyek?: Relasi | null;
  klien?: Relasi | null;
  induk?: Induk | null;
}

const ambilKunci = (k: Kontrak) => k.id;

function rpPenuh(s: string | number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(s) || 0);
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
 * Jenis kontrak → label Indonesia.
 *
 * Jatuhannya merapikan kunci ber-underscore, BUKAN menampilkannya mentah
 * dan bukan pula '—'. Nilai baru harus terlihat supaya bisa ditambahkan;
 * pelajaran yang sama dengan lencana "submitted" yang ditemukan memotret
 * layar mandor.
 */
const LABEL_JENIS: Record<string, string> = {
  klien: 'Klien',
  subkontraktor: 'Subkontraktor',
  supplier: 'Supplier',
  addendum: 'Addendum',
  amandemen: 'Amandemen',
};

function labelJenis(j: string | null): string {
  if (!j) return 'Lainnya';
  return (
    LABEL_JENIS[j] ??
    j
      .split(/[_-]+/)
      .filter(Boolean)
      .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
      .join(' ')
  );
}

const KartuKontrak = React.memo(function KartuKontrak({
  k,
  s,
  c,
}: {
  k: Kontrak;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const mulai = fmtTanggal(k.tanggal_mulai);
  const selesai = fmtTanggal(k.tanggal_selesai);
  const turunan = Boolean(k.kontrak_induk_id);
  const retensi = Number(k.retensi_pct) || 0;

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {k.judul ?? k.nomor ?? 'Tanpa judul'}
        </Text>
        {k.status ? (
          <Badge label={statusLabel(k.status)} variant={statusVariant(k.status)} />
        ) : null}
      </View>

      {/*
        Penanda TURUNAN ditaruh sebelum nilainya, bukan sesudah.

        Urutan baca menentukan artinya: melihat "Rp 50 juta" lebih dulu lalu
        "addendum dari KTR-001" di bawahnya membuat angka itu sempat
        terbaca sebagai nilai kontrak. Dibalik, angkanya sejak awal
        dipahami sebagai TAMBAHAN.
      */}
      {turunan ? (
        <View style={s.turunanBaris}>
          <Ionicons
            name="git-branch-outline"
            size={13}
            color={c.warning}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.turunanTeks} numberOfLines={2}>
            {labelJenis(k.jenis)} dari {k.induk?.nomor ?? 'kontrak induk'}
          </Text>
        </View>
      ) : null}

      <Text style={s.nominal}>{rpPenuh(k.nilai)}</Text>

      <View style={s.metaBaris}>
        {k.nomor ? (
          <View style={s.metaItem}>
            <Ionicons
              name="document-text-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>{k.nomor}</Text>
          </View>
        ) : null}

        {/*
          Nama klien ATAU proyek — bukan keduanya.

          Kontrak klien menyebut kliennya; kontrak subkontraktor/supplier
          menyebut proyeknya. Menampilkan dua-duanya membuat kartu penuh
          baris yang sebagian selalu kosong.
        */}
        {k.klien?.company_name ? (
          <View style={s.metaItem}>
            <Ionicons
              name="briefcase-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta} numberOfLines={2}>
              {k.klien.company_name}
            </Text>
          </View>
        ) : k.proyek?.name ? (
          <View style={s.metaItem}>
            <Ionicons
              name="business-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta} numberOfLines={2}>
              {k.proyek.name}
            </Text>
          </View>
        ) : null}

        {mulai || selesai ? (
          <View style={s.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>
              {mulai ?? '—'} → {selesai ?? '—'}
            </Text>
          </View>
        ) : null}

        {/*
          Retensi hanya muncul bila ADA.

          Nol retensi adalah keadaan yang sah dan umum; barisnya akan
          hadir di setiap kartu tanpa mengatakan apa pun. Yang bernilai
          justru ketika ia tidak nol — uang yang ditahan.
        */}
        {retensi > 0 ? (
          <View style={s.metaItem}>
            <Ionicons
              name="lock-closed-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>Retensi {retensi}%</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

export default function KontrakScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [kontrak, setKontrak] = useState<Kontrak[]>([]);
  const [jenisAktif, setJenisAktif] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    `res.data?.kontrak` — BERSARANG. `kontrak.ts:61` mengirim
    `{ kontrak: data ?? [] }`.

    Bentuk ketiga yang berbeda di modul yang sama-sama dibangun hari ini:
    `/approval/inbox` → `.data`, `/mutu/ikhtisar` → datar,
    `/procurement/material-requests` → `.material_requests`, dan ini →
    `.kontrak`. Tak ada pola yang bisa ditebak; masing-masing dibaca ke
    rutenya.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/kontrak');
      setKontrak(res.data?.kontrak ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'daftar kontrak'));
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
    Jenis dihitung dari DATA yang diterima, bukan daftar tetap.

    Daftar jenis yang dipaku akan menampilkan chip untuk jenis yang tak
    dimiliki tenant ini (chip yang selalu memulangkan kosong), dan
    MELEWATKAN jenis baru yang ditambahkan kelak.
  */
  const jenisTersedia = useMemo(() => {
    const hitung = new Map<string, number>();
    for (const k of kontrak) {
      const j = k.jenis ?? 'lainnya';
      hitung.set(j, (hitung.get(j) ?? 0) + 1);
    }
    return [...hitung.entries()]
      .map(([jenis, n]) => ({ jenis, n, label: labelJenis(jenis) }))
      .sort((a, b) => b.n - a.n);
  }, [kontrak]);

  const terlihat = useMemo(
    () => (jenisAktif ? kontrak.filter((k) => (k.jenis ?? 'lainnya') === jenisAktif) : kontrak),
    [kontrak, jenisAktif]
  );

  const render = useCallback(
    ({ item }: { item: Kontrak }) => <KartuKontrak k={item} s={styles} c={c} />,
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
        judul="Kontrak"
        penjelas={
          kontrak.length > 0
            ? `${kontrak.length} kontrak dan addendum`
            : 'Kontrak, addendum, dan nilainya'
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
            {galat ? <Galat judul="Kontrak tidak bisa dimuat" pesan={galat} /> : null}
            {jenisTersedia.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipBaris}
              >
                <Chip
                  label="Semua"
                  n={kontrak.length}
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
              petunjuk="Ketuk “Semua” di atas untuk melihat seluruh kontrak."
            />
          ) : (
            <Kosong
              ikon="document-attach-outline"
              judul="Belum ada kontrak"
              petunjuk="Kontrak yang dibuat akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
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
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={`${label}, ${n} kontrak${aktif ? ', terpilih' : ''}`}
      style={[s.chip, aktif && s.chipAktif]}
    >
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
    card: { gap: 6 },

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
    nominal: {
      fontSize: HURUF.lg,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },

    turunanBaris: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.warningBg,
      borderRadius: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
      alignSelf: 'flex-start',
    },
    turunanTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.warning, flexShrink: 1 },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
  });
}
