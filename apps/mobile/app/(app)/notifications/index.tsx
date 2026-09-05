import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

interface Notification {
  id: string;
  title: string;
  /*
    ⚠ `message`, BUKAN `body`.

    Diukur 2026-09-04 langsung ke API produksi: kolom yang dikirim bernama
    `message`, dan layar ini membaca `body` — **nol dari 30 notifikasi**
    pernah menampilkan isinya. Yang tampil cuma judul dan waktu.

    Kelas cacat yang sama persis dengan dashboard sehari sebelumnya: nama
    kunci yang meleset, ditelan `?? ''` tanpa satu pun galat. `tsc` hijau
    karena `res.data` bertipe `any` dari axios.

    Yang hilang bukan hiasan — `message` memuat keterangannya ("Kasbon
    Rp 4.000.000 dari Pak Budi menunggu persetujuan Anda"), sementara
    judulnya hanya menyebut JENIS. Tanpa itu, notifikasi "Izin Kerja Sudah
    Habis Masa Berlakunya" tak menyebutkan izin kerja yang MANA.

    Kunci lengkap yang dikirim rute, terukur:
      id · user_id · project_id · title · message · channel · is_read ·
      read_at · action_url · sent_at · created_at · type · action_type ·
      action_data · is_actioned · actioned_at · priority
  */
  message?: string;
  is_read: boolean;
  created_at: string;
  action_type?: string;
  is_actioned?: boolean;
  priority?: string;
}

/*
  30 per halaman — sama dengan bawaan rutenya, jadi permintaan pertama
  tak berubah perilakunya. Maksimum yang diizinkan rute 100, tapi 30 kartu
  sudah lebih dari satu layar penuh, dan memuat lebih banyak sekaligus
  memperlama muat pertama tanpa ada yang melihatnya.
*/
const UKURAN_HALAMAN = 30;

/*
  `keyExtractor` dari `id` basis, bukan indeks larik.

  Pedoman stack `react-native`, severity High. Di layar ini bahayanya
  langsung: menandai satu notifikasi terbaca menyusun ulang daftarnya, dan
  indeks sebagai kunci membuat React memasangkan ulang kartu yang salah —
  tombol "Setujui" pindah ke notifikasi LAIN. Untuk layar yang menyetujui
  uang, itu bukan cacat kosmetik.

  Dengan paginasi ia jadi lebih penting lagi: tiap halaman baru menyambung
  larik, dan indeks sebagai kunci membuat SELURUH daftar bergeser
  identitasnya tiap kali 30 baris ditambahkan.
*/
const ambilKunci = (n: Notification) => n.id;

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Baru saja';
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

/**
 * Satu kartu notifikasi — komponen SENDIRI dan ter-`memo`.
 *
 * `FlatList` merender ulang `renderItem` tiap kali induknya berubah, dan
 * layar ini berubah pada TIAP ketukan: menandai terbaca mengubah state
 * daftar. Tanpa `memo`, 30 kartu dirakit ulang setiap kali satu disentuh.
 *
 * Pedoman stack `react-native`, severity **High**.
 */
