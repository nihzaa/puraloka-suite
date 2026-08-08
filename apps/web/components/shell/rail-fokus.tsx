"use client";

/**
 * RAIL FOKUS — "Perlu keputusan", SATU BARIS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, PADAHAL SIDEBAR SUDAH PUNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `SidebarFokus` dan komponen ini membaca endpoint yang SAMA
 * (`/api/v1/dashboard/fokus`) dan sengaja hidup berdampingan:
 *
 *   SIDEBAR   ~196px · dua angka total · hadir di SETIAP halaman
 *   RAIL      ~300px · satu angka + tautan · hanya di halaman DASHBOARD
 *
 * Sidebar tak dicabut justru karena rail bisa mati: di halaman DAFTAR (invoice,
 * upah, transaksi) rail tidak dipasang, dan di situlah orang paling lama
 * bekerja. Kalau fokus hanya hidup di rail, yang mendesak menghilang persis
 * saat orang sedang tenggelam dalam pekerjaan lain.
 *
 * ── Dulu lima baris terurai, sekarang satu (2026-08-09)
 *
 * Founder: *"perlu keputusan itu bikin 1 baris aja, gausah kasih detail isinya
 * apa aja nya"*. Rincian per-jenis tetap dihitung server dan tetap terbaca di
 * halaman tujuan — yang dibuang cuma penyalinannya ke kolom 300px, tempat
 * lima baris itu mendorong kalender dan asisten turun keluar layar.
 *
 * Yang berubah KERINCIAN tampilan, bukan sumbernya: `barisFokus`/`totalFokus`
 * masih dipakai, karena totalnya harus dihitung dengan aturan yang sama
 * dengan sidebar. Menjumlahkan sendiri di sini adalah cara termudah membuat
 * dua angka berbeda untuk data yang sama.
 *
 * ── Yang tetap dijaga
 *
 * **Nol adalah kabar baik, dan harus terlihat begitu** — `RailRingkas` yang
 * memaksanya lewat prop `kosong` yang wajib.
 *
 * **Gagal memuat ≠ tidak ada yang menunggu.** Menampilkan "0" pada data yang
 * tak terbaca adalah kebohongan yang menenangkan — kartunya disembunyikan.
 */

import { useCallback, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { barisFokus, totalFokus, type RincianFokus } from "@/lib/fokus";
import { RailRingkas } from "./rail-ringkas";

interface Jawaban {
  lewat: number;
  menunggu: number;
  tautan: string;
  rincian?: RincianFokus;
}

export function RailFokus() {
  const [data, setData] = useState<Jawaban | null>(null);
  const [gagal, setGagal] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<Jawaban>("/api/v1/dashboard/fokus", { signal })
      .then((r) => { setData(r.data); setGagal(false); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setGagal(true);
      });
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  if (gagal || !data) return null;

  const baris = barisFokus(data.rincian);
  const { lewat, menunggu } = totalFokus(baris);
  const total = lewat + menunggu;

  /*
    Nada merah HANYA kalau ada yang sudah LEWAT tenggat, bukan sekadar ada
    antrean. Perbedaannya penting: "4 hal menunggu keputusan" adalah keadaan
    kerja normal, sedangkan "ada yang lewat tenggat" adalah kegagalan. Kalau
    keduanya merah, merah berhenti berarti apa-apa.

    Angka yang ditampilkan tetap TOTAL, sedangkan warnanya ditentukan `lewat` —
    jadi satu baris ini masih membedakan dua keadaan itu tanpa baris kedua.
  */
  return (
    <RailRingkas
      judul="Perlu keputusan"
      jumlah={total}
      satuan={lewat > 0 ? `menunggu · ${lewat} lewat tenggat` : "menunggu keputusan"}
      /*
        Tautan datang dari SERVER (`/keuangan` bila ada yang lewat tenggat,
        `/mandor` bila tidak) — bukan ditebak di sini. Cadangannya `/keuangan`
        karena rute itu terbukti ada; sebelumnya di sini tertulis
        `/persetujuan`, halaman yang tak pernah dibangun.
      */
      href={data.tautan || "/keuangan"}
      nada={lewat > 0 ? "bahaya" : "normal"}
      ikon={<ListChecks size={15} />}
      kosong="Tidak ada yang menunggu keputusan"
    />
  );
}
