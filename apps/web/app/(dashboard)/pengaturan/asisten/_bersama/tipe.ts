/**
 * Kosakata bersama halaman Asisten — dipakai layout dan keempat sub-halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIPECAH JADI EMPAT HALAMAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-11 seluruhnya hidup di SATU halaman setinggi **4.566 px** —
 * hampir lima layar penuh. Untuk mengubah asisten web, orang harus menggulir
 * melewati pengaturan global, wawasan portofolio, asisten pemilik, dan
 * asisten staf. Semua kartu terlihat sama, jadi tak ada penanda sudah sampai
 * di mana.
 *
 * TJS memisahnya sejak awal — `settings/owner-ai`, `settings/staff-ai`,
 * `settings/web-ai` — dan founder memilih mengikuti itu ("tetap ikuti TJS
 * biar lebih enak"). Alasannya bukan selera: keempat asisten adalah
 * **kanal yang berbeda**, bukan varian satu sama lain.
 *
 *   pemilik   WhatsApp, penanya adalah pemilik perusahaan
 *   staf      WhatsApp, penanya adalah orang lapangan/kantor
 *   web       dashboard, penanya siapa pun yang login
 *   wawasan   TIDAK ada penanya — ia menulis ringkasan di beranda
 *
 * Yang terakhir paling menjelaskan: "wawasan" tak memakai tool sama sekali,
 * jadi separuh kontrol di halaman gabungan tak berlaku untuknya — dan itu
 * hanya bisa diketahui dengan membaca kalimat kecil di bawah kotaknya.
 */

/** Satu tool yang boleh dipakai asisten. */
export interface ToolTersedia {
  nama: string;
  keterangan: string;
  /** Izin yang tetap harus dipegang penanya — tool tak menembus otorisasi. */
  izin: string;
}

export interface Konfigurasi {
  asisten: string;
  prompt_sistem: string | null;
  maks_ronde: number;
  /** `null` = seluruh tool yang berizin. Bukan "tak ada satu pun". */
  tool_aktif: string[] | null;
  tersimpan: boolean;
  penyedia: string;
  model: string;
  max_token: number;
  aktif: boolean;
  batas_bulanan_idr: number | null;
  mode_batas: "blokir" | "peringatkan";
}

export interface Muatan {
  data: Konfigurasi[];
  tool_tersedia: ToolTersedia[];
}

export interface PengaturanTenant {
  ai_aktif: boolean;
  retensi_hari: number | null;
}

/** Kunci asisten → nama yang dibaca orang. */
export const PERAN: Record<string, string> = {
  insight: "Wawasan portofolio",
  owner: "Asisten pemilik",
  staff: "Asisten staf",
  web: "Asisten web",
};

/**
 * Kunci asisten → slug rute.
 *
 * Rutenya berbahasa Indonesia sementara kunci datanya Inggris. Itu disengaja:
 * kunci `owner`/`staff`/`web` adalah **kontrak dengan API** (`/ai/config/:asisten`)
 * dan mengubahnya berarti migrasi data, sedangkan URL dibaca pengguna.
 */
export const SLUG: Record<string, string> = {
  owner: "pemilik",
  staff: "staf",
  web: "web",
  insight: "wawasan",
};

/** Kebalikan `SLUG` — dipakai tiap halaman untuk menemukan konfignya. */
export const DARI_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG).map(([k, v]) => [v, k]),
);

/**
 * Asisten yang benar-benar memakai tool. `insight` tidak — ia menulis dari
 * angka yang sudah dihitung sistem, jadi batas langkah dan pilihan data tak
 * berlaku untuknya.
 */
export const PAKAI_TOOL = new Set(["owner", "staff", "web"]);

/** Kalimat pembeda tiap asisten — dipakai sebagai keterangan halaman. */
export const KETERANGAN: Record<string, string> = {
  owner:
    "Menjawab pertanyaan lintas proyek lewat WhatsApp dan menyiapkan tindakan untuk disetujui.",
  staff:
    "Asisten untuk orang lapangan dan kantor. Kanal WhatsApp sendiri, batas datanya lebih sempit dari asisten pemilik.",
  web: "Asisten di dalam dashboard. Penanyanya siapa pun yang login — batasnya mengikuti izin orang itu.",
  insight:
    "Menulis dua kalimat penilaian di beranda dari angka yang sudah dihitung sistem. Tidak memakai tool.",
};
