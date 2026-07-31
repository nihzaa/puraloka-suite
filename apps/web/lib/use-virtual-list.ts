"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Virtualisasi daftar panjang — tanpa dependensi.
//
// ── Masalah yang diselesaikan
//
// Katalog AHSP berisi 3.043 analisa dan price book 2.637 harga. Merender
// semuanya menghasilkan puluhan ribu elemen DOM: halaman berat, scroll patah,
// dan pada perangkat lapangan yang tak baru bisa sampai tak responsif sama
// sekali. Itu sebabnya daftarnya dulu dipotong 200 — tapi memotong berarti
// analisa di baris ke-500 tak pernah bisa dilihat oleh orang yang sedang
// mencari-cari justru KARENA belum tahu kata kuncinya.
//
// ── Cara kerja
//
// Seluruh data tetap di memori (ringan: ~1-2 MB JSON), tapi yang DIRENDER hanya
// baris yang terlihat di layar plus buffer di atas & bawah. Ruang kosongnya
// diisi dua div berketinggian tetap, sehingga scrollbar tetap sepanjang data
// sesungguhnya dan posisi scroll terasa wajar.
//
// ── Kenapa ditulis sendiri, bukan memakai pustaka
//
// Kasus di sini yang paling sederhana: satu kolom, tinggi baris seragam, scroll
// vertikal saja. Pustaka virtualisasi umum membawa kemampuan untuk kasus yang
// tak kita punya (tinggi dinamis, grid dua arah, scroll horizontal) beserta
// kewajiban memantaunya di `pnpm audit` selamanya. Untuk ~80 baris kode yang
// perilakunya bisa dibaca utuh di satu tempat, dependensi itu tak sepadan.
//
// ── Batas yang disadari
//
// Tinggi baris DIANGGAP seragam (`tinggiBaris`). Kalau isi baris bisa membuat
// tingginya berbeda-beda, posisi scroll akan meleset. Untuk daftar katalog dan
// harga, tiap baris satu baris teks dengan tinggi tetap — asumsinya berlaku.

export interface HasilVirtual {
  /** Indeks awal yang harus dirender (inklusif). */
  mulai: number;
  /** Indeks akhir yang harus dirender (eksklusif). */
  akhir: number;
  /** Tinggi ruang kosong di ATAS baris pertama yang dirender, dalam px. */
  padTop: number;
  /** Tinggi ruang kosong di BAWAH baris terakhir yang dirender, dalam px. */
  padBottom: number;
  /**
   * Pasang ke elemen yang punya `overflow-y: auto`.
   *
   * Callback ref, bukan objek ref: `react-hooks/refs` melarang membaca
   * `.current` selama render, dan hook ini memang perlu bereaksi terhadap
   * elemen begitu ia terpasang. Callback memberi tahu kita saat itu terjadi
   * tanpa membaca ref di jalur render sama sekali.
   *
   * ⚠️ Dinamai `pasang`, BUKAN `ref`. `react-hooks/refs` memperlakukan properti
   * bernama `ref` pada objek hasil hook sebagai ref sungguhan, lalu menganggap
   * setiap pembacaan properti lain di objek yang sama sebagai akses-ref selama
   * render. Nama yang berbeda menghilangkan salah tafsir itu tanpa mengakali
   * aturannya — dan memang lebih jujur: ini fungsi pemasang, bukan kotak nilai.
   */
  pasang: (el: HTMLDivElement | null) => void;
  /** True saat virtualisasi tidak aktif (data sedikit) — render biasa saja. */
  nonaktif: boolean;
}

export function useVirtualList(
  jumlah: number,
  tinggiBaris: number,
  opsi: { tinggiViewport?: number; buffer?: number; ambangAktif?: number } = {},
): HasilVirtual {
  const { tinggiViewport = 520, buffer = 8, ambangAktif = 60 } = opsi;

  const [scrollTop, setScrollTop] = useState(0);
  const [tinggi, setTinggi] = useState(tinggiViewport);
  const bersihkan = useRef<(() => void) | null>(null);
  const elemen = useRef<HTMLDivElement | null>(null);

  // Di bawah ambang, virtualisasi hanya menambah rumit tanpa manfaat: 60 baris
  // dirender browser tanpa kesulitan sama sekali.
  const nonaktif = jumlah <= ambangAktif;

  // Callback ref: dipanggil React saat elemen terpasang/terlepas. Seluruh
  // penyentuhan DOM terjadi DI SINI — bukan di jalur render — sehingga tak ada
  // ref yang dibaca selama render (`react-hooks/refs`).
  const pasang = useCallback((el: HTMLDivElement | null) => {
    bersihkan.current?.();
    bersihkan.current = null;
    elemen.current = el;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    const ukur = () => setTinggi(el.clientHeight || tinggiViewport);

    // `passive: true` — handler ini tak pernah memanggil preventDefault, dan
    // memberi tahu browser itu membuat scroll tetap mulus.
    el.addEventListener("scroll", onScroll, { passive: true });
    ukur();

    // Tinggi viewport bisa berubah (rotasi layar, panel dibuka/ditutup).
    // ResizeObserver tak selalu ada di WebView lama — dijaga, bukan diasumsikan.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(ukur);
      ro.observe(el);
    }

    bersihkan.current = () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [tinggiViewport]);

  // Saat daftar berganti isi (filter/pencarian), posisi scroll lama tak lagi
  // bermakna — tanpa reset, pemakai mendarat di tengah hasil baru tanpa sebab.
  //
  // `scrollTop = 0` pada elemen memicu event `scroll`, dan handler-nya yang
  // memanggil setState. Jadi state TIDAK ditulis sinkron di dalam effect
  // (`react-hooks/set-state-in-effect`) — cukup menyentuh DOM, sisanya mengalir
  // lewat jalur yang sama dengan scroll biasa.
  useEffect(() => {
    const el = elemen.current;
    if (el && el.scrollTop !== 0) el.scrollTop = 0;
  }, [jumlah]);

  if (nonaktif) {
    return { mulai: 0, akhir: jumlah, padTop: 0, padBottom: 0, pasang, nonaktif: true };
  }

  const terlihat = Math.ceil(tinggi / tinggiBaris);
  const mulai = Math.max(0, Math.floor(scrollTop / tinggiBaris) - buffer);
  const akhir = Math.min(jumlah, mulai + terlihat + buffer * 2);

  return {
    mulai,
    akhir,
    padTop: mulai * tinggiBaris,
    padBottom: Math.max(0, (jumlah - akhir) * tinggiBaris),
    pasang,
    nonaktif: false,
  };
}
