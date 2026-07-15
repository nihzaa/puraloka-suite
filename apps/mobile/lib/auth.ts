import { api } from './api';
import { storage } from './storage';

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
  return user;
}

export async function logout(): Promise<void> {
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
