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
  PENGADAAN — permintaan material & pesanan pembelian, NATIVE. Gelombang 2a.

  Menggantikan modul WebView `procurement` (13 halaman web, terbanyak di
  antara seluruh modul).

  ── Dua entitas, satu layar, dan kenapa BUKAN dua

  `material_requests` (MR) dan `purchase_orders` (PO) adalah rantai yang
  sama dilihat dari dua ujung: mandor meminta, kantor memesan. Yang membuka
  layar ini di lapangan menanyakan satu hal — *"barang yang saya minta
  sudah dipesan belum, sampai kapan"* — dan jawabannya menyeberangi
  keduanya.

  Dipisah jadi dua layar berarti berpindah-pindah untuk satu pertanyaan.

  ── Yang TIDAK ditampilkan

  Sembilan belas rute GET lainnya (supplier, katalog material, kategori,
  RFQ, retur, log pengiriman) dilewati. Katalog dan supplier adalah data
  REFERENSI — dibuka saat menyusun pesanan, dan penyusunan pesanan bukan
  pekerjaan yang dilakukan sambil berdiri di proyek.

  ⚠ Layar ini TIDAK menggantikan halaman web pengadaan secara utuh.

  ── Mandor hanya melihat MR-nya sendiri

  `procurement.ts:280` menyaringnya di server
  (`if (currentUser.role === 'mandor') q = q.eq('requested_by', ...)`).
  TIDAK disaring ulang di sini: menduplikasi aturan otorisasi di klien
  berarti dua tempat yang bisa menyimpang, dan yang di klien tak menjaga
  apa pun — datanya sudah tak terkirim.
*/

interface Relasi {
  id?: string;
  name?: string;
}

interface ItemMr {
  id: string;
  qty_requested: number | string | null;
  qty_ordered: number | string | null;
  unit: string | null;
  material?: { id?: string; name?: string; unit?: string } | null;
}

interface Mr {
  id: string;
  mr_number: string;
  status: string;
  request_date: string | null;
  needed_date: string | null;
  notes: string | null;
  project?: Relasi | null;
  requested_by?: Relasi | null;
  items?: ItemMr[] | null;
}

interface ItemPo {
  id: string;
  qty_ordered: number | string | null;
  qty_received: number | string | null;
  unit: string | null;
  material?: { id?: string; name?: string } | null;
}

interface Po {
  id: string;
  po_number: string;
  status: string;
  order_date: string | null;
  expected_delivery_date: string | null;
  total_amount: number | string | null;
  project?: Relasi | null;
  supplier?: { id?: string; name?: string; phone?: string } | null;
  items?: ItemPo[] | null;
}

type Tab = 'mr' | 'po';

const kunciMr = (m: Mr) => `mr:${m.id}`;
const kunciPo = (p: Po) => `po:${p.id}`;

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
 * Sisa hari menuju tanggal — negatif berarti LEWAT.
 *
 * Dihitung di klien, dan itu disengaja: rutenya mengirim tanggal mentah,
 * bukan selisih. Risikonya selisih zona waktu satu hari, dan itu
 * DITERIMA di sini sebab angkanya dipakai untuk MEWARNAI, bukan untuk
 * memutuskan — beda dengan `terlambat` di layar Lapangan, yang dihitung
 * server justru karena ia label kategoris.
 */
function sisaHari(s: string | null): number | null {
  if (!s) return null;
  const ms = Date.parse(s.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10));
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000);
}

/**
 * Ringkasan pemenuhan: berapa dari yang diminta sudah dipesan/diterima.
 *
 * Ini angka yang paling dicari di layar ini, dan ia TIDAK dikirim rute
 * mana pun — harus dijumlahkan dari `items`. Dihitung di klien sebab
 * datanya sudah ada di tangan; satu panggilan tambahan untuk menjumlahkan
 * larik yang sudah diterima adalah perjalanan jaringan yang sia-sia.
 */
function ringkasPemenuhan(
  items: Array<{ diminta: number | string | null; dipenuhi: number | string | null }> | null
): { diminta: number; dipenuhi: number; persen: number } | null {
  if (!items?.length) return null;
  let diminta = 0;
  let dipenuhi = 0;
  for (const it of items) {
    diminta += Number(it.diminta) || 0;
    dipenuhi += Number(it.dipenuhi) || 0;
  }
  if (diminta <= 0) return null;
  /*
    Dijepit 0-100. Penerimaan berlebih tercatat di sebagian PO (kiriman
    lebih dari pesanan), dan tanpa jepitan bar meluber keluar kartu —
    keluarga cacat `Infinity%` yang ditemukan memotret halaman struktur.
  */
  const persen = Math.max(0, Math.min(100, Math.round((dipenuhi / diminta) * 100)));
  return { diminta, dipenuhi, persen };
}

