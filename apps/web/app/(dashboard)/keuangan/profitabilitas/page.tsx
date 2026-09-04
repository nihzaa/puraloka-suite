"use client";

/**
 * PROFITABILITAS — laba kotor per proyek.
 *
 * Dipindah dari tab keenam `keuangan/page.tsx` (3.449 baris) jadi rute
 * sendiri. Alasan lengkap ada di `components/nav-bagian.tsx`; yang paling
 * terasa di halaman ini: laporan margin adalah hal yang DIKIRIM ke orang
 * lain ("lihat margin proyek Dago"), dan sebagai tab ia tak punya URL.
 */

import { useCallback, useState } from "react";
import { PieChart, X } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { marginPerluDicurigai, keandalanMargin, alasanMarginRagu } from "@/lib/margin-tepercaya";
import { Pilihan } from "@/components/pilihan";

interface ProfitProject {
  id: string; name: string; contract_model: string; contract_value: number;
  revenue: number; paid: number; outstanding: number;
  labor_cost: number; material_cost: number; non_labor_cost: number;
  total_cost: number; gross_profit: number; gross_margin_pct: number;
  advance_outstanding: number;
}
interface ProfitTotals {
  revenue: number; paid: number; labor_cost: number; material_cost: number;
  non_labor_cost: number; total_cost: number; gross_profit: number;
  advance_outstanding: number;
}
interface Proyek { id: string; name: string }

const rp = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
};

/** Ambang margin — dipakai di tabel DAN grafik, jadi keduanya tak bisa
 *  menyimpang. 20% adalah batas sehat untuk kontraktor menengah; di bawah
 *  nol berarti proyek merugi. */
function warnaMargin(pct: number) {
  return pct >= 20 ? C.green : pct >= 0 ? C.yellow : C.red;
}

const gaya = {
  th: {
    padding: "8px 12px", fontSize: "var(--t-mikro)", fontWeight: 700,
    letterSpacing: "0.05em", textTransform: "uppercase" as const,
    color: C.mid, whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "12px 12px", textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
  },
  input: {
    padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
    fontSize: 12, color: C.text, background: "var(--surface)",
  },
  label: {
    fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, display: "block",
    marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em",
  },
};

