/**
 * MENU BERBAGI HREF — menandai sub-menu yang belum punya halaman sendiri.
 *
 * ── Keadaan yang ditangani
 *
 * Diukur di database: 23 item menu menunjuk `/proyek`, 14 ke `/mandor`,
 * 13 ke `/procurement`, 13 ke `/estimasi`. Itu bukan data rusak —
 * sub-menu yang belum digarap sengaja dialihkan ke halaman induknya
 * (triase F5-1).
 *
 * Akibatnya di layar: membuka `/proyek` menyalakan 23 item sekaligus,
 * karena semuanya cocok dengan pathname yang sama. Penanda posisi
 * berhenti menunjukkan posisi. Dan orang yang mengklik "Cost Baseline
 * (BAC)" mendarat di halaman Proyek biasa tanpa penjelasan apa pun.
 *
 * ── Kenapa satu perwakilan tetap menyala
 *
 * Percobaan pertama meredupkan SEMUA item yang berbagi href. Hasilnya
 * `/proyek` menampilkan NOL item tersorot — lebih buruk daripada 23,
 * karena setidaknya yang 23 memberi tahu grup mana yang sedang dibuka.
 *
 * ── Kenapa perwakilan dipilih dari kecocokan label
 *
 * Dua percobaan meleset sebelum ini:
 *
 *   1. Item pertama yang ditemui → `/proyek` diwakili "Jaminan
 *      Penawaran", nama yang tak menyiratkan halaman Proyek sama sekali.
 *   2. Item tingkat atas didahulukan → tak berubah, karena item bernama
 *      "Proyek" TIDAK ADA di menu yang dikirim ke klien (tersaring
 *      permission/is_active). Diperiksa dari cache menu di peramban,
 *      bukan disimpulkan dari tabel mentah.
 *
 * Jadi kandidat "bernama persis" belum tentu tersedia. Yang dipilih:
 * label yang paling menyerupai segmen terakhir href. Hasilnya "Manajemen
 * Mandor" untuk `/mandor` dan "Laporan Keuangan" untuk `/laporan` —
 * tidak sempurna untuk semua kasus, tapi masuk akal dan STABIL: ia tak
 * berpindah-pindah saat urutan menu diubah.
 */

export interface SimpulMenu {
  key: string;
  label: string;
  href: string | null;
  children?: SimpulMenu[];
}

/**
 * Seberapa cocok label dengan segmen terakhir href-nya.
 *
 * 3 = persis ("Proyek" ↔ /proyek) · 2 = berawalan sama ·
 * 1 = memuat · 0 = tak berkaitan.
 */
export function skorKecocokan(label: string, href: string): number {
  const segmen = (href.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  if (!segmen) return 0;
  const l = label.toLowerCase();
  if (l === segmen) return 3;
  if (l.startsWith(segmen) || segmen.startsWith(l)) return 2;
  if (l.includes(segmen)) return 1;
  return 0;
}

/** Berapa item menu yang memakai tiap href. */
export function hitungHref(menu: SimpulMenu[]): Map<string, number> {
  const n = new Map<string, number>();
  const telusuri = (nodes: SimpulMenu[]) => {
    for (const x of nodes) {
      if (x.href && x.href !== "#") n.set(x.href, (n.get(x.href) ?? 0) + 1);
      if (x.children?.length) telusuri(x.children);
    }
  };
  telusuri(menu);
  return n;
}

/** href → `key` item yang mewakilinya (yang tetap boleh menyala). */
export function pilihWakil(menu: SimpulMenu[]): Map<string, string> {
  const wakil = new Map<string, string>();
  const skorTerbaik = new Map<string, number>();

  const telusuri = (nodes: SimpulMenu[]) => {
    for (const x of nodes) {
      if (x.href && x.href !== "#") {
        const s = skorKecocokan(x.label, x.href);
        if (!wakil.has(x.href) || s > (skorTerbaik.get(x.href) ?? -1)) {
          wakil.set(x.href, x.key);
          skorTerbaik.set(x.href, s);
        }
      }
      if (x.children?.length) telusuri(x.children);
    }
  };
  telusuri(menu);
  return wakil;
}

/**
 * Item ini belum punya halaman sendiri, jadi jangan disorot dan
 * redupkan tampilannya.
 *
 * `false` untuk href yang cuma dipakai satu item (halaman sungguhan),
 * DAN untuk perwakilan — perwakilan yang ikut diredupkan akan membuat
 * halaman itu tak punya penanda posisi sama sekali.
 */
export function belumPunyaHalaman(
  href: string | null | undefined,
  key: string | undefined,
  jumlah: Map<string, number>,
  wakil: Map<string, string>,
): boolean {
  if (!href || href === "#") return false;
  if ((jumlah.get(href) ?? 0) <= 1) return false;
  return wakil.get(href) !== key;
}
