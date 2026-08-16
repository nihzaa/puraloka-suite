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

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await api.post('/api/v1/auth/login', { email, password });
  const { session, user } = res.data;
  await storage.set('puraloka_token', session.access_token);
  if (session.refresh_token) await storage.set('puraloka_refresh', session.refresh_token);
  await storage.set('puraloka_user', JSON.stringify(user));

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

  return user;
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
