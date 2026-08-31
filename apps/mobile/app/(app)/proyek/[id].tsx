import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

type Tab = 'ringkasan' | 'rab' | 'progress';

interface Milestone { id: string; title: string; due_date: string; is_completed: boolean; target_date?: string }
interface ProgressLog { id: string; log_date: string; progress_pct?: number; pct_overall?: number; notes?: string; photos?: Array<{ photo_url: string }> }
interface RabItem { id: string; no_urut: string; uraian: string; level: number; weight_pct: number; progress_pct: number; total_price: number; parent_id: string | null; children?: RabItem[] }
interface ProjectDetail {
  id: string; name: string; location: string; status: string; progress_pct: number;
  contract_value: number; start_date?: string; end_date?: string;
  clients?: { contact_person?: string }; pm?: { name?: string };
  milestones?: Milestone[]; progress_logs?: ProgressLog[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtShort(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
}

function RabTree({ items, depth = 0 }: { items: RabItem[]; depth?: number }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <>
      {items.map(item => {
        const hasChildren = item.children && item.children.length > 0;
        const isCollapsed = collapsed[item.id];
        return (
          <React.Fragment key={item.id}>
            <TouchableOpacity
              onPress={() => hasChildren ? setCollapsed(prev => ({ ...prev, [item.id]: !prev[item.id] })) : undefined}
              activeOpacity={hasChildren ? 0.7 : 1}
              style={[
                styles.rabRow,
                { paddingLeft: 12 + depth * 14 },
                item.level === 1 && styles.rabRowCat,
                item.level === 2 && styles.rabRowSub,
              ]}
              accessibilityRole="button"
            >
              <View style={styles.rabRowInner}>
                {hasChildren && (
                  <Text style={styles.rabChevron}>{isCollapsed ? '▶' : '▼'}</Text>
                )}
                <Text
                  style={[
                    styles.rabName,
                    item.level === 1 && styles.rabNameCat,
                    item.level === 2 && styles.rabNameSub,
                  ]}
                  numberOfLines={2}
                >
                  {item.no_urut ? `${item.no_urut}. ` : ''}{item.uraian}
                </Text>
              </View>
              {item.level === 3 && (
                <View style={styles.rabMeta}>
                  <Text style={styles.rabPrice}>{fmtShort(item.total_price ?? 0)}</Text>
                  <View style={styles.rabProgressWrap}>
                    <View style={[styles.rabProgressBar, { width: `${Math.min(item.progress_pct ?? 0, 100)}%` }]} />
                  </View>
                  <Text style={styles.rabPct}>{item.progress_pct ?? 0}%</Text>
                </View>
              )}
              {item.level !== 3 && item.weight_pct > 0 && (
                <Text style={styles.rabWeight}>{item.weight_pct.toFixed(1)}%</Text>
              )}
            </TouchableOpacity>
            {!isCollapsed && hasChildren && (
              <RabTree items={item.children!} depth={depth + 1} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

export default function ProyekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [rabTree, setRabTree] = useState<RabItem[]>([]);
  const [loadingRab, setLoadingRab] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/projects/${id}`);
      setProject(res.data);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'detail proyek'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    if (tab === 'rab' && id && rabTree.length === 0) {
      setLoadingRab(true);
      api.get(`/api/v1/projects/${id}/rab`)
        .then(res => setRabTree(res.data?.tree ?? res.data?.rab ?? []))
        .catch(() => setRabTree([]))
        .finally(() => setLoadingRab(false));
    }
  }, [tab, id]);

  const onRefresh = () => { setRefreshing(true); fetchProject(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#003366" />
      </SafeAreaView>
    );
  }

  /*
    GAGAL MUAT dan TIDAK DITEMUKAN dibedakan.

    Sebelumnya keduanya jatuh ke satu cabang `!project` yang berbunyi "Proyek
    tidak ditemukan" — jadi jaringan mati di lokasi proyek tampil sebagai
    proyeknya DIHAPUS. Mandor yang melihat itu akan menelepon kantor
    menanyakan proyek yang sebenarnya baik-baik saja.
  */
  if (!project) {
    return (
      <SafeAreaView style={styles.centered}>
        <View style={{ paddingHorizontal: 20, width: '100%' }}>
          {galat
            ? <Galat judul="Proyek tidak bisa dimuat" pesan={galat} />
            : <Text style={styles.errorText}>Proyek tidak ditemukan</Text>}
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnWrap} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnWrap} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['ringkasan', 'rab', 'progress'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)} accessibilityRole="button">
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t === 'ringkasan' ? 'Ringkasan' : t === 'rab' ? 'RAB' : 'Progres'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003366" />}
      >
        {/* ── Tab: Ringkasan ── */}
        {tab === 'ringkasan' && (
          <>
            <Card>
              <View style={styles.headerRow}>
                <Text style={styles.projName}>{project.name}</Text>
                <Badge label={statusLabel(project.status)} variant={statusVariant(project.status)} />
              </View>
              {project.location ? <Text style={styles.meta}>📍 {project.location}</Text> : null}
              {(project.clients as any)?.contact_person
                ? <Text style={styles.meta}>👤 {(project.clients as any).contact_person}</Text>
                : null}
              {(project.pm as any)?.name
                ? <Text style={styles.meta}>🧑‍💼 PM: {(project.pm as any).name}</Text>
                : null}
              <Text style={styles.meta}>📅 {fmtDate(project.start_date)} → {fmtDate(project.end_date)}</Text>
              <View style={styles.divider} />
              <Text style={styles.contractValue}>{fmt(project.contract_value ?? 0)}</Text>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Progress Fisik</Text>
                <Text style={styles.progressPct}>{project.progress_pct ?? 0}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${project.progress_pct ?? 0}%` }]} />
              </View>
            </Card>

            {project.milestones && project.milestones.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Milestone</Text>
                {project.milestones.map((m) => (
                  <Card key={m.id} style={styles.milestoneCard}>
                    <View style={styles.milestoneRow}>
                      <Text style={styles.milestoneCheck}>{m.is_completed ? '✅' : '⏳'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.milestoneTitle}>{m.title}</Text>
                        <Text style={styles.milestoneDue}>Target: {fmtDate(m.due_date ?? m.target_date)}</Text>
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Tab: RAB ── */}
        {tab === 'rab' && (
          <Card style={{ overflow: 'hidden', padding: 0 }}>
            <View style={styles.rabHeader}>
              <Text style={styles.rabHeaderTitle}>Rencana Anggaran Biaya</Text>
              <Text style={styles.rabHeaderSub}>Tap kategori untuk expand/collapse</Text>
            </View>
            {loadingRab ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#003366" />
              </View>
            ) : rabTree.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>Belum ada RAB untuk proyek ini</Text>
              </View>
            ) : (
              <RabTree items={rabTree} />
            )}
          </Card>
        )}

        {/* ── Tab: Progress ── */}
        {tab === 'progress' && (
          <>
            {project.progress_logs && project.progress_logs.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Log Progress</Text>
                {project.progress_logs.slice(0, 10).map((log) => (
                  <Card key={log.id} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logDate}>{fmtDate(log.log_date)}</Text>
                      {(log.pct_overall ?? log.progress_pct) != null && (
                        <Text style={styles.logPct}>{log.pct_overall ?? log.progress_pct}%</Text>
                      )}
                    </View>
                    {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                    {log.photos && log.photos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                        {log.photos.map((ph, i) => (
                          <Image key={i} source={{ uri: ph.photo_url }} style={styles.photo} />
                        ))}
                      </ScrollView>
                    )}
                  </Card>
                ))}
              </View>
            ) : (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>Belum ada log progress</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA', padding: 16 },
  errorText: { fontSize: 15, color: '#6B7280', marginBottom: 16 },
  topBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backBtnWrap: { alignSelf: 'flex-start' },
  backBtnText: { fontSize: 15, color: '#003366', fontWeight: '500' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  tabBtnActive: { backgroundColor: '#003366', borderColor: '#003366' },
  tabBtnText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  tabBtnTextActive: { color: '#fff', fontWeight: '600' },
  container: { padding: 16, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  projName: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  contractValue: { fontSize: 18, fontWeight: '700', color: '#003366', marginBottom: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 13, color: '#374151', fontWeight: '500' },
  progressPct: { fontSize: 13, color: '#003366', fontWeight: '600' },
  progressBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#003366', borderRadius: 4 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  milestoneCard: { padding: 12 },
  milestoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  milestoneCheck: { fontSize: 16 },
  milestoneTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  milestoneDue: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  logCard: { gap: 8 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontSize: 13, color: '#374151', fontWeight: '500' },
  logPct: { fontSize: 13, color: '#003366', fontWeight: '700' },
  logNotes: { fontSize: 13, color: '#6B7280' },
  photoRow: { marginTop: 4 },
  photo: { width: 80, height: 80, borderRadius: 8, marginRight: 8, backgroundColor: '#E5E7EB' },
  // RAB styles
  rabHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  rabHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rabHeaderSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rabRow: { paddingVertical: 9, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rabRowCat: { backgroundColor: '#EBF2FF' },
  rabRowSub: { backgroundColor: '#F9FAFB' },
  rabRowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  rabChevron: { fontSize: 9, color: '#6B7280', width: 12 },
  rabName: { flex: 1, fontSize: 13, color: '#374151' },
  rabNameCat: { fontWeight: '700', color: '#003366', fontSize: 13 },
  rabNameSub: { fontWeight: '600', color: '#111827' },
  rabMeta: { alignItems: 'flex-end', gap: 2, minWidth: 80 },
  rabPrice: { fontSize: 12, color: '#6B7280' },
  rabProgressWrap: { width: 60, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  rabProgressBar: { height: '100%', backgroundColor: '#003366', borderRadius: 2 },
  rabPct: { fontSize: 12, color: '#003366', fontWeight: '700' },
  rabWeight: { fontSize: 12, color: '#6B7280', marginLeft: 8 },
});
