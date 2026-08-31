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

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await storage.remove('puraloka_token');
      await storage.remove('puraloka_user');
    }
    return Promise.reject(err);
  }
);
