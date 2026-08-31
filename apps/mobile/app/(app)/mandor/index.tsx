import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';

interface MandorSummary {
  id: string;
  name: string;
  active_projects: number;
  pending_kasbons: number;
  total_kasbon_amount: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export default function MandorScreen() {
  const [summary, setSummary] = useState<MandorSummary[]>([]);
  const [wageReports, setWageReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, wageRes] = await Promise.allSettled([
        api.get('/api/v1/mandor/summary'),
        api.get('/api/v1/mandor/wage-reports'),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data ?? []);
      if (wageRes.status === 'fulfilled') setWageReports(wageRes.value.data?.data ?? []);
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
      <View style={styles.header}>
        <Text style={styles.title}>Mandor</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        {summary.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Ringkasan Mandor</Text>
            {summary.map((m) => (
              <Card key={m.id} style={styles.mandorCard}>
                <Text style={styles.mandorName}>{m.name}</Text>
                <View style={styles.mandorStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{m.active_projects}</Text>
                    <Text style={styles.statLabel}>Proyek Aktif</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{m.pending_kasbons}</Text>
                    <Text style={styles.statLabel}>Kasbon Pending</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValueSm}>{fmt(m.total_kasbon_amount ?? 0)}</Text>
                    <Text style={styles.statLabel}>Total Kasbon</Text>
                  </View>
                </View>
              </Card>
            ))}
          </>
        )}

        {wageReports.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Laporan Upah Terbaru</Text>
            {wageReports.slice(0, 10).map((r: any) => (
              <Card key={r.id} style={styles.wageCard}>
                <View style={styles.wageTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wageMandor}>{r.mandors?.name ?? '—'}</Text>
                    <Text style={styles.wagePeriod}>
                      {r.week_start ? new Date(r.week_start).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : ''}
                      {r.week_end ? ` – ${new Date(r.week_end).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                    </Text>
                  </View>
                  <Badge label={statusLabel(r.status)} variant={statusVariant(r.status)} />
                </View>
                <Text style={styles.wageAmount}>{fmt(r.total_amount ?? 0)}</Text>
                {r.projects?.name ? <Text style={styles.wageMeta}>🏗️ {r.projects.name}</Text> : null}
              </Card>
            ))}
          </>
        )}

        {summary.length === 0 && wageReports.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Belum ada data mandor</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  container: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginTop: 4 },
  mandorCard: { gap: 10 },
  mandorName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mandorStats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#003366' },
  statValueSm: { fontSize: 13, fontWeight: '700', color: '#003366' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  wageCard: { gap: 6 },
  wageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  wageMandor: { fontSize: 14, fontWeight: '600', color: '#111827' },
  wagePeriod: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  wageAmount: { fontSize: 16, fontWeight: '700', color: '#003366' },
  wageMeta: { fontSize: 12, color: '#6B7280' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#6B7280' },
});
