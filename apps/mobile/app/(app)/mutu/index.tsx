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
import { Badge } from '@/components/ui/Badge';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/*
  MUTU & K3 — ikhtisar lintas proyek, NATIVE.

  Menggantikan modul WebView `mutu` dan `k3` (keputusan founder 2026-09-11).

  ── Kenapa DUA modul jadi SATU layar

  Bukan penggabungan demi hemat. `/api/v1/mutu/ikhtisar` memang memulangkan
  keduanya dalam satu balasan (`ncr`, `inspeksi`, `punch`, `dokumen`,
  `izin_kerja`, `k3`), sebab di lapangan keduanya satu pekerjaan: yang
  memeriksa mutu beton adalah orang yang sama yang mencatat temuan K3 di
  lokasi itu.

  Memisahkannya jadi dua layar berarti dua panggilan API ke endpoint yang
  sama dan dua tempat menggulir untuk satu kunjungan lokasi.

  ── BEDANYA dengan layar "Pekerjaan Saya"

  `pekerjaan.tsx` menampilkan NCR, punch, dan izin kerja **yang dikirim
  pengguna itu sendiri**. Layar ini pandangan LINTAS PROYEK — seluruh yang
  terbuka, milik siapa pun.

  Perbedaan itu ditulis di sini karena keduanya menyebut entitas yang sama
  dan mudah disangka duplikat. Menghapus salah satunya akan menghilangkan
  peran yang tak digantikan yang lain: satu untuk "apa tugas saya", satu
  untuk "apa keadaan proyeknya".
*/

interface NcrBaris {
  nomor: string;
  judul: string;
  severity: string;
  status: string;
  sisa_hari: number | null;
}

interface DokBaris {
  pihak: string;
  jenis: string;
  sisa_hari: number | null;
}

interface Ikhtisar {
  ncr: { total: number; terbuka: number; berat: number; daftar: NcrBaris[] };
  inspeksi: { total: number; menunggu: number };
  punch: { total: number; terbuka: number };
  dokumen: {
    total: number;
    belum_terverifikasi: number;
    kedaluwarsa: number;
    segera_habis: number;
    daftar: DokBaris[];
  };
  izin_kerja: { total: number; aktif: number; menunggu: number };
  k3: { kecelakaan: number; daftar_hitam: number; skor_k3_terendah: unknown };
}

type Item =
  | { tipe: 'judul'; teks: string; jumlah?: number }
  | { tipe: 'ncr'; data: NcrBaris }
  | { tipe: 'dok'; data: DokBaris };

const ambilKunci = (i: Item, idx: number) =>
  i.tipe === 'judul' ? `judul:${i.teks}` : `${i.tipe}:${idx}`;

/**
 * Severity → label Indonesia.
 *
 * Terlihat dari potret: lencana berbunyi `major`, `kritis`, `minor` —
 * huruf kecil semua, bahasa campur. Bentuk yang sama dengan lencana
 * "submitted" yang ditemukan memotret layar mandor, dan yang melahirkan
 * `audit-status-mobile-berlabel.mjs`.
 *
 * Jatuhannya menampilkan nilai APA ADANYA, bukan '—': nilai baru yang
 * belum dipetakan harus TERLIHAT supaya bisa ditambahkan, bukan
 * disembunyikan di balik tanda hubung yang tak bisa ditelusuri.
 */
const LABEL_SEVERITY: Record<string, string> = {
  kritis: 'Kritis',
  critical: 'Kritis',
  major: 'Berat',
  mayor: 'Berat',
  minor: 'Ringan',
  tinggi: 'Tinggi',
  sedang: 'Sedang',
  rendah: 'Rendah',
};

const labelSeverity = (s: string) => LABEL_SEVERITY[s?.toLowerCase()] ?? s;

/**
 * Severity NCR → varian lencana.
 *
 * Polanya disalin dari `mutu-ikhtisar.ts:70`, yang memakai
 * `/major|mayor|tinggi|high/i` untuk menghitung "berat". Memakai daftar
 * kata yang BERBEDA di sini akan membuat kartu bertanda merah tak cocok
 * dengan angka "berat" di ringkasan di atasnya — dua angka yang keduanya
 * benar menurut aturannya sendiri, dan tak ada yang bisa menunjuk sebabnya.
 */
