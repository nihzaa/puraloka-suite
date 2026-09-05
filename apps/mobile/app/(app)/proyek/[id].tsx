import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { Tekan } from '@/components/ui/Tekan';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

type Tab = 'ringkasan' | 'rab' | 'progress';

interface Milestone { id: string; title: string; due_date: string; is_completed: boolean; target_date?: string }
/**
 * Satu log progres — bentuknya diukur ke rutenya.
 *
 * ⚠ `logged_at`, BUKAN `log_date`. Versi sebelumnya membaca `log_date`,
 * yang tak pernah ada — jadi `fmtDate()` memulangkan "—" untuk KEDUA PULUH
 * log. Tab Progres menampilkan dua puluh baris bertanggal "—".
 *
 * Tiga medan berguna juga tak pernah dirender meski dikirim rutenya:
 * `weather`, `worker_count`, dan `reporter.name`. Untuk log lapangan,
 * cuaca dan jumlah tukang adalah konteks yang menjelaskan kenapa progres
 * hari itu cepat atau lambat — dan tanpa nama pelapor, dua log yang
 * bertentangan tak bisa ditelusuri ke siapa pun.
 *
 * `photos` DIBUANG dari tipe ini. Rute `/projects/:id` tak mengirimnya —
 * foto progres hidup di tabel `project_photos` yang terpisah. Blok render
 * yang menunggunya adalah kode mati yang MENJANJIKAN kemampuan tak ada,
 * dan `audit-bentuk-balasan-mobile.mjs` menandainya.
 */
interface ProgressLog {
  id: string;
  logged_at?: string;
  pct_overall?: number | null;
  mode?: string | null;
  weather?: string | null;
  worker_count?: number | null;
  notes?: string | null;
  reporter?: { name?: string } | null;
}
/**
 * Satu baris RAB — **bentuknya diukur ke rutenya, bukan ditebak**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TAB RAB MENAMPILKAN "Belum ada RAB" ATAS 287 BARIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-05 ke API produksi, proyek terkaya di basis:
 *
 *     GET /projects/<id>/rab  →  { data: [287 baris] }
 *     layar membaca            →  res.data?.tree ?? res.data?.rab ?? []
 *
 * Dua kunci yang tak pernah ada, lalu `?? []` menutupnya. Tab RAB berbunyi
 * "Belum ada RAB untuk proyek ini" — kalimat yang terbaca seperti keadaan
 * wajar bagi proyek yang memang belum dianggarkan.
 *
 * Empat nama medan juga meleset, dan tiap satunya sendirian sudah cukup
 * mengosongkan barisnya:
 *
 *     no_urut  → yang benar `category_code`
 *     uraian   → yang benar `name`
 *     level    → BUKAN angka. Nilainya string: 'category' |
 *                'subcategory' | 'item'
 *     children → tak ada. Datanya DATAR; 137 dari 287 baris punya
 *                `parent_id`, dan pohonnya dirakit di klien.
 *
 * `tsc` hijau untuk semuanya karena `res.data` bertipe `any` dari axios.
 */
type TingkatRab = 'category' | 'subcategory' | 'item';

interface RabItem {
  id: string;
  category_code?: string | null;
  name: string;
  level: TingkatRab;
  parent_id: string | null;
  weight_pct?: number | null;
  progress_pct?: number | null;
  total_price?: number | null;
  unit?: string | null;
  qty?: number | null;
  /* Dirakit di klien oleh `rakitPohon`, bukan datang dari API. */
  children?: RabItem[];
}

/**
 * Merakit 287 baris datar jadi pohon.
 *
 * Dua alasan ini dikerjakan di klien, bukan diminta ke API:
 *
 *   1. Rutenya memang memulangkan datar (`{ data: [...] }`), dan mengubah
 *      bentuk balasan menyentuh pemakai lain — web membacanya juga.
 *   2. 287 baris adalah satu lintasan; biayanya tak terukur di HP, dan
 *      hasilnya di-`useMemo` sehingga hanya dirakit sekali per muat.
 *
 * ⚠ Baris YATIM ikut dinaikkan ke akar, bukan dibuang. `parent_id` yang
 * menunjuk baris yang tak ada di halaman ini akan membuat barisnya hilang
 * senyap — dan RAB yang kurang satu pekerjaan lebih berbahaya daripada RAB
 * yang menampilkan satu baris di tempat yang salah, karena yang hilang tak
 * meninggalkan jejak.
 */
