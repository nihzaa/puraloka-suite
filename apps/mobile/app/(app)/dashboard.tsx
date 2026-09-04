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
import { Card } from '@/components/ui/Card';
import { PenandaAntrean } from '@/components/PenandaAntrean';
import { Galat } from '@/components/ui/Galat';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';

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

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
      >
        <PenandaAntrean />
        {galat ? <Galat judul="Ringkasan tidak bisa dimuat" pesan={galat} /> : null}
        <View style={styles.topRow}>
          <View>
            {/*
              Emoji 👋 dibuang: rupanya berbeda di tiap HP, dan sebagian
              Android lama menggambar kotak kosong tepat di sebelah nama
              penggunanya. Sapaan tak butuh gambar untuk terbaca ramah.
            */}
            <Text style={styles.greeting}>Halo, {user?.name?.split(' ')[0]}</Text>
            <Text style={styles.role}>{user?.role?.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn} accessibilityRole="button">
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Ringkasan 30 Hari</Text>

        <View style={styles.kpiGrid}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Proyek Aktif</Text>
            <Text style={styles.kpiValue}>{data?.kpis?.active_projects ?? 0}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Kontrak</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.kpis?.total_contract_value ?? 0)}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Invoice Belum Lunas</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.kpis?.invoice_outstanding ?? 0)}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Kas Bersih</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.kpis?.net_cash_estimate ?? 0)}</Text>
          </Card>
        </View>

        {data?.projects_list && data.projects_list.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Proyek Aktif</Text>
            {data.projects_list.slice(0, 5).map((proj) => (
              <Card key={proj.id} style={styles.projCard}>
                <Text style={styles.projName}>{proj.name}</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${proj.progress_pct ?? 0}%` }]} />
                </View>
                <Text style={styles.progressLabel}>{proj.progress_pct ?? 0}%</Text>
              </Card>
            ))}
          </>
        )}
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
    container: {
      paddingHorizontal: SPASI.lg,
      paddingTop: SPASI.xxl,
      paddingBottom: SPASI.lg,
      gap: SPASI.md,
    },
    topRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: SPASI.sm,
    },
    greeting: { fontSize: HURUF.xl, fontFamily: FONT.judul, color: c.textPrimary },
    role: {
      fontSize: HURUF.xs, fontFamily: FONT.isiTebal,
      color: c.textSecondary, marginTop: 2, letterSpacing: 0.3,
    },
    logoutBtn: {
      paddingHorizontal: SPASI.md, paddingVertical: 6,
      borderRadius: RADIUS.sm, borderWidth: 1, borderColor: c.border,
    },
    logoutText: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },
    sectionTitle: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal,
      color: c.textPrimary, marginTop: SPASI.sm,
    },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCard: { width: '47%', padding: 14 },
    kpiLabel: {
      fontSize: HURUF.xs, fontFamily: FONT.isi,
      color: c.textSecondary, marginBottom: 6,
    },
    /*
      Angka KPI memakai `FONT.judul` — keluarga display, bukan font isi yang
      ditebalkan. Angka adalah yang dicari mata lebih dulu di layar ini, dan
      digit Bricolage Grotesque lebih tegas pada ukuran besar.
    */
    kpiValue: { fontSize: 28, fontFamily: FONT.judul, color: c.navy },
    kpiValueSm: { fontSize: HURUF.sm + 1, fontFamily: FONT.judul, color: c.navy },
    projCard: { gap: SPASI.sm },
    projName: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal, color: c.textPrimary,
    },
    progressBar: {
      height: 6, backgroundColor: c.surfaceHover,
      borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: c.navy, borderRadius: 3 },
    progressLabel: {
      fontSize: HURUF.xs, fontFamily: FONT.isi,
      color: c.textSecondary, textAlign: 'right',
    },
  });
}
