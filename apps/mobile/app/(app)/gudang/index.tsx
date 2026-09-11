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
  GUDANG — stok & aset, NATIVE.

  Menggantikan modul WebView `gudang` (keputusan founder 2026-09-11).

  ── Kenapa modul ini masuk gelombang 1

  Ia dibuka PERSIS saat orangnya berdiri di depan raknya: "sisa semen
  berapa?", "bor ini tercatat di gudang mana?". Modul kantor bisa menunggu
  sampai seseorang duduk; ini tidak.

  ── Apa yang DITAMPILKAN, dan apa yang tidak

  Satu endpoint — `/api/v1/gudang/ikhtisar` — memulangkan sembilan blok
  sekaligus (kpi, gudang, aset per kategori/kondisi, isi_gudang,
  pergerakan, material_gudang, belum_ditarik). Layar ini sengaja hanya
  memakai EMPAT: ringkasan, daftar gudang, material, dan aset yang perlu
  perhatian.

  Alasannya bukan kemalasan. Di layar selebar 360dp, sembilan blok berarti
  menggulir melewati delapan hal untuk mencari satu — dan yang dicari orang
  di lokasi hampir selalu "berapa sisanya" atau "barangnya di mana".
  Analitik per-kategori punya tempatnya di layar besar.

  ⚠ Karena itu layar ini TIDAK menggantikan halaman web gudang secara
  utuh, dan pernyataan itu ditulis di sini supaya tak diklaim sebaliknya.
*/

interface Kpi {
  total_aset: number;
  di_gudang: number;
  di_lapangan: number;
  perlu_perhatian: number;
  jenis_material_gudang: number;
  proyek_belum_ditarik: number;
  nilai_perolehan: number;
  nilai_buku: number;
  akumulasi_susut: number;
}

interface BarisGudang {
  id: string;
  kode: string;
  nama: string;
  alamat: string | null;
  jumlah_aset: number;
  jenis_material: number;
}

interface BarisAset {
  id: string;
  kode: string;
  nama: string;
  kategori: string;
  kondisi: string;
  status: string;
  gudang: string | null;
}

interface BarisMaterial {
  id: string;
  material_id: string;
  /** Nama katalog. `null` bila materialnya tak ditemukan — bukan ''. */
  nama: string | null;
  kode: string | null;
  satuan: string | null;
  /** String, bukan number — API mengirimnya begitu (numeric Postgres). */
  qty: string;
  asal: string | null;
}

/** Satu baris daftar gabungan — FlatList tunggal, bukan ScrollView bersarang. */
type Item =
  | { tipe: 'gudang'; data: BarisGudang }
  | { tipe: 'material'; data: BarisMaterial }
  | { tipe: 'aset'; data: BarisAset }
  | { tipe: 'judul'; teks: string; jumlah: number };

const ambilKunci = (i: Item, idx: number) =>
  i.tipe === 'judul' ? `judul:${i.teks}` : `${i.tipe}:${i.data.id}:${idx}`;