const KartuNotifikasi = React.memo(function KartuNotifikasi({
  n,
  s,
  c,
  sedangProses,
  onBaca,
  onAksi,
}: {
  n: Notification;
  s: ReturnType<typeof gaya>;
  c: Palet;
  sedangProses: boolean;
  onBaca: (id: string) => void;
  onAksi: (id: string, action: 'approve' | 'reject', judul: string) => void;
}) {
  return (
    <Tekan
      onPress={() => !n.is_read && onBaca(n.id)}
      accessibilityRole="button"
      accessibilityLabel={`${n.title}. ${n.is_read ? 'Sudah dibaca' : 'Belum dibaca'}`}
    >
      <Card style={[s.card, !n.is_read ? s.cardUnread : undefined]}>
        <View style={s.cardTop}>
          <View style={s.dotCol}>{!n.is_read ? <View style={s.dot} /> : null}</View>
          <View style={{ flex: 1 }}>
            <Text style={[s.notifTitle, !n.is_read && s.bold]}>{n.title}</Text>
            {n.message ? <Text style={s.notifBody}>{n.message}</Text> : null}
            <Text style={s.timeAgo}>{timeAgo(n.created_at)}</Text>
          </View>
        </View>

        {n.action_type && !n.is_actioned ? (
          <View style={s.actionRow}>
            {/*
              Kedua tombol lewat `onAksi`, yang MEMINTA KONFIRMASI dulu.
              Alasannya di `mintaKonfirmasi`: rute ini menyetujui kasbon
              lewat mesin approval berjenjang — uang sungguhan.

              Ikon vektor menggantikan "✓" dan "✕": karakter centang dan
              silang dirender berbeda di tiap perangkat, dan pada sebagian
              Android lama muncul sebagai kotak kosong. Untuk tombol yang
              memutuskan uang, "kotak kosong Setujui" bukan risiko yang
              boleh diambil.
            */}
            <Tekan
              style={[s.actionBtn, s.approveBtn]}
              onPress={() => onAksi(n.id, 'approve', n.title)}
              disabled={sedangProses}
              accessibilityRole="button"
              accessibilityLabel={`Setujui: ${n.title}`}
            >
              {sedangProses ? (
                <ActivityIndicator size="small" color={c.success} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color={c.success} />
                  <Text style={s.approveBtnText}>Setujui</Text>
                </>
              )}
            </Tekan>
            <Tekan
              style={[s.actionBtn, s.rejectBtn]}
              onPress={() => onAksi(n.id, 'reject', n.title)}
              disabled={sedangProses}
              accessibilityRole="button"
              accessibilityLabel={`Tolak: ${n.title}`}
            >
              <Ionicons name="close" size={15} color={c.danger} />
              <Text style={s.rejectBtnText}>Tolak</Text>
            </Tekan>
          </View>
        ) : null}

        {n.is_actioned && n.action_type ? (
          <Text style={s.actionedLabel}>Sudah diproses</Text>
        ) : null}
      </Card>
    </Tekan>
  );
});

