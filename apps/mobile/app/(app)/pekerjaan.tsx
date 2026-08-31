import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

/*
  ══════════════════════════════════════════════════════════════════════════
  PEKERJAAN SAYA — apa yang sudah dilaporkan, dan bagaimana nasibnya
  ══════════════════════════════════════════════════════════════════════════

  ── Lubang yang ditutup layar ini

  Diukur 2026-08-31: mobile punya ENAM layar tulis lapangan (progres,
  kasbon, absensi, temuan, NCR, izin kerja) dan NOL layar baca untuk tiga
  yang terakhir. `api.get` di dalam ketiganya hanya mengisi dropdown proyek.

  Akibatnya mandor bisa MENGIRIM temuan, NCR, dan izin kerja dari HP, lalu
  tak pernah tahu apa yang terjadi sesudahnya. Izin kerja yang paling parah:
  ia GERBANG — pekerjaan berbahaya menunggu persetujuan yang tak bisa
  dilihat dari alat yang dipakai mengajukannya.

  Menambah layar tulis ketujuh tak menutup ini. Diukur, semua tabel tulis
  lapangan yang punya isi SUDAH punya layarnya:

      absensi_harian 1.279 · kasbons 67 · punch_items 40 · ncr_items 19
      material_requests 9 · izin_kerja 4 · submittals 4 · serah_terima 0

  Yang kurang bukan pintu masuk lagi, melainkan pintu keluar.

  ── Kenapa SATU daftar, bukan tiga layar

  Mandor tak memikirkan pekerjaannya sebagai tiga kategori sistem. Yang ia
  tanyakan satu: "apa yang masih menggantung dari saya?" Tiga layar terpisah
  memaksanya memeriksa tiga tempat untuk menjawab satu pertanyaan — dan yang
  ketiga hampir tak pernah dibuka.

  Jenisnya tetap ditandai per kartu, karena tindak lanjutnya berbeda: temuan
  dirapikan, NCR didisposisi, izin kerja ditunggu keputusannya.

  ── Kenapa dua panggilan berbeda bentuk

  Punch dan NCR PER-PROYEK (`/projects/:id/punch-items`), izin kerja GLOBAL
  dengan `project_id` opsional. Bukan ketidakkonsistenan yang perlu
  diseragamkan dari sisi mobile: punch/NCR memang milik satu proyek,
  sementara izin kerja dinilai lintas proyek (kedaluwarsa, aktif sekarang).

  Layar ini karena itu memanggil izin kerja SEKALI, dan punch/NCR sekali per
  proyek. Dengan `Promise.allSettled`, bukan `all`: satu proyek yang gagal
  dimuat tak boleh mengosongkan seluruh layar, dan yang gagal DISEBUTKAN
  jumlahnya — daftar yang diam-diam kurang lebih berbahaya daripada daftar
  yang mengaku tak lengkap.

  ── Batas yang disebutkan: hanya BACA

  Menutup temuan, mendisposisi NCR, memutuskan izin — semuanya butuh izin
  yang tak dipegang mandor (`k3:permit:decide` misalnya), dan sebagian
  dijaga CHECK basis (pemutus <> pengaju). Layar ini tak berpura-pura bisa.
*/

type Jenis = 'punch' | 'ncr' | 'izin';

type Baris = {
  kunci: string;
  jenis: Jenis;
  nomor?: string;
  judul: string;
  lokasi?: string;
  severity?: string;
  status: string;
  proyek?: string;
  tanggal?: string;
  /** Sudah selesai dari sisi mandor — tak lagi menuntut apa pun. */
  beres: boolean;
  /** Menuntut perhatian: kritis/berat terbuka, atau izin yang ditolak. */
  mendesak: boolean;
};

type Proyek = { id: string; nama: string };

/*
  Label status. Kunci mentah TIDAK boleh muncul di layar — `menunggu_cek`
  dan `tak_berlaku` adalah kata sistem, dan yang membacanya mandor.

  Repo ini punya penjaga CI untuk cacat yang sama di sisi web
  (`audit-jenis-tulis-punya-label`); alasannya identik di sini.
*/
const STATUS_PUNCH: Record<string, string> = {
  terbuka: 'Belum dikerjakan',
  dikerjakan: 'Sedang dikerjakan',
  menunggu_cek: 'Menunggu pengecekan',
  ditutup: 'Selesai',
  ditolak: 'Ditolak',
};

