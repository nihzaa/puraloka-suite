"use client";

/**
 * FOKUS HARI INI — widget di sidebar, tepat di atas kartu sesi login.
 *
 * ── Kenapa ini, bukan "Storage Usage" seperti referensi
 *
 * Referensi Buildify menaruh pemakaian penyimpanan di posisi ini. Untuk
 * produk SaaS umum itu masuk akal — kuota adalah hal yang menentukan apakah
 * pemakai harus naik paket.
 *
 * Untuk kontraktor, penyimpanan bukan kekhawatiran. Yang menentukan harinya
 * adalah: **berapa hal yang menunggu keputusan saya, dan berapa yang sudah
 * lewat tenggat.** Itu pertanyaan yang orang bawa saat membuka aplikasi, dan
 * hari ini jawabannya tersebar di enam halaman berbeda.
 *
 * ── Kenapa di SIDEBAR, bukan di dashboard
 *
 * Sidebar hadir di SETIAP halaman. Angka yang hanya ada di dashboard cuma
 * terlihat saat orang kebetulan ke sana — dan yang paling mendesak justru
 * ditemukan saat sedang mengerjakan hal lain.
 *
 * ── Yang paling dijaga
 *
 * **Nol bukan kegagalan — nol adalah kabar baik, dan harus terlihat begitu.**
 * Widget yang menghilang saat kosong membuat orang bertanya-tanya apakah ia
 * rusak. Yang muncul dengan "semua beres" memberi kepastian.
 *
 * **Angka yang LEWAT TENGGAT dibedakan dari yang sekadar menunggu.** Dua-
 * duanya "belum selesai", tapi yang satu masih dalam kendali dan yang lain
 * sudah merugikan. Menyatukannya membuat yang mendesak tenggelam.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

interface Fokus {
  /** Lewat tenggat — sudah merugikan, bukan lagi "menunggu". */
  lewat: number;
  /** Menunggu keputusan, masih dalam kendali. */
  menunggu: number;
  /** Ke mana orang harus pergi untuk menyelesaikannya. */
  tautan: string;
}

export function SidebarFokus({ collapsed }: { collapsed: boolean }) {
  const [fokus, setFokus] = useState<Fokus | null>(null);
  const [gagal, setGagal] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<Fokus>("/api/v1/dashboard/fokus", { signal })
      .then((r) => { setFokus(r.data); setGagal(false); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        // Diam-diam gagal DILARANG di repo ini, tapi widget sidebar bukan
        // tempat menampilkan galat merah — ia hadir di setiap halaman, dan
        // galat yang menetap di sana akan diabaikan dalam sehari. Yang
        // dilakukan: sembunyikan widgetnya, dan tandai supaya tak dikira
        // "tidak ada yang menunggu".
        setGagal(true);
      });
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  // Gagal memuat → jangan tampilkan apa pun. Menampilkan "0" pada data yang
  // tak terbaca adalah kebohongan yang menenangkan.
  if (gagal || !fokus) return null;

  const adaYangLewat = fokus.lewat > 0;
  const adaYangMenunggu = fokus.menunggu > 0;
  const bersih = !adaYangLewat && !adaYangMenunggu;

  // ── Ciut: satu titik berwarna, angka saja ─────────────────────────────
  if (collapsed) {
    return (
      <Link
        href={fokus.tautan}
        aria-label={
          bersih
            ? "Fokus hari ini: tidak ada yang menunggu keputusan"
            : `Fokus hari ini: ${fokus.lewat} lewat tenggat, ${fokus.menunggu} menunggu keputusan`
        }
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 2, padding: "8px 0", marginBottom: 6,
          borderRadius: 10, textDecoration: "none",
          background: adaYangLewat ? "var(--danger-bg)" : "var(--surface-subtle)",
          border: `1px solid ${adaYangLewat ? "var(--danger-border)" : "var(--border)"}`,
        }}
      >
        <span style={{
          fontSize: 15, fontWeight: 700, lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          color: adaYangLewat ? "var(--danger)"
            : adaYangMenunggu ? "var(--aksen)" : "var(--success)",
        }}>{bersih ? "✓" : fokus.lewat + fokus.menunggu}</span>
      </Link>
    );
  }

  // ── Lebar penuh ────────────────────────────────────────────────────────
  return (
    <Link
      href={fokus.tautan}
      style={{
        display: "block", marginBottom: 6, padding: "8px 12px",
        borderRadius: 10, textDecoration: "none",
        // Gradasi HANYA saat ada yang lewat tenggat — ini satu-satunya
        // tempat di sidebar yang boleh memakainya, dan justru itu yang
        // membuatnya menarik perhatian. Kalau semua bergradasi, tak ada
        // yang menonjol.
        background: adaYangLewat ? "var(--grad-aksen)" : "var(--surface-subtle)",
        border: `1px solid ${adaYangLewat ? "transparent" : "var(--border)"}`,
        transition: "transform 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6, marginBottom: bersih ? 0 : 7,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
          textTransform: "uppercase",
          color: adaYangLewat ? "rgba(255,255,255,.75)" : "var(--text-muted)",
        }}>Fokus hari ini</span>
        <ChevronRight size={12} aria-hidden="true"
          color={adaYangLewat ? "rgba(255,255,255,.75)" : "var(--text-muted)"} />
      </div>

      {bersih ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} color="var(--success)" aria-hidden="true" />
          <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.35 }}>
            Tidak ada yang menunggu
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {adaYangLewat && (
            <div>
              <div style={{
                fontSize: 22, fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "var(--font-display, inherit)",
                // `--on-aksen` bukan "var(--surface)": di mode gelap ia berbalik jadi
                // gelap, karena aksen di sana adalah indigo TERANG. Putih mati
                // di sini memberi kontras 2,x:1 — cacat yang persis sama sudah
                // pernah terjadi pada tombol Masuk (lihat --on-navy).
                color: "var(--on-aksen)",
              }}>{fokus.lewat}</div>
              <div style={{
                fontSize: 10, marginTop: 3, display: "flex",
                alignItems: "center", gap: 2,
                color: "rgba(255,255,255,.85)",
              }}>
                <AlertTriangle size={9} aria-hidden="true" />lewat tenggat
              </div>
            </div>
          )}
          {adaYangMenunggu && (
            <div>
              <div style={{
                fontSize: adaYangLewat ? 16 : 22, fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "var(--font-display, inherit)",
                color: adaYangLewat ? "rgba(255,255,255,.85)" : "var(--aksen)",
              }}>{fokus.menunggu}</div>
              <div style={{
                fontSize: 10, marginTop: 3,
                color: adaYangLewat ? "rgba(255,255,255,.7)" : "var(--text-muted)",
              }}>menunggu putusan</div>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
