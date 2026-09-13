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
import { KartuPahlawan } from '@/components/ui/KartuPahlawan';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RAPAT, SPASI, type Palet } from '@/lib/tema';

/*
  KEUANGAN — piutang & tagihan, NATIVE. Gelombang 2a.

  Menggantikan modul WebView `keuangan` (9 halaman web).

  ── Yang ditampilkan, dan kenapa BUKAN semuanya

  `/api/v1/keuangan/ikhtisar` memulangkan tujuh blok: kpi, bulanan,
  komposisi_kasbon, umur_piutang, per_proyek, invoice_tertunggak.

  Layar ini memakai TIGA — kpi, umur piutang, invoice tertunggak.

  `bulanan` dan `komposisi_kasbon` adalah data GRAFIK. Di layar 360dp
  tanpa pustaka chart, keduanya hanya bisa jadi deretan angka — dan
  deretan angka bulanan tak menjawab pertanyaan apa pun yang orang bawa
  ke HP. Yang dibawa ke HP: "siapa yang telat bayar, berapa lama".

  `per_proyek` dilewati sebab `/lapangan` sudah menampilkan proyek, dan
  dua daftar proyek di dua layar dengan angka berbeda membuat orang
  bertanya mana yang benar.

  ⚠ Karena itu layar ini TIDAK menggantikan halaman web keuangan secara
  utuh. Ditulis di sini supaya tak diklaim sebaliknya.

  ── NOMINAL DATANG SEBAGAI STRING

  `keuangan-ikhtisar.ts` memakai `rp()` yang memulangkan string ('0.00'),
  sebab nominalnya `numeric` Postgres — ADR menuntutnya, dan mengubahnya
  jadi `number` di server berarti kehilangan presisi pada angka miliaran.

  Di klien ia di-`Number()` HANYA untuk ditampilkan, tak pernah untuk
  dihitung. Penjumlahan tetap tugas server.
*/

interface Kpi {
  nilai_kontrak: string;
  tertagih: string;
  terbayar: string;
  piutang: string;
  kasbon_beredar: string;
  invoice_lewat_tempo: number;
  proyek_aktif: number;
}

interface UmurPiutang {
  nama: string;
  nilai: string;
  jumlah: number;
}

interface InvoiceTertunggak {
  id: string;
  nomor: string;
  proyek: string | null;
  jatuh_tempo: string;
  hari_lewat: number;
  sisa: string;
}

type Item =
  | { tipe: 'judul'; teks: string; jumlah?: number }
  | { tipe: 'umur'; data: UmurPiutang }
  | { tipe: 'invoice'; data: InvoiceTertunggak };

const ambilKunci = (i: Item, idx: number) =>
  i.tipe === 'judul' ? `judul:${i.teks}` : `${i.tipe}:${idx}`;

/**
 * Rupiah RINGKAS — untuk angka orientasi, bukan angka yang dihitung.
 *
 * Nilai kontrak di repo ini menembus miliaran ("Rp 7.135.525.000"), dan
 * rupiah penuh memakan seluruh lebar sel KPI di layar 360dp lalu memaksa
 * label di bawahnya membungkus jadi tiga baris.
 *
 * Yang butuh rupiah persis membuka laporan di komputer — dan itu memang
 * tempatnya. Di sini yang dicari: "kira-kira berapa, dan apakah besar".
 */
