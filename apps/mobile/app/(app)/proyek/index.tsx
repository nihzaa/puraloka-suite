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
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';

interface Project {
  id: string;
  name: string;
  location: string;
  status: string;
  progress_pct: number;
  contract_value: number;
  clients?: { contact_person?: string };
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export default function ProyekListScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/projects');
      setProjects(res.data?.projects ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'daftar proyek'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const onRefresh = () => { setRefreshing(true); fetchProjects(); };

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
        <Text style={styles.title}>Proyek</Text>
        <Text style={styles.count}>{projects.length} proyek</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        {galat ? <Galat judul="Proyek tidak bisa dimuat" pesan={galat} /> : null}
        {!galat && projects.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Belum ada proyek</Text>
          </View>
        )}
        {projects.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => router.push(`/(app)/proyek/${p.id}`)} accessibilityRole="button">
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.projName} numberOfLines={2}>{p.name}</Text>
                <Badge label={statusLabel(p.status)} variant={statusVariant(p.status)} />
              </View>
              {p.location ? <Text style={styles.location}>📍 {p.location}</Text> : null}
              {(p.clients as any)?.contact_person
                ? <Text style={styles.client}>👤 {(p.clients as any).contact_person}</Text>
                : null}
              <View style={styles.progressRow}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${p.progress_pct ?? 0}%` }]} />
                </View>
                <Text style={styles.progressPct}>{p.progress_pct ?? 0}%</Text>
              </View>
              <Text style={styles.contractValue}>{fmt(p.contract_value ?? 0)}</Text>
            </Card>
          </TouchableOpacity>
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
  count: { fontSize: 13, color: '#6B7280' },
  list: { padding: 16, gap: 12 },
  card: { gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  projName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  location: { fontSize: 12, color: '#6B7280' },
  client: { fontSize: 12, color: '#6B7280' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#003366', borderRadius: 3 },
  progressPct: { fontSize: 12, color: '#374151', fontWeight: '600', width: 32, textAlign: 'right' },
  contractValue: { fontSize: 13, color: '#003366', fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
});