function rakitPohon(datar: RabItem[]): RabItem[] {
  const peta = new Map<string, RabItem>();
  for (const b of datar) peta.set(b.id, { ...b, children: [] });

  const akar: RabItem[] = [];
  for (const b of datar) {
    const simpul = peta.get(b.id)!;
    const induk = b.parent_id ? peta.get(b.parent_id) : undefined;
    if (induk) induk.children!.push(simpul);
    else akar.push(simpul);
  }
  return akar;
}
interface ProjectDetail {
  id: string; name: string; location: string; status: string; progress_pct: number;
  contract_value: number; start_date?: string; end_date?: string;
  clients?: { contact_person?: string } | null;
  pm?: { name?: string } | null;
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

/**
 * Satu baris metadata: ikon + teks.
 *
 * Dipisah jadi komponen karena diulang empat kali dengan bentuk yang sama,
 * dan karena ikonnya wajib `accessibilityElementsHidden` — pembaca layar
 * yang mengumumkan "gambar" sebelum tiap baris membuat kartunya dua kali
 * lebih panjang didengar tanpa menambah satu pun informasi.
 */
function BarisMeta({
  ikon,
  s,
  c,
  children,
}: {
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  s: ReturnType<typeof gaya>;
  c: Palet;
  children: React.ReactNode;
}) {
  return (
    <View style={s.metaBaris}>
      <Ionicons
        name={ikon}
        size={13}
        color={c.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={s.meta}>{children}</Text>
    </View>
  );
}

/**
 * Pohon RAB.
 *
 * ⚠ `level` adalah STRING, bukan angka.
 *
 * Versi sebelumnya membandingkan `item.level === 1 / 2 / 3` — dan nilainya
 * `'category' | 'subcategory' | 'item'`, terukur langsung dari rutenya.
 * Ketiga perbandingan itu SELALU false, jadi:
 *
 *   · tak ada baris yang mendapat gaya kategori atau sub-kategori —
 *     287 baris tampil dengan bobot visual yang sama persis;
 *   · blok harga + batang progres (`level === 3`) tak pernah dirender,
 *     jadi angka rupiah dan persentase pekerjaan TAK PERNAH terlihat;
 *   · blok bobot (`level !== 3`) dirender untuk SEMUA baris, termasuk
 *     item yang seharusnya menampilkan harga.
 *
 * `tsc` hijau karena `level` dideklarasikan `number` di tipe lama — tipe
 * yang ditulis dari tebakan, bukan dari pengukuran.
 *
 * Ketiganya tak bergejala: tak ada galat, dan RAB yang seragam-rata
 * terbaca seperti "memang begitu tampilannya".
 */
const RabTree = React.memo(function RabTree({
  items,
  s,
  c,
  depth = 0,
  tertutup,
  onTutupBuka,
}: {
  items: RabItem[];
  s: ReturnType<typeof gaya>;
  c: Palet;
  depth?: number;
  tertutup: Record<string, boolean>;
  onTutupBuka: (id: string) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const punyaAnak = !!item.children && item.children.length > 0;
        const ditutup = tertutup[item.id];
        const kategori = item.level === 'category';
        const subkategori = item.level === 'subcategory';
        const daun = item.level === 'item';
        const bobot = item.weight_pct ?? 0;

        return (
          <React.Fragment key={item.id}>
            <Tekan
              onPress={punyaAnak ? () => onTutupBuka(item.id) : undefined}
              disabled={!punyaAnak}
              tanpaUmpan={!punyaAnak}
              style={[
                s.rabRow,
                { paddingLeft: 12 + depth * 14 },
                kategori && s.rabRowCat,
                subkategori && s.rabRowSub,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                punyaAnak
                  ? `${item.name}, ${ditutup ? 'tertutup' : 'terbuka'}, ${item.children!.length} baris`
                  : item.name
              }
            >
              <View style={s.rabRowInner}>
                {/*
                  Ikon vektor menggantikan karakter ▶ / ▼.

                  Keduanya karakter geometri Unicode, dan pada sebagian
                  Android lama dirender sebagai kotak kosong — untuk
                  penanda buka-tutup, kotak kosong berarti pengguna tak
                  tahu barisnya bisa ditekan.
                */}
                {punyaAnak ? (
                  <Ionicons
                    name={ditutup ? 'chevron-forward' : 'chevron-down'}
                    size={13}
                    color={c.textSecondary}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                ) : null}
                <Text
                  style={[s.rabName, kategori && s.rabNameCat, subkategori && s.rabNameSub]}
                  numberOfLines={2}
                >
                  {item.category_code ? `${item.category_code}. ` : ''}
                  {item.name}
                </Text>
              </View>

              {daun ? (
                <View style={s.rabMeta}>
                  <Text style={s.rabPrice}>{fmtShort(item.total_price ?? 0)}</Text>
                  <View style={s.rabProgressWrap}>
                    <View
                      style={[
                        s.rabProgressBar,
                        { width: `${Math.max(0, Math.min(item.progress_pct ?? 0, 100))}%` },
                      ]}
                    />
                  </View>
                  <Text style={s.rabPct} numberOfLines={1}>
                      {Math.round(item.progress_pct ?? 0)}%
                    </Text>
                </View>
              ) : bobot > 0 ? (
                <Text style={s.rabWeight}>{bobot.toFixed(1)}%</Text>
              ) : null}
            </Tekan>

            {!ditutup && punyaAnak ? (
              <RabTree
                items={item.children!}
                s={s}
                c={c}
                depth={depth + 1}
                tertutup={tertutup}
                onTutupBuka={onTutupBuka}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
});

export default function ProyekDetailScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [rabDatar, setRabDatar] = useState<RabItem[]>([]);
  const [galatRab, setGalatRab] = useState('');
  const [loadingRab, setLoadingRab] = useState(false);

  /*
    Pohon dirakit SEKALI per muat, bukan tiap render.

    287 baris × satu lintasan memang murah, tapi tanpa `useMemo` ia
    dijalankan ulang tiap kali tab diganti atau daftar di-refresh — dan
    tiap rakitan menghasilkan objek BARU, yang membatalkan `React.memo`
    di seluruh pohonnya.
  */
  const rabTree = useMemo(() => rakitPohon(rabDatar), [rabDatar]);

  /*
    State buka-tutup pindah dari `RabTree` ke induknya.

    Sebelumnya tiap tingkat rekursi punya `useState` sendiri — jadi
    menutup satu kategori TIDAK ikut menutup keadaan cucunya, dan
    keadaannya HILANG tiap kali pohonnya dirakit ulang.

    Yang lebih menentukan: `RabTree` kini ter-`React.memo`, dan komponen
    ber-state internal tak bisa di-memo dengan benar — prop-nya sama,
    tapi isinya berubah.
  */
  const [tertutup, setTertutup] = useState<Record<string, boolean>>({});
  const tutupBuka = useCallback((idBaris: string) => {
    setTertutup((prev) => ({ ...prev, [idBaris]: !prev[idBaris] }));
  }, []);

  const fetchProject = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/projects/${id}`);
      /*
        `res.data.project`, BUKAN `res.data`.

        API membungkusnya: `{ project: { … } }`. Menyimpan pembungkusnya
        membuat SELURUH medan detail tak terbaca — nama proyek kosong,
        tanggal "— → —", nilai "Rp 0", progres 0%.

        Terukur dari layarnya sendiri sebelum perbaikan: 171 karakter, dan
        yang 171 itu hampir semuanya label bilah tab.

        `?? res.data` dipertahankan sebagai jaring: kalau suatu saat rute
        berhenti membungkus, layar tetap hidup alih-alih kosong lagi.
      */
      setProject(res.data?.project ?? res.data);
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
    if (tab === 'rab' && id && rabDatar.length === 0 && !galatRab) {
      setLoadingRab(true);
      api.get(`/api/v1/projects/${id}/rab`)
        /*
          `res.data.data` — kunci yang BENAR-BENAR dikirim rutenya.

          Versi sebelumnya `res.data?.tree ?? res.data?.rab ?? []`: dua
          kunci yang tak pernah ada, lalu `?? []` menutupnya. Tab RAB
          berbunyi "Belum ada RAB untuk proyek ini" atas 287 baris.

          Datanya DATAR — pohonnya dirakit `rakitPohon` di klien.
        */
        .then((res) => setRabDatar(res.data?.data ?? []))
        .catch((err: unknown) => {
          /*
            Galat tak lagi ditelan. `.catch(() => setRabTree([]))`
            sebelumnya membuat kegagalan jaringan tampil sebagai "Belum
            ada RAB" — kalimat yang terbaca seperti keadaan wajar, dan
            itulah yang membuat cacat di atas bertahan.
          */
          setRabDatar([]);
          setGalatRab(pesanGalat(err, 'RAB proyek'));
        })
        .finally(() => setLoadingRab(false));
    }
  }, [tab, id, rabDatar.length, galatRab]);

  const onRefresh = () => { setRefreshing(true); fetchProject(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
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
        <Tekan onPress={() => router.back()} style={styles.backBtnWrap} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Kembali</Text>
        </Tekan>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Tekan onPress={() => router.back()} style={styles.backBtnWrap} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Kembali</Text>
        </Tekan>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['ringkasan', 'rab', 'progress'] as Tab[]).map(t => (
          <Tekan key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)} accessibilityRole="button">
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t === 'ringkasan' ? 'Ringkasan' : t === 'rab' ? 'RAB' : 'Progres'}
            </Text>
          </Tekan>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />}
      >
        {/* ── Tab: Ringkasan ── */}
        {tab === 'ringkasan' && (
          <>
            <Card>
              <View style={styles.headerRow}>
                <Text style={styles.projName}>{project.name}</Text>
                <Badge label={statusLabel(project.status)} variant={statusVariant(project.status)} />
              </View>
              {/*
                Ikon vektor menggantikan 📍 👤 🧑‍💼 📅.

                Yang keempat paling rapuh: 🧑‍💼 adalah emoji MAJEMUK
                (ZWJ sequence). Perangkat yang tak mengenalinya menggambar
                DUA glif terpisah — orang, lalu koper — bukan satu kotak
                kosong. Rupanya berbeda-beda, dan tak satu pun yang
                dimaksudkan.

                Cast `as any` juga dibuang: tipenya sekarang dinyatakan,
                jadi salah nama medan jadi galat alih-alih diam.
              */}
              {project.location ? (
                <BarisMeta ikon="location-outline" s={styles} c={c}>
                  {project.location}
                </BarisMeta>
              ) : null}
              {project.clients?.contact_person ? (
                <BarisMeta ikon="person-outline" s={styles} c={c}>
                  {project.clients.contact_person}
                </BarisMeta>
              ) : null}
              {project.pm?.name ? (
                <BarisMeta ikon="briefcase-outline" s={styles} c={c}>
                  PM: {project.pm.name}
                </BarisMeta>
              ) : null}
              <BarisMeta ikon="calendar-outline" s={styles} c={c}>
                {fmtDate(project.start_date)} → {fmtDate(project.end_date)}
              </BarisMeta>
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
                    <View
                      style={styles.milestoneRow}
                      accessibilityLabel={`${m.title}. ${m.is_completed ? 'Selesai' : 'Belum selesai'}`}
                    >
                      {/*
                        Ikon vektor menggantikan ✅ dan ⏳.

                        Keduanya berbeda rupa di tiap platform — ✅ hijau
                        kotak di Android, hijau bulat di iOS — dan warnanya
                        DIPAKU pada emojinya, jadi ia tak bisa mengikuti
                        tema maupun palet semantik.

                        Sekarang `success` untuk selesai dan `warning` untuk
                        menunggu, keduanya dari token yang sudah terhitung
                        kontrasnya di dua mode.
                      */}
                      <Ionicons
                        name={m.is_completed ? 'checkmark-circle' : 'time-outline'}
                        size={18}
                        color={m.is_completed ? c.success : c.warning}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
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
                <ActivityIndicator size="small" color={c.navy} />
              </View>
            ) : rabTree.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={styles.kosongInline}>Belum ada RAB untuk proyek ini</Text>
              </View>
            ) : (
              <RabTree
                items={rabTree}
                s={styles}
                c={c}
                tertutup={tertutup}
                onTutupBuka={tutupBuka}
              />
            )}
          </Card>
        )}

        {/* ── Tab: Progress ── */}
        {tab === 'progress' && (
          <>
            {project.progress_logs && project.progress_logs.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Log Progress</Text>
                {/*
                  ⚠ `.slice(0, 10)` DIPERTAHANKAN, dan sekarang disebutkan.

                  Memotong 20 log jadi 10 tanpa memberi tahu membuat
                  daftarnya terbaca sebagai "cuma segitu yang ada" — batas
                  yang tak disebutkan adalah batas yang menyesatkan.

                  Tak dijadikan `FlatList`: layar ini punya tiga tab di
                  dalam satu `ScrollView`, dan daftar tervirtualisasi di
                  dalam induk yang menggulir menghasilkan dua wilayah gulir
                  bersarang — `ui-ux-pro-max` §5 `scroll-behavior`
                  menyebutnya anti-pattern, dan di RN ia benar-benar
                  merusak momentum gulirnya.
                */}
                {project.progress_logs.slice(0, 10).map((log) => (
                  <Card key={log.id} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logDate}>{fmtDate(log.logged_at)}</Text>
                      {log.pct_overall != null ? (
                        <Text style={styles.logPct}>{log.pct_overall.toFixed(1)}%</Text>
                      ) : null}
                    </View>

                    {/*
                      Cuaca, jumlah tukang, dan pelapor — dikirim rutenya
                      dan tak pernah dirender sebelum hari ini.

                      Untuk log lapangan ketiganya bukan hiasan: cuaca dan
                      jumlah tukang MENJELASKAN kenapa progres hari itu
                      cepat atau lambat, dan tanpa nama pelapor dua log
                      yang bertentangan tak bisa ditelusuri ke siapa pun.
                    */}
                    {(log.weather || log.worker_count != null || log.reporter?.name) ? (
                      <View style={styles.logMetaRow}>
                        {log.weather ? (
                          <View style={styles.logMetaItem}>
                            <Ionicons
                              name="partly-sunny-outline"
                              size={12}
                              color={c.textSecondary}
                              accessibilityElementsHidden
                              importantForAccessibility="no"
                            />
                            <Text style={styles.logMeta}>{log.weather}</Text>
                          </View>
                        ) : null}
                        {log.worker_count != null ? (
                          <View style={styles.logMetaItem}>
                            <Ionicons
                              name="people-outline"
                              size={12}
                              color={c.textSecondary}
                              accessibilityElementsHidden
                              importantForAccessibility="no"
                            />
                            <Text style={styles.logMeta}>{log.worker_count} tukang</Text>
                          </View>
                        ) : null}
                        {log.reporter?.name ? (
                          <View style={styles.logMetaItem}>
                            <Ionicons
                              name="person-outline"
                              size={12}
                              color={c.textSecondary}
                              accessibilityElementsHidden
                              importantForAccessibility="no"
                            />
                            <Text style={styles.logMeta} numberOfLines={1}>
                              {log.reporter.name}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                    {/*
                      ⚠ Blok foto DIBUANG, bukan dibiarkan menunggu data.

                      `audit-bentuk-balasan-mobile.mjs` menandainya: rute
                      `/projects/:id` TIDAK mengirim `photos` — foto progres
                      hidup di tabel `project_photos` yang terpisah, dan
                      tak ikut di balasan ini.

                      Jadi blok ini kode mati sejak ditulis. Yang membuatnya
                      layak dibuang, bukan dibiarkan:

                        · ia MENJANJIKAN kemampuan yang tak ada. Pembaca
                          kode berikutnya akan menyimpulkan foto sudah
                          tersambung dan mencari sebab lain saat tak muncul;
                        · `key={i}` di dalamnya adalah indeks sebagai kunci
                          — cacat yang penjaga daftar kami larang, dan yang
                          diam-diam ikut terbaca sebagai contoh yang benar.

                      Menyambungkan foto butuh rute sendiri
                      (`/projects/:id/photos`) — pekerjaan tersendiri, bukan
                      tambalan di sini.
                    */}
                  </Card>
                ))}
                {project.progress_logs.length > 10 ? (
                  <Text style={styles.logSisa}>
                    Menampilkan 10 dari {project.progress_logs.length} log. Riwayat
                    lengkap ada di portal web.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={styles.kosongInline}>Belum ada log progress</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    /*
      Keadaan kosong sebaris di dalam tab, bukan layar penuh — karena itu
      tak memakai `<Kosong>`, yang berpadding 56px dan dimaksudkan mengisi
      layar sendirian.

      Sebelumnya gaya sebaris ber-hex: `{ color: '#6B7280', fontSize: 13 }`
      ditulis DUA KALI. Abu-abu itu benar di mode terang dan nyaris tak
      terbaca di mode gelap — cacat yang tak bergejala sampai layarnya
      dibuka malam hari.
    */
    kosongInline: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      lineHeight: 19,
    },
    centered: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSubtle, padding: SPASI.lg,
    },
    errorText: {
      fontSize: HURUF.base, fontFamily: FONT.isi,
      color: c.textSecondary, marginBottom: SPASI.lg,
    },
    topBar: { paddingHorizontal: SPASI.lg, paddingTop: SPASI.md, paddingBottom: 4 },
    backBtnWrap: { alignSelf: 'flex-start', minHeight: SENTUH_MIN, justifyContent: 'center' },
    backBtnText: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.navy },
    tabBar: {
      flexDirection: 'row', paddingHorizontal: SPASI.lg,
      paddingBottom: SPASI.sm, gap: SPASI.sm,
    },
    /*
      `minHeight: SENTUH_MIN` pada tab: sebelumnya `paddingVertical: 7`
      pada teks 13px menghasilkan tinggi ~31px — di bawah ambang 44 (Apple
      HIG) dan 48 (Material), dan tiga tab berdampingan berarti sasaran
      sempit yang berdekatan.
    */
    tabBtn: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised,
      minHeight: SENTUH_MIN, justifyContent: 'center',
    },
    tabBtnActive: { backgroundColor: c.navy, borderColor: c.navy },
    tabBtnText: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    tabBtnTextActive: { color: c.onNavy, fontFamily: FONT.isiTebal },
    container: { padding: SPASI.lg, gap: SPASI.lg, paddingBottom: 40 },
    headerRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: SPASI.sm, marginBottom: SPASI.sm,
    },
    projName: {
      flex: 1, fontSize: HURUF.lg + 1, fontFamily: FONT.judul,
      color: c.textPrimary, lineHeight: 24,
    },
    metaBaris: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 4 },
    meta: { flex: 1, fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },
    divider: { height: 1, backgroundColor: c.border, marginVertical: SPASI.md },
    contractValue: {
      fontSize: HURUF.lg + 1, fontFamily: FONT.judul, color: c.navy,
      marginBottom: SPASI.sm, fontVariant: ['tabular-nums'],
    },
    progressRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 6,
    },
    progressLabel: { fontSize: HURUF.sm, fontFamily: FONT.isiTebal, color: c.textPrimary },
    progressPct: {
      fontSize: HURUF.sm, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    progressBar: {
      height: 8, backgroundColor: c.surfaceHover, borderRadius: 4, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: c.navy, borderRadius: 4 },
    section: { gap: SPASI.sm },
    sectionTitle: {
      fontSize: HURUF.lg - 1, fontFamily: FONT.judul, color: c.textPrimary,
    },
    milestoneCard: { padding: SPASI.md },
    milestoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    milestoneTitle: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal, color: c.textPrimary, flex: 1,
    },
    milestoneDue: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 2 },
    logCard: { gap: SPASI.sm },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logDate: { fontSize: HURUF.sm, fontFamily: FONT.isiTebal, color: c.textPrimary },
    logPct: {
      fontSize: HURUF.sm, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'],
    },
    logNotes: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary, lineHeight: 19 },
    /*
      `flexWrap` supaya tiga potong metadata membungkus di layar 360px
      alih-alih terpotong. Nama pelapor bisa panjang ("[UJI-ISOLASI] Admin
      B"), dan memaksanya satu baris akan memotong tepat di tengah nama.
    */
    logMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPASI.md, marginTop: 2 },
    logMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    logMeta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    logSisa: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary,
      textAlign: 'center', marginTop: SPASI.sm, lineHeight: 17,
    },

    /* ── RAB ─────────────────────────────────────────────────────────── */
    rabHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    rabHeaderTitle: { fontSize: HURUF.sm + 1, fontFamily: FONT.judul, color: c.textPrimary },
    rabHeaderSub: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 2 },
    /*
      `minHeight: SENTUH_MIN` pada baris RAB yang bisa dibuka-tutup.
      Sebelumnya `paddingVertical: 9` pada teks 13px = ~35px, dan baris
      berurutan rapat — sasaran yang mudah meleset ke baris tetangga.
    */
    rabRow: {
      paddingVertical: 9, paddingRight: SPASI.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      minHeight: SENTUH_MIN,
    },
    rabRowCat: { backgroundColor: c.navyLight },
    rabRowSub: { backgroundColor: c.surfaceHover },
    rabRowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    /*
      `textPrimary`, dan itu SUDAH benar — yang membuatnya terlihat pucat
      di potret adalah `Tekan` yang memudarkan seluruh barisnya lewat
      `opacity: 0.45` saat `disabled`.

      Baris item memang `disabled` (tak punya anak, tak bisa dibuka), tapi
      "tak bisa ditekan" bukan "tak aktif": isinya tetap harus terbaca
      penuh. `tanpaUmpan` sudah dipasang; yang kurang adalah membedakan
      DUA keadaan itu di `Tekan`.
    */
    rabName: { flex: 1, fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    rabNameCat: { fontFamily: FONT.judul, color: c.navy },
    rabNameSub: { fontFamily: FONT.isiTebal, color: c.textPrimary },
    /*
      Harga, batang, dan persen SEJAJAR mendatar — bukan bertumpuk.

      Terlihat dari potret: susunan vertikal membuat "5jt" melayang di atas
      batang dan "100%" menggantung di bawahnya, ketiganya berdesakan dalam
      80px. Mata harus membaca tiga baris untuk satu item.

      Mendatar, ketiganya terbaca sekali pandang, dan lebar tetap membuat
      batang di baris berurutan mulai dan berakhir di titik yang sama —
      yang justru kemampuan yang diberikan batang progres.
    */
    rabMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 124 },
    rabPrice: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary,
      fontVariant: ['tabular-nums'], width: 42, textAlign: 'right',
    },
    rabProgressWrap: {
      width: 36, height: 4, backgroundColor: c.surfaceHover,
      borderRadius: 2, overflow: 'hidden',
    },
    rabProgressBar: { height: '100%', backgroundColor: c.navy, borderRadius: 2 },
    /*
      Lebar 38, bukan 32 — dan angkanya dari MENGUKUR, bukan menaksir.

      Terlihat dari potret: "100%" pecah jadi dua baris. Diukur di DOM,
      tingginya **28px** sementara "10%" dan "0%" hanya 14px — persis dua
      kali lipat.

      Hitungan untuk 12px tabular memberi 30,6px (3 digit × 0,6em + simbol
      % × 0,75em), yang "muat" dalam 32 di atas kertas dan tetap pecah di
      layar. Estimasi lebar glif tak bisa diandalkan lintas font dan
      platform — yang bisa diandalkan cuma mengukurnya.

      `numberOfLines={1}` dipasang sebagai jaring terakhir: kalau suatu
      hari fontnya berubah dan 38 pun tak cukup, yang terjadi adalah teks
      terpotong (terlihat) alih-alih baris pecah — yang diam-diam
      menggandakan tinggi SETIAP baris item RAB.
    */
    rabPct: {
      fontSize: HURUF.xs, fontFamily: FONT.judul, color: c.navy,
      fontVariant: ['tabular-nums'], width: 38, textAlign: 'right',
    },
    rabWeight: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary,
      marginLeft: SPASI.sm, fontVariant: ['tabular-nums'],
    },
  });
}
