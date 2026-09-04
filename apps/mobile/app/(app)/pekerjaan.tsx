import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { Tekan } from '@/components/ui/Tekan';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';

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

/**
 * Warna keparahan temuan, diambil dari palet aktif.
 *
 * ⚠ Dulu peta hex tetap, dipilih untuk latar TERANG dan tanpa padanan
 * gelap. DIHITUNG terhadap `surface` gelap `#1A1D27` (bukan ditaksir —
 * CLAUDE.md mewajibkan dihitung):
 *
 *     #059669 ringan/minor   4.46:1   nyaris — lolos tipis
 *     #D97706 sedang/major   5.28:1   lolos
 *     #DC2626 berat          3.48:1   ❌ GAGAL AA
 *     #B91C1C kritis         2.60:1   ❌ GAGAL AA, terburuk
 *
 * Yang gagal justru dua keparahan TERTINGGI — dan urutannya terbalik dari
 * dugaan: makin parah temuannya, makin sulit dibaca labelnya. `#B91C1C`
 * dipilih karena merah tua terbaca "gawat" di latar putih; di latar gelap
 * merah tua justru melebur ke dalamnya.
 *
 * Token gelap yang menggantikan, terhitung di latar yang sama:
 * success `#22C55E` 7.38:1 · warning `#F59E0B` 7.83:1 · danger `#FB8585`
 * 7.04:1 — ketiganya lewat AA dengan margin.
 *
 * Kenapa `audit-kontras-mobile.mjs` tak menangkapnya: ia memindai nilai
 * `color:` di dalam gaya; warna ini masuk lewat `Record` lalu dipasang
 * saat render. Benar di satu lapis, patah di lapis yang sesungguhnya
 * dipakai.
 *
 * `ringan`/`minor` sengaja memakai `success` dan bukan hijau tersendiri:
 * satu tangga warna semantik untuk seluruh aplikasi lebih mudah dijaga
 * daripada dua yang mirip.
 */
function warnaKeparahan(c: Palet, sev: string): string | undefined {
  switch (sev) {
    case 'ringan':
    case 'minor':
      return c.success;
    case 'sedang':
    case 'major':
      return c.warning;
    case 'berat':
    case 'kritis':
      return c.danger;
    default:
      return undefined;
  }
}