const KartuMr = React.memo(function KartuMr({
  m,
  s,
  c,
}: {
  m: Mr;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const butuh = sisaHari(m.needed_date);
  const tgl = fmtTanggal(m.needed_date);
  const pemenuhan = ringkasPemenuhan(
    (m.items ?? []).map((i) => ({ diminta: i.qty_requested, dipenuhi: i.qty_ordered }))
  );

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {m.project?.name ?? m.mr_number}
        </Text>
        <Badge label={statusLabel(m.status)} variant={statusVariant(m.status)} />
      </View>

      {/*
        Daftar material — maksimal DUA, sisanya diringkas.

        Satu MR bisa memuat belasan baris, dan menampilkan semuanya membuat
        satu kartu memenuhi layar. Dua cukup untuk mengenali MR-nya
        ("oh, yang pasir dan semen itu"); jumlah sisanya menjawab "ada
        berapa lagi" tanpa memaksa menggulir.
      */}
      {m.items?.length ? (
        <View style={s.itemBlok}>
          {m.items.slice(0, 2).map((it) => (
            <View key={it.id} style={s.itemBaris}>
              <Text style={s.itemNama} numberOfLines={1}>
                {it.material?.name ?? 'Material'}
              </Text>
              <Text style={s.itemQty}>
                {Number(it.qty_requested) || 0}
                <Text style={s.itemSatuan}> {it.unit ?? it.material?.unit ?? ''}</Text>
              </Text>
            </View>
          ))}
          {m.items.length > 2 ? (
            <Text style={s.itemLagi}>+{m.items.length - 2} material lagi</Text>
          ) : null}
        </View>
      ) : null}

      {pemenuhan ? (
        <Baris
          label="Sudah dipesan"
          persen={pemenuhan.persen}
          s={s}
        />
      ) : null}

      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="document-text-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{m.mr_number}</Text>
        </View>
        {tgl ? (
          <View style={s.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={butuh != null && butuh < 0 ? c.danger : c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[s.meta, butuh != null && butuh < 0 && s.metaBahaya]}>
              {butuh != null && butuh < 0
                ? `Terlambat ${Math.abs(butuh)} hari`
                : `Dibutuhkan ${tgl}`}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const KartuPo = React.memo(function KartuPo({
  p,
  s,
  c,
}: {
  p: Po;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const kirim = sisaHari(p.expected_delivery_date);
  const tgl = fmtTanggal(p.expected_delivery_date);
  const terima = ringkasPemenuhan(
    (p.items ?? []).map((i) => ({ diminta: i.qty_ordered, dipenuhi: i.qty_received }))
  );

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {p.supplier?.name ?? p.po_number}
        </Text>
        <Badge label={statusLabel(p.status)} variant={statusVariant(p.status)} />
      </View>

      <Text style={s.nominal}>{rpPenuh(p.total_amount)}</Text>

      {terima ? <Baris label="Sudah diterima" persen={terima.persen} s={s} /> : null}

      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="receipt-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta}>{p.po_number}</Text>
        </View>
        {p.project?.name ? (
          <View style={s.metaItem}>
            <Ionicons
              name="business-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta} numberOfLines={2}>
              {p.project.name}
            </Text>
          </View>
        ) : null}
        {tgl ? (
          <View style={s.metaItem}>
            <Ionicons
              name="cube-outline"
              size={13}
              color={kirim != null && kirim < 0 ? c.danger : c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[s.meta, kirim != null && kirim < 0 && s.metaBahaya]}>
              {kirim != null && kirim < 0
                ? `Telat kirim ${Math.abs(kirim)} hari`
                : `Kirim ${tgl}`}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

/** Bar pemenuhan dengan labelnya — dipakai MR dan PO. */
function Baris({
  label,
  persen,
  s,
}: {
  label: string;
  persen: number;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.penuhBlok}>
      <View style={s.penuhKepala}>
        <Text style={s.penuhLabel}>{label}</Text>
        <Text style={s.penuhPersen}>{persen}%</Text>
      </View>
      <View
        style={s.barLuar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[
            s.barDalam,
            { width: `${persen}%` },
            persen >= 100 && s.barPenuh,
          ]}
        />
      </View>
    </View>
  );
}

export default function PengadaanScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [tab, setTab] = useState<Tab>('mr');
  const [mr, setMr] = useState<Mr[]>([]);
  const [po, setPo] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /*
    KEDUANYA dimuat sekaligus, bukan per tab.

    Berpindah tab lalu menunggu spinner memutus alur pertanyaan yang justru
    menyeberangi keduanya ("saya minta ini — sudah dipesan belum?").
    Dua panggilan paralel di awal lebih murah daripada satu panggilan tiap
    kali jempol menyentuh tab.

    `Promise.allSettled`, BUKAN `all`: kalau satu gagal, yang lain tetap
    tampil. `all` membuang balasan yang sudah tiba karena saudaranya gagal
    — dan layar jadi kosong total atas kegagalan separuh.
  */
  const muat = useCallback(async () => {
    try {
      const [rMr, rPo] = await Promise.allSettled([
        api.get('/api/v1/procurement/material-requests'),
        api.get('/api/v1/procurement/purchase-orders'),
      ]);

      const gagal: string[] = [];
      if (rMr.status === 'fulfilled') setMr(rMr.value.data?.material_requests ?? []);
      else gagal.push(pesanGalat(rMr.reason, 'permintaan material'));

      if (rPo.status === 'fulfilled') setPo(rPo.value.data?.purchase_orders ?? []);
      else gagal.push(pesanGalat(rPo.reason, 'pesanan pembelian'));

      setGalat(gagal.join(' · '));
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

  const renderMr = useCallback(
    ({ item }: { item: Mr }) => <KartuMr m={item} s={styles} c={c} />,
    [styles, c]
  );
  const renderPo = useCallback(
    ({ item }: { item: Po }) => <KartuPo p={item} s={styles} c={c} />,
    [styles, c]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const kepala = (
    <>
      {galat ? <Galat judul="Sebagian data tidak bisa dimuat" pesan={galat} /> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBaris}
      >
        <TabChip
          label="Permintaan"
          n={mr.length}
          aktif={tab === 'mr'}
          onPress={() => setTab('mr')}
          s={styles}
        />
        <TabChip
          label="Pesanan"
          n={po.length}
          aktif={tab === 'po'}
          onPress={() => setTab('po')}
          s={styles}
        />
      </ScrollView>
    </>
  );

  /*
    DUA `FlatList` bersyarat, bukan satu daftar gabungan bertanda.

    Kartu MR dan PO berbeda bentuk dan berbeda `keyExtractor`. Menyatukannya
    berarti tipe union di tiap render — dan yang lebih mahal: berpindah tab
    akan me-render ulang SELURUH daftar alih-alih menukar dua daftar yang
    masing-masing sudah ter-virtualisasi.
  */
  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar judul="Pengadaan" penjelas="Permintaan material dan pesanan ke supplier" />

      {tab === 'mr' ? (
        <FlatList
          data={mr}
          keyExtractor={kunciMr}
          renderItem={renderMr}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
          }
          ListHeaderComponent={kepala}
          ListEmptyComponent={
            galat ? null : (
              <Kosong
                ikon="clipboard-outline"
                judul="Belum ada permintaan material"
                petunjuk="Permintaan yang diajukan akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
              />
            )
          }
          initialNumToRender={8}
          windowSize={7}
        />
      ) : (
        <FlatList
          data={po}
          keyExtractor={kunciPo}
          renderItem={renderPo}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
          }
          ListHeaderComponent={kepala}
          ListEmptyComponent={
            galat ? null : (
              <Kosong
                ikon="cart-outline"
                judul="Belum ada pesanan pembelian"
                petunjuk="Pesanan ke supplier akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
              />
            )
          }
          initialNumToRender={8}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
}

function TabChip({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={`${label}, ${n} baris${aktif ? ', terpilih' : ''}`}
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

    tabBaris: { gap: SPASI.sm, paddingBottom: SPASI.md, paddingRight: SPASI.lg },
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

    /*
      Daftar material diberi latar sendiri, bukan border.

      Ia blok DI DALAM kartu; memberinya border membuat kartu di dalam
      kartu, dan dua tepi bersarang membaca sebagai dua benda yang bisa
      ditekan terpisah (ui-ux-pro-max: "Not everything is a card").
    */
    itemBlok: {
      backgroundColor: c.surfaceSubtle,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      gap: 4,
      marginTop: 2,
    },
    itemBaris: { flexDirection: 'row', alignItems: 'baseline', gap: SPASI.sm },
    itemNama: { flex: 1, fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    itemQty: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    itemSatuan: { fontFamily: FONT.isi, color: c.textSecondary },
    itemLagi: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    penuhBlok: { gap: 3, marginTop: 2 },
    penuhKepala: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    penuhLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    penuhPersen: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    barLuar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceHover,
      overflow: 'hidden',
    },
    barDalam: { height: '100%', borderRadius: 3, backgroundColor: c.navy },
    barPenuh: { backgroundColor: c.success },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    metaBahaya: { color: c.danger },
  });
}
