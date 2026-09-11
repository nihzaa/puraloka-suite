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
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/*
  KALENDER — agenda mendatang, NATIVE. Gelombang 2b.

  Menggantikan modul WebView `kalender`.

  ── TIDAK butuh rute baru, dan itu koreksi terhadap rencana

  `MOBILE-NATIVE-G2` menempatkan `kalender` di G2b ("butuh rute ikhtisar
  lebih dulu"). Diukur 2026-09-11: tak ada satu pun tabel bernama
  `kalender`/`calendar` di basis — halaman webnya menyusun peristiwa dari
  `/api/v1/projects` yang SUDAH mengirim `milestones` dan
  `termin_schedules` bersarang.

  Rencana yang salah bukan karena kurang teliti melainkan karena disusun
  dari nama modul, bukan dari sumber datanya.

  ── AGENDA, bukan grid bulanan

  Halaman web menggambar kalender bulanan 7×5. Di layar 360dp satu sel
  jadi ~45px — cukup untuk satu titik warna, tak cukup untuk teks. Dan
  yang dicari orang di HP bukan "apa saja bulan ini" melainkan
  **"apa berikutnya"**.

  Jadi bentuknya daftar agenda urut waktu, dikelompokkan per hari, dengan
  yang TERLAMBAT di paling atas. Itu keputusan sadar untuk menyimpang
  dari web — layar kecil menuntut bentuk lain, bukan versi mengecil.

  ── Peristiwa dibangun di KLIEN, dan batasnya

  Tiga jenis (mulai proyek, selesai proyek, milestone, termin) dirakit
  dari satu balasan. Kalau kelak jenis keempat ditambahkan di web, layar
  ini TIDAK ikut berubah sendiri — dan tak ada yang memberi tahu.

  Ditulis di sini supaya terlihat: yang benar kelak adalah rute agenda
  tersendiri, dan itu pekerjaan sisi server.
*/

interface Milestone {
  id: string;
  title: string;
  target_date: string | null;
  status: string | null;
}

interface Termin {
  id: string;
  termin_number: number | null;
  label: string | null;
  amount: number | string | null;
  target_date: string | null;
  status: string | null;
}

interface Proyek {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  milestones?: Milestone[] | null;
  termin_schedules?: Termin[] | null;
}

type JenisPeristiwa = 'mulai' | 'selesai' | 'milestone' | 'termin';

interface Peristiwa {
  id: string;
  tanggal: string;
  /** Baris pertama — yang paling membedakan baris ini dari tetangganya. */
  judul: string;
  proyekId: string;
  /*
    Baris kedua: KONTEKS, bukan selalu nama proyek.

    Untuk milestone/termin ia nama proyeknya; untuk peristiwa proyek
    (mulai/selesai) justru sebaliknya — judulnya nama proyek, dan yang
    di sini jenis peristiwanya. Karena itu namanya `subjudul`, bukan
    `proyekNama`: medan yang isinya berubah peran wajib bernama sesuai
    PERANNYA, bukan sesuai isi yang paling sering.
  */
  subjudul: string;
  jenis: JenisPeristiwa;
  nominal?: number | null;
  selesai: boolean;
}

type Item =
  | { tipe: 'hari'; kunci: string; label: string; lewat: boolean; n: number }
  | { tipe: 'peristiwa'; data: Peristiwa };

const ambilKunci = (i: Item) =>
  i.tipe === 'hari' ? `hari:${i.kunci}` : `ev:${i.data.id}`;

const IKON: Record<JenisPeristiwa, React.ComponentProps<typeof Ionicons>['name']> = {
  mulai: 'play-circle-outline',
  selesai: 'checkmark-circle-outline',
  milestone: 'flag-outline',
  termin: 'cash-outline',
};

const LABEL_JENIS: Record<JenisPeristiwa, string> = {
  mulai: 'Mulai proyek',
  selesai: 'Selesai proyek',
  milestone: 'Milestone',
  termin: 'Termin',
};

/** `YYYY-MM-DD` lokal — pembanding yang stabil, bukan objek Date. */
function kunciTanggal(s: string | null): string | null {
  if (!s) return null;
  const t = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function labelHari(kunci: string): string {
  const d = new Date(`${kunci}T00:00:00`);
  const hariIni = new Date().toISOString().slice(0, 10);
  if (kunci === hariIni) return 'Hari ini';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function rpRingkas(n: number | string | null) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000_000) return `Rp ${Math.round(v / 1_000_000)} jt`;
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
}

