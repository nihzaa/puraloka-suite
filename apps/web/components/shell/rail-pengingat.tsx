"use client";

/**
 * PENGINGAT — "Smart Reminders" versi yang angkanya benar-benar dihitung.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * REFERENSI MENUNJUKKAN "7", DARI MANA?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menaruh pita biru "Smart Reminders (7)" menempel di dasar rail.
 * Bentuknya ditiru. Angkanya tidak: di referensi ia karangan, di sini ia
 * jumlah tenggat yang benar-benar mendekat.
 *
 * Sumbernya `upcoming_milestones` yang SUDAH dimuat halaman — nol permintaan
 * jaringan tambahan, dan karena itu pengingat tak bisa gagal sendiri.
 *
 * ── Kenapa "mendekat" = 14 hari, dan kenapa yang LEWAT juga masuk
 *
 * Pengingat yang hanya melihat ke depan melewatkan hal yang paling mendesak:
 * tenggat yang SUDAH lewat dan belum ditutup. Itu justru yang harus paling
 * dulu terlihat, jadi ia dihitung — dan ditandai berbeda.
 *
 * 14 hari: cukup jauh untuk sempat bertindak (memesan material, memanggil
 * mandor), cukup dekat untuk tidak berisi hal yang belum relevan.
 *
 * ── Kenapa tidak bisa dibuka
 *
 * Referensi memberinya tombol panah dan tanda plus yang tak jelas melakukan
 * apa. Di sini ia TAUTAN ke kalender — satu tujuan, jelas, dan sudah ada
 * halamannya. Kontrol yang tak melakukan apa-apa adalah janji yang tak
 * ditepati (Aturan Emas §9).
 */

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { kunciTanggal } from "@/lib/kalender";

/** Ambang "mendekat", dalam hari. Dijadikan konstanta supaya bisa dibaca. */
const HARI_DEKAT = 14;

export function RailPengingat({
  tanggalTenggat = [],
}: {
  /** Tanggal tenggat apa pun bentuknya; dinormalkan di sini. */
  tanggalTenggat?: readonly (string | null | undefined)[];
}) {
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);

  let lewat = 0;
  let dekat = 0;

  for (const mentah of tanggalTenggat) {
    const kunci = kunciTanggal(mentah);
    if (!kunci) continue;
    // Diurai sebagai tanggal LOKAL (bukan `new Date(kunci)` yang UTC), supaya
    // "hari ini" tak bergeser sehari di Asia/Jakarta.
    const [t, b, h] = kunci.split("-").map(Number);
    const tgl = new Date(t, b - 1, h);
    const selisihHari = Math.round((tgl.getTime() - hariIni.getTime()) / 86_400_000);

    if (selisihHari < 0) lewat++;
    else if (selisihHari <= HARI_DEKAT) dekat++;
  }

  const total = lewat + dekat;

  return (
    <Link
      href="/kalender"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px var(--pad-kartu)",
        borderRadius: "var(--rad-besar)",
        background: "var(--grad-aksen)",
        color: "var(--on-navy)",
        textDecoration: "none",
        // ── TANPA `marginTop: auto` — sengaja, dan ini bukan kelalaian
        //
        // Kartu ini tetap menempel di dasar rail, tetapi yang memakunya
        // `marginTop: auto` pada `RailAsisten` TEPAT DI ATASNYA. Keduanya jadi
        // satu blok yang menempel bersama.
        //
        // Dua `auto` berturut-turut TIDAK membuat yang pertama menyerap
        // segalanya — flexbox MEMBAGI sisa ruang RATA di antara keduanya.
        // Diukur 2026-08-12 setelah keduanya diberi `auto`:
        //
        //     Asisten   mt=210.9px   berakhir  903
        //     Pengingat mt=210.9px   mulai    1130   ← masih 227px celah
        //
        // Itu justru kesalahan yang saya tulis di komentar sendiri sebelum
        // mengukurnya. Yang benar: HANYA SATU yang boleh `auto`, dan ia harus
        // yang PALING ATAS dari pasangan yang ingin menempel.
        flexShrink: 0,
      }}
    >
      <Bell size={16} aria-hidden="true" style={{ flexShrink: 0 }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "var(--t-badan)", fontWeight: 700, lineHeight: 1.3 }}>
          Pengingat
        </span>
        <span style={{ display: "block", fontSize: 11, opacity: 0.85, marginTop: 1 }}>
          {total === 0
            ? "Tak ada tenggat dalam 2 minggu"
            : lewat > 0
              ? `${lewat} lewat · ${dekat} dalam 2 minggu`
              : `${dekat} dalam 2 minggu`}
        </span>
      </span>

      {total > 0 && (
        <span
          aria-hidden="true"
          style={{
            display: "grid", placeItems: "center", flexShrink: 0,
            minWidth: 22, height: 22, padding: "0 6px",
            borderRadius: "var(--rad-pil)",
            // Latar dibalik: teks --navy di atas blok --on-navy. Dua-duanya
            // ikut berbalik antar mode, jadi kontrasnya terjaga di keduanya.
            background: "var(--on-navy)",
            color: "var(--navy)",
            fontSize: 12, fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total > 99 ? "99+" : total}
        </span>
      )}

      <ChevronRight size={14} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }} />
    </Link>
  );
}
