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

// ─── Company aktif: DIISI, bukan hanya dibaca ────────────────────────────────
//
// ══════════════════════════════════════════════════════════════════════════
// Cacat yang ditutup di sini, diukur 2026-08-13
// ══════════════════════════════════════════════════════════════════════════
//
// `puraloka_company_id` dibaca EMPAT berkas — `api.ts` (header x-company-id),
// `data-cache.ts`, `antrean-offline.ts`, `antrean-foto.ts` — tetapi hanya
// DITULIS satu tempat: `company-switcher.tsx`, saat pengguna BERGANTI
// perusahaan.
//
// Artinya pengguna yang tak pernah berganti — mayoritas, dan SELURUH mandor,
// karena switcher-nya memang tak dirender di portal mandor — tak pernah punya
// kunci itu. Diukur di peramban nyata: nol kunci ber-"company" di localStorage
// sesudah login.
//
// Akibatnya bukan header yang hilang (backend punya default yang benar),
// melainkan ANTREAN OFFLINE yang tak terlihat: `antreanAktif()` menyaring
// dengan company kosong, tak menemukan apa pun, dan lencana "menunggu sinyal"
// tak pernah muncul. Mandor mengira kirimannya sudah sampai.
//
// Diisi di sini — bukan di switcher — karena inilah satu-satunya jalur yang
// dilewati semua halaman, termasuk portal mandor.
export function simpanCompanyAktif(id: string | null | undefined): void {
  if (typeof window === "undefined" || !id) return;
  try {
    if (localStorage.getItem("puraloka_company_id") !== id) {
      localStorage.setItem("puraloka_company_id", id);
    }
  } catch {
    // best-effort: mode privat tertentu menolak menulis localStorage, dan
    // itu BUKAN alasan menjatuhkan permintaannya — header tetap terkirim
    // tanpa nilai, dan backend memakai default penggunanya.
    //
    // Memberi tahu pengguna di sini justru merugikan: ia tak menekan tombol
    // apa pun (fungsi ini dipanggil dari interceptor tiap balasan), jadi
    // pesan galat akan muncul tanpa sebab yang bisa ia hubungkan dengan
    // tindakannya, berulang kali, atas sesuatu yang tak bisa ia perbaiki.
  }
}

