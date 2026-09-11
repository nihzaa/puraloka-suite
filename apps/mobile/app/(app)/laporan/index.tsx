import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RAPAT, SPASI, type Palet } from '@/lib/tema';

/*
  LAPORAN — KPI perusahaan (EVM, piutang, backlog), NATIVE. Gelombang 2b.

  Menggantikan modul WebView `laporan`.

  ── Satu dari tiga belas rute, dan itu disengaja

  `reports.ts` memuat 13 rute GET — projects, financial, cashflow, mandor,
  expenses, progress, rekap pajak (4 varian), export PDF, kpi-perusahaan.

  Layar ini memakai SATU: `/api/v1/reports/kpi-perusahaan`.

  Selebihnya adalah laporan yang dibaca, dicetak, dan diarsipkan — bentuk
  kerja yang menuntut layar lebar, ekspor, dan waktu duduk. Memindahkannya
  ke HP berarti tabel yang harus digulir dua arah.

  Yang MASUK akal di HP cuma satu pertanyaan: *"perusahaan sedang sehat
  atau tidak"* — dan itu persis yang dijawab KPI.

  ⚠ Karena itu layar ini TIDAK menggantikan halaman web laporan.

  ── Bukan FlatList, dan itu pengecualian yang disengaja

  `audit-daftar-mobile-virtual.mjs` menuntut daftar panjang memakai
  FlatList. Layar ini `ScrollView` sebab isinya BUKAN daftar: tiga blok
  tetap (EVM, piutang, backlog) yang jumlahnya tak tumbuh seiring data.

  Bedanya bukan panjang layar melainkan apakah jumlah elemennya bergantung
  pada banyaknya baris di basis. Di sini tidak — 8 proyek dan 800 proyek
  menghasilkan blok yang sama.
*/

interface StatusKpi {
  keadaan: 'baik' | 'perhatian' | 'buruk' | 'tak_ada_data';
  arti: string;
}

/*
  ⚠ `name`, BUKAN `nama` — dan saya menebak salah pada percobaan pertama.

  `lib/kpi-perusahaan.ts:110` menulis
  `perProyek.push({ id, name, cpi, spi, bac, ac })`. Berkas ini semula
  membacanya sebagai `nama` (mengikuti kebiasaan penamaan Indonesia di
  modul lain), dan akibatnya: baris "Terendah: …" TIDAK PERNAH tampil
  meski SPI 0,39 — `terendah?.nama` selalu undefined, jadi seluruh blok
  di-skip oleh `?`-nya sendiri.

  Nol galat. `tsc` hijau karena field-nya opsional. Dan layarnya terlihat
  wajar — hanya kehilangan satu baris yang justru mengubah angka jadi
  sesuatu yang bisa ditindaklanjuti.

  Ketahuan dari MEMOTRET, lalu dibaca ke sumbernya. Ini kelas cacat yang
  dijaga `audit-bentuk-balasan-mobile.mjs` di layar lain: kunci yang
  dibaca wajib benar-benar yang dikirim.
*/
interface ProyekTerendah {
  id?: string;
  name?: string;
  cpi?: number | null;
  spi?: number | null;
}

interface Evm {
  cpi: number | null;
  spi: number | null;
  proyekDihitung: number;
  proyekTotal: number;
  cpiTerendah: ProyekTerendah | null;
  spiTerendah: ProyekTerendah | null;
  totalBac: number;
  totalAc: number;
  statusCpi: StatusKpi;
  statusSpi: StatusKpi;
  dasar_bac: string;
  dasar_pv: string;
}

interface Backlog {
  backlogNilai: number;
  backlogJumlah: number;
  pipelineNilai: number;
  pipelineJumlah: number;
  menang: number;
  kalah: number;
  winRatePct: number | null;
  selisihHargaRataPct: number | null;
  kalahDenganPembanding: number;
}

interface EmberPiutang {
  nama?: string;
  label?: string;
  nilai?: number | string;
  jumlah?: number;
}

interface Kpi {
  tanggal: string;
  evm: Evm;
  piutang: EmberPiutang[] | Record<string, unknown> | null;
  backlog: Backlog;
}

