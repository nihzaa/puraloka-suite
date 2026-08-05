"use client";

/**
 * HALAMAN MENU YANG BELUM DIBANGUN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN "COMING SOON" BIASA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman "segera hadir" yang seragam di 100+ rute adalah bentuk paling jujur
 * dari tidak-diurus: ia memberi tahu bahwa halamannya kosong, dan tak satu pun
 * hal lain. Orang yang mengkliknya pergi dengan pertanyaan yang sama persis
 * seperti sebelum mengklik.
 *
 * Yang dibangun di sini menjawab tiga hal, tiap-tiap menu berbeda isinya:
 *
 *   1. APA yang akan dikerjakan di halaman ini (satu kalimat, bahasa kerja)
 *   2. KENAPA belum ada — dan ini yang paling penting. "Belum sempat" berbeda
 *      jauh dari "menunggu tender mensyaratkan" atau "sengaja pakai tool luar".
 *      Tanpa membedakannya, seluruh 100+ halaman terbaca sebagai utang.
 *   3. KE MANA sementara ini — bila ada tempat lain yang mengerjakan hal serupa
 *
 * ── Arah visual: melanjutkan, bukan menciptakan
 *
 * Sistem ini sudah punya bahasa visual (navy var(--navy), Bricolage Grotesque
 * untuk judul, kartu putih di atas var(--bg)). Halaman baru yang membawa gaya
 * sendiri akan terasa seperti tempelan — dan 100+ halaman bergaya-sendiri
 * adalah definisi paling tepat dari sistem yang tak punya arah.
 *
 * Satu keputusan visual yang membedakannya dari halaman biasa: **garis status
 * vertikal** di kiri kartu, warnanya menandai jenis penantian. Bukan hiasan —
 * ia yang membuat "menunggu tender" dan "belum dibangun" bisa dibedakan dalam
 * sekali lihat, tanpa membaca.
 *
 * Tidak ada ilustrasi kosong, tidak ada emoji, tidak ada tulisan raksasa
 * "COMING SOON". Yang mengisi ruang adalah INFORMASI.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight, Clock, ExternalLink, Lock, Wrench, CircleDashed, FolderKanban,
} from "lucide-react";
import { PETA_MENU, cariItem, type StatusMenu } from "@/lib/peta-menu";
import { api, makeAbortController } from "@/lib/api";

import { C } from "@/lib/warna-ui";

/**
 * Tiap status punya bahasa sendiri.
 *
 * Yang dijaga di sini: "rencana" dan "eksternal" TIDAK boleh terbaca sama.
 * Yang pertama akan dibangun; yang kedua adalah keputusan bahwa ia tak akan
 * dibangun. Menyamakan keduanya membuat pembaca menghitung 100+ halaman
 * sebagai utang, padahal sebagian adalah pilihan sadar.
 */
const RUPA: Record<StatusMenu, {
  label: string; warna: string; bg: string; border: string;
  Icon: typeof Clock; kalimat: string;
}> = {
  rencana: {
    label: "Belum dibangun", warna: C.blue, bg: C.blueBg, border: C.blueBorder,
    Icon: Wrench,
    kalimat: "Sudah direncanakan dan ada di antrean pekerjaan. Belum dikerjakan karena urutannya belum sampai.",
  },
  sebagian: {
    label: "Sebagian sudah ada", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder,
    Icon: CircleDashed,
    kalimat: "Sebagian fungsinya sudah berjalan di tempat lain, tapi belum lengkap sebagai satu halaman tersendiri.",
  },
  gerbang: {
    label: "Menunggu pemicu", warna: C.mid, bg: "var(--surface-subtle)", border: C.border,
    Icon: Lock,
    kalimat: "Sengaja belum dibangun sampai ada kebutuhan nyata. Membangunnya sekarang berarti menebak bentuk yang diminta — dan tebakan yang salah lebih mahal daripada menunggu.",
  },
  eksternal: {
    label: "Pakai aplikasi lain", warna: C.mid, bg: "var(--surface-subtle)", border: C.border,
    Icon: ExternalLink,
    kalimat: "Diputuskan TIDAK dibangun di sini. Sudah ada aplikasi khusus yang menanganinya lebih baik, dan membangun ulang berarti menanggung risiko tanpa menambah nilai.",
  },
  hidup: {
    label: "Sudah berjalan", warna: C.green, bg: C.greenBg, border: C.greenBorder,
    Icon: ArrowRight,
    kalimat: "Fitur ini sudah berfungsi.",
  },
};

interface Proyek { id: string; name: string; status: string }

