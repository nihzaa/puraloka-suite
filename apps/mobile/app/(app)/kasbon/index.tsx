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
import { api } from '@/lib/api';

interface Kasbon {
  id: string;
  amount: number;
  purpose: string;
  status: string;
  created_at: string;
  notes?: string;
  projects?: { name?: string };
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

  const fetchKasbons = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/mandor/kasbons');
      setKasbons(res.data ?? []);
    } catch {
      // keep
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
        {kasbons.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Belum ada kasbon</Text>
          </View>
        )}
        {kasbons.map((k) => (
          <Card key={k.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.amount}>{fmt(k.amount)}</Text>
                <Text style={styles.purpose}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</Text>
              </View>
              <Badge label={statusLabel(k.status)} variant={statusVariant(k.status)} />
            </View>
            {(k.projects as any)?.name
              ? <Text style={styles.meta}>🏗️ {(k.projects as any).name}</Text>
              : null}
            <Text style={styles.meta}>📅 {fmtDate(k.created_at)}</Text>
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
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
});