function rpRingkas(s: string | number) {
  const n = Number(s) || 0;
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n)}`;
}

/** Rupiah PENUH — dipakai di kartu invoice, tempat angkanya menentukan. */
function rpPenuh(s: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(s) || 0);
}

function fmtTanggal(s: string) {
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const KartuInvoice = React.memo(function KartuInvoice({
  v,
  s,
  c,
}: {
  v: InvoiceTertunggak;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  /*
    Tiga tingkat keterlambatan, dan ambangnya SAMA dengan ember umur
    piutang di server (30 / 60 hari, `keuangan-ikhtisar.ts:228`).

    Memakai ambang sendiri di sini membuat kartu bertanda merah tak cocok
    dengan ember "60+ hari" di atasnya — dua tampilan yang keduanya benar
    menurut aturannya sendiri, dan tak seorang pun bisa menunjuk sebabnya.
  */
  const varian = v.hari_lewat > 60 ? 'danger' : v.hari_lewat > 30 ? 'warning' : 'default';

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {v.proyek ?? v.nomor}
        </Text>
        <Badge label={`${v.hari_lewat} hari`} variant={varian} />
      </View>

      {/* Sisa tagihan PENUH — ini angka yang ditagihkan, bukan orientasi. */}
      <Text style={s.nominal}>{rpPenuh(v.sisa)}</Text>

      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="document-text-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{v.nomor}</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons
            name="alarm-outline"
            size={13}
            color={c.danger}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[s.meta, s.metaBahaya]}>Jatuh tempo {fmtTanggal(v.jatuh_tempo)}</Text>
        </View>
      </View>
    </Card>
  );
});

/**
 * Satu ember umur piutang, dengan bar proporsional.
 *
 * Angka rupiah antar-ember sulit dibandingkan sekilas ("Rp 412 jt" vs
 * "Rp 1,2 M" menuntut konversi mental). Bar memberi bentuk — dan bentuk
 * itulah yang menjawab "piutangnya menumpuk di mana".
 */
const BarisUmur = React.memo(function BarisUmur({
  u,
  maks,
  s,
  c,
}: {
  u: UmurPiutang;
  maks: number;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const n = Number(u.nilai) || 0;
  /*
    Pembagi dijaga tak nol. `maks` 0 berarti seluruh ember kosong — dan
    `0/0` menghasilkan NaN, yang di `width: '${NaN}%'` membuat bar
    menghilang tanpa galat. Keluarga cacat yang sama dengan `Infinity%`
    yang pernah ditemukan memotret halaman struktur.
  */
  const lebar = maks > 0 ? Math.round((n / maks) * 100) : 0;

  /* Ember paling tua = paling mendesak. Warnanya mengikuti urutan itu. */
  const tua = /60/.test(u.nama);
  const sedang = /31|30/.test(u.nama);

  return (
    <View style={s.umurBaris}>
      <View style={s.umurKepala}>
        <Text style={s.umurNama}>{u.nama}</Text>
        <Text style={s.umurNilai}>
          {rpRingkas(u.nilai)}
          <Text style={s.umurJumlah}> · {u.jumlah}</Text>
        </Text>
      </View>
      <View
        style={s.barLuar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[
            s.barDalam,
            { width: `${lebar}%` },
            tua && s.barTua,
            sedang && s.barSedang,
          ]}
        />
      </View>
    </View>
  );
});

export default function KeuanganScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [umur, setUmur] = useState<UmurPiutang[]>([]);
  const [tertunggak, setTertunggak] = useState<InvoiceTertunggak[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    `res.data` DATAR — `keuangan-ikhtisar.ts:296` mengirim objeknya apa
    adanya, tanpa pembungkus `.data`.

    Dibaca ke rutenya, bukan ditebak dari pola: `/approval/inbox`
    BERSARANG, `/mutu/ikhtisar` dan ini DATAR. Tiga endpoint di repo yang
    sama, dua bentuk berbeda — dan `res.data` bertipe `any` dari axios,
    jadi tsc tak bisa menolong.
  */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/keuangan/ikhtisar');
      setKpi(res.data?.kpi ?? null);
      setUmur(res.data?.umur_piutang ?? []);
      setTertunggak(res.data?.invoice_tertunggak ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'ikhtisar keuangan'));
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

  /* Skala bar umur dihitung SEKALI, bukan per baris. */
  const maksUmur = useMemo(
    () => umur.reduce((m, u) => Math.max(m, Number(u.nilai) || 0), 0),
    [umur]
  );

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    /*
      Ember kosong DILEWATI, tetapi hanya kalau SEMUANYA kosong barisnya
      hilang — ember tunggal bernilai nol tetap ditampilkan supaya
      pembacanya tahu ember itu ada dan memang kosong.
    */
    if (umur.some((u) => (Number(u.nilai) || 0) > 0)) {
      out.push({ tipe: 'judul', teks: 'Umur piutang' });
      for (const u of umur) out.push({ tipe: 'umur', data: u });
    }
    if (tertunggak.length) {
      out.push({
        tipe: 'judul',
        teks: 'Invoice lewat tempo',
        jumlah: tertunggak.length,
      });
      for (const v of tertunggak) out.push({ tipe: 'invoice', data: v });
    }
    return out;
  }, [umur, tertunggak]);

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
      if (item.tipe === 'umur') {
        return <BarisUmur u={item.data} maks={maksUmur} s={styles} c={c} />;
      }
      return <KartuInvoice v={item.data} s={styles} c={c} />;
    },
    [styles, c, maksUmur]
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
      <KepalaLayar judul="Keuangan" penjelas="Piutang, tagihan, dan yang lewat tempo" />

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

            {/*
              PIUTANG diberi baris sendiri dan ukuran terbesar.

                  Ia satu-satunya angka di layar ini yang menuntut tindakan
                  — sisanya (nilai kontrak, tertagih, terbayar) adalah
                  konteks. `ui-ux-pro-max` §4: satu angka utama per blok;
                  enam angka sederajat berarti tak ada yang menonjol.
                */}
                {/*
                  Kartu pahlawan (2026-09-13) — angka ini sudah "satu angka
                  utama per blok" sejak awal; yang berubah PERMUKAANNYA.

                  ⚠ Nadanya `netral`, bukan `buruk`. Piutang besar bukan
                  kabar buruk dengan sendirinya — ia uang yang memang belum
                  waktunya masuk. Yang buruk itu invoice LEWAT TEMPO, dan
                  itulah yang diberi pil merah di bawah angka.

                  Mewarnai seluruh angka merah membuat piutang sehat terbaca
                  sebagai masalah, lalu pil lewat-tempo kehilangan artinya
                  sebab semuanya sudah merah.
            */}
            {kpi ? (
              <KartuPahlawan
                  label="Piutang belum tertagih"
                  ikon="wallet-outline"
                  nilai={rpPenuh(kpi.piutang)}
                  style={styles.pahlawan}
                  tren={
                    kpi.invoice_lewat_tempo > 0
                      ? {
                          teks: `${kpi.invoice_lewat_tempo} invoice lewat tempo`,
                          arah: 'buruk',
                        }
                      : undefined
                  }
                />
            ) : null}

            {kpi ? (
              <View style={styles.kpiKotak}>

                <View style={styles.kpiBaris}>
                  <KpiSel label="Nilai kontrak" nilai={rpRingkas(kpi.nilai_kontrak)} s={styles} />
                  <KpiSel label="Tertagih" nilai={rpRingkas(kpi.tertagih)} s={styles} />
                  <KpiSel label="Terbayar" nilai={rpRingkas(kpi.terbayar)} s={styles} />
                </View>
                <View style={styles.kpiPisah} />
                <View style={styles.kpiBaris}>
                  <KpiSel
                    label="Kasbon beredar"
                    nilai={rpRingkas(kpi.kasbon_beredar)}
                    s={styles}
                  />
                  <KpiSel label="Proyek aktif" nilai={String(kpi.proyek_aktif)} s={styles} />
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="wallet-outline"
              judul="Belum ada piutang tertunggak"
              petunjuk="Invoice yang lewat tempo akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
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
  label,
  nilai,
  s,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.kpi1}>
      <Text style={s.kpiNilai}>{nilai}</Text>
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
    utamaKotak: { paddingHorizontal: SPASI.lg, gap: 2 },
    utamaLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    /*
      Tingkat DISPLAY (kandidat C, 2026-09-12) — satu angka memimpin layar.

      Sebelumnya `xxl` (24px). Naik ke 38px + tracking rapat karena
      jangkauan skala kita 2,50x sementara Linear 6,00x dan Ramp 6,40x;
      pada 2,5x tak ada yang bisa memimpin, jadi hierarki jatuh ke warna
      dan kotak. Rinciannya di ARAH-VISUAL-2026 §12b.

      ⚠ SATU display per layar. Kalau angka kedua ikut memakainya, tak ada
      yang memimpin dan skalanya rata lagi — hanya dengan angka lebih besar.
    */
    /* Kartu pahlawan berdiri sendiri di atas grid KPI. */
    pahlawan: { marginBottom: SPASI.md },
    utamaNilai: {
      fontSize: HURUF.display,
      fontFamily: FONT.judul,
      letterSpacing: RAPAT.display,
      lineHeight: 42,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    utamaCatatan: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    utamaCatatanTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.danger },

    kpiBaris: { flexDirection: 'row' },
    kpiPisah: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: SPASI.md,
      marginHorizontal: SPASI.md,
    },
    kpi1: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
    kpiNilai: {
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    kpiLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
    },

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

    /*
      Ember umur TIDAK dibungkus `Card`.

      Keempatnya satu bacaan — sebuah distribusi, bukan empat benda
      terpisah. Memberi masing-masing border dan bayangan memutus
      perbandingan yang justru jadi gunanya
      (ui-ux-pro-max: "Not everything is a card").
    */
    umurBaris: { gap: 4, paddingHorizontal: 2 },
    umurKepala: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    umurNama: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    umurNilai: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    umurJumlah: { fontFamily: FONT.isi, color: c.textSecondary },

    barLuar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceHover,
      overflow: 'hidden',
    },
    barDalam: { height: '100%', borderRadius: 3, backgroundColor: c.navy },
    barSedang: { backgroundColor: c.warning },
    barTua: { backgroundColor: c.danger },

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
    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    metaBahaya: { color: c.danger },
  });
}
