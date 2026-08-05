"use client";

/**
 * PAGINASI — navigasi halaman untuk daftar panjang.
 *
 * ── Kenapa jadi komponen bersama
 *
 * `/audit` sudah punya paginasi yang baik. `/keuangan/kasbon` tidak, dan
 * akibatnya halaman itu **9.083px** — dua kali lipat halaman terpanjang
 * berikutnya, sembilan layar gulir untuk mencari satu kasbon.
 *
 * Menyalin blok dari `/audit` akan bekerja, tapi salinan kedua berarti
 * tiap perbaikan harus dikerjakan dua kali dan yang kedua selalu terlupa.
 * Bukti bahwa itu nyata: versi di `/audit` memakai `background: "#fff"`
 * dipaku — tombol halaman aktif tetap PUTIH di mode gelap. Diangkat ke
 * sini, cacat itu diperbaiki sekali untuk semua pemakainya.
 *
 * ── Kenapa maksimal 7 nomor
 *
 * Daftar 40 halaman yang menampilkan 40 tombol menghabiskan lebar dan
 * tak menolong siapa pun: tak ada yang melompat ke halaman 27 karena
 * ingat isinya. Yang dibutuhkan adalah "mundur satu", "maju satu", dan
 * gambaran posisi — itu yang diberikan jendela 7 nomor plus keterangan
 * "Hal. N dari M".
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

export function Paginasi({
  halaman, totalHalaman, totalEntri, satuan = "entri", onPindah,
}: {
  halaman: number;
  totalHalaman: number;
  /** Untuk keterangan "· 1.234 entri". Kosongkan bila tak diketahui. */
  totalEntri?: number;
  /** Kata benda yang dihitung — "entri", "kasbon", "invoice". */
  satuan?: string;
  onPindah: (halamanBaru: number) => void;
}) {
  if (totalHalaman <= 1) return null;

  // Jendela geser: awal, akhir, atau berpusat pada halaman aktif.
  const jumlahTombol = Math.min(totalHalaman, 7);
  const nomor = Array.from({ length: jumlahTombol }, (_, i) =>
    totalHalaman <= 7 ? i + 1
      : halaman <= 4 ? i + 1
      : halaman >= totalHalaman - 3 ? totalHalaman - 6 + i
      : halaman - 3 + i,
  );

  const gayaPanah = (nonaktif: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    minWidth: 34, height: 34,
    padding: "6px 12px", borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: nonaktif ? "var(--text-muted)" : "var(--text-secondary)",
    cursor: nonaktif ? "not-allowed" : "pointer",
    opacity: nonaktif ? 0.5 : 1,
  });

  return (
    <nav
      aria-label="Navigasi halaman"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, marginTop: 16, flexWrap: "wrap",
      }}
    >
      <button
        aria-label="Halaman sebelumnya"
        disabled={halaman <= 1}
        onClick={() => onPindah(halaman - 1)}
        style={gayaPanah(halaman <= 1)}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>

      {nomor.map((p) => {
        const aktif = p === halaman;
        return (
          <button
            key={p}
            onClick={() => onPindah(p)}
            // `aria-current` bukan hiasan: tanpa itu pemakai pembaca layar
            // tak tahu halaman mana yang sedang terbuka — warna tak terbaca.
            aria-current={aktif ? "page" : undefined}
            aria-label={`Halaman ${p}`}
            style={{
              width: 34, height: 34, borderRadius: 6,
              border: aktif ? "none" : "1px solid var(--border)",
              // `var(--surface)`, BUKAN `#fff` dipaku — versi lama di
              // `/audit` memakai putih literal dan tetap putih di mode gelap.
              background: aktif ? "var(--navy)" : "var(--surface)",
              color: aktif ? "var(--on-navy)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: aktif ? 700 : 400, cursor: "pointer",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p}
          </button>
        );
      })}

      <button
        aria-label="Halaman berikutnya"
        disabled={halaman >= totalHalaman}
        onClick={() => onPindah(halaman + 1)}
        style={gayaPanah(halaman >= totalHalaman)}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>

      <span style={{
        fontSize: 12, color: "var(--text-muted)", marginLeft: 4,
        fontVariantNumeric: "tabular-nums",
      }}>
        Hal. {halaman} dari {totalHalaman}
        {totalEntri != null && <> · {totalEntri.toLocaleString("id-ID")} {satuan}</>}
      </span>
    </nav>
  );
}