function rpRingkas(n: number | string | null) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000_000) return `Rp ${Math.round(v / 1_000_000)} jt`;
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)} rb`;
  return `Rp ${Math.round(v)}`;
}

/**
 * Indeks EVM → warna.
 *
 * Keadaannya datang dari SERVER (`statusIndeks`), tidak dihitung ulang di
 * sini. Ambang CPI/SPI adalah aturan domain — menuliskannya lagi di klien
 * berarti dua sumber yang bisa menyimpang, dan yang di layar belum tentu
 * yang dimaksud perhitungannya.
 */
function warnaKeadaan(k: StatusKpi['keadaan'], c: Palet): string {
  if (k === 'baik') return c.success;
  if (k === 'perhatian') return c.warning;
  if (k === 'buruk') return c.danger;
  return c.textSecondary;
}

function ikonKeadaan(
  k: StatusKpi['keadaan']
): React.ComponentProps<typeof Ionicons>['name'] {
  if (k === 'baik') return 'checkmark-circle-outline';
  if (k === 'perhatian') return 'alert-circle-outline';
  if (k === 'buruk') return 'close-circle-outline';
  return 'help-circle-outline';
}

/** Satu indeks EVM dengan artinya — bukan angka telanjang. */
function KartuIndeks({
  nama,
  metrik,
  nilai,
  status,
  terendah,
  s,
  c,
}: {
  nama: string;
  /**
   * Metrik yang diwakili kartu ini.
   *
   * Ditambahkan 2026-09-12 karena kartunya TIDAK tahu dirinya CPI atau
   * SPI, dan akibatnya baris "Terendah" mencetak KEDUANYA — lihat
   * catatan di tempat pemakaiannya.
   *
   * Dilewatkan eksplisit, bukan ditebak dari `nama`: `nama` adalah teks
   * yang ditampilkan ("CPI — efisiensi biaya") dan boleh berubah kapan
   * saja tanpa ada yang sadar ia dipakai sebagai penanda logika.
   */
  metrik: 'cpi' | 'spi';
  nilai: number | null;
  status: StatusKpi;
  terendah: ProyekTerendah | null;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const warna = warnaKeadaan(status.keadaan, c);
  return (
    <Card style={s.card}>
      <View style={s.indeksAtas}>
        <View style={s.indeksKiri}>
          <Text style={s.indeksNama}>{nama}</Text>
          {/*
            Angka indeks 2 desimal, `tabular-nums`.

            CPI 0,97 dan 1,03 berbeda arah meski selisihnya kecil —
            pembulatan ke satu desimal menyamarkan itu, dan digit yang
            tak sejajar membuat dua kartu sulit dibandingkan sekilas.
          */}
          <Text style={[s.indeksNilai, { color: warna }]}>
            {nilai == null ? '—' : nilai.toFixed(2)}
          </Text>
        </View>
        <Ionicons
          name={ikonKeadaan(status.keadaan)}
          size={22}
          color={warna}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      {/*
        ARTI dari server, bukan label satu kata.

        "CPI 0,94" tak berarti apa-apa bagi yang tak hafal rumusnya — dan
        yang membuka laporan di HP justru bukan orang yang menyusunnya.
        `statusIndeks` sudah memulangkan kalimat penjelasnya; menampilkan
        angka tanpa kalimat itu membuang bagian yang paling berguna.
      */}
      <Text style={s.indeksArti}>{status.arti}</Text>

      {/*
        Proyek TERENDAH — arah tindakan, bukan sekadar statistik.

        Rata-rata perusahaan yang sehat bisa menyembunyikan satu proyek
        yang sangat buruk. Menyebut namanya mengubah angka jadi sesuatu
        yang bisa ditindaklanjuti.
      */}
      {terendah?.name ? (
        <View style={s.terendahBaris}>
          <Ionicons
            name="arrow-down-circle-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {/*
            SATU angka — milik metrik kartu ini saja.

            ⚠ Ditemukan dari MEMOTRET 2026-09-12. Sebelumnya kedua baris
            dicetak tanpa syarat, jadi kartu CPI berbunyi:

                Terendah: Pembangunan Rumah Bu Sari (0.00) (0.00)

            Dua angka dalam kurung berurutan tanpa label: pembacanya tak
            bisa tahu mana CPI mana SPI, dan di kartu CPI angka SPI tak
            ada urusannya sama sekali. Lebih buruk lagi keduanya kebetulan
            sama (0.00), sehingga terbaca seperti salah cetak — bukan
            seperti dua metrik berbeda.

            `tsc` hijau: keduanya memang field yang sah. Yang salah bukan
            tipenya melainkan MAKNANYA di tempat ini.
          */}
          <Text style={s.terendahTeks} numberOfLines={2}>
            Terendah: {terendah.name}
            {(() => {
              const v = metrik === 'cpi' ? terendah.cpi : terendah.spi
              return v != null ? ` (${v.toFixed(2)})` : ''
            })()}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function LaporanScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data` DATAR — `reports.ts:1716` mengirim objeknya apa adanya. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/reports/kpi-perusahaan');
      setKpi(res.data ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'KPI perusahaan'));
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

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const evm = kpi?.evm;
  const bl = kpi?.backlog;

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar judul="Laporan" penjelas="Kinerja biaya, jadwal, dan tender" />

      <ScrollView
        contentContainerStyle={styles.isi}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
      >
        {galat ? <Galat judul="KPI tidak bisa dimuat" pesan={galat} /> : null}

        {!galat && !kpi ? (
          <Kosong
            ikon="stats-chart-outline"
            judul="Belum ada data KPI"
            petunjuk="Angka muncul setelah ada proyek dengan nilai kontrak dan biaya tercatat. Tarik ke bawah untuk memeriksa lagi."
          />
        ) : null}

        {evm ? (
          <>
            <View style={styles.bagian}>
              <Text style={styles.bagianJudul}>Kinerja proyek</Text>
              <Text style={styles.bagianJumlah}>
                {evm.proyekDihitung}/{evm.proyekTotal}
              </Text>
            </View>

            <KartuIndeks
              nama="CPI — efisiensi biaya"
              metrik="cpi"
              nilai={evm.cpi}
              status={evm.statusCpi}
              terendah={evm.cpiTerendah}
              s={styles}
              c={c}
            />
            <KartuIndeks
              nama="SPI — ketepatan jadwal"
              metrik="spi"
              nilai={evm.spi}
              status={evm.statusSpi}
              terendah={evm.spiTerendah}
              s={styles}
              c={c}
            />

            <Card style={styles.card}>
              <View style={styles.duaAngka}>
                <Angka label="Nilai kontrak (BAC)" nilai={rpRingkas(evm.totalBac)} s={styles} />
                <Angka label="Biaya aktual (AC)" nilai={rpRingkas(evm.totalAc)} s={styles} />
              </View>
              {/*
                DASAR perhitungan ditampilkan, tidak disembunyikan.

                Server sengaja mengirimnya ("Disebutkan supaya angka ini tak
                dikira identik dengan kurva-S", reports.ts:1722). Membuang
                keterangan itu di klien membatalkan maksudnya — dan angka
                EVM yang disangka kurva-S adalah kesalahan baca yang mahal.
              */}
              <Text style={styles.dasar}>
                BAC dari {evm.dasar_bac} · PV {evm.dasar_pv}
              </Text>
            </Card>
          </>
        ) : null}

        {bl ? (
          <>
            <View style={styles.bagian}>
              <Text style={styles.bagianJudul}>Tender</Text>
            </View>

            <Card style={styles.card}>
              <View style={styles.duaAngka}>
                <Angka
                  label={`Backlog · ${bl.backlogJumlah} menang`}
                  nilai={rpRingkas(bl.backlogNilai)}
                  s={styles}
                />
                <Angka
                  label={`Pipeline · ${bl.pipelineJumlah} diajukan`}
                  nilai={rpRingkas(bl.pipelineNilai)}
                  s={styles}
                />
              </View>

              {/*
                Win rate `null` DIBEDAKAN dari 0%.

                `null` berarti belum ada tender yang diputuskan; 0% berarti
                sudah ada dan semuanya kalah. Menampilkan keduanya sebagai
                "0%" menyamakan "belum tahu" dengan "buruk" — dan yang
                pertama tak menuntut tindakan apa pun.
              */}
              <View style={styles.pisah} />
              <View style={styles.duaAngka}>
                <Angka
                  label="Menang / kalah"
                  nilai={`${bl.menang} / ${bl.kalah}`}
                  s={styles}
                />
                <Angka
                  label="Win rate"
                  nilai={bl.winRatePct == null ? 'Belum ada' : `${bl.winRatePct}%`}
                  s={styles}
                />
              </View>

              {bl.selisihHargaRataPct != null ? (
                <Text style={styles.dasar}>
                  Rata-rata harga kita {bl.selisihHargaRataPct > 0 ? 'lebih tinggi' : 'lebih rendah'}{' '}
                  {Math.abs(bl.selisihHargaRataPct)}% dari pemenang · dari{' '}
                  {bl.kalahDenganPembanding} tender kalah yang ada pembandingnya
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Angka({
  label,
  nilai,
  s,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.angkaSel}>
      <Text style={s.angkaNilai}>{nilai}</Text>
      <Text style={s.angkaLabel} numberOfLines={2}>
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
    isi: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    card: { gap: 6 },

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

    indeksAtas: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    indeksKiri: { flex: 1, gap: 1 },
    indeksNama: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    /*
      Tingkat DISPLAY (kandidat C, 2026-09-12) — satu angka memimpin layar.

      Sebelumnya `xxl` (24px). Naik ke 38px + tracking rapat karena
      jangkauan skala kita 2,50x sementara Linear 6,00x dan Ramp 6,40x;
      pada 2,5x tak ada yang bisa memimpin, jadi hierarki jatuh ke warna
      dan kotak. Rinciannya di ARAH-VISUAL-2026 §12b.

      ⚠ SATU display per layar. Kalau angka kedua ikut memakainya, tak ada
      yang memimpin dan skalanya rata lagi — hanya dengan angka lebih besar.
    */
    indeksNilai: {
      fontSize: HURUF.display,
      fontFamily: FONT.judul,
      letterSpacing: RAPAT.display,
      lineHeight: 42,
      fontVariant: ['tabular-nums'],
      /*
        Tak boleh menyusut: ia berbagi baris `space-between` dengan teks
        arti. Teks yang boleh menyusut akan MEMBUNGKUS di tengah angka —
        cacat yang sudah terjadi di `kasbon/index.tsx` (JOURNAL 2026-09-12).
      */
      flexShrink: 0,
    },
    indeksArti: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isi,
      color: c.textPrimary,
      lineHeight: HURUF.sm * 1.4,
    },
    terendahBaris: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    terendahTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },

    duaAngka: { flexDirection: 'row' },
    angkaSel: { flex: 1, gap: 2 },
    angkaNilai: {
      fontSize: HURUF.lg,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    angkaLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    pisah: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: SPASI.sm,
    },
    dasar: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      lineHeight: HURUF.xs * 1.4,
      marginTop: 2,
    },
  });
}