const BarisPeristiwa = React.memo(function BarisPeristiwa({
  p,
  s,
  c,
  onBuka,
}: {
  p: Peristiwa;
  s: ReturnType<typeof gaya>;
  c: Palet;
  onBuka: (id: string) => void;
}) {
  return (
    <Tekan
      onPress={() => onBuka(p.proyekId)}
      accessibilityRole="button"
      accessibilityLabel={`${LABEL_JENIS[p.jenis]}: ${p.judul} — ${p.subjudul}. Buka detail proyek.`}
    >
      <Card style={s.card}>
        <View style={s.evBaris}>
          {/*
            Ikon jenis, BUKAN titik warna.

            Warna saja tak bisa membedakan empat jenis bagi yang buta
            warna — dan dua di antaranya (milestone & termin) sama-sama
            bermakna "tenggat". Ikon menyampaikan jenisnya tanpa
            bergantung warna (ui-ux-pro-max: jangan pakai warna sebagai
            satu-satunya pembawa makna).
          */}
          <View style={[s.ikonKotak, p.selesai && s.ikonSelesai]}>
            <Ionicons
              name={IKON[p.jenis]}
              size={16}
              color={p.selesai ? c.success : c.navy}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>

          <View style={s.evIsi}>
            <Text style={[s.evJudul, p.selesai && s.evSelesai]} numberOfLines={2}>
              {p.judul}
            </Text>
            <Text style={s.evProyek} numberOfLines={1}>
              {p.subjudul}
            </Text>
          </View>

          {p.nominal != null && Number(p.nominal) > 0 ? (
            <Text style={s.evNominal}>{rpRingkas(p.nominal)}</Text>
          ) : null}
        </View>
      </Card>
    </Tekan>
  );
});