api.interceptors.response.use((res) => {
  // Balasan `my/companies` membawa `active_company_id` yang sudah
  // diverifikasi server terhadap keanggotaan pengguna — sumber yang lebih
  // dipercaya daripada tebakan sisi klien.
  const data = res.data as { active_company_id?: string } | undefined;
  if (data?.active_company_id) simpanCompanyAktif(data.active_company_id);
  return res;
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

/*
  ══════════════════════════════════════════════════════════════════════════
  PUTARAN MUAT-ULANG TANPA AKHIR — kenapa fungsi ini menunggu, dan menahan
  ══════════════════════════════════════════════════════════════════════════

  Dilaporkan founder 2026-09-04: `/dashboard` "reload terus". Direproduksi
  dengan merusak `puraloka_token` (meniru token yang KEDALUWARSA sesudah ~1
  jam, sementara cookie-nya sendiri berumur 7 hari):

      120 navigasi dalam 20 detik — kira-kira 3x per detik, tanpa henti.

  Urutannya terekam utuh dari browser sungguhan:

      200 GET  /dashboard
      401 GET  /api/v1/menu          (dan 6 endpoint lain)
      400 POST /api/v1/auth/refresh  ← refresh token juga tak sah lagi
      200 POST /api/v1/auth/logout   ← DIKIRIM, tapi tak ditunggu
      307 GET  /login                ← middleware melempar BALIK ke /dashboard
      200 GET  /dashboard            ← mulai lagi dari atas

  Simpul putarannya baris `307`. `middleware.ts` hanya memeriksa cookie ADA
  atau tidak — bukan apakah tokennya masih sah — jadi selama cookie belum
  terhapus, `/login` selalu dilempar balik ke home. Dan cookie belum terhapus
  karena `logout` dipanggil TANPA `await`: `window.location.href` menang
  balapan, halaman berpindah sebelum balasan `Set-Cookie` sempat diterapkan.

  Tiga hal yang diperbaiki di sini, dan ketiganya perlu:

  1. `await` logout — supaya cookie benar-benar hilang SEBELUM pindah halaman.
     Ini yang memutus simpulnya.
  2. `puraloka_role` dihapus dari sisi klien. Ia BUKAN HttpOnly (dipasang
     `login()` lewat `document.cookie`), jadi server tak menghapusnya, dan
     middleware membacanya untuk menentukan home. Tertinggal, ia ikut
     menghidupkan pelemparan balik.
  3. Penahan `sudahDialihkan` + pemeriksaan "sudah di /login?". Tujuh
     permintaan gagal berbarengan; tanpa penahan, ketujuhnya masing-masing
     memanggil `window.location.href` — dan kalau satu saja lolos setelah
     halaman `/login` termuat, putarannya lahir kembali dari ujung yang lain.

  Yang SENGAJA tidak dilakukan: menaruh verifikasi masa berlaku token di
  middleware. Itu memindahkan pemeriksaan kripto ke edge runtime tiap
  permintaan, dan tetap tak menolong bila jam server dan klien berbeda.
  Sumber kebenaran masa berlaku tetap API — yang harus benar cuma reaksinya
  saat API bilang "tidak".
*/
let sudahDialihkan = false;

async function clearAuthAndRedirect() {
  if (typeof window === "undefined") return;

  // Tujuh permintaan bisa gagal berbarengan; cukup satu yang mengalihkan.
  if (sudahDialihkan) return;
  sudahDialihkan = true;

  localStorage.removeItem("puraloka_user");
  localStorage.removeItem("puraloka_permissions");

  // `puraloka_role` dipasang JS (bukan HttpOnly), jadi server tak bisa
  // menghapusnya — dan middleware memakainya untuk memilih home.
  document.cookie = "puraloka_role=;path=/;max-age=0;SameSite=Lax";

  /*
    DITUNGGU, bukan fire-and-forget. Cookie HttpOnly hanya bisa dihapus
    server, dan selama ia masih ada middleware melempar `/login` balik ke
    home — itulah putarannya. `catch` tetap ada: logout yang gagal tak boleh
    menahan orang di halaman yang sudah tak bisa memuat apa pun.
  */
  try {
    /*
      SAMA-ORIGIN, bukan `NEXT_PUBLIC_API_URL`. Ini yang sesungguhnya
      memutus putaran — lihat blok penjelasan di atas fungsi ini.

      Cookie dipasang saat login lewat `api` (baseURL ""), jadi domainnya
      `app.puraloka-suite.duckdns.org`. Memanggil logout ke
      `api.puraloka-suite.duckdns.org` menghapus cookie DOMAIN ITU — yang
      tak pernah ada. Cookie di `app` tak tersentuh, dan sesinya hidup terus.

      Terukur 2026-09-04, sesudah header `Secure` diperbaiki di server:

          set-cookie: puraloka_token=; Max-Age=0; ... HttpOnly; Secure
          → balasan 200, header BENAR
          → cookie akhir di peramban: ['puraloka_token','puraloka_refresh']

      Header yang sempurna, dikirim ke domain yang salah.
    */
    await api.post("/api/v1/auth/logout", {});
  } catch {
    /* diabaikan sengaja — lihat komentar di atas */
  }

  // Sudah di /login? Memuat ulang halaman yang sama hanya mengulang putaran.
  if (window.location.pathname.startsWith("/login")) return;

  window.location.href = "/login";
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
    /*
      `logout` WAJIB ada di daftar ini sejak ia dipanggil lewat `api`
      (sama-origin) alih-alih `axios` telanjang.

      Tanpa itu, logout yang membalas 401 masuk ke interceptor ini →
      memanggil refresh → gagal → `clearAuthAndRedirect` → logout lagi.
      Rekursi yang bentuknya sama persis dengan putaran yang sedang
      diperbaiki, cuma lebih dalam.
    */
    if (/\/auth\/(login|logout|refresh|google-callback)/.test(url)) {
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
      /*
        SAMA-ORIGIN juga, dan alasannya sama seperti logout: `/auth/refresh`
        MEMASANG cookie baru saat berhasil, dan MENGHAPUSNYA saat gagal.
        Lewat domain lain, keduanya meleset — cookie baru mendarat di domain
        yang tak dibaca middleware, dan penghapusannya tak mengenai apa pun.
      */
      await api.post("/api/v1/auth/refresh", {});

      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      // DITUNGGU: fungsinya kini async karena harus memastikan cookie
      // HttpOnly terhapus SEBELUM pindah halaman. Tanpa `await`, kita kembali
      // ke balapan yang melahirkan putaran muat-ulang itu.
      await clearAuthAndRedirect();
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
    // Cache app-shell service worker ikut dibuang — kalau tidak, orang
    // berikutnya yang login di perangkat ini bisa mendapat fallback shell
    // offline milik tenant/sesi sebelumnya sampai SW berikutnya `activate`
    // (lihat sw.js — sweep versi lama baru jalan di titik itu, bukan di sini).
    if ("caches" in window) {
      caches.delete("puraloka-shell-v1").catch(() => {});
    }
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
