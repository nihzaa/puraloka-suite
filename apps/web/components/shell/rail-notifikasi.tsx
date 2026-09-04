"use client";

/**
 * RAIL NOTIFIKASI — lima kabar terbaru, di rail kanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, PADAHAL LONCENG DI TOPBAR SUDAH ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menaruh "Notifications" sebagai kartu tetap di rail, dan founder
 * memintanya ada. Pembagian kerjanya dengan lonceng topbar tegas, dan sama
 * pola dengan `RailFokus` vs `SidebarFokus`:
 *
 *   LONCENG  angka saja · SETIAP halaman · harus ditekan dulu
 *   RAIL     lima baris terbaca · halaman DASHBOARD · terlihat tanpa ditekan
 *
 * Lonceng tak dicabut: rail mati di halaman DAFTAR, dan di situlah orang
 * paling lama bekerja.
 *
 * ── Yang dijaga
 *
 * **Gagal memuat ≠ tidak ada notifikasi.** Daftar kosong pada data yang tak
 * terbaca adalah kebohongan yang menenangkan — kartunya berkata terus terang.
 *
 * **Belum dibaca ditandai, bukan hanya diurutkan.** Urutan waktu saja membuat
 * kabar penting yang belum dibaca tenggelam begitu ada tiga kabar baru.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, makeAbortController } from "@/lib/api";
import { formatRelatif } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import { KartuRail } from "./rail-kartu";

interface Notifikasi {
  id: string;
  title: string;
  message: string | null;
  is_read: boolean;
  sent_at: string | null;
  created_at: string | null;
  action_url: string | null;
  priority: string | null;
}

export function RailNotifikasi() {
  const [daftar, setDaftar] = useState<Notifikasi[] | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    const ac = makeAbortController();
    api
      .get<{ notifications: Notifikasi[] }>("/api/v1/notifications?limit=5", { signal: ac.signal })
      .then((r) => setDaftar(r.data?.notifications ?? []))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setGagal(true);
      });
    return () => ac.abort();
  }, []);

  if (gagal) {
    return (
      <KartuRail judul="Notifikasi" kosong="Kabar terbaru tak bisa dimuat saat ini." />
    );
  }

  return (
    <KartuRail
      judul="Notifikasi"
      tautan="/notifications"
      labelTautan="Semua"
      kosong="Belum ada kabar baru."
    >
      {(daftar ?? []).map((n, i) => (
        <BarisNotifikasi key={n.id} n={n} pertama={i === 0} />
      ))}
    </KartuRail>
  );
}

function BarisNotifikasi({ n, pertama }: { n: Notifikasi; pertama: boolean }) {
  const isi = (
    <>
      {/*
        Titik "belum dibaca" — penanda visual murni, jadi statusnya dititipkan
        ke teks tersembunyi. Pembaca layar tak melihat lingkaran 6px.
      */}
      <span
        aria-hidden="true"
        style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 6,
          background: n.is_read ? "transparent" : "var(--navy)",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: "block", fontSize: "var(--t-badan)", color: C.text,
          fontWeight: n.is_read ? 400 : 600, lineHeight: 1.35,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {!n.is_read && <span className="sr-only">Belum dibaca: </span>}
          {n.title}
        </span>
        <span style={{
          display: "block", fontSize: "var(--t-kecil)", color: C.muted, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {formatRelatif(n.sent_at ?? n.created_at)}
        </span>
      </span>
    </>
  );

  const gaya = {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "10px var(--pad-kartu)",
    borderTop: pertama ? "none" : "1px solid var(--border)",
    textDecoration: "none",
  } as const;

  // Tautan HANYA kalau ada tujuannya. Membungkus semuanya jadi <Link> ke "#"
  // memberi kursor tangan pada baris yang tak ke mana-mana.
  if (!n.action_url) return <div style={gaya}>{isi}</div>;

  return (
    <Link
      href={n.action_url}
      style={{ ...gaya, transition: "background 150ms ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {isi}
    </Link>
  );
}
