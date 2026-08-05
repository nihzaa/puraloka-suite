"use client";

/**
 * BUKU BESAR — mutasi satu akun, dengan saldo berjalan.
 *
 * ── Kenapa dibuat
 *
 * `/api/v1/gl/ledger` sudah ada, ber-test, dan TIDAK PUNYA LAYAR. Ditemukan
 * lewat `uji-api-punya-ui.mjs`.
 *
 * Neraca Saldo yang sudah ada menjawab "berapa saldo tiap akun". Buku besar
 * menjawab pertanyaan berikutnya, yang selalu muncul begitu ada angka
 * mencurigakan: **"dari mana saldo itu datang?"** Tanpa layar ini, satu-
 * satunya jalan adalah membaca jurnal satu per satu dan menyaring dengan
 * mata — persis pekerjaan yang seharusnya dikerjakan komputer.
 *
 * ── Saldo berjalan dihitung di sini, bukan di API
 *
 * API memulangkan baris mutasi apa adanya. Saldo berjalan bergantung pada
 * URUTAN dan SIFAT akun, dan keduanya cuma bermakna setelah satu akun
 * dipilih:
 *
 *   aset & beban   → bertambah di DEBIT   (saldo normal debit)
 *   liabilitas, ekuitas, pendapatan → bertambah di KREDIT
 *
 * Menghitungnya tanpa memperhatikan sifat akun menghasilkan saldo kas yang
 * NEGATIF saat kas bertambah — kesalahan klasik yang terlihat masuk akal
 * sampai ada yang mencocokkannya dengan rekening koran.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Loader2 } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";

export interface AkunRingkas {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BarisLedger {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  account_id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  project_id: string | null;
}

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

const tanggal = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Akun bersaldo normal DEBIT bertambah saat didebit; sisanya sebaliknya.
 * Ini aturan akuntansi, bukan pilihan tampilan — karena itu ia kode, bukan
 * konfigurasi (Ember [C], CLAUDE.md §5.3).
 */
function saldoNormalDebit(tipe: string) {
  return tipe === "asset" || tipe === "expense";
}

