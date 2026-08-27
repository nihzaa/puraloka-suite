"use client";

/**
 * RETENSI SUBKONTRAKTOR — uang mandor yang kita tahan, dan kapan harus
 * dicairkan.
 *
 * ── Kenapa halaman ini dibuat
 *
 * `/api/v1/mandor/retensi-register` dan `/api/v1/mandor/retensi-releases`
 * sudah ada, ber-test, dan TIDAK PUNYA LAYAR sama sekali. Ditemukan lewat
 * `scripts/uji-api-punya-ui.mjs`.
 *
 * Akibat tak adanya layar bukan sekadar fitur yang tak terpakai. Retensi
 * adalah uang MILIK MANDOR yang ditahan sementara sebagai jaminan mutu —
 * biasanya 5% dari nilai pekerjaan. Tanpa daftar, tak ada yang tahu:
 *
 *   · berapa total yang sedang ditahan (utang perusahaan, bukan kas bebas)
 *   · siapa yang pekerjaannya sudah selesai dan berhak dicairkan
 *
 * Yang kedua paling merugikan hubungan kerja: mandor menagih berkali-kali,
 * kantor tak punya tempat memeriksanya, dan uang yang seharusnya keluar
 * mengendap tanpa niat buruk siapa pun.
 *
 * ── Kenapa BUKAN di halaman /keuangan
 *
 * Retensi klien (uang KITA yang ditahan klien) dan retensi subkontraktor
 * (uang MANDOR yang kita tahan) adalah dua arah berlawanan. Menaruhnya
 * berdampingan adalah cara paling mudah salah baca mana piutang mana utang.
 * Yang ini milik modul Mandor karena tindakannya ada di sana.
 */

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, HandCoins, Lock, RefreshCw } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";

interface BarisRetensi {
  work_scope_id: string;
  scope_name: string;
  status: string;
  retensi_pct: number | null;
  mandor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  ditahan: number;
  dicairkan: number;
  outstanding: number;
}

interface Register {
  scopes: BarisRetensi[];
  total_ditahan: number;
  total_dicairkan: number;
  total_outstanding: number;
}

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);

const rpRingkas = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return rp(n);
};

