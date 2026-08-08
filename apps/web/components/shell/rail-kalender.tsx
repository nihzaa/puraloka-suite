"use client";

/**
 * KALENDER RAIL — kisi bulanan dengan titik pada hari yang punya tenggat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA BUKAN PEMILIH TANGGAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menaruh kalender di puncak rail, dan yang membuatnya berguna bukan
 * kalendernya — melainkan **titik-titik di bawah tanggal**. Ia menjawab
 * pertanyaan yang tak terjawab oleh daftar: *"minggu depan padat atau lengang?"*
 *
 * Daftar "Milestone mendatang" tepat di bawahnya sudah menyebutkan APA saja.
 * Yang tak bisa disampaikan daftar adalah SEBARANNYA — lima tenggat menumpuk di
 * satu hari terlihat sama saja dengan lima tenggat tersebar sebulan, kalau
 * hanya dibaca berurutan.
 *
 * Jadi ini **bukan** pemilih tanggal: tak ada yang bisa diklik, tak ada filter
 * yang berubah. Menambahkan interaksi yang tak mengubah apa pun adalah janji
 * yang tak ditepati — persis cacat "tombol View Full AI Analysis" di referensi.
 *
 * ── Sumber titik: data yang SUDAH ada
 *
 * `upcoming_milestones` dari `/api/v1/dashboard` sudah membawa `target_date`.
 * Tak ada endpoint baru, tak ada permintaan tambahan — dan karena itu kalender
 * ini tak bisa "gagal" sendiri: kalau dashboard punya data, kalender punya.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { susunKisi, kunciTanggal, HARI_ID } from "@/lib/kalender";
import { C } from "@/lib/warna-ui";

export function RailKalender({
  tanggalPenting = [],
}: {
  /** Tanggal apa pun bentuknya (`date` atau `timestamptz`) — dinormalkan di sini. */
  tanggalPenting?: readonly (string | null | undefined)[];
}) {
  // Geseran bulan relatif terhadap bulan ini. 0 = bulan berjalan.
  const [geser, setGeser] = useState(0);

  const { baris, judul, jumlahBulanIni } = useMemo(() => {
    const kini = new Date();
    const acuan = new Date(kini.getFullYear(), kini.getMonth() + geser, 1);
    const kunci = tanggalPenting
      .map(kunciTanggal)
      .filter((v): v is string => v !== null);
    const kisi = susunKisi(acuan, kunci, kini);

    // Dipecah jadi 6 minggu x 7 hari — dibutuhkan `role="row"`, bukan hiasan.
    const minggu: (typeof kisi.sel)[] = [];
    for (let i = 0; i < kisi.sel.length; i += 7) minggu.push(kisi.sel.slice(i, i + 7));

    return {
      baris: minggu,
      judul: kisi.judul,
      jumlahBulanIni: kisi.sel.filter((s) => s.berisi).length,
    };
  }, [geser, tanggalPenting]);

  return (
    <section
      aria-labelledby="kalender-judul"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
      }}
    >
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, padding: "var(--pad-kartu)", borderBottom: "1px solid var(--border)",
      }}>
        <h2 id="kalender-judul" style={{
          margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
          letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
        }}>
          Kalender
        </h2>

        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <TombolBulan arah="mundur" onClick={() => setGeser((g) => g - 1)} />
          {/*
            Judul bulan diberi lebar tetap: tanpa itu tombol maju/mundur
            bergeser tiap kali nama bulan berganti panjang ("Mei" → "September"),
            dan sasaran klik yang berpindah membuat penelusuran cepat meleset.
          */}
          <span style={{
            minWidth: 104, textAlign: "center",
            fontSize: 12, fontWeight: 600, color: C.text,
          }}>
            {judul}
          </span>
          <TombolBulan arah="maju" onClick={() => setGeser((g) => g + 1)} />
        </div>
      </header>

      <div style={{ padding: "var(--pad-kartu)" }}>
        {/*
          `role="grid"` menuntut anak `role="row"` — sel tak boleh menempel
          langsung ke grid. Versi pertama berkas ini melewatkan baris itu
          (kisinya CSS grid datar), dan axe menolaknya: `aria-required-children`
          critical + 38 x `aria-required-parent`. Kotaknya terlihat benar; yang
          rusak hanya STRUKTUR yang dibaca pembaca layar — jenis cacat yang
          mustahil terlihat di tangkapan layar.

          `display: contents` membuat elemen baris ada bagi ARIA tetapi tak
          memengaruhi tata letak, sehingga CSS grid 7-kolom tetap utuh.
        */}
        <div
          role="grid"
          aria-label={`Kalender ${judul}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}
        >
          <div role="row" style={{ display: "contents" }}>
            {HARI_ID.map((h) => (
              <div
                key={h}
                role="columnheader"
                style={{
                  textAlign: "center", fontSize: 10, fontWeight: 700,
                  letterSpacing: ".02em", color: C.muted, paddingBottom: 4,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {baris.map((minggu, iBaris) => (
            <div key={iBaris} role="row" style={{ display: "contents" }}>
              {minggu.map((s, i) => {
                if (s.tanggal === null) {
                  return (
                    <div
                      key={i}
                      role="gridcell"
                      aria-label=""
                      style={{ height: 28 }}
                    />
                  );
                }

                return (
                  <div
                    key={i}
                    role="gridcell"
                    /*
                      Titik penanda murni visual, jadi maknanya dititipkan ke
                      aria-label — pembaca layar tak melihat lingkaran 4px.
                      Tanpa ini, seluruh informasi kalender ini hilang bagi mereka.
                    */
                    aria-label={
                      s.berisi ? `${s.tanggal} — ada tenggat` : String(s.tanggal)
                    }
                    aria-current={s.hariIni ? "date" : undefined}
                    style={{
                      position: "relative",
                      height: 28,
                      display: "grid", placeItems: "center",
                      borderRadius: "var(--rad-kecil)",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      // Hari ini dibalik warnanya (bukan sekadar tebal): di kisi
                      // 42 kotak, tebal saja hampir tak terlihat.
                      background: s.hariIni ? "var(--navy)" : "transparent",
                      color: s.hariIni ? "var(--on-merek)" : C.text,
                      fontWeight: s.hariIni ? 700 : 400,
                    }}
                  >
                    {s.tanggal}
                    {s.berisi && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute", bottom: 3,
                          width: 4, height: 4, borderRadius: "50%",
                          // Di kotak "hari ini" yang berlatar navy, titik navy
                          // takkan terlihat — dibalik jadi warna teks di atasnya.
                          background: s.hariIni ? "var(--on-merek)" : "var(--danger)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/*
          Ringkasan satu baris. Kalender tanpa titik sama sekali terlihat seperti
          gagal memuat; kalimat ini menyatakan bahwa bulannya memang lengang.
        */}
        <p style={{
          margin: "10px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.4,
        }}>
          {jumlahBulanIni > 0
            ? <><strong style={{ color: C.text, fontWeight: 600 }}>{jumlahBulanIni} hari</strong> punya tenggat milestone bulan ini.</>
            : "Tak ada tenggat milestone di bulan ini."}
        </p>
      </div>
    </section>
  );
}

/** Tombol geser bulan. Dipisah supaya dua pemakaiannya tak bisa menyimpang. */
function TombolBulan({ arah, onClick }: { arah: "maju" | "mundur"; onClick: () => void }) {
  const Ikon = arah === "maju" ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={arah === "maju" ? "Bulan berikutnya" : "Bulan sebelumnya"}
      style={{
        display: "grid", placeItems: "center",
        // 26px: di bawah 24px sasaran sentuh terlalu kecil untuk jari,
        // dan rail hanya 300px sehingga lebih besar mendesak judul bulan.
        width: 26, height: 26,
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-kecil)",
        background: "transparent",
        color: C.mid,
        cursor: "pointer",
        transition: "background 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Ikon size={14} aria-hidden="true" />
    </button>
  );
}