export default function KalenderScreen() {
  const router = useRouter();
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data?.projects` — `projects.ts:48` mengirim `{ total, projects }`. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/projects');
      setProyek(res.data?.projects ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'agenda proyek'));
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

  const buka = useCallback((id: string) => router.push(`/(app)/proyek/${id}`), [router]);

  const items = useMemo<Item[]>(() => {
    const hariIni = new Date().toISOString().slice(0, 10);
    const ev: Peristiwa[] = [];

    for (const p of proyek) {
      const mulai = kunciTanggal(p.start_date);
      const selesai = kunciTanggal(p.end_date);

      /*
        ── JUDUL peristiwa proyek adalah NAMA PROYEKNYA ──────────────────

        Versi pertama memakai 'Mulai proyek' / 'Target selesai' sebagai
        judul, dengan nama proyek di baris kedua. Terlihat dari potret:
        sembilan baris "Terlambat" SEMUANYA berjudul "Target selesai",
        dan yang membedakannya justru baris kedua yang lebih redup.

        Judul yang identik di sembilan baris berturut-turut tak
        membedakan apa pun — mata melewatinya, dan pembacanya harus
        turun ke baris kedua tiap kali. Untuk peristiwa proyek, nama
        proyeknya YANG dicari; jenisnya sudah disampaikan ikon.

        Milestone dan termin tetap memakai judulnya sendiri: di sana
        judulnya memang berbeda-beda ("Struktur lantai 1 selesai"), dan
        nama proyek yang jadi konteks.
      */
      if (mulai) {
        ev.push({
          id: `ps-${p.id}`, tanggal: mulai, judul: p.name,
          proyekId: p.id, subjudul: 'Mulai proyek', jenis: 'mulai',
          selesai: mulai < hariIni,
        });
      }
      if (selesai) {
        ev.push({
          id: `pe-${p.id}`, tanggal: selesai, judul: p.name,
          proyekId: p.id, subjudul: 'Target selesai', jenis: 'selesai',
          selesai: p.status === 'completed',
        });
      }
      for (const m of p.milestones ?? []) {
        const t = kunciTanggal(m.target_date);
        if (!t) continue;
        ev.push({
          id: `ms-${m.id}`, tanggal: t, judul: m.title,
          proyekId: p.id, subjudul: p.name, jenis: 'milestone',
          selesai: m.status === 'completed',
        });
      }
      for (const t of p.termin_schedules ?? []) {
        const tg = kunciTanggal(t.target_date);
        if (!tg) continue;
        ev.push({
          id: `tm-${t.id}`,
          tanggal: tg,
          judul: t.label ?? `Termin ${t.termin_number ?? ''}`.trim(),
          proyekId: p.id, subjudul: p.name, jenis: 'termin',
          nominal: Number(t.amount) || null,
          selesai: t.status === 'paid' || t.status === 'lunas',
        });
      }
    }

    /*
      ── Urutan: TERLAMBAT dulu, lalu mendatang ──────────────────────────

      Bukan urutan kronologis murni. Peristiwa yang sudah lewat DAN belum
      selesai adalah yang menuntut tindakan hari ini; menaruhnya di bawah
      (karena tanggalnya lebih tua) berarti mengubur justru yang mendesak.

      Yang sudah lewat dan SUDAH selesai dibuang sama sekali — ia riwayat,
      dan riwayat bukan agenda.
    */
    const terlambat = ev
      .filter((e) => e.tanggal < hariIni && !e.selesai)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const mendatang = ev
      .filter((e) => e.tanggal >= hariIni)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    const out: Item[] = [];

    if (terlambat.length) {
      out.push({
        tipe: 'hari', kunci: 'terlambat', label: 'Terlambat', lewat: true,
        n: terlambat.length,
      });
      for (const e of terlambat) out.push({ tipe: 'peristiwa', data: e });
    }

    /* Mendatang dikelompokkan per HARI — sekali tulis per tanggal. */
    let hariTerakhir = '';
    const perHari = new Map<string, number>();
    for (const e of mendatang) perHari.set(e.tanggal, (perHari.get(e.tanggal) ?? 0) + 1);

    for (const e of mendatang) {
      if (e.tanggal !== hariTerakhir) {
        hariTerakhir = e.tanggal;
        out.push({
          tipe: 'hari', kunci: e.tanggal, label: labelHari(e.tanggal), lewat: false,
          n: perHari.get(e.tanggal) ?? 1,
        });
      }
      out.push({ tipe: 'peristiwa', data: e });
    }

    return out;
  }, [proyek]);

  const render = useCallback(
    ({ item }: { item: Item }) => {
      if (item.tipe === 'hari') {
        return (
          <View style={styles.hariBaris}>
            <Text style={[styles.hariLabel, item.lewat && styles.hariLewat]}>
              {item.label}
            </Text>
            <Text style={styles.hariJumlah}>{item.n}</Text>
          </View>
        );
      }
      return <BarisPeristiwa p={item.data} s={styles} c={c} onBuka={buka} />;
    },
    [styles, c, buka]
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
      <KepalaLayar judul="Kalender" penjelas="Milestone, termin, dan tenggat proyek" />

      <FlatList
        data={items}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          galat ? <Galat judul="Agenda tidak bisa dimuat" pesan={galat} /> : null
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="calendar-outline"
              judul="Tidak ada agenda mendatang"
              petunjuk="Milestone dan termin yang dijadwalkan akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={12}
        windowSize={7}
      />
    </SafeAreaView>
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
    list: { padding: SPASI.lg, gap: SPASI.sm, paddingBottom: 40 },
    card: { paddingVertical: 10 },

    hariBaris: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: SPASI.md,
      marginBottom: 2,
    },
    hariLabel: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.textPrimary },
    hariLewat: { color: c.danger },
    hariJumlah: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    evBaris: { flexDirection: 'row', alignItems: 'center', gap: SPASI.sm },
    /*
      Kotak ikon 32px: cukup besar untuk terbaca, cukup kecil agar teks
      tetap dapat lebar penuh di layar 360dp. Ia dekoratif — sasaran
      sentuhnya seluruh kartu, bukan kotak ini.
    */
    ikonKotak: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.navyLight,
    },
    ikonSelesai: { backgroundColor: c.successBg },

    evIsi: { flex: 1, gap: 1 },
    evJudul: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      lineHeight: HURUF.sm * 1.35,
    },
    /*
      Yang SUDAH selesai diredupkan, bukan dicoret.

      Coretan di layar kecil mengurangi keterbacaan teks yang sudah 13px,
      dan peristiwa selesai masih perlu terbaca — orang memeriksanya untuk
      memastikan, bukan untuk mengabaikannya.
    */
    evSelesai: { color: c.textSecondary },
    evProyek: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    evNominal: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
  });
}
