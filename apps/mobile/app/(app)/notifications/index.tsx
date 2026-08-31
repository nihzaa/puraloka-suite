import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';

interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  action_type?: string;
  is_actioned?: boolean;
  priority?: string;
}

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Baru saja';
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/notifications');
      setNotifications(res.data?.notifications ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'notifikasi'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const onRefresh = () => { setRefreshing(true); fetchNotifications(); };

  const markRead = async (id: string) => {
    await api.patch(`/api/v1/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await api.patch('/api/v1/notifications/read-all').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await api.post(`/api/v1/notifications/${id}/action`, { action });
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, is_actioned: true, is_read: true } : n)
      );
    } catch (err: any) {
      Alert.alert('Gagal', err?.response?.data?.error ?? 'Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#003366" />
      </SafeAreaView>
    );
  }

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifikasi</Text>
          {unread > 0 && <Text style={styles.unreadCount}>{unread} belum dibaca</Text>}
        </View>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.readAllBtn} accessibilityRole="button">
            <Text style={styles.readAllText}>Tandai semua</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        {galat ? <Galat judul="Notifikasi tidak bisa dimuat" pesan={galat} /> : null}
        {!galat && notifications.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>Tidak ada notifikasi</Text>
          </View>
        )}
        {notifications.map((n) => (
          <TouchableOpacity key={n.id} onPress={() => !n.is_read && markRead(n.id)} activeOpacity={0.8} accessibilityRole="button">
            <Card style={[styles.card, !n.is_read ? styles.cardUnread : undefined]}>
              <View style={styles.cardTop}>
                <View style={styles.dotCol}>
                  {!n.is_read && <View style={styles.dot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, !n.is_read && styles.bold]}>{n.title}</Text>
                  <Text style={styles.notifBody}>{n.body}</Text>
                  <Text style={styles.timeAgo}>{timeAgo(n.created_at)}</Text>
                </View>
              </View>

              {n.action_type && !n.is_actioned && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => handleAction(n.id, 'approve')}
                    disabled={actionLoading === n.id}
                    accessibilityRole="button"
                  >
                    <Text style={styles.approveBtnText}>
                      {actionLoading === n.id ? '...' : '✓ Setujui'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleAction(n.id, 'reject')}
                    disabled={actionLoading === n.id}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rejectBtnText}>✕ Tolak</Text>
                  </TouchableOpacity>
                </View>
              )}

              {n.is_actioned && n.action_type && (
                <Text style={styles.actionedLabel}>Sudah diproses</Text>
              )}
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
  unreadCount: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  readAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  readAllText: { fontSize: 13, color: '#374151' },
  list: { padding: 16, gap: 10 },
  card: { gap: 8 },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#003366' },
  cardTop: { flexDirection: 'row', gap: 8 },
  dotCol: { width: 12, paddingTop: 4, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#003366' },
  notifTitle: { fontSize: 14, color: '#111827', marginBottom: 2 },
  bold: { fontWeight: '700' },
  notifBody: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  timeAgo: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center', borderWidth: 1,
  },
  approveBtn: { backgroundColor: '#DCFCE7', borderColor: '#15803D' },
  approveBtnText: { fontSize: 13, color: '#15803D', fontWeight: '600' },
  rejectBtn: { backgroundColor: '#FEE2E2', borderColor: '#B91C1C' },
  rejectBtnText: { fontSize: 13, color: '#B91C1C', fontWeight: '600' },
  actionedLabel: { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 15, color: '#6B7280' },
});
