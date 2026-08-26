import { api } from './api';
import { storage } from './storage';
import { daftarkanPerangkat, cabutPerangkat } from './push';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'pm' | 'mandor' | 'client';
  avatar_url?: string;
}

/**
 * Kunci izin milik pengguna yang sedang login.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA IZIN, BUKAN PERAN (ADR-004)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `(app)/_layout.tsx` dulu menentukan tab dari literal peran:
 *
 *     const showMandorTabs = role === 'mandor' || role === 'admin'
 *     const showPMTabs     = role === 'pm'     || role === 'admin'
 *
 * ADR-004 melarang itu, dan alasannya bukan kerapian: **peran adalah data
 * konfigurasi per-tenant**, bukan konstanta. Tenant yang membuat peran
 * `direktur` atau `kepala_proyek` lewat UI — yang memang boleh, dan sudah
 * bisa sejak migrasi role FK — akan melihat aplikasi mobile TANPA SATU TAB
 * PUN selain dashboard, proyek, dan notifikasi. Tak ada galat; menunya
 * sekadar tak ada.
 *
 * Yang menyakitkan: server SUDAH mengirim daftar izinnya sejak dulu
 * (`auth.ts:106` memulangkan `permissions`), dan aplikasi mobile
 * MEMBUANGNYA. Data yang benar sudah sampai di perangkat, lalu diabaikan.
 *
 * Bentuknya sengaja meniru `apps/web/lib/api.ts` — `getStoredPermissions()`
 * + `hasPermission()` atas kunci penyimpanan yang setara. Dua klien yang
 * membaca kontrak yang sama sebaiknya membacanya dengan cara yang sama.
 */
const KUNCI_IZIN = 'puraloka_permissions';

export async function getStoredPermissions(): Promise<Set<string>> {
  const raw = await storage.get(KUNCI_IZIN);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    // Bukan-array (mis. objek dari versi lama) diperlakukan sebagai KOSONG,
    // bukan dilempar: izin yang tak terbaca harus menutup pintu, tidak
    // membuka semuanya. Gagal-tertutup — Ember [C], CLAUDE.md §5.3.
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/*
  Memulangkan izin BERSAMA user, bukan hanya menyimpannya diam-diam.

  Kalau `login()` hanya menulis ke penyimpanan, layar login harus ingat
  membacanya kembali — dan yang harus diingat akan terlupakan. Dengan
  dipulangkan, pemanggilnya tak bisa memasang user tanpa izinnya.
*/
export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser; izin: Set<string> }> {
  const res = await api.post('/api/v1/auth/login', { email, password });
  const { session, user, permissions } = res.data;
  await storage.set('puraloka_token', session.access_token);
  if (session.refresh_token) await storage.set('puraloka_refresh', session.refresh_token);
  await storage.set('puraloka_user', JSON.stringify(user));
  await storage.set(KUNCI_IZIN, JSON.stringify(permissions ?? []));

  /*
    Daftarkan perangkat SESUDAH token sesi tersimpan.

    Urutannya mengikat: `api` menyisipkan `Authorization` dari
    `puraloka_token` lewat interceptor, jadi mendaftar sebelum baris di atas
    akan mengirim permintaan tanpa header dan dibalas 401 — pendaftaran gagal
    diam-diam pada login yang justru berhasil.

    TIDAK di-`await`. Login tak boleh menunggu dialog izin sistem: pengguna
    yang mengabaikan dialognya akan melihat aplikasi menggantung di layar
    login. `daftarkanPerangkat` sudah menelan seluruh errornya sendiri.
  */
  void daftarkanPerangkat();

  return { user, izin: new Set<string>(Array.isArray(permissions) ? permissions : []) };
}

export async function logout(): Promise<void> {
  // Cabut DULU, selagi token sesi masih ada — permintaan DELETE butuh
  // `Authorization`, dan menghapusnya lebih dulu membuat pencabutan dibalas
  // 401. Di-`await` (tidak seperti saat login) karena setelah baris berikutnya
  // kesempatannya hilang; ia sudah menelan errornya sendiri, jadi logout tetap
  // berlanjut kalau jaringan mati.
  await cabutPerangkat();

  await storage.remove('puraloka_token');
  await storage.remove('puraloka_refresh');
  await storage.remove('puraloka_user');
  /*
    Izin WAJIB ikut dibuang.

    Kalau tertinggal, orang berikutnya yang login di HP yang sama memulai
    dengan izin milik pemakai sebelumnya sampai `login()` menimpanya — dan di
    HP proyek yang dipegang bergantian, itu bukan kemungkinan teoretis.
    Alasan yang sama membuat `apps/web/lib/api.ts` membuangnya saat logout.
  */
  await storage.remove(KUNCI_IZIN);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await storage.get('puraloka_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
