import axios from 'axios';
import { storage } from './storage';

/*
  ══════════════════════════════════════════════════════════════════════════
  ALAMAT API — dan kenapa bawaan `localhost` BERBAHAYA di aplikasi terpasang
  ══════════════════════════════════════════════════════════════════════════

  Bentuk sebelumnya: `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'`.

  Di komputer pengembang itu wajar. Di HP mandor, `localhost` adalah HP-NYA
  SENDIRI — jadi tiap permintaan gagal dengan galat jaringan yang menuduh
  SERVER, padahal aplikasinya tak pernah keluar dari perangkat.

  Dan kegagalannya muncul SESUDAH aplikasi disebar, di tangan orang yang tak
  punya cara memeriksanya. Diukur 2026-08-19: `apps/mobile/.env` berisi
  persis `http://localhost:3001`, jadi build yang dibuat hari itu akan rusak
  di setiap HP.

  `__DEV__` memisahkan keduanya: bawaan localhost hanya untuk pengembangan.
  Pada build rilis, alamat yang kosong DINYATAKAN — bukan ditebak.
*/
const API_URL = process.env.EXPO_PUBLIC_API_URL
  ?? (__DEV__ ? 'http://localhost:3001' : '');

if (!API_URL) {
  // Dilempar saat modul dimuat, bukan didiamkan sampai permintaan pertama.
  // Aplikasi yang terbuka lalu gagal diam-diam di layar ketiga jauh lebih
  // sulit dilaporkan mandor daripada aplikasi yang menolak berjalan.
  throw new Error(
    'EXPO_PUBLIC_API_URL belum diisi saat build. Aplikasi tak tahu ke mana '
    + 'harus mengirim data. Isi di eas.json (bagian env profil yang dipakai) '
    + 'lalu build ulang.',
  );
}

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  /*
    `X-Client: mobile` memberi tahu API bahwa klien ini tak bisa memakai
    cookie, sehingga `POST /auth/login` memulangkan `access_token` di badan.

    Tanpa header ini, login memulangkan `session: { expires_at }` saja —
    token hanya dikirim sebagai cookie HttpOnly, yang benar untuk browser
    (XSS tak bisa membacanya) dan mustahil untuk aplikasi ini.

    Diukur 2026-09-01: tanpa header, mobile menyimpan `undefined` sebagai
    token dan SETIAP permintaan dijawab 401. Aplikasi ini tak pernah bisa
    login sekali pun sejak ditulis, dan tak ada galat yang menyebutnya —
    layar login menampilkan pesan kredensial, seolah sandinya salah.

    Dikirim pada SEMUA permintaan, bukan hanya login: bawaan yang bergantung
    pada satu tempat mudah terlewat saat rute baru ditambahkan.
  */
  config.headers['X-Client'] = 'mobile';

  const token = await storage.get('puraloka_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/*
  ══════════════════════════════════════════════════════════════════════════
  401 → PERBARUI TOKEN, bukan langsung buang sesi
  ══════════════════════════════════════════════════════════════════════════

  Versi sebelumnya menghapus token begitu ada 401. Itu benar untuk layar
  biasa — pengguna tinggal masuk lagi. Tapi ia merusak ANTREAN OFFLINE, dan
  kerusakannya diam:

    1. mandor lapor dari lokasi tanpa sinyal → masuk antrean
    2. token kedaluwarsa (sesi Supabase lazimnya satu jam)
    3. antrean mengirim → 401
    4. antrean menaikkan `percobaan` — benar untuk 4xx, karena mengulang
       muatan salah bentuk akan gagal selamanya
    5. sesudah lima kali → "perlu diperiksa", dengan pesan `HTTP 401` yang
       tak berarti apa-apa bagi mandor

  Laporannya benar. Yang salah cuma tokennya.

  ── Dasarnya baru ADA hari ini

  `refresh_token` disimpan `auth.ts` sejak awal dan TAK PERNAH sampai:
  login hanya mengirim token lewat cookie, dan mobile tak memakai cookie.
  Diperbaiki 5657ba06 lewat header `X-Client: mobile`.

  Sesudah itu, seluruh rantai diuji terhadap API sungguhan:

      refresh_token diterima mobile   ADA
      POST /auth/refresh              200
      access_token baru               ADA
      dipakai GET /projects           200

  Versi pertama penyegaran ini saya tulis SEBELUM temuan itu, lalu saya
  mundurkan — kodenya benar tetapi berdiri di atas token yang tak pernah
  ada. Ini penulisan ulangnya di atas dasar yang terbukti.

  ── Kenapa satu percobaan, bukan berulang

  Kalau refresh juga gagal, sesi memang habis dan pengguna harus masuk lagi.
  Mengulanginya hanya menunda kesimpulan yang sama.

  `_ulang` menandai permintaan yang sudah pernah dicoba ulang, supaya 401
  kedua tak memicu putaran tanpa akhir.
*/
let sedangMenyegarkan: Promise<string | null> | null = null;

async function segarkanToken(): Promise<string | null> {
  /*
    Satu permintaan penyegaran untuk banyak panggilan yang gagal bersamaan.
    Antrean mengirim beberapa kiriman sekaligus; tanpa ini, sepuluh kiriman
    memicu sepuluh refresh — dan sembilan di antaranya memakai refresh_token
    yang sudah dipakai. Supabase memutarnya, jadi yang belakangan ditolak.
  */
  if (sedangMenyegarkan) return sedangMenyegarkan;

  sedangMenyegarkan = (async () => {
    try {
      const refresh = await storage.get('puraloka_refresh');
      if (!refresh) return null;

      /*
        axios POLOS, bukan `api` — kalau lewat `api`, 401 dari rute refresh
        memicu interceptor ini lagi dan berputar tanpa akhir.
      */
      const r = await axios.post(
        `${API_URL}/api/v1/auth/refresh`,
        { refresh_token: refresh },
        { headers: { 'X-Client': 'mobile' } },
      );
      const baru = r.data?.session?.access_token as string | undefined;
      if (!baru) return null;

      await storage.set('puraloka_token', baru);
      const refreshBaru = r.data?.session?.refresh_token as string | undefined;
      if (refreshBaru) await storage.set('puraloka_refresh', refreshBaru);
      return baru;
    } catch {
      return null;
    } finally {
      sedangMenyegarkan = null;
    }
  })();

  return sedangMenyegarkan;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const asli = err.config as (typeof err.config & { _ulang?: boolean }) | undefined;

    if (err.response?.status === 401 && asli && !asli._ulang) {
      const baru = await segarkanToken();
      if (baru) {
        asli._ulang = true;
        asli.headers = { ...(asli.headers ?? {}), Authorization: `Bearer ${baru}` };
        return api.request(asli);
      }
      /*
        Refresh gagal — sesi benar-benar habis. Token dibuang seperti
        sebelumnya, DAN antrean dibiarkan utuh: kirimannya masih sah dan
        akan terkirim begitu pengguna masuk lagi.
      */
      await storage.remove('puraloka_token');
      await storage.remove('puraloka_refresh');
      await storage.remove('puraloka_user');
    }
    return Promise.reject(err);
  }
);