export default function NotificationsScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /*
    ══════════════════════════════════════════════════════════════════════
    NOTIFIKASI KE-31 DAN SETERUSNYA TAK PERNAH BISA DILIHAT
    ══════════════════════════════════════════════════════════════════════

    Diukur 2026-09-04 langsung ke basis produksi:

        baris di tabel `notifications`  : 8.947
        yang bisa dilihat dari HP       : 30

    Rutenya mendukung paginasi (`?limit=&offset=`, bawaan 30, maksimum
    100 — `notifications.ts:44-47`), tetapi layar ini tak pernah
    memintanya: satu panggilan tanpa parameter, lalu berhenti.

    Tak ada `onEndReached`, tak ada tombol muat-lebih, tak ada indikasi
    bahwa masih ada yang lain. Layarnya terlihat LENGKAP — gulir sampai
    habis, tak ada apa pun yang mengatakan "ini baru 30 dari ribuan".

    Yang hilang bukan riwayat basa-basi: notifikasi memuat kasbon yang
    menunggu persetujuan, izin kerja yang habis masa berlakunya, dan
    risiko yang lewat tenggat tinjau. Yang lebih tua dari 30 terbaru
    hilang dari jangkauan orang yang harus menindaknya.

    ── Kenapa `onEndReached`, bukan tombol

    Tombol "muat lebih banyak" menuntut satu ketukan tepat sasaran di
    ujung daftar — di layar berdebu dengan sarung tangan itu sasaran yang
    buruk. `onEndReached` memuat saat penggunanya sudah bergulir ke sana,
    yang justru sinyal paling jelas bahwa ia ingin lebih.

    ── Kenapa `habis`, bukan menghitung total

    Rutenya tak mengirim jumlah total (hanya `{ notifications: [...] }`),
    dan menambahkannya berarti query `count` tambahan tiap halaman.

    Yang dipakai: halaman yang memulangkan KURANG dari yang diminta adalah
    halaman terakhir. Sederhana, dan tak bisa salah ke arah yang berbahaya
    — paling buruk ia meminta satu halaman kosong sekali.
  */
  const [offset, setOffset] = useState(0);
  const [habis, setHabis] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);

  const fetchNotifications = useCallback(async (lanjutDari = 0) => {
    try {
      const res = await api.get('/api/v1/notifications', {
        params: { limit: UKURAN_HALAMAN, offset: lanjutDari },
      });
      const datang: Notification[] = res.data?.notifications ?? [];

      setNotifications((prev) => (lanjutDari === 0 ? datang : [...prev, ...datang]));
      setOffset(lanjutDari + datang.length);
      setHabis(datang.length < UKURAN_HALAMAN);
      setGalat('');
    } catch (err: unknown) {
      /*
        Galat pada halaman LANJUTAN tak menghapus yang sudah tampil —
        spanduk galat di atas daftar yang berisi lebih membingungkan
        daripada membantu. Yang gagal cuma penambahannya.
      */
      if (lanjutDari === 0) setGalat(pesanGalat(err, 'notifikasi'));
      else console.warn('[notifikasi] gagal memuat halaman lanjutan —', pesanGalat(err, 'notifikasi'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setMemuatLagi(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(0); }, [fetchNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setHabis(false);
    fetchNotifications(0);
  }, [fetchNotifications]);

  /*
    Tiga penjaga sebelum memuat, dan ketiganya perlu:

      `habis`       — jangan meminta halaman yang tak ada
      `memuatLagi`  — `onEndReached` bisa terpicu BERKALI-KALI dalam satu
                      gulir; tanpa ini satu gerakan jempol mengirim tiga
                      permintaan yang sama
      `loading`     — jangan menumpuk di atas muat pertama yang belum selesai
  */
  const muatLagi = useCallback(() => {
    if (habis || memuatLagi || loading || refreshing) return;
    setMemuatLagi(true);
    fetchNotifications(offset);
  }, [habis, memuatLagi, loading, refreshing, offset, fetchNotifications]);

  /*
    ⚠ `useCallback` BUKAN kehalusan di sini — tanpanya `React.memo` pada
    kartunya tak bekerja SAMA SEKALI.

    Rantainya: `markRead` baru tiap render → `renderKartu` (yang menerimanya
    sebagai dependensi) juga baru → `FlatList` menganggap `renderItem`
    berubah → seluruh kartu dirender ulang, dan `memo` yang saya pasang di
    `KartuNotifikasi` tak pernah menahan apa pun.

    Nol gejala: aplikasinya tetap benar, cuma optimasinya tak pernah hidup.
    Persis kelas cacat yang sama dengan font yang dimuat tapi tak dipakai —
    biaya penuh, nol hasil.

    ── Dan galatnya tak lagi ditelan

    `.catch(() => {})` sebelumnya membuang kegagalan diam-diam, lalu state
    lokal tetap ditandai terbaca. Notifikasi yang GAGAL ditandai di server
    akan muncul lagi sebagai belum-dibaca pada muat berikutnya — dan
    pengguna yang sudah "membacanya" menyimpulkan aplikasinya kacau.

    Sekarang state hanya berubah kalau servernya menerima. Ini kelas yang
    dijaga `audit-catch-senyap.mjs` di sisi API; apps/mobile tak tercakup.
  */
  const markRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/api/v1/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err: unknown) {
      /*
        Sengaja TAK memunculkan Alert: menandai-terbaca adalah aksi latar
        yang dipicu sekadar dengan menyentuh kartu, dan dialog untuk itu
        akan mengganggu tanpa memberi pilihan yang berarti. Yang penting
        state TIDAK berbohong — kartunya tetap bertanda belum dibaca.

        ⚠ Tapi galatnya TETAP DICATAT, bukan ditelan.

        Versi pertama saya menulis `catch {}` kosong dengan alasan ini di
        komentarnya — dan `audit-mobile-sehat.mjs` merahkannya. Penjaga itu
        benar: ia memindai PERNYATAAN, dan komentar bukan pernyataan.

        Bedanya nyata, bukan formalitas. `catch {}` membuang bukti bahwa
        server menolak; `console.warn` menyisakan jejak yang bisa dibaca
        dari Metro atau adb logcat saat ada yang melaporkan "notifikasi
        saya muncul lagi terus". Tanpa jejak itu, satu-satunya cara
        mendiagnosis adalah menebak.

        Kelas yang sama dengan `audit-catch-senyap.mjs` di sisi API —
        kegagalan yang tak bisa dibedakan dari kekosongan.
      */
      console.warn(
        '[notifikasi] gagal menandai terbaca —',
        pesanGalat(err, 'menandai terbaca')
      );
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/api/v1/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err: unknown) {
      /*
        Yang INI diberi tahu: pengguna menekannya dengan sengaja dan
        mengharapkan seluruh daftar berubah. Diam di sini berarti ia melihat
        daftar yang tak berubah tanpa tahu kenapa.
      */
      Alert.alert('Gagal', pesanGalat(err, 'menandai semua terbaca'));
    }
  }, []);

  /*
    ⚠ KONFIRMASI WAJIB — ditambahkan 2026-09-04.

    Sebelumnya satu ketukan langsung mengeksekusi. Diukur ke rutenya:
    `POST /api/v1/notifications/:id/action` menyetujui KASBON lewat mesin
    approval berjenjang (`kasbons.ts:263-352`) — uang sungguhan, dan
    keputusannya tak bisa ditarik dari HP.

    Tombol "✓ Setujui" dan "✕ Tolak" berdampingan, masing-masing selebar
    setengah kartu, ditekan dengan ibu jari bersarung di layar berdebu.
    `ui-ux-pro-max` §8 `confirmation-dialogs`: "Confirm before destructive
    actions", dan §2 `no-precision-required`.

    Yang dikonfirmasi menyebut TINDAKANNYA, bukan "Anda yakin?" — kalimat
    itu tak memberi tahu apa yang akan terjadi, dan orang menekannya secara
    refleks.
  */
  const mintaKonfirmasi = useCallback((id: string, action: 'approve' | 'reject', judul: string) => {
    const setuju = action === 'approve';
    Alert.alert(
      setuju ? 'Setujui pengajuan ini?' : 'Tolak pengajuan ini?',
      `${judul}\n\nKeputusan ini langsung berlaku dan tak bisa dibatalkan dari aplikasi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: setuju ? 'Setujui' : 'Tolak',
          style: setuju ? 'default' : 'destructive',
          onPress: () => handleAction(id, action),
        },
      ]
    );
    /*
      `handleAction` sengaja TIDAK jadi dependensi.

      Ia dibaca di dalam `onPress` yang baru dieksekusi SETELAH pengguna
      menekan tombol dialog — saat itu closure-nya sudah ter-resolve ke
      versi terbaru lewat referensi fungsi yang stabil di bawah. Menjadikan
      `handleAction` dependensi akan membuat `mintaKonfirmasi` berubah tiap
      kali `actionLoading` berubah, dan rantai memo-nya putus lagi.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback(async (id: string, action: 'approve' | 'reject') => {
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
  }, []);

  /*
    `useCallback`: `FlatList` membandingkan prop secara dangkal, jadi fungsi
    baru tiap render membatalkan `React.memo` pada kartunya.

    ⚠ POSISINYA di ATAS `if (loading)`, dan itu bukan selera.

    Versi pertama saya menaruhnya di bawah early-return, dan layar ini
    CRASH: "Rendered more hooks than during the previous render". Saat
    memuat, hook ini tak dipanggil; sesudah data datang, dipanggil — dan
    React menghitung jumlah hook per render.

    Yang membuatnya mahal untuk ditemukan: `tsc` hijau, keenam penjaga
    mobile hijau, dan skrip potret melapor **"✅ Semua layar terisi"** —
    karena layar crash TETAP berisi teks (stack trace React), tak menggulir
    mendatar, dan tak punya teks di bawah 12px.

    Ketiga pengukuran itu benar untuk dirinya sendiri, dan ketiganya
    melewatkan layar yang tak bisa dibuka sama sekali. Hanya MELIHAT
    potretnya yang menemukannya.

    Aturannya: SEMUA hook dipanggil sebelum early-return apa pun.
  */
  /*
    Kaki daftar mengatakan KEADAANNYA, bukan sekadar berhenti.

    Tiga keadaan, tiga tampilan berbeda:

      sedang memuat  → spinner. Tanpa ini, jeda jaringan terbaca sebagai
                       "daftarnya habis", dan pengguna berhenti menggulir.
      habis          → garis penutup. Ia MENJAWAB pertanyaan "apakah masih
                       ada lagi?" yang sebelumnya tak pernah dijawab —
                       selama tiga hari layar ini berhenti di 30 dari
                       8.947 tanpa satu pun tanda.
      belum habis    → nol tinggi, tak mengganggu.

    `ui-ux-pro-max` §8 `empty-states` dan §3 `progressive-loading`: jeda
    di atas 1 detik butuh indikator, dan akhir daftar butuh penanda.
  */
  const kakiDaftar = useMemo(() => {
    if (memuatLagi) {
      return (
        <View style={styles.kakiMuat}>
          <ActivityIndicator size="small" color={c.navy} />
        </View>
      );
    }
    if (habis && notifications.length >= UKURAN_HALAMAN) {
      return (
        <View style={styles.kakiHabis}>
          <Text style={styles.kakiHabisTeks}>
            Semua {notifications.length} notifikasi sudah ditampilkan
          </Text>
        </View>
      );
    }
    return null;
  }, [memuatLagi, habis, notifications.length, styles, c]);

  const renderKartu = useCallback(
    ({ item }: { item: Notification }) => (
      <KartuNotifikasi
        n={item}
        s={styles}
        c={c}
        sedangProses={actionLoading === item.id}
        onBaca={markRead}
        onAksi={mintaKonfirmasi}
      />
    ),
    [styles, c, actionLoading, markRead, mintaKonfirmasi]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar
        judul="Notifikasi"
        penjelas={unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
        aksi={
          unread > 0 ? (
            <Tekan onPress={markAllRead} style={styles.readAllBtn} accessibilityRole="button">
              <Text style={styles.readAllText}>Tandai semua</Text>
            </Tekan>
          ) : undefined
        }
      />
      {/*
        `FlatList`, bukan `ScrollView` + `.map()`.

        Diukur 2026-09-04 ke API produksi: **30 notifikasi**. Di bawah
        ambang 50, tetapi daftar ini TUMBUH terus — tiap kasbon, NCR, dan
        izin kerja menambah baris, dan tak ada yang menghapusnya. Ia akan
        melewati 50 tanpa ada yang memperhatikan.

        Yang membedakannya dari `.map()` atas lima chip: daftar ini panjangnya
        ditentukan DATA, bukan kode.
      */}
      <FlatList
        data={notifications}
        keyExtractor={ambilKunci}
        renderItem={renderKartu}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          galat ? <Galat judul="Notifikasi tidak bisa dimuat" pesan={galat} /> : null
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="notifications-off-outline"
              judul="Tidak ada notifikasi"
              petunjuk="Kasbon yang menunggu persetujuan, izin kerja yang habis masa berlakunya, dan pengingat lain akan muncul di sini."
            />
          )
        }
        /*
          `onEndReachedThreshold={0.4}` — mulai memuat saat tersisa 40%
          layar. Nilai bawaan 0.5 sudah baik, tapi kartu di sini tinggi
          (judul + keterangan beberapa baris), jadi 0.5 berarti memuat
          terlalu dini dan menarik data yang mungkin tak pernah dilihat.

          Di bawah 0.2 sebaliknya: pengguna sampai ke dasar sebelum
          permintaannya selesai, dan melihat daftar berhenti — yang
          terbaca seperti "habis".
        */
        onEndReached={muatLagi}
        onEndReachedThreshold={0.4}
        ListFooterComponent={kakiDaftar}
        initialNumToRender={8}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSubtle,
    },
    readAllBtn: {
      paddingHorizontal: SPASI.md, paddingVertical: 6,
      borderRadius: RADIUS.sm, borderWidth: 1, borderColor: c.border,
      minHeight: SENTUH_MIN, justifyContent: 'center',
    },
    readAllText: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    list: { padding: SPASI.lg, gap: 10, paddingBottom: 40 },
    card: { gap: SPASI.sm },
    cardUnread: { borderLeftWidth: 3, borderLeftColor: c.navy },
    cardTop: { flexDirection: 'row', gap: SPASI.sm },
    dotCol: { width: 12, paddingTop: 4, alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.navy },
    notifTitle: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isi,
      color: c.textPrimary, marginBottom: 2,
    },
    /*
      Belum-dibaca ditandai TIGA hal sekaligus: titik, garis kiri navy, dan
      judul tebal. Bukan berlebihan — WCAG 1.4.1 melarang informasi
      disampaikan lewat warna semata, dan "belum dibaca" adalah keadaan yang
      menentukan apakah orang perlu bertindak.
    */
    bold: { fontFamily: FONT.isiTebal },
    notifBody: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c.textSecondary, lineHeight: 18,
    },
    timeAgo: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 4,
    },
    actionRow: { flexDirection: 'row', gap: SPASI.sm, marginTop: 4 },
    /*
      `minHeight: SENTUH_MIN` — dua tombol yang MEMUTUSKAN UANG, ditekan
      dengan ibu jari bersarung. Sebelumnya hanya `paddingVertical: 8`, yang
      pada teks 13px menghasilkan tinggi ~33px: di bawah ambang 44 (Apple
      HIG) dan 48 (Material).

      `flexDirection: 'row'` + `gap` supaya ikon dan teks sejajar; keduanya
      dulu satu string ("✓ Setujui").
    */
    actionBtn: {
      flex: 1, paddingVertical: SPASI.sm, borderRadius: RADIUS.sm,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 5, borderWidth: 1, minHeight: SENTUH_MIN,
    },
    /*
      Pasangan warna DIHITUNG di kedua mode, bukan ditaksir:

          terang  #15803D di #F0FDF4  4.79:1
                  #B91C1C di #FEF2F2  5.91:1
          gelap   #22C55E di campuran 5.64:1
                  #FB8585 di campuran 5.37:1

      Keempatnya lewat AA. Versi hex sebelumnya juga lolos (4.57 / 5.30) —
      jadi migrasi ini MENAIKKAN angkanya, bukan menyelamatkan cacat. Yang
      ia selamatkan adalah mode gelap, yang sebelumnya tak ada.
    */
    approveBtn: { backgroundColor: c.successBg, borderColor: c.success },
    approveBtnText: { fontSize: HURUF.sm, fontFamily: FONT.isiTebal, color: c.success },
    rejectBtn: { backgroundColor: c.dangerBg, borderColor: c.danger },
    rejectBtnText: { fontSize: HURUF.sm, fontFamily: FONT.isiTebal, color: c.danger },
    actionedLabel: {
      fontSize: HURUF.xs, fontFamily: FONT.isi,
      color: c.textSecondary, fontStyle: 'italic',
    },
    kakiMuat: { paddingVertical: SPASI.lg, alignItems: 'center' },
    /*
      Penanda habis diberi garis atas, bukan cuma teks: di ujung daftar
      panjang, teks abu-abu tanpa pembatas terbaca seperti kartu terakhir
      yang gagal dirender.
    */
    kakiHabis: {
      paddingTop: SPASI.lg,
      paddingBottom: SPASI.sm,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginTop: SPASI.sm,
    },
    kakiHabisTeks: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary,
    },
    empty: { alignItems: 'center', paddingTop: 80, gap: SPASI.sm },
    emptyText: { fontSize: HURUF.base, fontFamily: FONT.isi, color: c.textSecondary },
  });
}
