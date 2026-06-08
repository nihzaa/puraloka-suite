import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

// Sisipkan token otomatis di setiap request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("puraloka_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface PuralokaUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "pm" | "mandor" | "client";
  avatar_url?: string | null;
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/api/v1/auth/login", { email, password });
  if (typeof window !== "undefined") {
    localStorage.setItem("puraloka_token", data.session.access_token);
    localStorage.setItem("puraloka_refresh", data.session.refresh_token);
    localStorage.setItem("puraloka_user", JSON.stringify(data.user));
  }
  return data.user as PuralokaUser;
}

export function logout() {
  localStorage.removeItem("puraloka_token");
  localStorage.removeItem("puraloka_refresh");
  localStorage.removeItem("puraloka_user");
}

export function getStoredUser(): PuralokaUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("puraloka_user");
  return raw ? JSON.parse(raw) : null;
}