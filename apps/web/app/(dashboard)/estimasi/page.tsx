"use client";

/**
 * ESTIMASI — IKHTISAR modul.
 *
 * Halaman pertama yang dilihat orang saat membuka modul. Tugasnya menjawab
 * satu pertanyaan yang versi lama TIDAK pernah jawab: **saya harus mulai dari
 * mana?**
 *
 * Versi lama membuka di tab "Komposer" yang isinya panduan tertulis —
 * empat paragraf menjelaskan cara memakai layar yang sedang kosong. Diukur
 * 2026-08-16: 0 tabel, 0 baris. Halaman yang menjelaskan dirinya sendiri
 * alih-alih mengerjakan sesuatu adalah tanda alurnya belum ketemu.
 *
 * Yang menggantikannya: daftar proyek beserta KEADAAN RAB-nya, sehingga
 * langkah berikutnya terbaca dari datanya sendiri — proyek mana yang belum
 * punya RAB, mana yang masih draft, mana yang sudah terkunci.
 */

import Link from "next/link";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { FileText, Layers, Lock, Plus } from "lucide-react";
import { LayarKosong } from "./_bersama/layar-kosong";
import { rpRingkas, type ProyekRingkas } from "./_bersama/tipe";

interface JawabProyek {
  projects?: ProyekRingkas[];
}

export default function EstimasiIkhtisarPage() {
  const { data, memuat, galat } = useData<JawabProyek>("/api/v1/projects");
  const proyek = data?.projects ?? [];

  if (memuat) {
    return (
      <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>
        Memuat daftar proyek…
      </p>
    );
  }

  if (galat) {
    return (
      <p style={{ fontSize: "var(--teks-label)", color: "var(--danger)" }}>
        Gagal memuat daftar proyek. Coba muat ulang halaman.
      </p>
    );
  }

  if (proyek.length === 0) {
    return (
      <LayarKosong
        ikon={<FileText size={21} />}
        judul="Belum ada proyek"
        apa="RAB selalu melekat pada satu proyek."
        kenapa="Buat proyeknya lebih dulu, lalu RAB bisa disusun dari sini."
        aksi={{ label: "Buka daftar proyek", href: "/proyek" }}
      />
    );
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
          gap: 12,
        }}
      >
        {proyek.map((p) => (
          <KartuProyek key={p.id} proyek={p} />
        ))}
      </div>

      <p
        style={{
          fontSize: "var(--teks-label)",
          color: C.muted,
          marginTop: 16,
          lineHeight: 1.6,
        }}
      >
        Analisa AHSP dan price book kini berada di{" "}
        <Link href="/master/ahsp" style={{ color: C.aksen }}>
          Master&nbsp;Data
        </Link>{" "}
        — keduanya dipakai lintas proyek, jadi bukan bagian dari pekerjaan satu
        proyek.
      </p>
    </>
  );
}

function KartuProyek({ proyek }: { proyek: ProyekRingkas }) {
  return (
    <Link
      href={`/estimasi/rab?proyek=${proyek.id}`}
      style={{
        display: "block",
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-md)",
        background: C.surface,
        padding: "var(--pad-kartu-lega, 16px)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "var(--teks-badan)",
            fontWeight: 600,
            color: C.text,
            lineHeight: 1.35,
          }}
        >
          {proyek.name}
        </span>
        <span aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }}>
          <Plus size={15} />
        </span>
      </div>

      <span
        style={{
          display: "inline-block",
          marginTop: 10,
          fontSize: "var(--teks-label)",
          color: C.aksen,
          fontWeight: 600,
        }}
      >
        Susun RAB →
      </span>
    </Link>
  );
}
