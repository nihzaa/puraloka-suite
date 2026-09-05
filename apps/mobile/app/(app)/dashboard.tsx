import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PenandaAntrean } from '@/components/PenandaAntrean';
import { Galat } from '@/components/ui/Galat';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { ELEVASI, FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';
import { LambangPuraloka } from '@/components/SplashMerek';

/**
 * Bentuk balasan `/api/v1/dashboard`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DIPERBAIKI 2026-09-04 — layar ini menampilkan NOL untuk SEMUA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur langsung ke API produksi:
 *
 *     API mengirim  { kpis: { active_projects: 15, … } }   ← BERSARANG
 *     layar membaca   data?.active_projects                 ← DATAR
 *
 * Tiga nama juga tak pernah cocok:
 *
 *     net_cash          → sebenarnya `kpis.net_cash_estimate`
 *     recent_projects   → sebenarnya `projects_list` (19 proyek)
 *     (KPI lain)        → semuanya di bawah `kpis`
 *
 * Yang membuatnya bertahan tanpa gejala: `?? 0` di tiap pembacaan. Nilai
 * `undefined` jadi 0, dan **nol yang salah tak bisa dibedakan dari nol yang
 * benar**. Layar terlihat sehat, memuat cepat, tanpa satu pun galat — dan
 * memberitahu pemiliknya bahwa perusahaannya punya nol proyek aktif dan
 * nol nilai kontrak. Yang sesungguhnya: 15 proyek, Rp 7,14 miliar.
 *
 * `tsc` hijau selama itu karena `res.data` bertipe `any` dari axios: TypeScript
 * dengan senang hati mencocokkan apa pun ke `DashboardData`.
 *
 * Ini KELAS cacat, bukan satu kesalahan ketik: tiap layar mobile menebak
 * bentuk balasan dari ingatan, dan tak ada satu pun tempat yang membandingkan
 * tebakan itu dengan kenyataan. Dijaga `audit-bentuk-balasan-mobile.mjs`.
 */
interface DashboardData {
  kpis?: {
    active_projects?: number;
    total_contract_value?: number;
    invoice_outstanding?: number;
    income_this_month?: number;
    net_cash_estimate?: number;
    kasbon_active_total?: number;
  };
  alerts?: {
    kasbon_pending?: number;
    invoice_overdue?: number;
    milestone_late?: number;
  };
  projects_list?: Array<{
    id: string;
    name: string;
    status: string;
    progress_pct: number;
    location?: string | null;
    contract_value?: number;
  }>;
}

/**
 * Rupiah RINGKAS — "Rp 7,14 M", bukan "Rp 7.135.525.000".
 *
 * ── Kenapa dipendekkan, dan apa yang hilang
 *
 * Bentuk penuh nilai kontrak di sini 18 huruf. Di kartu selebar ~165px ia
 * mengecil sampai tak terbaca sambil berdiri, atau terpotong di tengah
 * angka — dan angka yang terpotong lebih buruk daripada angka yang
 * dibulatkan, sebab pembacanya tak tahu ada yang hilang.
 *
 * Yang HILANG: ketepatan rupiah. Itu sengaja — dashboard dibaca sekilas
 * untuk tahu SKALA dan ARAH, bukan untuk rekonsiliasi. Angka penuh tetap
 * ada di layar detail masing-masing.
 *
 * ⚠ Tanda minusnya `−` (U+2212), bukan hyphen `-`. Pada angka besar hyphen
 * mudah terbaca sebagai tanda hubung atau debu di layar; minus matematis
 * setinggi palang angka dan tak bisa salah baca. Ini penting justru karena
 * satu-satunya angka negatif di layar ini adalah KAS.
 */
function ringkasRp(n: number): string {
  const abs = Math.abs(n);
  const tanda = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${tanda}Rp ${(abs / 1e9).toFixed(2).replace('.', ',')} M`;
  if (abs >= 1e6) return `${tanda}Rp ${(abs / 1e6).toFixed(1).replace('.', ',')} jt`;
  if (abs >= 1e3) return `${tanda}Rp ${Math.round(abs / 1e3)} rb`;
  return `${tanda}Rp ${abs}`;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const { c } = useTema();
  const styles = gaya(c);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/dashboard?period=last_30_days');
      setData(res.data);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'ringkasan dashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const kpi = data?.kpis;
  const peringatan = data?.alerts;
  const kasBersih = kpi?.net_cash_estimate ?? 0;

  /*
    Peringatan hanya ditampilkan kalau ADA yang perlu ditindak. Kartu
    "0 tenggat lewat" tiap hari mengajari orang melewatinya — lalu yang
    ke-13 ikut terlewat.
  */
  const perluTindak = [
    { n: peringatan?.milestone_late ?? 0, teks: 'tenggat milestone sudah lewat' },
    { n: peringatan?.kasbon_pending ?? 0, teks: 'kasbon menunggu persetujuan' },
    { n: peringatan?.invoice_overdue ?? 0, teks: 'invoice lewat jatuh tempo' },
  ].filter((x) => x.n > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
      >
        {/*
          ── Panel merek ─────────────────────────────────────────────────

          Meneruskan panel navy layar login, supaya masuk aplikasi tak
          terasa seperti pindah produk. Angka terpenting — nilai kontrak —
          duduk DI DALAM bidang merek, bukan di kartu setara dengan yang
          lain.

          `edges` SafeAreaView sengaja tanpa 'top': panel harus menyentuh
          tepi atas layar. Inset notch dibayar `paddingTop` panel sendiri.
        */}
        <View style={styles.panel}>
          <View style={styles.panelTeksturKotak} pointerEvents="none">
            <View style={styles.panelTekstur}>
              <LambangPuraloka ukuran={150} warna={c.onMerek} />
            </View>
          </View>

          <View style={styles.panelAtas}>
            <View style={styles.panelSapa}>
              {/*
                Emoji 👋 dibuang: rupanya berbeda di tiap HP, dan sebagian
                Android lama menggambar kotak kosong tepat di sebelah nama
                penggunanya. Sapaan tak butuh gambar untuk terbaca ramah.
              */}
              <Text style={styles.halo}>Halo, {user?.name?.split(' ')[0]}</Text>
              <Text style={styles.peran}>
                {user?.role?.toUpperCase()} · 30 HARI TERAKHIR
              </Text>
            </View>
            <TouchableOpacity
              onPress={logout}
              style={styles.keluarBtn}
              accessibilityRole="button"
              accessibilityLabel="Keluar dari akun"
            >
              <Text style={styles.keluarTeks}>Keluar</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.angkaBesar} numberOfLines={1} adjustsFontSizeToFit>
            {ringkasRp(kpi?.total_contract_value ?? 0)}
          </Text>
          <Text style={styles.angkaLabel}>
            Total nilai kontrak · {kpi?.active_projects ?? 0} proyek berjalan
          </Text>
        </View>

        <View style={styles.isi}>
          <PenandaAntrean />
          {galat ? <Galat judul="Ringkasan tidak bisa dimuat" pesan={galat} /> : null}

          {/*
            Kartu MENUMPANG tepi panel lewat margin negatif.

            ⚠ Di RN, anak dengan margin negatif digambar di bawah saudaranya
            kecuali diberi `zIndex` — dan tanpa itu separuh kartu tertutup
            panel. Terlihat di render banding pertama: "−Rp 35,6 jt" terpotong
            setengah huruf.
          */}
          <View style={styles.tumpang}>
            <View style={styles.selKecil}>
              <Text style={styles.selLabel}>Kas Bersih</Text>
              <Text
                style={[styles.selNilai, kasBersih < 0 && styles.selNilaiNegatif]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {ringkasRp(kasBersih)}
              </Text>
            </View>
            <View style={styles.selKecil}>
              <Text style={styles.selLabel}>Kasbon Aktif</Text>
              <Text style={styles.selNilai} numberOfLines={1} adjustsFontSizeToFit>
                {ringkasRp(kpi?.kasbon_active_total ?? 0)}
              </Text>
            </View>
            <View style={styles.selKecil}>
              <Text style={styles.selLabel}>Masuk Bulan Ini</Text>
              <Text style={styles.selNilai} numberOfLines={1} adjustsFontSizeToFit>
                {ringkasRp(kpi?.income_this_month ?? 0)}
              </Text>
            </View>
            <View style={styles.selKecil}>
              <Text style={styles.selLabel}>Invoice Belum Lunas</Text>
              <Text style={styles.selNilai} numberOfLines={1} adjustsFontSizeToFit>
                {ringkasRp(kpi?.invoice_outstanding ?? 0)}
              </Text>
            </View>
          </View>

          {/*
            ── Yang harus dikerjakan ─────────────────────────────────────

            `alerts` SUDAH dikirim API sejak lama dan TAK PERNAH dirender.
            Diukur 2026-09-05 di produksi: 13 tenggat milestone lewat dan
            9 kasbon menunggu persetujuan — nol keduanya terlihat dari HP.

            Dashboard yang menyembunyikan tenggat yang lewat lebih buruk
            daripada dashboard yang jelek: ia membuat pemiliknya percaya
            tak ada yang perlu dikerjakan.
          */}
          {perluTindak.length > 0 && (
            <View style={styles.perhatian}>
              <Text style={styles.perhatianJudul}>PERLU PERHATIAN</Text>
              {perluTindak.map((x) => (
                <View key={x.teks} style={styles.perhatianBaris}>
                  <Text style={styles.perhatianAngka}>{x.n}</Text>
                  <Text style={styles.perhatianTeks}>{x.teks}</Text>
                </View>
              ))}
            </View>
          )}

          {data?.projects_list && data.projects_list.length > 0 && (
            <>
              <Text style={styles.bagian}>PROYEK BERJALAN</Text>
              {data.projects_list.slice(0, 5).map((proj) => (
                <View key={proj.id} style={styles.baris}>
                  <View style={styles.barisAtas}>
                    <Text style={styles.namaProyek} numberOfLines={2}>
                      {proj.name}
                    </Text>
                    <Text style={styles.persen}>{proj.progress_pct ?? 0}%</Text>
                  </View>
                  {/*
                    PANJANG sebagai encoding kuantitas — paling akurat
                    menurut NN/g, jauh di atas sudut (donut, radial gauge).
                    Nol dirender NOL: sliver 1-2px terbaca seperti cacat
                    render, bukan seperti belum mulai.
                  */}
                  <View style={styles.rel}>
                    <View style={[styles.isiRel, { width: `${proj.progress_pct ?? 0}%` }]} />
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Gaya dashboard.
 *
 * ── Ruang atas: 16 → 24
 *
 * `SafeAreaView` menyediakan inset notch di perangkat sungguhan, tetapi 16px
 * di ATAS inset itu membuat sapaan menempel ke tepi — dan pada HP berpunch-
 * hole tengah (mayoritas Android kelas menengah), teks 20px di posisi itu
 * berdesakan dengan kameranya.
 */
function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSubtle,
    },
    container: { paddingBottom: SPASI.xxl },

    /* ── Panel merek ──────────────────────────────────────────────────── */
    /*
      `paddingTop` 56 membayar inset notch sendiri, sebab SafeAreaView di
      layar ini sengaja tanpa edge 'top' — panel harus menyentuh tepi atas.
      Angka yang sama dipakai panel login, supaya keduanya sejajar saat
      berpindah dari satu ke yang lain.
    `paddingBottom` 52 menyediakan ruang untuk kartu yang menumpang.
    */
    panel: {
      backgroundColor: c.merekBidang,
      paddingTop: 56,
      paddingBottom: 52,
      paddingHorizontal: SPASI.lg,
      borderBottomLeftRadius: RADIUS.xl,
      borderBottomRightRadius: RADIUS.xl,
    },
    /*
      Kliping dipasang pada PEMBUNGKUS TEKSTUR, bukan pada panel.

      Di panel, `overflow:'hidden'` ikut memotong kartu yang sengaja
      menumpang tepinya — terlihat di render banding pertama, "−Rp 35,6 jt"
      terpotong separuh huruf. Yang benar-benar perlu dikliping cuma lambang
      pilar yang menjorok keluar.
    */
    /*
      ⚠ Versi pertama memakai `StyleSheet.absoluteFillObject` SAJA, tanpa
      posisi dan tanpa opacity — dan lambangnya terender sebagai balok
      putih PEKAT menutupi "Halo, Nizar" dan angka kontraknya. Terlihat di
      potret pertama; tak satu pun galat, tsc hijau.

      Nilai posisi & opacity disamakan dengan `panelTekstur` di layar login
      (right/bottom negatif, opacity 0.07) supaya kedua panel merek benar-
      benar terlihat satu keluarga — bukan dua tafsir yang berdekatan.
    */
    panelTeksturKotak: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
      borderBottomLeftRadius: RADIUS.xl,
      borderBottomRightRadius: RADIUS.xl,
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    panelTekstur: {
      position: 'absolute',
      right: -44,
      bottom: -30,
      opacity: 0.07,
    },
    panelAtas: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    panelSapa: { flex: 1 },
    halo: {
      fontSize: HURUF.xl, fontFamily: FONT.judul,
      color: c.onMerek, letterSpacing: -0.3,
    },
    peran: {
      fontSize: HURUF.xs, fontFamily: FONT.isi,
      color: c.onMerek, opacity: 0.72, marginTop: 3, letterSpacing: 0.6,
    },
    keluarBtn: {
      paddingHorizontal: SPASI.md, paddingVertical: 7,
      borderRadius: RADIUS.sm,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
      minHeight: 34,
    },
    keluarTeks: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.onMerek },
    /*
      Angka utama memakai `FONT.judul` — keluarga display, bukan font isi
      yang ditebalkan. Ini angka yang dicari mata lebih dulu, dan digit
      Bricolage Grotesque lebih tegas pada ukuran besar.

      `adjustsFontSizeToFit` menahan nama panjang/nilai besar dari
      terpotong; tanpa itu "Rp 999,99 M" bisa melewati tepi di HP 360px.
    */
    angkaBesar: {
      fontSize: 36, fontFamily: FONT.judul, color: c.onMerek,
      letterSpacing: -1, marginTop: SPASI.xl,
      fontVariant: ['tabular-nums'],
    },
    angkaLabel: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c.onMerek, opacity: 0.8, marginTop: 5,
    },

    /* ── Isi di bawah panel ───────────────────────────────────────────── */
    isi: { paddingHorizontal: SPASI.lg, gap: SPASI.md },

    /*
      `marginTop` negatif membuat kartu menumpang tepi panel; `zIndex`
      WAJIB menyertainya. Tanpa itu RN menggambar anak bermargin-negatif DI
      BAWAH saudaranya, dan separuh kartu tertutup panel.
    */
    tumpang: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 10,
      marginTop: -38, zIndex: 1,
    },
    selKecil: {
      width: '47.6%',
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.lg,
      paddingVertical: 13, paddingHorizontal: 14,
      ...ELEVASI.ambang,
    },
    selLabel: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.textSecondary },
    selNilai: {
      fontSize: HURUF.lg + 2, fontFamily: FONT.judul, color: c.textPrimary,
      marginTop: 5, letterSpacing: -0.3, fontVariant: ['tabular-nums'],
    },
    /*
      Kas NEGATIF diberi warna bahaya. Sebelumnya ia dirender abu-abu sama
      seperti angka positif — satu-satunya isyarat cuma tanda minus setinggi
      2px, yang hilang begitu layar dilihat sekilas.

      Warna DIPERKUAT tanda minus, tak berdiri sendiri: sampai 4,5% populasi
      buta warna, dan warna saja tak boleh jadi satu-satunya pembawa makna.
    */
    selNilaiNegatif: { color: c.danger },

    /* ── Perlu perhatian ──────────────────────────────────────────────── */
    perhatian: {
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.lg,
      borderWidth: 1, borderColor: c.border,
      borderLeftWidth: 3, borderLeftColor: c.danger,
      paddingVertical: 14, paddingHorizontal: 15,
      gap: SPASI.sm,
    },
    perhatianJudul: {
      fontSize: HURUF.xs, fontFamily: FONT.judul,
      color: c.danger, letterSpacing: 0.8,
    },
    perhatianBaris: { flexDirection: 'row', alignItems: 'center', gap: SPASI.md },
    perhatianAngka: {
      fontSize: 26, fontFamily: FONT.judul, color: c.textPrimary,
      minWidth: 34, letterSpacing: -0.5, fontVariant: ['tabular-nums'],
    },
    perhatianTeks: {
      flex: 1, fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c.textPrimary, lineHeight: 18,
    },

    /* ── Daftar proyek ────────────────────────────────────────────────── */
    bagian: {
      fontSize: HURUF.xs + 1, fontFamily: FONT.judul,
      color: c.textSecondary, letterSpacing: 0.8, marginTop: SPASI.sm,
    },
    /*
      Kartu daftar TANPA bayangan — kedalaman dari border + permukaan
      (tonal elevation). Tiap lapis bayangan satu alpha blending, dan
      Android menggambar bagian tertutupnya juga; di daftar panjang itu
      terbayar tiap baris, tiap frame.
    */
    baris: {
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.lg,
      borderWidth: 1, borderColor: c.border,
      paddingVertical: 13, paddingHorizontal: 14,
      gap: 9,
    },
    barisAtas: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: SPASI.md,
    },
    namaProyek: {
      flex: 1, fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal,
      color: c.textPrimary, lineHeight: 18,
    },
    persen: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.judul,
      color: c.textPrimary, fontVariant: ['tabular-nums'],
    },
    rel: {
      height: 5, backgroundColor: c.surfaceHover,
      borderRadius: 3, overflow: 'hidden',
    },
    isiRel: { height: '100%', backgroundColor: c.navy, borderRadius: 3 },
  });
}