function varianSeverity(s: string): 'danger' | 'warning' | 'default' {
  /*
    `kritis` DIDAHULUKAN, dan itu temuan dari MEMOTRET — bukan dari test.

    Versi pertama menyalin pola `/major|mayor|tinggi|high/i` dari
    `mutu-ikhtisar.ts:70` apa adanya. Diukur ke basis sesudah potret:
    kolom `ncr_items.severity` memuat TIGA nilai — `minor`, `major`, dan
    `kritis`. Yang ketiga tak cocok pola mana pun, jatuh ke `default`, dan
    terender KELABU di sebelah `major` yang merah.

    Di layar itu terbaca sebagai "kritis lebih ringan daripada major" —
    kebalikan dari artinya. Nol galat, nol test merah: kelabu adalah
    keadaan yang sah bagi lencana.

    ⚠ Yang tak ikut diperbaiki di sini, dan sengaja: `mutu-ikhtisar.ts`
    menghitung "NCR berat" dengan pola LAMA, jadi `kritis` TIDAK masuk
    hitungan itu. Angka "5 NCR berat" di ringkasan karenanya lebih kecil
    dari yang sesungguhnya berat. Itu cacat SISI SERVER — memperbaikinya
    di sini hanya membuat kartu dan ringkasan saling bertentangan, dan
    dua angka yang keduanya "benar menurut aturannya sendiri" adalah
    bentuk yang paling sulit ditelusuri (CLAUDE.md §8a.2).
  */
  if (/kritis|critical|berat/i.test(s)) return 'danger';
  if (/major|mayor|tinggi|high/i.test(s)) return 'danger';
  if (/minor|sedang|medium/i.test(s)) return 'warning';
  return 'default';
}

/**
 * Sisa hari → teks manusia.
 *
 * Negatif berarti LEWAT tenggat, dan itu kata yang dipakai — bukan
 * "-3 hari", yang menuntut pembacanya menerjemahkan tanda minus.
 */
function teksSisa(n: number | null): { teks: string; lewat: boolean } | null {
  if (n == null) return null;
  if (n < 0) return { teks: `Lewat ${Math.abs(n)} hari`, lewat: true };
  if (n === 0) return { teks: 'Jatuh tempo hari ini', lewat: true };
  return { teks: `${n} hari lagi`, lewat: false };
}