export function BukuBesar({ akun }: { akun: AkunRingkas[] }) {
  const [akunId, setAkunId] = useState("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [baris, setBaris] = useState<BarisLedger[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const akunTerpilih = akun.find((a) => a.id === akunId) ?? null;

  const muat = useCallback((signal?: AbortSignal) => {
    // Tanpa akun terpilih, buku besar tak punya makna: ia laporan PER AKUN.
    // Memuat semua baris tanpa saringan hanya menghasilkan daftar panjang
    // yang tak bisa dijumlahkan jadi saldo apa pun.
    if (!akunId) { setBaris([]); return Promise.resolve(); }
    setMemuat(true);
    const params: Record<string, string> = { account_id: akunId };
    if (dari) params.from = dari;
    if (sampai) params.to = sampai;
    return api.get<{ data: BarisLedger[] }>("/api/v1/gl/ledger", { params, signal })
      .then((r) => { setBaris(r.data.data); setGalat(null); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setBaris([]);
        setGalat(e?.response?.data?.error ?? "Gagal memuat buku besar.");
      })
      .finally(() => setMemuat(false));
  }, [akunId, dari, sampai]);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  /** Baris + saldo berjalan. */
  const denganSaldo = useMemo(() => {
    if (!akunTerpilih) return [];
    const normalDebit = saldoNormalDebit(akunTerpilih.type);
    let saldo = 0;
    return baris.map((b) => {
      saldo += normalDebit ? b.debit - b.credit : b.credit - b.debit;
      return { ...b, saldo };
    });
  }, [baris, akunTerpilih]);

  const totalDebit = baris.reduce((s, b) => s + b.debit, 0);
  const totalKredit = baris.reduce((s, b) => s + b.credit, 0);
  const saldoAkhir = denganSaldo.length ? denganSaldo[denganSaldo.length - 1].saldo : 0;

  function unduhCsv() {
    if (!akunTerpilih || !denganSaldo.length) return;
    const kepala = ["Tanggal", "No Jurnal", "Keterangan", "Debit", "Kredit", "Saldo"];
    const isi = denganSaldo.map((b) => [
      b.entry_date, b.entry_number,
      // Tanda kutip di keterangan digandakan — kalau tidak, satu tanda kutip
      // dalam catatan memecah seluruh kolom di Excel.
      `"${(b.description ?? "").replace(/"/g, '""')}"`,
      b.debit, b.credit, b.saldo,
    ].join(","));
    const blob = new Blob([[kepala.join(","), ...isi].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-besar-${akunTerpilih.code}-${dari || "awal"}-${sampai || "kini"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gayaInput: React.CSSProperties = {
    padding: "8px 12px", fontSize: 13, borderRadius: 6,
    border: `1px solid ${C.border}`, outline: "none",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  return (
    <div>
      {/* ── Saringan ── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 16,
        flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <label htmlFor="bb-akun" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Akun</label>
          <select id="bb-akun" value={akunId} onChange={(e) => setAkunId(e.target.value)}
            style={{ ...gayaInput, width: "100%" }}>
            <option value="">— pilih akun —</option>
            {akun.map((a) => (
              <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bb-dari" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Dari</label>
          <input id="bb-dari" type="date" value={dari}
            onChange={(e) => setDari(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="bb-sampai" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Sampai</label>
          <input id="bb-sampai" type="date" value={sampai}
            onChange={(e) => setSampai(e.target.value)} style={gayaInput} />
        </div>
        {denganSaldo.length > 0 && (
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
        }}>{galat}</div>
      )}

      {!akunId ? (
        <div style={{
          padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 14,
        }}>
          <BookOpen size={34} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Pilih akun dulu</p>
          <p>Buku besar menampilkan mutasi satu akun beserta saldo berjalannya.</p>
        </div>
      ) : memuat ? (
        <div style={{
          padding: 40, textAlign: "center", color: C.mid,
          background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 14,
        }}>
          <Loader2 size={20} className="spin" aria-hidden="true" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Memuat mutasi…</p>
        </div>
      ) : denganSaldo.length === 0 ? (
        <div style={{
          padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 14,
        }}>
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Tidak ada mutasi pada rentang ini
          </p>
          <p>
            Hanya jurnal ber-status <strong>posted</strong> yang masuk buku besar —
            draft belum sah, dan yang dibatalkan tak dihitung.
          </p>
        </div>
      ) : (
        <>
          {/* Tiga angka penutup — ditaruh DI ATAS tabel supaya terbaca
              sebelum menggulir. Saldo akhir adalah yang dicari orang; debit
              dan kredit ada untuk mencocokkannya. */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8, marginBottom: 14,
          }}>
            {[
              { l: "Total Debit", v: totalDebit, w: C.text },
              { l: "Total Kredit", v: totalKredit, w: C.text },
              {
                l: `Saldo Akhir (${saldoNormalDebit(akunTerpilih?.type ?? "") ? "D" : "K"})`,
                v: saldoAkhir,
                w: saldoAkhir >= 0 ? C.navy : C.red,
              },
            ].map((k) => (
              <div key={k.l} style={{
                padding: "12px 12px", borderRadius: 10,
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4,
                }}>{k.l}</div>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: k.w,
                  fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                }}>{rp(k.v)}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--surface)", border: `1px solid ${C.border}`,
            borderRadius: 14, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                <caption className="sr-only">
                  Buku besar akun {akunTerpilih?.code} {akunTerpilih?.name}: mutasi dan saldo berjalan
                </caption>
                <thead>
                  <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                    {["Tanggal", "No. Jurnal", "Keterangan", "Debit", "Kredit", "Saldo"].map((h, i) => (
                      <th key={h} scope="col" style={{
                        padding: "8px 12px", textAlign: i >= 3 ? "right" : "left",
                        fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                        textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {denganSaldo.map((b, i) => (
                    <tr key={`${b.entry_id}-${i}`} style={{ borderBottom: "1px solid var(--surface-hover)" }}>
                      <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap" }}>
                        {tanggal(b.entry_date)}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: C.navy, whiteSpace: "nowrap" }}>
                        {b.entry_number}
                      </td>
                      <td style={{ padding: "8px 12px", color: C.text }}>{b.description || "—"}</td>
                      <td style={{
                        padding: "8px 12px", textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: b.debit ? C.text : C.muted,
                      }}>{b.debit ? rp(b.debit) : "—"}</td>
                      <td style={{
                        padding: "8px 12px", textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: b.credit ? C.text : C.muted,
                      }}>{b.credit ? rp(b.credit) : "—"}</td>
                      <td style={{
                        padding: "8px 12px", textAlign: "right", fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: b.saldo >= 0 ? C.text : C.red,
                      }}>{rp(b.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "right" }}>
            {denganSaldo.length} baris · hanya jurnal <strong>posted</strong>
            {denganSaldo.length >= 500 && " · dibatasi 500 baris teratas, persempit rentang tanggal"}
          </p>
        </>
      )}
    </div>
  );
}