/*
  Proyek yang dimuat GELOMBANG PERTAMA — bukan batas, melainkan urutan.

  Versi pertama layar ini memotong di 6 proyek dan berhenti di situ, dengan
  alasan 19 proyek = 39 permintaan terlalu berat. Diukur, alasan itu SALAH
  di kedua sisinya:

      13 permintaan (6 proyek)  → 2.448 ms
      39 permintaan (19 proyek) → 3.587 ms

  Selisihnya 1,1 detik, bukan tiga kali lipat — permintaannya paralel.
  Sementara ongkos pemotongannya besar: dari 25 hal MENDESAK di 19 proyek,
  enam proyek pertama hanya memuat 3. Dua puluh dua temuan berat dan kritis
  tak akan pernah terlihat, dan yang membacanya menyimpulkan pekerjaannya
  bersih.

  Kompromi yang menyembunyikan 88% hal mendesak bukan kompromi.

  Jadi SEMUA proyek dimuat. Enam pertama diselesaikan lebih dulu supaya
  layar terisi cepat, sisanya menyusul dan digabungkan — pengguna melihat
  sesuatu dalam ~2,4 detik alih-alih menunggu 3,6 detik untuk layar kosong.
*/
const GELOMBANG_PERTAMA = 6;

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
  const { c } = useTema();
  /*
    Gaya dirakit di dalam komponen, bukan di lingkup modul.

    `StyleSheet.create` di lingkup modul dievaluasi SEKALI saat impor —
    sebelum satu hook pun berjalan — jadi ia tak bisa membaca `useTema()`.
    Warna yang terkunci di sana tetap warna mode terang selamanya, dan
    gejalanya di mode gelap adalah teks gelap di atas latar gelap: terbaca
    seperti bug render, bukan seperti gaya yang tak pernah diperbarui.

    `useMemo` sengaja TIDAK dipakai: `gaya()` merakit satu objek datar dan
    hanya berubah saat palet berubah (dua kali seumur sesi, saat pengguna
    mengganti tema HP). Memoisasi di sini menambah satu hook untuk
    menghemat pekerjaan yang tak pernah jadi beban.
  */
  const s = gaya(c);
  const [baris, setBaris] = useState<Baris[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [gagalSebagian, setGagalSebagian] = useState(0);
  const [memuatSisa, setMemuatSisa] = useState(0);
  const [tampilSelesai, setTampilSelesai] = useState(false);

  const bolehPunch = punyaIzin('punch:view');
  const bolehNcr = punyaIzin('ncr:view');
  const bolehIzin = punyaIzin('k3:permit:view');
  const bolehApaPun = bolehPunch || bolehNcr || bolehIzin;

  const muat = useCallback(async () => {
    setGalatMuat(null);
    setGagalSebagian(0);
    setMemuatSisa(0);
    try {
      const rp = await api.get('/api/v1/projects');
      const proyek: Proyek[] = (rp.data?.projects ?? rp.data ?? []).map(
        (p: { id: string; name: string }) => ({ id: p.id, nama: p.name }),
      );
      const namaProyek = new Map(proyek.map((p) => [p.id, p.nama]));

      /*
        Semua panggilan dikumpulkan lebih dulu, lalu `allSettled` sekali per
        gelombang. Menunggu berurutan (await di dalam for) membuat sembilan
        belas proyek jadi sembilan belas perjalanan berantai — di jaringan
        lapangan itu menit, bukan detik.
      */
      const buatTugas = (daftar: Proyek[]) => {
        const tg: Promise<{ jenis: Jenis; proyekId?: string; data: unknown }>[] = [];
        for (const p of daftar) {
          if (bolehPunch) {
            tg.push(
              api.get(`/api/v1/projects/${p.id}/punch-items`)
                .then((r) => ({ jenis: 'punch' as Jenis, proyekId: p.id, data: r.data })),
            );
          }
          if (bolehNcr) {
            tg.push(
              api.get(`/api/v1/projects/${p.id}/ncr`)
                .then((r) => ({ jenis: 'ncr' as Jenis, proyekId: p.id, data: r.data })),
            );
          }
        }
        return tg;
      };

      const gel1 = proyek.slice(0, GELOMBANG_PERTAMA);
      const gel2 = proyek.slice(GELOMBANG_PERTAMA);

      const tugas = buatTugas(gel1);
      if (bolehIzin) {
        /* Izin kerja ikut gelombang PERTAMA meski satu panggilan untuk semua
           proyek: ia yang paling mendesak dilihat — pekerjaan berbahaya
           menunggu keputusannya. */
        tugas.push(
          api.get('/api/v1/kepatuhan/izin-kerja')
            .then((r) => ({ jenis: 'izin' as Jenis, data: r.data })),
        );
      }

      /*
        Pengurai dipisah supaya bisa dipanggil DUA KALI — sekali per
        gelombang. Menyalinnya akan membuat gelombang kedua pelan-pelan
        menyimpang dari yang pertama tanpa satu pun galat.
      */
      const urai = (
        hasil: PromiseSettledResult<{ jenis: Jenis; proyekId?: string; data: unknown }>[],
      ) => {
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
        return { kumpul, gagal };
      };

      const urut = (a: Baris[]) => a.slice().sort((x, y) => {
        if (x.mendesak !== y.mendesak) return x.mendesak ? -1 : 1;
        if (x.beres !== y.beres) return x.beres ? 1 : -1;
        return (y.tanggal ?? '').localeCompare(x.tanggal ?? '');
      });

      const h1 = urai(await Promise.allSettled(tugas));
      setBaris(urut(h1.kumpul));
      setGagalSebagian(h1.gagal);
      setMemuat(false);

      /*
        Gelombang KEDUA. Layar sudah terisi; sisanya menyusul dan digabung.
        `setMemuatSisa` membuat layar mengatakan bahwa ia masih menambah —
        tanpa itu, daftar yang tiba-tiba bertambah panjang terbaca seperti
        cacat.
      */
      if (gel2.length > 0) {
        setMemuatSisa(gel2.length);
        try {
          const h2 = urai(await Promise.allSettled(buatTugas(gel2)));
          setBaris((lama) => urut([...lama, ...h2.kumpul]));
          setGagalSebagian((g) => g + h2.gagal);
        } catch {
          /*
            Gelombang kedua punya `catch` SENDIRI, dan sengaja.

            Tanpa ini, kegagalan gelombang kedua jatuh ke `catch` luar dan
            memasang "Gagal memuat daftar" DI ATAS daftar yang sudah terisi
            dari gelombang pertama — pesan yang menyangkal apa yang sedang
            dilihat orangnya. Dan `memuatSisa` tak akan pernah kembali nol,
            jadi "Menambahkan 13 proyek lagi…" menggantung selamanya.

            Yang benar: gelombang pertama berhasil, sebagian kedua tidak.
            Itu keadaan "daftar belum lengkap", yang sudah punya penampilnya
            sendiri lewat `gagalSebagian`.
          */
          setGagalSebagian((g) => g + gel2.length);
        } finally {
          setMemuatSisa(0);
        }
      }

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
        <ActivityIndicator size="large" color={c.navy} />
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
      {memuatSisa > 0 && (
        <View style={s.peringatan}>
          <Text style={s.peringatanTeks}>
            Menambahkan {memuatSisa} proyek lagi… Daftar di bawah belum lengkap.
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
            const warnaSev = b.severity ? warnaKeparahan(c, b.severity) : undefined;
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
                  {/*
                    ⚠ Pil STATUS tak lagi ikut memerah saat barisnya mendesak.

                    Terlihat dari potret 2026-09-04: kartu mendesak
                    menampilkan DUA pil merah berdampingan — "Berat" (tingkat)
                    dan "Menunggu Pengecekan" (status). Yang kedua bukan
                    keadaan bahaya; ia sekadar tahap kerja.

                    Akibatnya merah kehilangan artinya. Kalau "Sedang
                    Dikerjakan" semerah "Kritis", pembacanya berhenti memakai
                    warna sebagai isyarat dan harus membaca tiap kata —
                    persis kemampuan yang seharusnya diberikan warna.

                    Kemendesakan tetap terlihat, dan lewat isyarat yang tak
                    bersaing: garis kiri tebal pada kartunya (`kartuMendesak`)
                    plus pil tingkat yang memang berwarna semantik.
                  */}
                  <View style={[s.pil, s.pilStatus]}>
                    <Text style={[s.pilTeks, s.pilStatusTeks]}>
                      {petaStatus[b.status] ?? b.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {selesai.length > 0 && (
            <Tekan
              onPress={() => setTampilSelesai((v) => !v)}
              style={s.tombolSelesai}
              accessibilityRole="button"
            >
              <Text style={s.tombolSelesaiTeks}>
                {tampilSelesai
                  ? `Sembunyikan ${selesai.length} yang selesai`
                  : `Tampilkan ${selesai.length} yang selesai`}
              </Text>
            </Tekan>
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

      <Tekan
        onPress={() => router.push('/lainnya')}
        style={s.tautan}
        accessibilityRole="button"
      >
        <Text style={s.tautanTeks}>Lapor yang baru →</Text>
      </Tekan>
    </ScrollView>
  );
}

/**
 * Gaya layar ini, dirakit dari palet aktif.
 *
 * Menerima `Palet` alih-alih memanggil `useTema()` sendiri: fungsi ini
 * BUKAN komponen, dan hook di dalamnya akan melanggar aturan hook tanpa
 * galat yang menyebut sebabnya.
 */
function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: SPASI.lg, paddingBottom: 40 },
    tengah: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      padding: SPASI.xxl, backgroundColor: c.surfaceSubtle,
    },
    judulHalaman: {
      fontSize: HURUF.xl, fontFamily: FONT.judul, color: c.textPrimary,
      marginBottom: 14,
    },
    ringkas: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border,
      borderRadius: RADIUS.md, paddingVertical: 14, marginBottom: SPASI.lg,
    },
    ringkasSel: { flex: 1, alignItems: 'center' },
    ringkasGaris: { width: 1, height: 28, backgroundColor: c.border },
    /*
      Angka ringkasan memakai `FONT.judul` (Bricolage Grotesque) — bukan
      font isi yang ditebalkan. Angka adalah hal pertama yang dicari mata
      di layar ini, dan keluarga display memberi tinggi-x serta lebar yang
      lebih tegas pada digit besar.
    */
    ringkasAngka: { fontSize: 22, fontFamily: FONT.judul, color: c.textPrimary },
    ringkasAngkaMerah: { color: c.danger },
    ringkasLabel: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 2,
    },
    kartu: {
      backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border,
      borderRadius: RADIUS.md, padding: 13, marginBottom: 10,
    },
    /* Garis kiri tebal, bukan latar merah penuh: kartunya masih harus terbaca,
       dan latar jenuh membuat teks di atasnya melelahkan di bawah matahari. */
    kartuMendesak: {
      borderColor: c.dangerBorder, borderLeftWidth: 4, borderLeftColor: c.danger,
    },
    kartuBeres: { backgroundColor: c.surfaceHover, borderColor: c.border },
    kartuKepala: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 6,
    },
    /*
      12px, bukan 11.

      Diukur 2026-09-04 lewat potret: 223 elemen teks di layar ini terender
      di bawah 12px, dan SEMUANYA 11px dari tiga gaya di bawah — bukan 223
      keputusan berbeda, melainkan tiga yang terulang di tiap kartu.

      Ambang 12px bukan selera: di bawah itu teks tak terbaca di bawah
      matahari langsung, dan layar ini dibuka di lokasi proyek. Isinya juga
      bukan hiasan — nomor izin kerja, umur temuan, dan tingkat keparahan.
    */
    jenisTag: {
      fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.navy,
      letterSpacing: 0.4, textTransform: 'uppercase',
    },
    usia: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    judul: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal,
      color: c.textPrimary, lineHeight: 20,
    },
    judulBeres: { color: c.textSecondary },
    tempat: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, marginTop: 4,
    },
    kaki: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
    pil: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7 },
    pilTeks: {
      fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.onNavy,
      textTransform: 'capitalize',
    },
    pilStatus: { backgroundColor: c.surfaceHover },
    pilStatusTeks: { color: c.textPrimary, textTransform: 'none' },
    tombolSelesai: {
      marginTop: 6, paddingVertical: SPASI.md, alignItems: 'center',
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surfaceRaised,
    },
    tombolSelesaiTeks: {
      fontSize: HURUF.sm, fontFamily: FONT.isiTebal, color: c.textPrimary,
    },
    catatan: {
      fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary,
      textAlign: 'center', marginTop: 18, lineHeight: 18,
    },
    tautan: { marginTop: SPASI.md, paddingVertical: SPASI.md, alignItems: 'center' },
    tautanTeks: {
      fontSize: HURUF.sm + 1, fontFamily: FONT.isiTebal, color: c.navy,
    },
    kosong: { paddingVertical: 40, alignItems: 'center' },
    kosongJudul: {
      fontSize: HURUF.lg - 1, fontFamily: FONT.judul,
      color: c.textPrimary, marginBottom: 6,
    },
    kosongIsi: {
      fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary,
      lineHeight: 19, textAlign: 'center',
    },
    galat: {
      backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.dangerBorder,
      borderRadius: 10, padding: SPASI.md, marginBottom: 14,
    },
    galatTeks: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.danger, lineHeight: 19 },
    peringatan: {
      backgroundColor: c.warningBg, borderWidth: 1, borderColor: c.warningBorder,
      borderRadius: 10, padding: SPASI.md, marginBottom: 14,
    },
    peringatanTeks: {
      fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.warning, lineHeight: 19,
    },
  });
}