const KartuNcr = React.memo(function KartuNcr({
  n,
  s,
  c,
}: {
  n: NcrBaris;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const sisa = teksSisa(n.sisa_hari);
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {n.judul}
        </Text>
        <Badge label={labelSeverity(n.severity)} variant={varianSeverity(n.severity)} />
      </View>
      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="document-text-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{n.nomor}</Text>
        </View>
        {sisa ? (
          <View style={s.metaItem}>
            <Ionicons
              name="time-outline"
              size={13}
              color={sisa.lewat ? c.danger : c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[s.meta, sisa.lewat && s.metaBahaya]}>{sisa.teks}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const KartuDok = React.memo(function KartuDok({
  d,
  s,
  c,
}: {
  d: DokBaris;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const sisa = teksSisa(d.sisa_hari);
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {d.pihak}
        </Text>
        {sisa ? (
          <Badge label={sisa.teks} variant={sisa.lewat ? 'danger' : 'warning'} />
        ) : null}
      </View>
      <View style={s.metaItem}>
        <Ionicons
          name="ribbon-outline"
          size={13}
          color={c.textSecondary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={s.meta} numberOfLines={2}>
          {d.jenis}
        </Text>
      </View>
    </Card>
  );
});

export default function MutuScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [ikh, setIkh] = useState<Ikhtisar | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    `res.data` DATAR di sini — `mutu-ikhtisar.ts:213` mengirim hasil
    `ringkasMutu()` apa adanya, tanpa pembungkus.

    Ini kebalikan dari `/api/v1/approval/inbox` yang bersarang di `.data`.
    Dua endpoint di repo yang sama dengan bentuk berbeda, dan satu-satunya
    cara mengetahuinya adalah MEMBACA rutenya — bukan menebak dari pola.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/mutu/ikhtisar');
      setIkh(res.data ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'ikhtisar mutu'));
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

  const items = useMemo<Item[]>(() => {
    if (!ikh) return [];
    const out: Item[] = [];
    if (ikh.ncr?.daftar?.length) {
      out.push({ tipe: 'judul', teks: 'NCR terbuka', jumlah: ikh.ncr.terbuka });
      for (const n of ikh.ncr.daftar) out.push({ tipe: 'ncr', data: n });
    }
    if (ikh.dokumen?.daftar?.length) {
      out.push({
        tipe: 'judul',
        teks: 'Dokumen bermasalah',
        jumlah: ikh.dokumen.kedaluwarsa + ikh.dokumen.segera_habis,
      });
      for (const d of ikh.dokumen.daftar) out.push({ tipe: 'dok', data: d });
    }
    return out;
  }, [ikh]);

  const render = useCallback(
    ({ item }: { item: Item }) => {
      if (item.tipe === 'judul') {
        return (
          <View style={styles.bagian}>
            <Text style={styles.bagianJudul}>{item.teks}</Text>
            {item.jumlah != null ? (
              <Text style={styles.bagianJumlah}>{item.jumlah}</Text>
            ) : null}
          </View>
        );
      }
      if (item.tipe === 'ncr') return <KartuNcr n={item.data} s={styles} c={c} />;
      return <KartuDok d={item.data} s={styles} c={c} />;
    },
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
      <KepalaLayar judul="Mutu & K3" penjelas="Temuan, inspeksi, dan kepatuhan lintas proyek" />

      <FlatList
        data={items}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {galat ? <Galat judul="Ikhtisar tidak bisa dimuat" pesan={galat} /> : null}

            {ikh ? (
              <>
                {/*
                  Tiga angka yang MENUNTUT TINDAKAN diberi baris sendiri di
                  atas, terpisah dari angka total.

                  Alasannya bukan tata letak: "NCR 42" dan "NCR berat 3"
                  berdampingan membuat mata menimbang 42, padahal yang
                  menentukan hari ini adalah 3. `ui-ux-pro-max` §4 —
                  keadaan yang butuh perhatian harus terbaca sekilas,
                  bukan dihitung dari selisih dua angka.
                */}
                <View style={styles.kpiKotak}>
                  <View style={styles.kpiBaris}>
                    <Kpi
                      label="NCR berat"
                      nilai={String(ikh.ncr?.berat ?? 0)}
                      nada={(ikh.ncr?.berat ?? 0) > 0 ? 'bahaya' : undefined}
                      s={styles}
                    />
                    <Kpi
                      label="Dokumen lewat"
                      nilai={String(ikh.dokumen?.kedaluwarsa ?? 0)}
                      nada={(ikh.dokumen?.kedaluwarsa ?? 0) > 0 ? 'bahaya' : undefined}
                      s={styles}
                    />
                    <Kpi
                      label="Inspeksi menunggu"
                      nilai={String(ikh.inspeksi?.menunggu ?? 0)}
                      nada={(ikh.inspeksi?.menunggu ?? 0) > 0 ? 'awas' : undefined}
                      s={styles}
                    />
                  </View>
                  <View style={styles.kpiPisah} />
                  <View style={styles.kpiBaris}>
                    <Kpi label="NCR terbuka" nilai={String(ikh.ncr?.terbuka ?? 0)} s={styles} />
                    <Kpi label="Punch terbuka" nilai={String(ikh.punch?.terbuka ?? 0)} s={styles} />
                    <Kpi label="Izin aktif" nilai={String(ikh.izin_kerja?.aktif ?? 0)} s={styles} />
                  </View>
                </View>

                {/*
                  Blok K3 hanya muncul bila ADA angkanya.

                  Nol kecelakaan adalah kabar baik, tetapi kotak besar
                  berisi "0" di layar sempit memakan ruang yang dibutuhkan
                  daftar NCR — dan tak menyampaikan apa pun yang tak sudah
                  jelas dari ketiadaannya.
                */}
                {(ikh.k3?.kecelakaan ?? 0) > 0 || (ikh.k3?.daftar_hitam ?? 0) > 0 ? (
                  <View style={styles.k3Kotak}>
                    <View style={styles.k3Kepala}>
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color={c.danger}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={styles.k3Judul}>Catatan K3</Text>
                    </View>
                    <Text style={styles.k3Isi}>
                      {ikh.k3.kecelakaan > 0
                        ? `${ikh.k3.kecelakaan} kecelakaan tercatat`
                        : ''}
                      {ikh.k3.kecelakaan > 0 && ikh.k3.daftar_hitam > 0 ? ' · ' : ''}
                      {ikh.k3.daftar_hitam > 0
                        ? `${ikh.k3.daftar_hitam} subkontraktor masuk daftar hitam`
                        : ''}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="shield-checkmark-outline"
              judul="Tidak ada temuan terbuka"
              petunjuk="NCR dan dokumen yang butuh tindakan akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function Kpi({
  label,
  nilai,
  s,
  nada,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
  nada?: 'bahaya' | 'awas';
}) {
  return (
    <View style={s.kpi1}>
      <Text
        style={[s.kpiNilai, nada === 'bahaya' && s.kpiBahaya, nada === 'awas' && s.kpiAwas]}
      >
        {nilai}
      </Text>
      <Text style={s.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
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

    kpiKotak: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: SPASI.md,
      marginBottom: SPASI.sm,
    },
    kpiBaris: { flexDirection: 'row' },
    kpiPisah: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: SPASI.md,
      marginHorizontal: SPASI.md,
    },
    kpi1: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
    kpiNilai: {
      fontSize: HURUF.xl,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    kpiBahaya: { color: c.danger },
    kpiAwas: { color: c.warning },
    kpiLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
    },

    k3Kotak: {
      backgroundColor: c.dangerBg,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      borderRadius: 10,
      padding: SPASI.md,
      gap: 4,
      marginBottom: SPASI.sm,
    },
    k3Kepala: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    k3Judul: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.danger },
    k3Isi: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    bagian: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: SPASI.sm,
      marginBottom: 2,
    },
    bagianJudul: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.textPrimary },
    bagianJumlah: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },

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
    metaBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: SPASI.md, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    metaBahaya: { color: c.danger },
  });
}
