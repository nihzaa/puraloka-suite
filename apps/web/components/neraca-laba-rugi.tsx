"use client";

/**
 * NERACA & LABA-RUGI (INTI #1).
 *
 * ── Kenapa satu komponen, bukan dua halaman
 *
 * Keduanya dihitung dari SATU panggilan `/api/v1/gl/laporan`, dan itu
 * disengaja. Kalau dipisah, orang akan membuka salah satunya, lalu
 * membandingkan angkanya dengan yang lain — dan kalau rentang tanggalnya
 * beda sedikit, laba di neraca tak sama dengan laba di laba-rugi. Selisih
 * itu tak punya sebab yang bisa dijelaskan, dan orang berhenti memercayai
 * keduanya.
 *
 * ── Yang paling dijaga di layar ini
 *
 * **Ketidakseimbangan harus TERLIHAT, bukan disamarkan.** Neraca yang tak
 * seimbang berarti ada jurnal bocor — dan menampilkannya seolah normal
 * adalah kegagalan yang jauh lebih besar daripada tampilan yang jelek.
 * Karena itu status seimbang/tidak ada di paling atas, bukan di catatan kaki.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Scale } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";

interface Kelompok {
  label: string;
  akun: Array<{ account_id: string; code: string; name: string; saldo: number }>;
  total: number;
}

interface Laporan {
  periode: { dari: string | null; sampai: string | null };
  neraca: {
    aset: Kelompok; liabilitas: Kelompok; ekuitas: Kelompok;
    labaBerjalan: number; totalEkuitasDenganLaba: number;
    selisih: number; seimbang: boolean;
  };
  labaRugi: {
    pendapatan: Kelompok; beban: Kelompok;
    labaKotor: number; labaBersih: number; marginPct: number | null;
  };
  meta: { jumlah_akun: number; terpotong: boolean };
}

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

/** Daftar akun satu kelompok, dengan totalnya. */
function DaftarAkun({ kelompok, warnaTotal }: { kelompok: Kelompok; warnaTotal?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: ".05em",
        padding: "8px 12px", background: "var(--surface-subtle)",
        borderBottom: `1px solid ${C.border}`,
      }}>{kelompok.label}</div>

      {kelompok.akun.length === 0 ? (
        <div style={{ padding: "12px 12px", fontSize: 12, color: C.muted }}>
          Belum ada saldo pada kelompok ini.
        </div>
      ) : (
        kelompok.akun.map((a) => (
          <div key={a.account_id} style={{
            display: "flex", justifyContent: "space-between", gap: 12,
            padding: "8px 12px", borderBottom: "1px solid var(--surface-hover)",
            fontSize: 12,
          }}>
            <span style={{ color: C.text, minWidth: 0 }}>
              <span style={{
                color: C.muted, fontVariantNumeric: "tabular-nums", marginRight: 7,
              }}>{a.code}</span>
              {a.name}
            </span>
            <span style={{
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              color: a.saldo < 0 ? C.red : C.text,
            }}>{rp(a.saldo)}</span>
          </div>
        ))
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", gap: 12,
        padding: "8px 12px", borderTop: `2px solid ${C.border}`,
        fontSize: 13, fontWeight: 700,
        background: "var(--surface-subtle)",
      }}>
        <span style={{ color: C.text }}>Total {kelompok.label}</span>
        <span style={{
          fontVariantNumeric: "tabular-nums",
          color: warnaTotal ?? C.text,
        }}>{rp(kelompok.total)}</span>
      </div>
    </div>
  );
}

