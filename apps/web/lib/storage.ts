import { api } from "@/lib/api";

// Upload foto progress LEWAT API (bukan browser→Supabase langsung).
//
// Sebelumnya file ini upload langsung ke bucket `project-photos` dengan anon key —
// TAPI bucket itu TIDAK PERNAH ADA (OPEN-4), jadi upload SELALU gagal (fitur foto
// tak pernah berfungsi; 36 baris project_photos ternyata seed URL Unsplash).
// Bucket kini dibuat (migration 098) dengan policy KETAT service_role-only, sehingga
// browser tak boleh menulis langsung → upload dialihkan ke API seperti semua upload
// lain di app ini. API mengembalikan signed URL (bucket privat).

/** File → base64 (chunked, aman untuk file besar). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload satu foto progress. THROW bila gagal — pemanggil WAJIB menampilkan error
 * ke user dan MEMBATALKAN submit (jangan ditelan diam-diam; lihat OPEN-4).
 */
export async function uploadProgressPhoto(projectId: string, file: File): Promise<string> {
  return postPhoto(`/api/v1/projects/${projectId}/photos/upload`, file);
}

/**
 * Upload foto DAN langsung tautkan ke progress log yang SUDAH tersimpan (retry).
 * Dipakai saat log berhasil disimpan tapi sebagian foto gagal (sinyal jelek) —
 * mandor bisa coba ulang tanpa kehilangan laporan.
 */
export async function attachProgressPhoto(
  projectId: string,
  progressLogId: string,
  file: File,
  caption?: string,
  /**
   * Koordinat saat foto diambil (INTI #8). OPSIONAL, dan harus tetap begitu:
   * sinyal GPS hilang di basement dan daerah terpencil — persis tempat yang
   * paling perlu didokumentasikan. Foto tanpa koordinat tetap berguna; foto
   * yang tak pernah terunggah tidak.
   *
   * Ambil lewat `useLokasiPerangkat()` di `lib/lokasi-perangkat.ts`.
   */
  lokasi?: { lintang: number; bujur: number; akurasi_m: number | null; sumber_lokasi: string } | null
): Promise<string> {
  return postPhoto(`/api/v1/projects/${projectId}/photos/upload`, file, {
    progress_log_id: progressLogId,
    caption,
    ...(lokasi ?? {}),
  });
}

/**
 * Upload foto nota kasbon tukang. THROW bila gagal (bucket `kasbon-photos`,
 * privat + service_role-only — migration 098).
 */
export async function uploadKasbonPhoto(file: File): Promise<string> {
  return postPhoto("/api/v1/mandor/kasbon-photo/upload", file);
}

async function postPhoto(
  endpoint: string,
  file: File,
  extra?: Record<string, unknown>
): Promise<string> {
  const file_base64 = await fileToBase64(file);
  try {
    const { data } = await api.post<{ url: string }>(endpoint, { file_base64, file_name: file.name, ...extra });
    if (!data?.url) throw new Error("Server tidak mengembalikan URL foto");
    return data.url;
  } catch (err) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      (err instanceof Error ? err.message : "Upload gagal");
    throw new Error(msg);
  }
}