export default function RetensiPage() {
  const [cairkan, setCairkan] = useState<BarisRetensi | null>(null);

  const bolehCairkan = useSyncExternalStore(
    () => () => {},
    () => hasPermission("mandor:assign"),
    () => false,
  );

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController manual.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Register>("/api/v1/mandor/retensi-register");
  const galat = galatMuat ? "Gagal memuat register retensi." : null;
  const muat = () => { void muatUlang(); };

  // Scope yang PEKERJAANNYA SELESAI tapi retensinya belum keluar. Ini yang
  // menuntut tindakan — sisanya memang belum waktunya.
  const siapCair = (data?.scopes ?? []).filter(
    (s) => s.status === "completed" && s.outstanding > 0,
  );

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda.
    <div style={{
      width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: "var(--gap-bagian)", marginBottom: 18, flexWrap: "wrap",
      }}>
        <div>
          {/* `<h2>`, bukan `<h1>`: judul halaman ("Mandor") sekarang milik
              layout modul. Dua `<h1>` dalam satu dokumen membuat pembaca
              layar kehilangan tingkatan yang seharusnya menuntunnya. */}
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
            color: C.text, margin: "0 0 4px",
          }}>Retensi Subkontraktor</h2>
          <p style={{ fontSize: 13, color: C.mid, maxWidth: 620 }}>
            Uang mandor yang ditahan sebagai jaminan mutu, dan berapa yang sudah dicairkan.
            Angka di sini adalah <strong>utang perusahaan</strong> — bukan kas bebas.
          </p>
        </div>
        <button onClick={() => muat()} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
          border: `1px solid ${C.border}`, borderRadius: 6,
          background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>
      </div>

      {/* ── Tiga angka ── */}
      <div className="rise rise-2" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 8, marginBottom: 18,
      }}>
        {[
          {
            label: "Sedang Ditahan", nilai: data?.total_outstanding ?? 0,
            sub: "belum dicairkan ke mandor", warna: C.yellow, tepi: C.yellowBorder,
            ikon: <Lock size={15} />,
          },
          {
            label: "Sudah Dicairkan", nilai: data?.total_dicairkan ?? 0,
            sub: "sudah dibayarkan", warna: C.green, tepi: C.greenBorder,
            ikon: <HandCoins size={15} />,
          },
          {
            label: "Total Retensi", nilai: data?.total_ditahan ?? 0,
            sub: "sejak awal, semua scope", warna: C.navy, tepi: undefined,
            ikon: <AlertTriangle size={15} />,
          },
        ].map((k) => (
          <div key={k.label} style={{
            background: "var(--surface)", border: `1px solid ${k.tepi ?? C.border}`,
            borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ color: k.warna, display: "flex" }}>{k.ikon}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                textTransform: "uppercase", color: C.muted,
              }}>{k.label}</span>
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
              color: k.warna, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
            }}>{memuat ? "—" : rpRingkas(k.nilai)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Yang menuntut tindakan ──
          Ditaruh SEBELUM daftar penuh: pekerjaan selesai yang retensinya
          masih ditahan adalah satu-satunya baris di halaman ini yang butuh
          keputusan hari ini. Sisanya memang belum waktunya. */}
      {!memuat && siapCair.length > 0 && (
        <div className="rise rise-2" style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 16,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <AlertTriangle size={16} color={C.yellow} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.onWarningBg, flex: 1, minWidth: 200 }}>
            <strong>{siapCair.length} scope selesai</strong> tapi retensinya belum dicairkan ·
            total {rpRingkas(siapCair.reduce((t, s) => t + s.outstanding, 0))}
          </span>
        </div>
      )}

      {galat && (
        <div role="alert" style={{
          padding: "12px var(--pad-kartu-lega)", borderRadius: 10, marginBottom: 14,
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

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>
        {memuat ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} aria-hidden="true" style={{
                height: 52, borderRadius: 10,
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              }} />
            ))}
          </div>
        ) : !data || data.scopes.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            <Lock size={34} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
            <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
              {galat ? "Register tak bisa dimuat" : "Belum ada retensi tercatat"}
            </p>
            <p>Retensi muncul di sini setelah scope pekerjaan punya persentase retensi.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              <caption className="sr-only">
                Retensi per scope pekerjaan: yang ditahan, yang sudah dicairkan, dan sisanya
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                  {["Scope · Mandor", "Proyek", "Status", "%", "Ditahan", "Dicairkan", "Sisa", ""].map((h, i) => (
                    <th key={h || i} scope="col" style={{
                      padding: "8px 12px",
                      textAlign: i >= 3 && i <= 6 ? "right" : "left",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                      textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.scopes.map((s) => {
                  const selesai = s.status === "completed";
                  const perluCair = selesai && s.outstanding > 0;
                  return (
                    <tr key={s.work_scope_id} style={{
                      borderBottom: "1px solid var(--surface-hover)",
                      // Baris yang menuntut tindakan diberi latar, BUKAN cuma
                      // teks berwarna: di tabel padat, warna teks tenggelam.
                      background: perluCair ? C.yellowBg : "transparent",
                    }}>
                      <th scope="row" style={{ padding: "12px var(--pad-kartu-lega)", textAlign: "left", fontWeight: 400 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.scope_name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{s.mandor?.name ?? "—"}</div>
                      </th>
                      <td style={{ padding: "12px var(--pad-kartu-lega)", color: C.mid }}>{s.project?.name ?? "—"}</td>
                      <td style={{ padding: "12px var(--pad-kartu-lega)" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                          background: selesai ? C.greenBg : "var(--surface-hover)",
                          color: selesai ? C.onSuccessBg : C.mid,
                        }}>{selesai ? "Selesai" : s.status}</span>
                      </td>
                      <td style={{ padding: "12px var(--pad-kartu-lega)", textAlign: "right", color: C.mid, fontVariantNumeric: "tabular-nums" }}>
                        {s.retensi_pct != null ? `${s.retensi_pct}%` : "—"}
                      </td>
                      <td style={{ padding: "12px var(--pad-kartu-lega)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.text }}>
                        {rp(s.ditahan)}
                      </td>
                      <td style={{ padding: "12px var(--pad-kartu-lega)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.green }}>
                        {s.dicairkan ? rp(s.dicairkan) : "—"}
                      </td>
                      <td style={{
                        padding: "12px var(--pad-kartu-lega)", textAlign: "right", fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: s.outstanding > 0 ? C.yellow : C.muted,
                      }}>{s.outstanding > 0 ? rp(s.outstanding) : "lunas"}</td>
                      <td style={{ padding: "12px var(--pad-kartu-lega)", textAlign: "right" }}>
                        {bolehCairkan && s.outstanding > 0 && (
                          <button onClick={() => setCairkan(s)} style={{
                            padding: "4px 12px", borderRadius: 6,
                            border: perluCair ? "none" : `1px solid ${C.border}`,
                            background: perluCair ? "var(--grad-aksen)" : "var(--surface)",
                            color: perluCair ? "var(--on-aksen)" : C.mid,
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}>Cairkan</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cairkan && (
        <ModalCairkan
          baris={cairkan}
          onClose={() => setCairkan(null)}
          onSukses={() => { setCairkan(null); muat(); }}
        />
      )}
    </div>
  );
}

/** Form pencairan retensi. Nominalnya dibatasi ke sisa — melebihi itu
 *  berarti membayar uang yang tak pernah ditahan. */
function ModalCairkan({ baris, onClose, onSukses }: {
  baris: BarisRetensi; onClose: () => void; onSukses: () => void;
}) {
  const [jumlah, setJumlah] = useState(String(baris.outstanding));
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Esc menutup modal. Ini yang membuat latar-yang-bisa-diklik tak jadi
  // jebakan keyboard: pemakai yang tak bisa memakai tetikus tetap punya
  // jalan keluar, dan `jsx-a11y` tak lagi menghitungnya sebagai kontrol
  // tanpa padanan keyboard.
  useTutupEsc(onClose);

  const nominal = Number(jumlah) || 0;
  const lebih = nominal > baris.outstanding;
  const sah = nominal > 0 && !lebih;

  async function simpan() {
    if (!sah) return;
    setKirim(true);
    setGalat(null);
    try {
      await api.post("/api/v1/mandor/retensi-releases", {
        work_scope_id: baris.work_scope_id,
        amount: nominal,
        released_at: tanggal,
        notes: catatan || null,
      });
      onSukses();
    } catch (e: unknown) {
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      // Kegagalan pencairan HARUS terlihat: kalau diam, orang mengira uang
      // sudah keluar padahal belum, dan mandor menunggu tanpa kabar.
      setGalat(pesan ?? "Gagal mencairkan retensi. Coba lagi.");
    } finally {
      setKirim(false);
    }
  }

  const gayaInput: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6,
    border: `1px solid ${C.border}`, outline: "none", boxSizing: "border-box",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
      // Latar bisa diklik untuk menutup — pola yang sudah dipakai seluruh
      // modal di repo ini. Jalan keluar keyboard dijamin `useTutupEsc` di
      // atas, jadi ini kemudahan tambahan, bukan satu-satunya cara.
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="judul-cairkan" style={{
        background: "var(--surface)", borderRadius: 14, padding: 20,
        width: "min(430px, 94vw)", display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "var(--naik-3)",
      }}>
        <div>
          <h2 id="judul-cairkan" style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display)",
          }}>Cairkan Retensi</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>
            {baris.scope_name} · {baris.mandor?.name ?? "—"}
          </p>
        </div>

        <div style={{
          padding: "8px 12px", borderRadius: 10,
          background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
          fontSize: 12, color: C.mid, display: "flex", justifyContent: "space-between",
        }}>
          <span>Sisa yang ditahan</span>
          <strong style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {rp(baris.outstanding)}
          </strong>
        </div>

        <div>
          <label htmlFor="retensi-jumlah" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Jumlah dicairkan</label>
          <input id="retensi-jumlah" type="number" min={0} max={baris.outstanding}
            value={jumlah} onChange={(e) => setJumlah(e.target.value)}
            style={{
              ...gayaInput,
              borderColor: lebih ? C.redBorder : C.border,
            }} />
          {lebih && (
            <p style={{ margin: "5px 0 0", fontSize: 11, color: C.onDangerBg }}>
              Melebihi sisa yang ditahan ({rp(baris.outstanding)}).
            </p>
          )}
        </div>

        <div>
          <label htmlFor="retensi-tanggal" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Tanggal pencairan</label>
          <input id="retensi-tanggal" type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} style={gayaInput} />
        </div>

        <div>
          <label htmlFor="retensi-catatan" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em",
          }}>Catatan <span style={{ fontWeight: 400, textTransform: "none" }}>(opsional)</span></label>
          <input id="retensi-catatan" value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. setelah masa pemeliharaan 90 hari"
            style={gayaInput} />
        </div>

        {galat && (
          <div role="alert" style={{
            padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
          }}>{galat}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
          }}>Batal</button>
          <button onClick={simpan} disabled={!sah || kirim} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: sah && !kirim ? "var(--grad-aksen)" : "var(--surface-hover)",
            color: sah && !kirim ? "var(--on-aksen)" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: sah && !kirim ? "pointer" : "not-allowed",
          }}>{kirim ? "Menyimpan..." : "Cairkan"}</button>
        </div>
      </div>
    </div>
  );
}