export default function HalamanMenu() {
  const params = useParams<{ key: string }>();
  const item = cariItem(params.key);

  const [proyek, setProyek] = useState<Proyek[]>([]);
  // Keadaan awal `true`, bukan di-set di dalam effect. Set-state sinkron di
  // dalam effect memicu render tambahan sebelum data sempat datang
  // (`react-hooks/set-state-in-effect`) — pola yang sama sudah diperbaiki di
  // halaman aset & rantai kontrak.
  const [memuatProyek, setMemuatProyek] = useState(true);

  // Menu yang menunjuk TAB di dalam proyek butuh daftar proyek untuk dipilih.
  // Pola Primavera/Odoo: menu = tempat kerja; "Kurva S" tanpa memilih proyek
  // dulu tak berarti apa-apa.
  const butuhProyek = Boolean(item?.tabProyek);

  useEffect(() => {
    if (!butuhProyek) { setMemuatProyek(false); return; }
    const ac = makeAbortController();
    api.get<{ data: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then(({ data }) => setProyek((data.data ?? []).slice(0, 12)))
      .catch(() => { /* daftar proyek opsional — halaman tetap berguna tanpanya */ })
      .finally(() => setMemuatProyek(false));
    return () => ac.abort();
  }, [butuhProyek]);

  if (!item) {
    return (
      <div style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%", maxWidth: "var(--w-form)", margin: "0 auto",
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
          Menu tidak dikenal
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
          Tak ada menu dengan kode <code style={{
            padding: "0px 6px", borderRadius: 6, background: "var(--surface-subtle)",
            border: `1px solid ${C.border}`, fontSize: 12,
          }}>{params.key}</code>. Mungkin tautannya sudah berubah.
        </p>
        <Link href="/dashboard" style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16,
          fontSize: 13, fontWeight: 600, color: C.navy, textDecoration: "none",
        }}>
          Kembali ke Dashboard <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const rupa = RUPA[item.status];
  // Diambil ke variabel ber-huruf-besar, BUKAN dipakai sebagai `<rupa.Icon>`.
  // Bentuk kedua membuat React menganggapnya komponen baru tiap render —
  // ia akan di-unmount & mount ulang, dan ikonnya berkedip tiap kali halaman
  // dirender. Dijaga `react-hooks/static-components`.
  const IkonStatus = rupa.Icon;
  const grup = PETA_MENU.find((g) => g.items.some((i) => i.key === item.key));
  // Menu lain di grup yang sama yang SUDAH hidup — supaya orang punya tempat
  // untuk pergi, bukan cuma pemberitahuan bahwa ini kosong.
  const tetanggaHidup = (grup?.items ?? [])
    .filter((i) => i.key !== item.key && i.status === "hidup" && i.href)
    .slice(0, 5);

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      {/* Jejak posisi: dengan 20 grup, tahu ADA DI MANA sama pentingnya
          dengan tahu halaman apa ini. */}
      <nav aria-label="Posisi menu" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: 0.3 }}>
          {grup?.label ?? "Menu"}
        </span>
      </nav>

      <header style={{ marginBottom: 22 }}>
        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 800, color: C.text,
          fontFamily: "var(--font-display, inherit)", letterSpacing: -0.4,
        }}>
          {item.label}
        </h1>
        <p style={{
          margin: "7px 0 0", fontSize: 15, color: C.mid, lineHeight: 1.6,
          maxWidth: "62ch",
        }}>
          {item.guna}
        </p>
      </header>

      {/* Kartu status — garis vertikal kiri adalah penanda jenis penantian.
          Warna DAN teks (WCAG 1.4.1): warna saja tak boleh membawa makna. */}
      <section style={{
        display: "flex", gap: 0, borderRadius: 10, overflow: "hidden",
        border: `1px solid ${rupa.border}`, background: rupa.bg, marginBottom: 22,
      }}>
        <div style={{ width: 4, background: rupa.warna, flexShrink: 0 }} aria-hidden="true" />
        <div style={{ padding: "16px 16px", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <IkonStatus size={15} color={rupa.warna} aria-hidden="true" />
            <span style={{
              fontSize: 12, fontWeight: 700, color: rupa.warna,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {rupa.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.65, maxWidth: "70ch" }}>
            {rupa.kalimat}
          </p>
          {item.catatan && (
            <p style={{
              margin: "10px 0 0", paddingTop: 10, fontSize: 13, color: C.mid,
              lineHeight: 1.65, borderTop: `1px solid ${rupa.border}`, maxWidth: "70ch",
            }}>
              {item.catatan}
            </p>
          )}
        </div>
      </section>

      {/* Menu ber-tab proyek: daftar proyek untuk dipilih. Ini yang membuat
          halaman tetap BERGUNA, bukan sekadar pemberitahuan. */}
      {butuhProyek && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: C.text }}>
            Pilih proyek
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: C.mid, maxWidth: "62ch", lineHeight: 1.6 }}>
            {item.label} dikerjakan per proyek, jadi ia hidup di dalam halaman
            proyek — bukan sebagai halaman tersendiri.
          </p>
          {memuatProyek ? (
            <p style={{ fontSize: 13, color: C.muted }}>Memuat daftar proyek…</p>
          ) : proyek.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted }}>
              Belum ada proyek. <Link href="/proyek" style={{ color: C.navy, fontWeight: 600 }}>Buat proyek dulu</Link>.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {proyek.map((p) => (
                <Link
                  key={p.id}
                  href={`/proyek/${p.id}${item.tabProyek ? `#${item.tabProyek}` : ""}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "12px 12px", borderRadius: 10, textDecoration: "none",
                    border: `1px solid ${C.border}`, background: C.surface,
                    transition: "border-color 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.navy;
                    // 1px, bukan lompatan — cukup untuk terasa hidup tanpa
                    // menggeser tetangganya.
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <FolderKanban size={15} color={C.navy} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize: 13, color: C.text, fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tempat lain di grup yang sama yang sudah bisa dipakai. Orang datang ke
          sini dengan sebuah tujuan; memberi jalan terdekat lebih berguna
          daripada memintanya kembali sendiri. */}
      {!butuhProyek && tetanggaHidup.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: C.text }}>
            Yang sudah bisa dipakai di {grup?.label}
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: C.mid, maxWidth: "62ch", lineHeight: 1.6 }}>
            Sementara halaman ini belum ada, ini yang sudah berjalan di bagian yang sama.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tetanggaHidup.map((t) => (
              <Link
                key={t.key}
                href={t.href!}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 12px", borderRadius: 10, textDecoration: "none",
                  border: `1px solid ${C.border}`, background: C.surface,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.navy; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{t.guna}</div>
                </div>
                <ArrowRight size={15} color={C.muted} aria-hidden="true" style={{ flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