function fmtRupiahRingkas(n: number) {
  /*
    Nilai aset gudang di repo ini mencapai ratusan juta. Rupiah penuh
    ("Rp 412.750.000") memakan seluruh lebar kartu di layar 360dp dan
    memaksa angka berikutnya turun baris.

    Dibulatkan ke juta/miliar — ini angka ORIENTASI, bukan angka yang
    dipakai menghitung. Yang butuh rupiah persis membuka laporan di
    komputer, dan itu memang tempatnya.
  */
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)} jt`;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Kondisi → varian lencana.
 *
 * Urutan tingkatnya ('baik' > 'cukup' > 'buruk') sengaja TIDAK dihitung
 * ulang di sini — server sudah mengurutkan `isi_gudang` dengan bobot itu,
 * dan `gudang-ikhtisar.ts` memperingatkan bahwa menulis ulang urutannya
 * di UI membuat satu tempat yang keliru menandai alat sehat sebagai rusak.
 * Yang dilakukan di sini cuma memetakan nama ke warna.
 */
function varianKondisi(k: string): 'success' | 'warning' | 'danger' | 'default' {
  if (k === 'baik') return 'success';
  if (k === 'cukup') return 'warning';
  if (k === 'buruk') return 'danger';
  return 'default';
}

const LABEL_KONDISI: Record<string, string> = {
  baik: 'Baik',
  cukup: 'Cukup',
  buruk: 'Buruk',
};

const KartuGudang = React.memo(function KartuGudang({
  g,
  s,
  c,
}: {
  g: BarisGudang;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {g.nama}
        </Text>
        <Badge label={g.kode} variant="default" />
      </View>
      {g.alamat ? (
        <View style={s.metaItem}>
          <Ionicons
            name="location-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {/* Alamat MEMBUNGKUS, tak dipotong — di layar tanpa tooltip, teks
              terpotong berarti informasinya hilang (ui-ux-pro-max §6). */}
          <Text style={s.meta} numberOfLines={2}>
            {g.alamat}
          </Text>
        </View>
      ) : null}
      <View style={s.angkaBaris}>
        <AngkaKecil label="Aset" nilai={String(g.jumlah_aset)} s={s} />
        <AngkaKecil label="Jenis material" nilai={String(g.jenis_material)} s={s} />
      </View>
    </Card>
  );
});

const KartuMaterial = React.memo(function KartuMaterial({
  m,
  s,
  c,
}: {
  m: BarisMaterial;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        {/*
          Nama katalog, dengan jatuhan BERTINGKAT — bukan langsung ke id.

          Versi pertama layar ini menampilkan `material_id` apa adanya,
          sebab API memang belum mengirim namanya. Terlihat dari potret:

              5cb9e5c3-9523-4ba4-ac17-eb1714330178      40

          UUID sebagai nama barang, di layar yang dibuka orang sambil
          berdiri di depan raknya. API diperbaiki hari itu juga
          (`gudang-ikhtisar.ts` kini mengirim nama/kode/satuan).

          Jatuhannya tetap dipertahankan tiga tingkat — nama, lalu kode,
          lalu id — sebab baris stok yang materialnya terhapus dari
          katalog tetap ADA di gudang. Menyembunyikannya berarti barang
          nyata di rak yang tak terlihat sama sekali dari HP.
        */}
        <Text style={s.judulKartu} numberOfLines={2}>
          {m.nama ?? m.kode ?? m.material_id}
        </Text>
        {/*
          Satuan menempel pada angka, bukan baris terpisah: "40" tanpa
          satuan tak bisa dipakai memeriksa stok — 40 sak dan 40 kg beda
          sepuluh kali lipat.
        */}
        <Text style={s.qty}>
          {m.qty}
          {m.satuan ? <Text style={s.satuan}> {m.satuan}</Text> : null}
        </Text>
      </View>
      {m.asal ? (
        <View style={s.metaItem}>
          <Ionicons
            name="arrow-forward-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta} numberOfLines={2}>
            Sisa dari {m.asal}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const KartuAset = React.memo(function KartuAset({
  a,
  s,
  c,
}: {
  a: BarisAset;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {a.nama}
        </Text>
        <Badge label={LABEL_KONDISI[a.kondisi] ?? a.kondisi} variant={varianKondisi(a.kondisi)} />
      </View>
      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="pricetag-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{a.kode}</Text>
        </View>
        {a.gudang ? (
          <View style={s.metaItem}>
            <Ionicons
              name="business-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>{a.gudang}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

function AngkaKecil({
  label,
  nilai,
  s,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.angkaKecil}>
      <Text style={s.angkaKecilNilai}>{nilai}</Text>
      <Text style={s.angkaKecilLabel}>{label}</Text>
    </View>
  );
}

export default function GudangScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [gudang, setGudang] = useState<BarisGudang[]>([]);
  const [material, setMaterial] = useState<BarisMaterial[]>([]);
  const [aset, setAset] = useState<BarisAset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    Kunci dibaca PERSIS seperti yang dikirim `gudang-ikhtisar.ts:191` —
    `kpi`, `gudang`, `material_gudang`, `isi_gudang`.

    Salah satu huruf saja menghasilkan layar yang tampak sehat dengan nol
    di mana-mana, dan `res.data` bertipe `any` dari axios jadi `tsc` diam.
    Itu persis cacat dashboard 2026-09-04 (Rp 0 atas Rp 7,14 M) yang
    melahirkan `audit-bentuk-balasan-mobile.mjs`.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/gudang/ikhtisar');
      setKpi(res.data?.kpi ?? null);
      setGudang(res.data?.gudang ?? []);
      setMaterial(res.data?.material_gudang ?? []);
      setAset(res.data?.isi_gudang ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'data gudang'));
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
    SATU `FlatList` dengan bagian bertanda, bukan `ScrollView` berisi tiga
    daftar.

    `ScrollView` + `.map()` menahan seluruh anaknya di memori — itu yang
    dijaga `audit-daftar-mobile-virtual.mjs`. Dan `FlatList` bersarang di
    dalam `ScrollView` lebih buruk lagi: virtualisasinya mati total karena
    tingginya tak terbatas, dengan peringatan yang mudah terlewat.
  */
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (gudang.length) {
      out.push({ tipe: 'judul', teks: 'Gudang', jumlah: gudang.length });
      for (const g of gudang) out.push({ tipe: 'gudang', data: g });
    }
    if (material.length) {
      out.push({ tipe: 'judul', teks: 'Material terbanyak', jumlah: material.length });
      for (const m of material) out.push({ tipe: 'material', data: m });
    }
    if (aset.length) {
      out.push({ tipe: 'judul', teks: 'Aset di gudang', jumlah: aset.length });
      for (const a of aset) out.push({ tipe: 'aset', data: a });
    }
    return out;
  }, [gudang, material, aset]);

  const render = useCallback(
    ({ item }: { item: Item }) => {
      if (item.tipe === 'judul') {
        return (
          <View style={styles.bagian}>
            <Text style={styles.bagianJudul}>{item.teks}</Text>
            <Text style={styles.bagianJumlah}>{item.jumlah}</Text>
          </View>
        );
      }
      if (item.tipe === 'gudang') return <KartuGudang g={item.data} s={styles} c={c} />;
      if (item.tipe === 'material') return <KartuMaterial m={item.data} s={styles} c={c} />;
      return <KartuAset a={item.data} s={styles} c={c} />;
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
      <KepalaLayar judul="Gudang" penjelas="Stok material dan aset yang tersimpan" />

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
            {/* Galat MUAT terpisah dari keadaan KOSONG — disiplin
                `uji-galat-muat-terpisah.mjs`. "Gudang kosong" pada layar yang
                gagal memuat membuat orang menyimpulkan stoknya habis. */}
            {galat ? <Galat judul="Data gudang tidak bisa dimuat" pesan={galat} /> : null}

            {kpi ? (
              <View style={styles.kpiKotak}>
                <View style={styles.kpiBaris}>
                  <Kpi1 label="Aset total" nilai={String(kpi.total_aset)} s={styles} />
                  <Kpi1 label="Di gudang" nilai={String(kpi.di_gudang)} s={styles} />
                  <Kpi1 label="Di lapangan" nilai={String(kpi.di_lapangan)} s={styles} />
                </View>
                <View style={styles.kpiPisah} />
                <View style={styles.kpiBaris}>
                  <Kpi1
                    label="Perlu perhatian"
                    nilai={String(kpi.perlu_perhatian)}
                    s={styles}
                    /* Satu-satunya angka berwarna di blok ini — kalau semua
                       berwarna, tak ada yang menonjol. */
                    nada={kpi.perlu_perhatian > 0 ? 'bahaya' : undefined}
                  />
                  <Kpi1
                    label="Jenis material"
                    nilai={String(kpi.jenis_material_gudang)}
                    s={styles}
                  />
                  <Kpi1 label="Nilai buku" nilai={fmtRupiahRingkas(kpi.nilai_buku)} s={styles} />
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="cube-outline"
              judul="Belum ada isi gudang"
              petunjuk="Material dan aset yang masuk gudang akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function Kpi1({
  label,
  nilai,
  s,
  nada,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
  nada?: 'bahaya';
}) {
  return (
    <View style={s.kpi1}>
      <Text style={[s.kpiNilai, nada === 'bahaya' && s.kpiNilaiBahaya]}>{nilai}</Text>
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
    kpiNilaiBahaya: { color: c.danger },
    kpiLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
    },

    /*
      Kepala bagian, bukan kartu. Ia penanda bacaan — memberinya border dan
      bayangan akan membuatnya terbaca sebagai benda yang bisa ditekan
      (ui-ux-pro-max: "Not everything is a card").
    */
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
    qty: {
      fontSize: HURUF.lg,
      fontFamily: FONT.judul,
      color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    /* Satuan lebih kecil & lebih tenang — angkanya yang dicari mata. */
    satuan: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    metaBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: SPASI.md, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },

    angkaBaris: { flexDirection: 'row', gap: SPASI.xl, marginTop: 4 },
    angkaKecil: { gap: 1 },
    angkaKecilNilai: {
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    angkaKecilLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
  });
}
