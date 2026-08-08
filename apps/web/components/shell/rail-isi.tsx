"use client";

/**
 * ISI RAIL — susunan baku, dengan bagian atas yang bisa diganti per halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ATURAN FOUNDER 2026-08-08
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   *"kalo dihalaman lain kalender, My Task, dan notifikasi itu diganti
 *    isinya dengan yg lain yg relevan dengan halaman tersebut, tapi untuk ai
 *    dan smart reminder itu akan selalu ada"*
 *
 * Jadi rail punya DUA bagian dengan aturan berbeda:
 *
 *   ATAS   `konteks` — ditentukan halaman. Di beranda: kalender · tugas ·
 *          notifikasi. Di halaman lain: apa pun yang relevan di sana.
 *   BAWAH  Asisten + Pengingat — SELALU, di halaman mana pun rail hidup.
 *
 * ── Kenapa disatukan di komponen, bukan disusun ulang tiap halaman
 *
 * Kalau tiap halaman menyusun sendiri, "AI dan pengingat selalu ada" berubah
 * jadi sembilan kesempatan untuk lupa — dan halaman yang lupa tak akan
 * terlihat salah, ia cuma kekurangan dua kartu. Di sini aturannya dipaksa
 * oleh bentuk komponen: pemanggil hanya bisa mengisi bagian atas.
 *
 * ── Pengingat butuh tanggal, dan itu sengaja diminta
 *
 * `tanggalTenggat` wajib disebut pemanggil. Membuat komponen ini memuat
 * sendiri berarti permintaan jaringan kedua untuk data yang halaman sudah
 * punya — dan di beranda itu tepat data yang sama dengan kalender.
 */

import type { ReactNode } from "react";
import { RailAsisten } from "./rail-asisten";
import { RailPengingat } from "./rail-pengingat";

export function RailIsi({
  konteks,
  tanggalTenggat = [],
}: {
  /** Bagian atas — kartu yang relevan dengan halaman ini. */
  konteks?: ReactNode;
  /** Tenggat untuk menghitung Pengingat. Kosong = "tak ada dalam 2 minggu". */
  tanggalTenggat?: readonly (string | null | undefined)[];
}) {
  return (
    <>
      {konteks}

      {/*
        Dua ini SELALU ada. `RailPengingat` ber-`marginTop: auto` sehingga ia
        menempel ke DASAR rail seperti referensi, berapa pun isi di atasnya.
      */}
      <RailAsisten />
      <RailPengingat tanggalTenggat={tanggalTenggat} />
    </>
  );
}
