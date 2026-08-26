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

interface DashboardData {
  active_projects: number;
  total_contract_value: number;
  invoice_outstanding: number;
  net_cash: number;
  recent_projects?: Array<{ id: string; name: string; status: string; progress_pct: number }>;
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
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
        <ActivityIndicator size="large" color="#003366" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        <PenandaAntrean />
        {galat ? <Galat judul="Ringkasan tidak bisa dimuat" pesan={galat} /> : null}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>Halo, {user?.name?.split(' ')[0]} 👋</Text>
            <Text style={styles.role}>{user?.role?.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Ringkasan 30 Hari</Text>

        <View style={styles.kpiGrid}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Proyek Aktif</Text>
            <Text style={styles.kpiValue}>{data?.active_projects ?? 0}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Kontrak</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.total_contract_value ?? 0)}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Invoice Belum Lunas</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.invoice_outstanding ?? 0)}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Kas Bersih</Text>
            <Text style={styles.kpiValueSm}>{fmt(data?.net_cash ?? 0)}</Text>
          </Card>
        </View>

        {data?.recent_projects && data.recent_projects.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Proyek Aktif</Text>
            {data.recent_projects.map((proj) => (
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },
  container: { padding: 16, gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#111827' },
  role: { fontSize: 11, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  logoutText: { fontSize: 13, color: '#6B7280' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '47%', padding: 14 },
  kpiLabel: { fontSize: 11, color: '#6B7280', fontWeight: '500', marginBottom: 6 },
  kpiValue: { fontSize: 28, fontWeight: '700', color: '#003366' },
  kpiValueSm: { fontSize: 14, fontWeight: '700', color: '#003366' },
  projCard: { gap: 8 },
  projName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  progressBar: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#003366', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#6B7280', textAlign: 'right' },
});