export default function ProfitabilitasPage() {
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [filterProyek, setFilterProyek] = useState("");

  // Daftar proyek hanya mengisi dropdown filter. Gagal memuatnya tak
  // membuat halaman salah — hanya filternya kosong, jadi galatnya sengaja
  // tak diperiksa di sini.
  const { data: dataProyek } = useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    URL-nya DINAMIS mengikuti tiga saringan (dari/sampai/proyek) — `useData`
    memakai URL sebagai kunci cache, jadi kombinasi saringan yang sama
    persis tak perlu diambil ulang selama masih segar.
  */
  const q = new URLSearchParams();
  if (dari) q.set("date_from", dari);
  if (sampai) q.set("date_to", sampai);
  if (filterProyek) q.set("project_id", filterProyek);
  const jalur = `/api/v1/finance/profitability${q.size ? `?${q}` : ""}`;
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ projects: ProfitProject[]; totals: ProfitTotals }>(jalur);
  // Angka laba yang salah lebih berbahaya daripada tak ada angka: orang
  // mengambil keputusan harga dari layar ini. Jadi galat ditampilkan, bukan
  // disamarkan jadi "belum ada data".
  const gagal = galatMuat ? "Gagal memuat data profitabilitas." : null;
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  const adaFilter = dari || sampai || filterProyek;

  return (
    // Padding disediakan `keuangan/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian (diukur: 74px / 37px / 1px sebelum diseragamkan).
    <div style={{
      width: "100%", /* Padding DIHAPUS: layout bagian ini (kas/keuangan/mandor/layout.tsx)
         sudah memberi `20px 24px 24px` pada pembungkusnya. Menambahkan
         `--pad-x` di sini membuat jarak tepi terhitung DUA KALI —
         diukur 24+36=60px, sementara halaman lain 36px. */
      padding: 0, maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      {/* ── Saringan ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label htmlFor="profit-dari" style={gaya.label}>Dari</label>
          <input id="profit-dari" type="date" value={dari}
            onChange={(e) => setDari(e.target.value)} style={gaya.input} />
        </div>
        <div>
          <label htmlFor="profit-sampai" style={gaya.label}>Sampai</label>
          <input id="profit-sampai" type="date" value={sampai}
            onChange={(e) => setSampai(e.target.value)} style={gaya.input} />
        </div>
        <div>
          <label htmlFor="profit-proyek" style={gaya.label}>Proyek</label>
          <Pilihan id="profit-proyek" value={filterProyek}
            onChange={(e) => setFilterProyek(e.target.value)}
            style={{ ...gaya.input, minWidth: 160 }}>
            <option value="">Semua Proyek</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </div>
        {adaFilter && (
          <button onClick={() => { setDari(""); setSampai(""); setFilterProyek(""); }}
            style={{
              padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.mid, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
            <X size={12} aria-hidden="true" /> Reset
          </button>
        )}
      </div>

      {gagal ? (
        <div role="alert" style={{
          padding: "16px 16px", borderRadius: 10,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {gagal}{" "}
          <button onClick={() => void muat()} style={{
            marginLeft: 8, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      ) : memuat ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} aria-hidden="true" style={{
              height: 62, borderRadius: 10, border: `1px solid ${C.border}`,
              background: "var(--surface-subtle)",
            }} />
          ))}
        </div>
      ) : !data || data.projects.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          <PieChart size={36} style={{ color: "var(--border)", marginBottom: 12 }} aria-hidden="true" />
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada data profitabilitas</p>
          <p>{adaFilter ? "Coba longgarkan filternya." : "Data muncul setelah ada invoice dan biaya tercatat."}</p>
        </div>
      ) : (
        <>
          {/* ── Empat angka ringkas ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 8, marginBottom: 20,
          }}>
            {[
              { label: "Total Revenue", nilai: data.totals.revenue, warna: C.green },
              { label: "Total HPP", nilai: data.totals.total_cost, warna: C.red },
              { label: "Gross Profit", nilai: data.totals.gross_profit, warna: data.totals.gross_profit >= 0 ? C.green : C.red },
              { label: "Advance Beredar", nilai: data.totals.advance_outstanding, warna: C.yellow },
            ].map((s) => (
              <div key={s.label} style={{
                padding: "12px 16px", borderRadius: 10,
                border: `1px solid ${C.border}`, background: "var(--surface)",
              }}>
                <div style={{
                  fontSize: "var(--t-mikro)", fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
                }}>{s.label}</div>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: s.warna,
                  fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                }}>{rp(s.nilai)}</div>
              </div>
            ))}
          </div>

          {/* ── Tabel per proyek ── */}
          <div style={{ overflowX: "auto" }}>
            {/* SENGAJA tabel mentah, bukan komponen bersama — dan ini bukan
                utang yang menunggu dibayar.

                Sel Margin dan baris TOTAL memuat logika `margin-tepercaya`
                yang berbeda satu sama lain: baris memakai ambangnya sendiri,
                sedangkan total ditandai ragu kalau ADA SATU baris yang ragu.
                Aturan kedua itu lahir dari cacat yang benar-benar terjadi —
                total 94,1% tampil hijau di atas tabel yang 8 dari 15 barisnya
                bertanda "belum lengkap", dan angka ringkasan itulah yang
                paling sering dikutip keluar.

                Menuangkannya ke `total={[...]}` berarti memisahkan aturan
                total dari aturan barisnya ke dua tempat berbeda — persis
                bentuk yang membuat keduanya bisa berselisih diam-diam lagi.

                Jaminan yang biasanya datang dari komponen tetap dipenuhi di
                sini: caption tersembunyi, `th scope="row"`, `tabular-nums`,
                dan pembungkus `overflow-x` di elemen induknya. */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              <caption className="sr-only">
                Laba kotor per proyek: pendapatan, harga pokok, dan marginnya
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                  {["Proyek", "Revenue", "HPP Upah", "HPP Material", "HPP Ops", "Total HPP", "Gross Profit", "Margin", "Advance"].map((h, i) => (
                    <th key={h} scope="col" style={{ ...gaya.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => {
                  const wMargin = warnaMargin(p.gross_margin_pct);
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--surface-hover)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <th scope="row" style={{ padding: "12px 12px", textAlign: "left", fontWeight: 400 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                        <div style={{ fontSize: "var(--t-mikro)", color: C.muted, textTransform: "capitalize" }}>
                          {p.contract_model.replace("_", " ")} · Kontrak {rp(p.contract_value)}
                        </div>
                      </th>
                      <td style={{ ...gaya.td, color: C.green, fontWeight: 600 }}>{rp(p.revenue)}</td>
                      <td style={{ ...gaya.td, color: C.mid }}>{rp(p.labor_cost)}</td>
                      <td style={{ ...gaya.td, color: C.mid }}>{rp(p.material_cost)}</td>
                      <td style={{ ...gaya.td, color: C.mid }}>{rp(p.non_labor_cost)}</td>
                      <td style={{ ...gaya.td, color: C.red, fontWeight: 600 }}>{rp(p.total_cost)}</td>
                      <td style={{ ...gaya.td, color: p.gross_profit >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {rp(p.gross_profit)}
                      </td>
                      <td style={gaya.td}>
                        {/* Margin yang tak bisa dipercaya TIDAK diberi warna
                            sehat. Detail alasannya di `lib/margin-tepercaya.ts` —
                            ringkasnya: margin kotor 100% mustahil di konstruksi,
                            jadi ia menandakan biaya belum dicatat, bukan proyek
                            paling untung. Menampilkannya hijau bersama proyek
                            yang benar-benar sehat membuat keduanya tak
                            terbedakan. */}
                        {marginPerluDicurigai(p.gross_margin_pct, p.total_cost) ? (
                          <span
                            title={alasanMarginRagu(keandalanMargin(p.gross_margin_pct, p.total_cost)) ?? undefined}
                            style={{
                              padding: "2px 8px", borderRadius: 6, fontSize: "var(--t-kecil)", fontWeight: 700,
                              color: C.mid, background: "var(--surface-subtle)",
                              border: `1px dashed ${C.border}`,
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}
                          >
                            {p.gross_margin_pct}%
                            <span aria-hidden="true">·</span>
                            <span style={{ fontWeight: 600 }}>belum lengkap</span>
                          </span>
                        ) : (
                          <span style={{
                            padding: "2px 8px", borderRadius: 6, fontSize: "var(--t-kecil)", fontWeight: 700,
                            color: wMargin,
                            background: p.gross_margin_pct >= 20 ? C.greenBg : p.gross_margin_pct >= 0 ? C.yellowBg : C.redBg,
                          }}>{p.gross_margin_pct}%</span>
                        )}
                      </td>
                      <td style={{ ...gaya.td, color: C.yellow }}>{rp(p.advance_outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                  <th scope="row" style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.text }}>
                    TOTAL
                  </th>
                  <td style={{ ...gaya.td, fontWeight: 800, color: C.green }}>{rp(data.totals.revenue)}</td>
                  <td style={{ ...gaya.td, fontWeight: 600, color: C.text }}>{rp(data.totals.labor_cost)}</td>
                  <td style={{ ...gaya.td, fontWeight: 600, color: C.text }}>{rp(data.totals.material_cost)}</td>
                  <td style={{ ...gaya.td, fontWeight: 600, color: C.text }}>{rp(data.totals.non_labor_cost)}</td>
                  <td style={{ ...gaya.td, fontWeight: 800, color: C.red }}>{rp(data.totals.total_cost)}</td>
                  <td style={{ ...gaya.td, fontWeight: 800, color: data.totals.gross_profit >= 0 ? C.green : C.red }}>
                    {rp(data.totals.gross_profit)}
                  </td>
                  <td style={gaya.td}>
                    {data.totals.revenue > 0 && (() => {
                      const pct = data.totals.gross_profit / data.totals.revenue * 100;
                      // Total mengikuti aturan yang sama dengan barisnya.
                      // Kalau tidak, ringkasan bisa berbunyi "94,1% sehat"
                      // di atas tabel yang seluruh barisnya bertanda "biaya
                      // belum lengkap" — dan angka ringkasanlah yang paling
                      // sering dikutip keluar.
                      // Total dicurigai kalau ADA baris yang dicurigai —
                      // bukan cuma kalau totalnya sendiri melewati ambang.
                      //
                      // Diperiksa di layar: total 94,1% dengan HPP Rp 124jt
                      // lolos ambang 95%, jadi tampil HIJAU di atas tabel
                      // yang 8 dari 15 barisnya bertanda "belum lengkap".
                      // Aturannya bekerja persis seperti ditulis, tapi
                      // hasilnya tetap menyesatkan — dan angka ringkasan
                      // inilah yang paling sering dikutip keluar.
                      const raguTotal =
                        marginPerluDicurigai(pct, data.totals.total_cost) ||
                        data.projects.some((x) => marginPerluDicurigai(x.gross_margin_pct, x.total_cost));
                      return (
                        <span
                          title={raguTotal
                            ? (alasanMarginRagu(keandalanMargin(pct, data.totals.total_cost))
                                ?? "Sebagian proyek belum mencatat biayanya, jadi total ini belum bisa dipakai menilai untung-rugi.")
                            : undefined}
                          style={{
                            padding: "2px 8px", borderRadius: 6, fontSize: "var(--t-kecil)", fontWeight: 700,
                            color: raguTotal ? C.mid : warnaMargin(pct),
                            background: raguTotal
                              ? "var(--surface-subtle)"
                              : pct >= 20 ? C.greenBg : pct >= 0 ? C.yellowBg : C.redBg,
                            border: raguTotal ? `1px dashed ${C.border}` : undefined,
                          }}>
                          {Math.round(pct * 10) / 10}%{raguTotal ? " · belum lengkap" : ""}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ ...gaya.td, fontWeight: 700, color: C.yellow }}>{rp(data.totals.advance_outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Margin per proyek ──
              Diurutkan dari margin TERENDAH, bukan urutan tabel. Yang perlu
              dilihat lebih dulu di grafik ini adalah proyek yang tipis atau
              merugi — bukan yang sehat. Tabel di atas tetap urutan aslinya
              supaya bisa dicocokkan baris per baris. */}
          <div style={{ marginTop: 26 }}>
            <h2 style={{
              fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 3, height: 13, background: "var(--grad-aksen)", borderRadius: 0 }} />
              Gross Margin per Proyek
            </h2>
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, marginBottom: 14 }}>
              Diurutkan dari margin terendah · sehat ≥20%, waspada 0–20%, merugi &lt;0%
              {" · "}yang abu-abu biayanya belum tercatat, jadi marginnya belum berarti apa-apa
            </p>
            {[...data.projects]
              .sort((a, b) => a.gross_margin_pct - b.gross_margin_pct)
              .map((p) => {
                const lebar = Math.min(100, Math.max(0, Math.abs(p.gross_margin_pct)));
                const merugi = p.gross_margin_pct < 0;
                // Margin yang biayanya belum lengkap tak boleh tampil hijau
                // panjang penuh — itu bacaan "paling sehat", persis kebalikan
                // dari artinya.
                const ragu = marginPerluDicurigai(p.gross_margin_pct, p.total_cost);
                const w = ragu ? "var(--text-muted)" : warnaMargin(p.gross_margin_pct);
                return (
                  <div key={p.id} style={{ marginBottom: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{p.name}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: w,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {/* Tanda minus eksplisit: warna saja tak cukup — bagi
                            pemakai buta warna, "12%" dan "−12%" harus tetap
                            terbedakan. Alasan sama untuk "belum lengkap":
                            batang abu-abu saja tak menjelaskan apa pun. */}
                        {merugi ? "−" : ""}{Math.abs(p.gross_margin_pct)}%
                        {ragu && (
                          <span style={{ fontWeight: 600, marginLeft: 6, fontSize: "var(--t-kecil)" }}>
                            · biaya belum lengkap
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: "var(--data-diam)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${lebar}%`, borderRadius: 99,
                        // Gradasi pada batang: gelap di pangkal, terang di
                        // ujung — arah baca yang sama dengan seluruh aplikasi.
                        background: `linear-gradient(90deg, ${w} 0%, color-mix(in srgb, ${w} 55%, white) 100%)`,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