const STATUS_NCR: Record<string, string> = {
  terbuka: 'Belum didisposisi',
  disposisi: 'Sudah didisposisi',
  perbaikan: 'Sedang diperbaiki',
  verifikasi: 'Menunggu verifikasi',
  ditutup: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

/*
  Izin kerja memakai status TURUNAN dari server (`nilaiIzinKerja`), bukan
  kolom `status` mentah — server sudah menghitung kedaluwarsa dan
  belum_mulai terhadap jam sekarang. Menghitungnya lagi di HP berarti dua
  jam yang bisa berbeda, dan yang salah adalah yang di tangan orang.
*/
const STATUS_IZIN: Record<string, string> = {
  aktif: 'BERLAKU sekarang',
  menunggu: 'Menunggu persetujuan',
  belum_mulai: 'Disetujui, belum mulai',
  kedaluwarsa: 'Sudah lewat waktunya',
  tak_berlaku: 'Tidak berlaku',
};

const WARNA_SEVERITY: Record<string, string> = {
  ringan: '#059669', minor: '#059669',
  sedang: '#D97706', major: '#D97706',
  berat: '#DC2626',
  kritis: '#B91C1C',
};

/*
  Berapa proyek yang diperiksa sekali muat. Lihat alasannya di `muat()`.
*/
const MAKS_PROYEK = 6;

const LABEL_JENIS: Record<Jenis, string> = {
  punch: 'Temuan',
  ncr: 'NCR',
  izin: 'Izin kerja',
};

function usia(iso?: string) {
  if (!iso) return '';
  const hari = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (hari < 1) return 'hari ini';
  if (hari === 1) return 'kemarin';
  if (hari < 30) return `${hari} hari lalu`;
  return `${Math.floor(hari / 30)} bulan lalu`;
}

export default function PekerjaanSaya() {
  const { punyaIzin } = useAuth();
  const [baris, setBaris] = useState<Baris[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [gagalSebagian, setGagalSebagian] = useState(0);
  const [proyekTerlewat, setProyekTerlewat] = useState(0);
  const [tampilSelesai, setTampilSelesai] = useState(false);

  const bolehPunch = punyaIzin('punch:view');
  const bolehNcr = punyaIzin('ncr:view');
  const bolehIzin = punyaIzin('k3:permit:view');
  const bolehApaPun = bolehPunch || bolehNcr || bolehIzin;

  const muat = useCallback(async () => {
    setGalatMuat(null);
    setGagalSebagian(0);
    setProyekTerlewat(0);
    try {
      const rp = await api.get('/api/v1/projects');
      const proyek: Proyek[] = (rp.data?.projects ?? rp.data ?? []).map(
        (p: { id: string; name: string }) => ({ id: p.id, nama: p.name }),
      );
      const namaProyek = new Map(proyek.map((p) => [p.id, p.nama]));

      /*
        Semua panggilan dikumpulkan lebih dulu, lalu `allSettled` sekali.
        Menunggu berurutan (await di dalam for) membuat sepuluh proyek jadi
        sepuluh perjalanan berantai — di jaringan lapangan itu belasan detik
        layar kosong.
      */
      const tugas: Promise<{ jenis: Jenis; proyekId?: string; data: unknown }>[] = [];

      /*
        DIBATASI ke MAKS_PROYEK, dan batasnya disebutkan di layar.

        Punch dan NCR hanya punya rute PER-PROYEK; tak ada rute lintas
        proyek di API (diukur: nol `'/api/v1/punch-items'` tanpa
        `:projectId`). Akun uji hari ini memegang 19 proyek — itu 38
        permintaan tiap layar dibuka, di jaringan yang justru paling buruk
        tempat layar ini dipakai.

        Enam proyek pertama adalah kompromi, bukan jawaban. Jawabannya rute
        lintas-proyek di API (satu panggilan, disaring server) — pekerjaan
        API, bukan mobile. Sampai itu ada, layar MENYEBUTKAN berapa proyek
        yang tak diperiksa: daftar yang diam-diam sebagian membuat mandor
        menyimpulkan tak ada yang menggantung, padahal ada.

        Urutan `/projects` menentukan mana yang enam — server mengurutnya,
        dan yang aktif ada di depan.
      */
      const dipakai = proyek.slice(0, MAKS_PROYEK);
      setProyekTerlewat(Math.max(0, proyek.length - dipakai.length));

      for (const p of dipakai) {
        if (bolehPunch) {
          tugas.push(
            api.get(`/api/v1/projects/${p.id}/punch-items`)
              .then((r) => ({ jenis: 'punch' as Jenis, proyekId: p.id, data: r.data })),
          );
        }
        if (bolehNcr) {
          tugas.push(
            api.get(`/api/v1/projects/${p.id}/ncr`)
              .then((r) => ({ jenis: 'ncr' as Jenis, proyekId: p.id, data: r.data })),
          );
        }
      }
      if (bolehIzin) {
        tugas.push(
          api.get('/api/v1/kepatuhan/izin-kerja')
            .then((r) => ({ jenis: 'izin' as Jenis, data: r.data })),
        );
      }

      const hasil = await Promise.allSettled(tugas);
      const kumpul: Baris[] = [];
      let gagal = 0;

      for (const h of hasil) {
        if (h.status === 'rejected') { gagal++; continue; }
        const { jenis, proyekId, data } = h.value;
        const d = data as { data?: unknown[]; izin?: unknown[] };

        if (jenis === 'izin') {
          for (const x of (d.izin ?? []) as Record<string, unknown>[]) {
            /*
              `statusNyata` — camelCase, BUKAN snake_case. Server
              menghitungnya di `nilaiIzinKerja()` terhadap jam sekarang
              (kedaluwarsa, belum_mulai); kolom `status` mentah di basis
              hanya tahu diajukan/disetujui.

              Saya sempat menulis `status_nyata` di sini dengan meniru gaya
              kolom basis. Cacatnya DIAM: nilainya undefined, jatuh ke
              `x.status` = 'diajukan', yang tak ada di STATUS_IZIN — dan
              yang tampil di layar adalah kata mentah itu. Tak ada galat,
              tak ada nol, hanya satu kata teknis di layar orang yang justru
              tak paham istilah teknis.
            */
            const st = String(x.statusNyata ?? x.status ?? '');
            kumpul.push({
              kunci: `izin-${x.id}`,
              jenis: 'izin',
              nomor: x.nomor as string | undefined,
              judul: (x.uraian_pekerjaan as string) ?? 'Izin kerja',
              lokasi: x.lokasi as string | undefined,
              status: st,
              proyek: namaProyek.get(x.project_id as string),
              tanggal: x.berlaku_dari as string | undefined,
              beres: st === 'kedaluwarsa' || st === 'tak_berlaku',
              /* Izin yang MENUNGGU adalah yang menahan pekerjaan — itulah
                 yang mendesak, bukan yang sudah disetujui. */
              mendesak: st === 'menunggu',
            });
          }
          continue;
        }

        const petaStatus = jenis === 'punch' ? STATUS_PUNCH : STATUS_NCR;
        const selesai = jenis === 'punch'
          ? ['ditutup', 'ditolak']
          : ['ditutup', 'dibatalkan'];

        for (const x of (d.data ?? []) as Record<string, unknown>[]) {
          const st = String(x.status ?? '');
          const sev = String(x.severity ?? '');
          const beres = selesai.includes(st);
          kumpul.push({
            kunci: `${jenis}-${x.id}`,
            jenis,
            nomor: x.nomor as string | undefined,
            judul: (x.judul as string) ?? petaStatus[st] ?? 'Tanpa judul',
            lokasi: x.lokasi as string | undefined,
            severity: sev || undefined,
            status: st,
            proyek: namaProyek.get(proyekId ?? ''),
            tanggal: x.created_at as string | undefined,
            beres,
            mendesak: !beres && (sev === 'kritis' || sev === 'berat'),
          });
        }
      }

      /* Mendesak di atas, lalu yang belum beres, lalu yang terbaru. */
      kumpul.sort((a, b) => {
        if (a.mendesak !== b.mendesak) return a.mendesak ? -1 : 1;
        if (a.beres !== b.beres) return a.beres ? 1 : -1;
        return (b.tanggal ?? '').localeCompare(a.tanggal ?? '');
      });

      setBaris(kumpul);
      setGagalSebagian(gagal);
    } catch {
      /* Galat MUAT terpisah dari galat aksi — cacat yang sudah ditemukan di
         11 halaman web. Layar ini tak punya aksi, tapi polanya dijaga. */
      setGalatMuat('Gagal memuat daftar. Periksa koneksi lalu tarik ke bawah.');
    } finally {
      setMemuat(false);
    }
  }, [bolehPunch, bolehNcr, bolehIzin]);

  useFocusEffect(
    useCallback(() => {
      let hidup = true;
      (async () => { if (hidup) await muat(); })();
      return () => { hidup = false; };
    }, [muat]),
  );

  if (!bolehApaPun) {
    return (
      <View style={s.tengah}>
        <Text style={s.kosongJudul}>Tidak ada akses</Text>
        <Text style={s.kosongIsi}>
          Peran Anda belum diberi izin melihat temuan, NCR, maupun izin kerja.
          Hubungi admin bila ini keliru.
        </Text>
      </View>
    );
  }

  if (memuat) {
    return (
      <View style={s.tengah}>
        <ActivityIndicator size="large" color="#003366" />
      </View>
    );
  }

  const mendesak = baris.filter((b) => b.mendesak);
  const berjalan = baris.filter((b) => !b.mendesak && !b.beres);
  const selesai = baris.filter((b) => b.beres);
  const terlihat = tampilSelesai ? [...mendesak, ...berjalan, ...selesai] : [...mendesak, ...berjalan];

  return (
    <ScrollView
      style={s.wadah}
      contentContainerStyle={s.isi}
      refreshControl={<RefreshControl refreshing={false} onRefresh={muat} />}
    >
      <Text style={s.judulHalaman}>Pekerjaan Saya</Text>

      {galatMuat && (
        <View style={s.galat}>
          <Text style={s.galatTeks}>{galatMuat}</Text>
        </View>
      )}

      {/*
        Kegagalan SEBAGIAN disebutkan, bukan disamarkan. Daftar yang diam-diam
        kurang lebih berbahaya daripada daftar yang mengaku tak lengkap:
        mandor menyimpulkan tak ada yang menggantung, padahal ada.
      */}
      {proyekTerlewat > 0 && (
        <View style={s.peringatan}>
          <Text style={s.peringatanTeks}>
            Menampilkan {MAKS_PROYEK} proyek terbaru. {proyekTerlewat} proyek lain belum
            diperiksa — buka lewat portal bila yang Anda cari tak ada di sini.
          </Text>
        </View>
      )}

      {gagalSebagian > 0 && (
        <View style={s.peringatan}>
          <Text style={s.peringatanTeks}>
            {gagalSebagian} bagian gagal dimuat — daftar di bawah BELUM lengkap.
            Tarik ke bawah untuk mencoba lagi.
          </Text>
        </View>
      )}

      {baris.length === 0 && !galatMuat ? (
        <View style={s.kosong}>
          <Text style={s.kosongJudul}>Belum ada yang dilaporkan</Text>
          <Text style={s.kosongIsi}>
            Temuan, NCR, dan izin kerja yang Anda kirim dari lapangan muncul di sini
            beserta nasibnya.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.ringkas}>
            <View style={s.ringkasSel}>
              <Text style={[s.ringkasAngka, mendesak.length > 0 && s.ringkasAngkaMerah]}>
                {mendesak.length}
              </Text>
              <Text style={s.ringkasLabel}>perlu tindakan</Text>
            </View>
            <View style={s.ringkasGaris} />
            <View style={s.ringkasSel}>
              <Text style={s.ringkasAngka}>{berjalan.length}</Text>
              <Text style={s.ringkasLabel}>berjalan</Text>
            </View>
            <View style={s.ringkasGaris} />
            <View style={s.ringkasSel}>
              <Text style={s.ringkasAngka}>{selesai.length}</Text>
              <Text style={s.ringkasLabel}>selesai</Text>
            </View>
          </View>

          {terlihat.map((b) => {
            const petaStatus =
              b.jenis === 'punch' ? STATUS_PUNCH : b.jenis === 'ncr' ? STATUS_NCR : STATUS_IZIN;
            const warnaSev = b.severity ? WARNA_SEVERITY[b.severity] : undefined;
            return (
              <View
                key={b.kunci}
                style={[s.kartu, b.mendesak && s.kartuMendesak, b.beres && s.kartuBeres]}
              >
                <View style={s.kartuKepala}>
                  <Text style={s.jenisTag}>
                    {LABEL_JENIS[b.jenis]}
                    {b.nomor ? ` · ${b.nomor}` : ''}
                  </Text>
                  {b.tanggal && <Text style={s.usia}>{usia(b.tanggal)}</Text>}
                </View>

                <Text style={[s.judul, b.beres && s.judulBeres]} numberOfLines={2}>
                  {b.judul}
                </Text>

                {(b.lokasi || b.proyek) && (
                  <Text style={s.tempat} numberOfLines={1}>
                    {[b.proyek, b.lokasi].filter(Boolean).join(' · ')}
                  </Text>
                )}

                <View style={s.kaki}>
                  {/*
                    Tingkat dan status dibedakan LATAR, bukan warna teks saja —
                    WCAG 1.4.1: informasi tak boleh disampaikan lewat warna
                    semata, dan layar ini dibaca di bawah matahari.
                  */}
                  {b.severity && warnaSev && (
                    <View style={[s.pil, { backgroundColor: warnaSev }]}>
                      <Text style={s.pilTeks}>{b.severity}</Text>
                    </View>
                  )}
                  <View style={[s.pil, s.pilStatus, b.mendesak && s.pilStatusMendesak]}>
                    <Text style={[s.pilTeks, s.pilStatusTeks, b.mendesak && s.pilTeks]}>
                      {petaStatus[b.status] ?? b.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {selesai.length > 0 && (
            <Pressable
              onPress={() => setTampilSelesai((v) => !v)}
              style={s.tombolSelesai}
              accessibilityRole="button"
            >
              <Text style={s.tombolSelesaiTeks}>
                {tampilSelesai
                  ? `Sembunyikan ${selesai.length} yang selesai`
                  : `Tampilkan ${selesai.length} yang selesai`}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/*
        Batas disebutkan, bukan didiamkan. Mandor yang mencari tombol
        "tutup temuan" di sini akan menyimpulkan aplikasinya rusak — padahal
        yang menahannya izin, dan sebagian dijaga CHECK di basis.
      */}
      <Text style={s.catatan}>
        Halaman ini hanya menampilkan. Menutup temuan, mendisposisi NCR, dan memutuskan
        izin kerja dilakukan di portal oleh QC/PM — pengaju dan pemutus wajib orang berbeda.
      </Text>

      <Pressable
        onPress={() => router.push('/lainnya')}
        style={s.tautan}
        accessibilityRole="button"
      >
        <Text style={s.tautanTeks}>Lapor yang baru →</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wadah: { flex: 1, backgroundColor: '#F8FAFC' },
  isi: { padding: 16, paddingBottom: 40 },
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  judulHalaman: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 14 },
  ringkas: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  ringkasSel: { flex: 1, alignItems: 'center' },
  ringkasGaris: { width: 1, height: 28, backgroundColor: '#E5E7EB' },
  ringkasAngka: { fontSize: 22, fontWeight: '700', color: '#111827' },
  ringkasAngkaMerah: { color: '#B91C1C' },
  ringkasLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  kartu: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 13, marginBottom: 10,
  },
  /* Garis kiri tebal, bukan latar merah penuh: kartunya masih harus terbaca,
     dan latar jenuh membuat teks di atasnya melelahkan di bawah matahari. */
  kartuMendesak: { borderColor: '#FECACA', borderLeftWidth: 4, borderLeftColor: '#DC2626' },
  kartuBeres: { backgroundColor: '#FAFAFA', borderColor: '#F0F1F3' },
  kartuKepala: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  jenisTag: { fontSize: 11, fontWeight: '700', color: '#003366', letterSpacing: 0.4, textTransform: 'uppercase' },
  usia: { fontSize: 11, color: '#9CA3AF' },
  judul: { fontSize: 14, color: '#111827', lineHeight: 20, fontWeight: '500' },
  judulBeres: { color: '#6B7280' },
  tempat: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  kaki: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  pil: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7 },
  pilTeks: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', textTransform: 'capitalize' },
  pilStatus: { backgroundColor: '#F3F4F6' },
  pilStatusTeks: { color: '#374151', textTransform: 'none' },
  pilStatusMendesak: { backgroundColor: '#DC2626' },
  tombolSelesai: {
    marginTop: 6, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  tombolSelesaiTeks: { fontSize: 13, fontWeight: '600', color: '#374151' },
  catatan: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 18, lineHeight: 18 },
  tautan: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  tautanTeks: { fontSize: 14, fontWeight: '600', color: '#003366' },
  kosong: { paddingVertical: 40, alignItems: 'center' },
  kosongJudul: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  kosongIsi: { fontSize: 13, color: '#5A616B', lineHeight: 19, textAlign: 'center' },
  galat: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  galatTeks: { fontSize: 13, color: '#991B1B', lineHeight: 19 },
  peringatan: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  peringatanTeks: { fontSize: 13, color: '#78350F', lineHeight: 19 },
});
