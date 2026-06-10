import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

// ─── Request interceptor: attach token ────────────────────────────────────────

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getCookie("puraloka_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: auto token refresh ────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
}

function clearAuthAndRedirect() {
  deleteCookie("puraloka_token");
  deleteCookie("puraloka_refresh");
  if (typeof window !== "undefined") {
    localStorage.removeItem("puraloka_user");
    window.location.href = "/login";
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If another refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers["Authorization"] = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = getCookie("puraloka_refresh");

    if (!refreshToken) {
      isRefreshing = false;
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken }
      );

      const newToken: string = data.session.access_token;
      const newRefresh: string = data.session.refresh_token;

      setCookie("puraloka_token", newToken);
      setCookie("puraloka_refresh", newRefresh);

      api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      originalRequest.headers["Authorization"] = `Bearer ${newToken}`;

      processQueue(null, newToken);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearAuthAndRedirect();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((r) => r.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

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
  setCookie("puraloka_token", data.session.access_token);
  setCookie("puraloka_refresh", data.session.refresh_token);
  if (typeof window !== "undefined") {
    localStorage.setItem("puraloka_user", JSON.stringify(data.user));
  }
  return data.user as PuralokaUser;
}

export function logout() {
  deleteCookie("puraloka_token");
  deleteCookie("puraloka_refresh");
  if (typeof window !== "undefined") {
    localStorage.removeItem("puraloka_user");
  }
}

export function getStoredUser(): PuralokaUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("puraloka_user");
  return raw ? JSON.parse(raw) : null;
}