export function NeracaLabaRugi() {
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [data, setData] = useState<Laporan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback((signal?: AbortSignal) => {
    setMemuat(true);
    const params: Record<string, string> = {};
    if (dari) params.from = dari;
    if (sampai) params.to = sampai;
    return api.get<Laporan>("/api/v1/gl/laporan", { params, signal })
      .then((r) => { setData(r.data); setGalat(null); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setData(null);
        setGalat(e?.response?.data?.error ?? "Gagal memuat laporan keuangan.");
      })
      .finally(() => setMemuat(false));
  }, [dari, sampai]);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  function unduhCsv() {
    if (!data) return;
    const b: string[] = ["Bagian,Kode,Akun,Saldo"];
    const tulis = (bagian: string, k: Kelompok) => {
      for (const a of k.akun) {
        b.push(`${bagian},${a.code},"${a.name.replace(/"/g, '""')}",${a.saldo}`);
      }
      b.push(`${bagian},,TOTAL ${k.label},${k.total}`);
    };
    tulis("NERACA", data.neraca.aset);
    tulis("NERACA", data.neraca.liabilitas);
    tulis("NERACA", data.neraca.ekuitas);
    b.push(`NERACA,,LABA BERJALAN,${data.neraca.labaBerjalan}`);
    tulis("LABA-RUGI", data.labaRugi.pendapatan);
    tulis("LABA-RUGI", data.labaRugi.beban);
    b.push(`LABA-RUGI,,LABA BERSIH,${data.labaRugi.labaBersih}`);

    const blob = new Blob([b.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-keuangan-${dari || "awal"}-${sampai || "kini"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gayaInput: React.CSSProperties = {
    padding: "8px 12px", fontSize: 13, borderRadius: 6,
    border: `1px solid ${C.border}`, outline: "none",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };
  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 14, overflow: "hidden",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label htmlFor="lap-dari" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Dari</label>
          <input id="lap-dari" type="date" value={dari}
            onChange={(e) => setDari(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="lap-sampai" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Sampai</label>
          <input id="lap-sampai" type="date" value={sampai}
            onChange={(e) => setSampai(e.target.value)} style={gayaInput} />
        </div>
        {data && (
          <button type="button" onClick={unduhCsv} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <Download size={13} aria-hidden="true" /> CSV
          </button>
        )}
      </div>

      {galat && (
        <div role="alert" style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {galat}{" "}
          <button onClick={() => muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid }}>
          <Loader2 size={20} className="spin" aria-hidden="true" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Menghitung laporan…</p>
        </div>
      ) : !data ? null : (
        <>
          {/* ── Status keseimbangan ──
              DI ATAS, bukan di catatan kaki. Neraca yang tak seimbang
              berarti ada jurnal bocor, dan menampilkannya seolah normal
              adalah kegagalan yang jauh lebih besar daripada tampilan
              yang jelek. */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "12px 16px", borderRadius: 10, marginBottom: 14,
            background: data.neraca.seimbang ? C.greenBg : C.redBg,
            border: `1px solid ${data.neraca.seimbang ? C.greenBorder : C.redBorder}`,
          }}>
            {data.neraca.seimbang
              ? <CheckCircle2 size={16} color={C.green} aria-hidden="true" style={{ flexShrink: 0 }} />
              : <AlertTriangle size={16} color={C.red} aria-hidden="true" style={{ flexShrink: 0 }} />}
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: data.neraca.seimbang ? C.onSuccessBg : C.onDangerBg,
            }}>
              {data.neraca.seimbang
                ? "Neraca seimbang — aset = liabilitas + ekuitas + laba berjalan"
                : `Neraca TIDAK seimbang · selisih ${rp(data.neraca.selisih)}`}
            </span>
            {!data.neraca.seimbang && (
              <span style={{ fontSize: 12, color: C.onDangerBg }}>
                Ada jurnal yang debit dan kreditnya tak sama. Periksa Buku Besar.
              </span>
            )}
            {data.meta.terpotong && (
              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 600,
                padding: "2px 8px", borderRadius: 99,
                background: C.yellowBg, color: C.onWarningBg,
                border: `1px solid ${C.yellowBorder}`,
              }}>
                Dibatasi 1.000 jurnal — persempit rentang tanggal
              </span>
            )}
          </div>

          {/* ── Laba-Rugi lebih dulu ──
              Neraca menjawab "berapa harta dan utang saya"; laba-rugi
              menjawab "apakah bulan ini saya untung". Yang kedua ditanya
              lebih sering, jadi ditaruh lebih dulu. */}
          <h3 style={{
            fontSize: 13, fontWeight: 700, color: C.text,
            margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 3, height: 14, background: "var(--grad-aksen)", borderRadius: 0 }} />
            Laba Rugi
          </h3>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12, marginBottom: 12,
          }}>
            <div style={kartu}><DaftarAkun kelompok={data.labaRugi.pendapatan} warnaTotal={C.green} /></div>
            <div style={kartu}><DaftarAkun kelompok={data.labaRugi.beban} warnaTotal={C.red} /></div>
          </div>

          <div style={{
            ...kartu, padding: "12px 16px", marginBottom: 22,
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
          }}>
            {[
              { l: "Laba Kotor", v: rp(data.labaRugi.labaKotor), w: C.text,
                s: "pendapatan − harga pokok" },
              { l: "Laba Bersih", v: rp(data.labaRugi.labaBersih),
                w: data.labaRugi.labaBersih >= 0 ? C.green : C.red,
                s: "pendapatan − seluruh beban" },
              { l: "Margin Bersih",
                // `null` berarti belum bisa dihitung, BUKAN nol persen.
                // "0%" pada perusahaan yang belum menagih adalah kabar salah.
                v: data.labaRugi.marginPct == null ? "—" : `${data.labaRugi.marginPct}%`,
                w: (data.labaRugi.marginPct ?? 0) >= 20 ? C.green
                  : (data.labaRugi.marginPct ?? 0) >= 0 ? C.yellow : C.red,
                s: data.labaRugi.marginPct == null ? "belum ada pendapatan" : "terhadap pendapatan" },
            ].map((k) => (
              <div key={k.l}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4,
                }}>{k.l}</div>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: k.w,
                  fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                }}>{k.v}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* ── Neraca ── */}
          <h3 style={{
            fontSize: 13, fontWeight: 700, color: C.text,
            margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <Scale size={14} color={C.navy} aria-hidden="true" /> Neraca
          </h3>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12,
          }}>
            <div style={kartu}>
              <DaftarAkun kelompok={data.neraca.aset} warnaTotal={C.navy} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={kartu}><DaftarAkun kelompok={data.neraca.liabilitas} /></div>
              <div style={kartu}>
                <DaftarAkun kelompok={data.neraca.ekuitas} />
                {/* Laba berjalan ditampilkan SEBAGAI BAGIAN ekuitas, bukan
                    kelompok terpisah — itu memang tempatnya secara akuntansi,
                    dan memisahkannya membuat orang lupa menjumlahkannya. */}
                <div style={{
                  display: "flex", justifyContent: "space-between", gap: 12,
                  padding: "8px 12px", fontSize: 12,
                  borderTop: "1px solid var(--surface-hover)",
                }}>
                  <span style={{ color: C.text }}>Laba berjalan periode ini</span>
                  <span style={{
                    fontVariantNumeric: "tabular-nums",
                    color: data.neraca.labaBerjalan >= 0 ? C.green : C.red,
                  }}>{rp(data.neraca.labaBerjalan)}</span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", gap: 12,
                  padding: "8px 12px", borderTop: `2px solid ${C.border}`,
                  fontSize: 13, fontWeight: 700, background: "var(--surface-subtle)",
                }}>
                  <span style={{ color: C.text }}>Ekuitas + Laba</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: C.navy }}>
                    {rp(data.neraca.totalEkuitasDenganLaba)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
            {data.meta.jumlah_akun} akun bersaldo · hanya jurnal <strong>posted</strong> yang dihitung —
            draft belum sah, dan yang dibatalkan tak masuk.
          </p>
        </>
      )}
    </div>
  );
}
