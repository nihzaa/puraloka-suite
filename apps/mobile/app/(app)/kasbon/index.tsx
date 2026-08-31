import { useRouter } from 'expo-router';
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
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PenandaAntrean } from '@/components/PenandaAntrean';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';

interface Kasbon {
  id: string;
  amount: number;
  purpose: string;
  status: string;
  created_at: string;
  kasbon_date?: string;
  notes?: string;
  /*
    `project`, BUKAN `projects`.

    API meng-alias-kan relasinya: `project:projects!kasbons_project_id_fkey`
    (kasbons.ts:27). Versi sebelumnya berkas ini membaca `k.projects` —
    selalu undefined, jadi nama proyek TAK PERNAH tampil di kartu kasbon.
    Tak ada galat: `?.` menelannya, dan barisnya sekadar tak dirender.
  */
  project?: { id?: string; name?: string };
}

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: 'Gaji Tukang',
  uang_makan: 'Uang Makan',
  pembelian_alat: 'Pembelian Alat',
  operasional: 'Operasional',
  lain_lain: 'Lain-lain',
};

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function KasbonListScreen() {
  const router = useRouter();
  const [kasbons, setKasbons] = useState<Kasbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [galat, setGalat] = useState('');

  /*
    ══════════════════════════════════════════════════════════════════════
    TIGA CACAT SEKALIGUS DI PEMANGGILAN INI — semuanya gagal TANPA SUARA
    ══════════════════════════════════════════════════════════════════════

    1. RUTENYA TAK ADA. Sebelumnya `/api/v1/mandor/kasbons`. Disisir seluruh
       apps/api/src/routes/v1: yang ada hanya `/api/v1/kasbons` dan
       `/api/v1/mandor/worker-kasbons` (kasbon TUKANG milik mandor — entitas
       lain sama sekali). Jadi tiap muat dibalas 404.

    2. BENTUK BALASANNYA SALAH. API memulangkan `{ kasbons: [...] }`
       (kasbons.ts:59), bukan array telanjang. `res.data ?? []` menyimpan
       OBJEK ke dalam state bertipe array — `.map()` di bawah lalu meledak
       atau merender kosong.

    3. GALATNYA DITELAN. `catch {}` kosong membuat 404 tampil sebagai
       "Belum ada kasbon" — layar yang meyakinkan mandor bahwa pengajuannya
       HILANG. Untuk layar uang, itu lebih buruk daripada pesan galat.

    Ketiganya saling menutupi: (1) memastikan tak ada data, (3) memastikan
    tak ada yang bertanya kenapa. Cacat kelas inilah yang dijaga
    `audit-catch-senyap.mjs` di sisi API — apps/mobile tak pernah tercakup.

    Penyaringan "hanya milik mandor ini" TIDAK perlu dikirim dari sini:
    kasbons.ts:44-56 sudah membatasi ke proyek tempat mandor ber-assignment
    DAN `requested_by = user.id`. Menyaring ulang di klien hanya akan
    menduplikasi aturan yang bisa menyimpang diam-diam.
  */
  const fetchKasbons = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/kasbons');
      setKasbons(res.data?.kasbons ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'kasbon'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchKasbons(); }, [fetchKasbons]);

  const onRefresh = () => { setRefreshing(true); fetchKasbons(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#003366" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Kasbon</Text>
        <Button
          title="+ Ajukan"
          onPress={() => router.push('/(app)/kasbon/ajukan')}
          style={styles.ajukanBtn}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        <PenandaAntrean />
        {/*
          Galat MUAT dan keadaan KOSONG dipisah — persis disiplin yang
          ditegakkan `uji-galat-muat-terpisah.mjs` di apps/web. "Belum ada
          kasbon" pada layar yang sebenarnya GAGAL MEMUAT adalah kebohongan
          yang tenang: mandor menyimpulkan pengajuannya lenyap, lalu
          mengajukan ulang.
        */}
        {galat ? (
          <Galat judul="Kasbon tidak bisa dimuat" pesan={galat} />
        ) : kasbons.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Belum ada kasbon</Text>
            <Text style={styles.emptyPetunjuk}>
              Pengajuan yang Anda buat akan muncul di sini.
            </Text>
          </View>
        ) : null}
        {kasbons.map((k) => (
          <Card key={k.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.amount}>{fmt(k.amount)}</Text>
                <Text style={styles.purpose}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</Text>
              </View>
              <Badge label={statusLabel(k.status)} variant={statusVariant(k.status)} />
            </View>
            {k.project?.name
              ? <Text style={styles.meta}>🏗️ {k.project.name}</Text>
              : null}
            {/*
              `kasbon_date` = tanggal kasbonnya, `created_at` = kapan barisnya
              dibuat. Keduanya bisa berbeda (pengajuan mundur), dan yang
              relevan bagi mandor adalah tanggal kasbon. API mengurutkan
              dengan kolom itu juga, jadi memakai created_at membuat tanggal
              yang tampil tak sejalan dengan urutan daftarnya.
            */}
            <Text style={styles.meta}>📅 {fmtDate(k.kasbon_date ?? k.created_at)}</Text>
            {k.notes ? <Text style={styles.notes}>{k.notes}</Text> : null}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  ajukanBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  list: { padding: 16, gap: 12 },
  card: { gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  amount: { fontSize: 17, fontWeight: '700', color: '#003366' },
  purpose: { fontSize: 13, color: '#374151', marginTop: 2 },
  meta: { fontSize: 12, color: '#6B7280' },
  notes: { fontSize: 13, color: '#374151', fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  emptyPetunjuk: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
