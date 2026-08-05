import axios from "axios";

export const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  // HttpOnly cookies dikirim otomatis oleh browser untuk same-origin dan
  // cross-origin request jika backend men-set credentials: true di CORS
  withCredentials: true,
});

// ─── Request interceptor: attach token dari localStorage (fallback compat) ────
// Token utama kini di HttpOnly cookie yang dikirim otomatis via withCredentials.
// Interceptor ini hanya sebagai fallback saat transisi (misal: user lama masih
// punya token di localStorage setelah upgrade).
api.interceptors.request.use((config) => {
  // T7 — company switcher: kirim perusahaan yang dipilih user.
  //
  // Header ini adalah PERMINTAAN, bukan penentu. Backend (`resolveCompanyId`)
  // memverifikasinya terhadap keanggotaan user dan membalas 403 bila bukan
  // haknya — jadi nilai palsu di localStorage tidak membuka data perusahaan
  // lain. Tanpa header ini, backend memakai perusahaan default user.
  if (typeof window !== "undefined") {
    const companyId = localStorage.getItem("puraloka_company_id");
    if (companyId) config.headers["x-company-id"] = companyId;
  }
  return config;
});

// ─── Response interceptor: auto token refresh ────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
}

function clearAuthAndRedirect() {
  // Minta server hapus cookie HttpOnly (client tidak bisa hapus sendiri)
  axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/logout`,
    {},
    { withCredentials: true }
  ).catch(() => {});

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

    // Endpoint autentikasi TIDAK boleh ikut alur auto-refresh. 401 dari
    // /auth/login berarti "kredensial salah", bukan "token kedaluwarsa".
    // Tanpa pengecualian ini, salah password memicu: refresh (gagal, 400) →
    // clearAuthAndRedirect() → window.location.href = "/login" → halaman
    // dimuat ulang → pesan "Email atau password salah" IKUT TERHAPUS sebelum
    // sempat terbaca. Itulah sebabnya form terlihat diam saja saat login gagal.
    const url: string = originalRequest?.url ?? "";
    if (/\/auth\/(login|refresh|google-callback)/.test(url)) {
      return Promise.reject(error);
    }

    // Jika refresh sudah dalam proses, antri request ini
    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Kirim refresh request — server baca HttpOnly cookie puraloka_refresh
      // dan set ulang kedua cookie dengan token baru
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        {},
        { withCredentials: true }
      );

      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAuthAndRedirect();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export interface PuralokaUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar_url?: string | null;
}

export async function login(email: string, password: string): Promise<{ user: PuralokaUser; homePortal: string }> {
  const { data } = await api.post("/api/v1/auth/login", { email, password });
  // Token disimpan di HttpOnly cookie oleh server — tidak perlu sentuh cookie di JS
  if (typeof window !== "undefined") {
    localStorage.setItem("puraloka_user", JSON.stringify(data.user));
    localStorage.setItem("puraloka_permissions", JSON.stringify(data.permissions ?? []));
    // Set plain cookie so middleware can read role for redirects
    document.cookie = `puraloka_role=${data.user.role};path=/;max-age=604800;SameSite=Lax`;
  }
  return { user: data.user as PuralokaUser, homePortal: (data.homePortal as string) ?? "dashboard" };
}

export function getStoredPermissions(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function hasPermission(key: string): boolean {
  return getStoredPermissions().has(key);
}

/**
 * Kunci localStorage cache menu + ETag-nya.
 *
 * Ada DI SINI, bukan di `sidebar.tsx` yang memakainya, karena `logout()` di
 * berkas ini wajib membuang keduanya. Kunci yang ditulis literal di dua
 * tempat akan berpisah saat salah satunya di-rename, dan gejalanya senyap:
 * menu tenant lama bertahan setelah orang lain login di perangkat yang sama.
 */
export const MENU_CACHE_KEY = "puraloka_menu";
export const MENU_ETAG_KEY = "puraloka_menu_etag";

export function logout() {
  // Minta server hapus HttpOnly cookie
  api.post("/api/v1/auth/logout").catch(() => {});
  if (typeof window !== "undefined") {
    localStorage.removeItem("puraloka_user");
    localStorage.removeItem("puraloka_permissions");
    // T7: pilihan perusahaan ikut dibuang. Kalau tertinggal, orang berikutnya
    // yang login di perangkat ini mengirim x-company-id milik user sebelumnya
    // dan langsung ditolak 403 — aman, tapi ia terkunci tanpa tahu sebabnya.
    localStorage.removeItem("puraloka_company_id");
    // Cache menu + ETag-nya ikut dibuang.
    //
    // Katalog menu berbeda per perusahaan (`company_menu_settings`), jadi
    // meninggalkannya berarti orang berikutnya yang login di perangkat ini
    // melihat struktur menu perusahaan SEBELUMNYA sampai revalidasi selesai.
    //
    // Dengan ETag, membiarkannya lebih buruk lagi: peramban mengirim
    // `If-None-Match` milik tenant lama, dan bila muatannya kebetulan sama
    // server membalas 304 — menu lama bertahan tanpa pernah diperbarui, dan
    // tak ada satu pun pesan galat yang memberi tahu siapa pun.
    localStorage.removeItem(MENU_CACHE_KEY);
    localStorage.removeItem(MENU_ETAG_KEY);
    document.cookie = "puraloka_role=;path=/;max-age=0";
  }
}

export function getStoredUser(): PuralokaUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("puraloka_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PuralokaUser;
  } catch {
    // MEDIUM-5: Data corrupt atau di-tamper — hapus dan paksa login ulang
    localStorage.removeItem("puraloka_user");
    return null;
  }
}

// ─── Request cancellation helper ─────────────────────────────────────────────
// Pakai di useEffect: const ctrl = makeAbortController(); api.get(..., { signal: ctrl.signal })
// return () => ctrl.abort()
export function makeAbortController() {
  return new AbortController()
}

// ─── Progress Log types ───────────────────────────────────────────────────────

export interface ProgressPhoto {
  id: string;
  url: string;
  caption: string | null;
  taken_at: string | null;
}

export interface ProgressLog {
  id: string;
  pct_overall: number;
  weather: string | null;
  worker_count: number | null;
  notes: string | null;
  logged_at: string;
  created_at: string;
  reporter: { id: string; name: string; role: string } | null;
  photos: ProgressPhoto[];
}

export interface ProgressLogMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateProgressLogPayload {
  mode?: "daily" | "detail";
  pct_overall?: number;
  // mode=detail fields
  rab_item_id?: string;
  pct_completion?: number;
  // common fields
  weather?: string;
  worker_count?: number;
  notes?: string;
  logged_at?: string;
  photos?: Array<{ url: string; caption?: string; taken_at?: string }>;
}

// ─── Progress Log API functions ───────────────────────────────────────────────

export async function getProgressLogs(
  projectId: string,
  page = 1,
  limit = 20
): Promise<{ data: ProgressLog[]; meta: ProgressLogMeta }> {
  const { data } = await api.get<{ data: ProgressLog[]; meta: ProgressLogMeta }>(
    `/api/v1/projects/${projectId}/progress-logs`,
    { params: { page, limit } }
  );
  return data;
}

export async function createProgressLog(
  projectId: string,
  payload: CreateProgressLogPayload
): Promise<{ data: ProgressLog }> {
  const { data } = await api.post<{ data: ProgressLog }>(
    `/api/v1/projects/${projectId}/progress-logs`,
    payload
  );
  return data;
}

export async function deleteProgressLog(
  projectId: string,
  logId: string
): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(
    `/api/v1/projects/${projectId}/progress-logs/${logId}`
  );
  return data;
}

// ─── Milestone types ──────────────────────────────────────────────────────────

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  target_date: string;
  completed_at: string | null;
  status: string;
  sort_order: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: { id: string; name: string } | null;
}

export interface CreateMilestonePayload {
  title: string;
  description?: string;
  target_date: string;
  sort_order?: number;
}

export interface UpdateMilestonePayload {
  title?: string;
  description?: string;
  target_date?: string;
  completed_at?: string | null;
  status?: string;
  sort_order?: number;
}

// ─── Milestone API functions ──────────────────────────────────────────────────

export async function getMilestones(
  projectId: string
): Promise<{ data: Milestone[] }> {
  const { data } = await api.get<{ data: Milestone[] }>(
    `/api/v1/projects/${projectId}/milestones`
  );
  return data;
}

export async function createMilestone(
  projectId: string,
  payload: CreateMilestonePayload
): Promise<{ data: Milestone }> {
  const { data } = await api.post<{ data: Milestone }>(
    `/api/v1/projects/${projectId}/milestones`,
    payload
  );
  return data;
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  payload: UpdateMilestonePayload
): Promise<{ data: Milestone }> {
  const { data } = await api.patch<{ data: Milestone }>(
    `/api/v1/projects/${projectId}/milestones/${milestoneId}`,
    payload
  );
  return data;
}

export async function deleteMilestone(
  projectId: string,
  milestoneId: string
): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(
    `/api/v1/projects/${projectId}/milestones/${milestoneId}`
  );
  return data;
}

// ─── Contract generation ──────────────────────────────────────────────────────

export async function generateContract(
  projectId: string,
  params: Record<string, string | number>
): Promise<Blob> {
  const res = await api.get(
    `/api/v1/projects/${projectId}/contracts/generate`,
    { params, responseType: 'blob' }
  );
  return res.data as Blob;
}
