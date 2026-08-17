"use client";

/**
 * VARIANS BIAYA — pagu vs komitmen vs aktual, per cost code.
 *
 * Layar kendali biaya: apakah belanja masih di dalam pagu. Tiga angka yang
 * mudah tertukar, jadi ketiganya diberi keterangan di layar:
 *
 *     pagu       — yang boleh dibelanjakan  (dari RAP)
 *     komitmen   — sudah terikat PO/borongan, belum tentu dibayar
 *     aktual     — yang benar-benar keluar
 *
 * Menampilkan "aktual < pagu" sebagai aman itu menyesatkan kalau komitmennya
 * sudah melebihi pagu — uangnya belum keluar, tapi sudah terikat kontrak.
 * Karena itu kolom komitmen TIDAK disembunyikan meski nol.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { LayarKosong } from "../_bersama/layar-kosong";
import { angka, type ProyekRingkas } from "../_bersama/tipe";

interface VariansBaris {
  cost_code_id: string | null;
  code: string;
  name: string;
  status: string;
  pagu: number;
  commitment: number;
  actual: number;
  exposure: number;
  variance: number | null;
  serapan_pct: number | null;
}
interface VariansMeta {
  total_actual: number;
  commitment_total: number;
  kategori_total: number;
  kategori_dipetakan: number;
  actual_belum_dipetakan: number;
}
interface JawabVarians {
  data: VariansBaris[];
  meta: VariansMeta;
}

// Lihat catatan di /estimasi/kas: useSearchParams() tanpa Suspense
// MENGHENTIKAN `next build`, bukan sekadar memperingatkan.
export default function VariansPage() {
  return (
    <Suspense fallback={null}>
      <IsiVarians />
    </Suspense>
  );
}

function IsiVarians() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const { data: dataProyek } = useData<{ projects?: ProyekRingkas[] }>("/api/v1/projects");
  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const [jawab, setJawab] = useState<JawabVarians | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");

  const muat = useCallback(async (pid: string) => {
    if (!pid) { setJawab(null); return; }
    setMemuat(true); setGalat("");
    try {
      const r = await api.get<JawabVarians>(`/api/v1/projects/${pid}/varians`);
      setJawab(r.data);
    } catch (e) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal memuat data varians");
      setJawab(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(proyekId); }, [proyekId, muat]);

  if (!proyekId) {
    return (
      <>
        <Pemilih proyek={proyek} nilai="" onPilih={(id) => router.push(`/estimasi/varians?proyek=${id}`)} />
        <LayarKosong
          ikon={<Scale size={21} />}
          judul="Pilih proyek dulu"
          apa="Varians membandingkan pagu, komitmen, dan belanja aktual satu proyek."
          kenapa="Pilih proyeknya di atas untuk melihat perbandingannya."
          aksi={{ label: "Lihat daftar proyek", href: "/estimasi" }}
        />
      </>
    );
  }

  const baris = jawab?.data ?? [];
  const meta = jawab?.meta;

  return (
    <>
      <Pemilih
        proyek={proyek}
        nilai={proyekId}
        onPilih={(id) => router.push(id ? `/estimasi/varians?proyek=${id}` : "/estimasi/varians")}
      />

      {galat && (
        <p role="alert" style={{
          background: "var(--danger-bg)", color: "var(--danger)",
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
          padding: "8px 12px", fontSize: "var(--teks-label)", marginBottom: 12,
        }}>{galat}</p>
      )}

      {memuat && <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>Memuat…</p>}

      {!memuat && !galat && baris.length === 0 && (
        <LayarKosong
          ikon={<Scale size={21} />}
          judul="Belum ada yang bisa dibandingkan"
          apa="Varians mengadu pagu RAP dengan belanja yang benar-benar terjadi."
          kenapa="Proyek ini belum punya pagu RAP, atau belum ada belanja yang tercatat. Bentuk RAP-nya dulu."
          aksi={{ label: "Buka Anggaran Pelaksanaan", href: `/estimasi/rap?proyek=${proyekId}` }}
        />
      )}

      {!memuat && baris.length > 0 && (
        <>
          {meta && meta.actual_belum_dipetakan > 0 && (
            <p style={{
              background: "var(--warning-bg, var(--surface-subtle))",
              border: `1px solid ${C.border}`,
              borderRadius: "var(--radius-dense)",
              padding: "9px 12px", fontSize: "var(--teks-label)",
              color: C.mid, marginBottom: 12, lineHeight: 1.55,
            }}>
              <b>{angka(meta.actual_belum_dipetakan)}</b> belanja belum terpetakan ke
              cost code mana pun — angkanya nyata, tetapi belum masuk baris di
              bawah. {meta.kategori_dipetakan}/{meta.kategori_total} kategori
              sudah dipetakan.
            </p>
          )}

          <section style={{
            border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
            background: C.surface, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--teks-tabel)" }}>
                <thead>
                  <tr>
                    <th style={th}>Cost code</th>
                    <th style={{ ...th, textAlign: "right" }} title="Yang boleh dibelanjakan (dari RAP)">Pagu</th>
                    <th style={{ ...th, textAlign: "right" }} title="Sudah terikat PO/borongan, belum tentu dibayar">Komitmen</th>
                    <th style={{ ...th, textAlign: "right" }} title="Yang benar-benar sudah keluar">Aktual</th>
                    <th style={{ ...th, textAlign: "right" }}>Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => {
                    const lewat = b.variance != null && b.variance < 0;
                    return (
                      <tr key={b.cost_code_id ?? b.code}>
                        <td style={td}>
                          <span style={{ color: C.aksen, fontWeight: 600 }}>{b.code}</span>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{b.name}</div>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {b.pagu ? angka(b.pagu) : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {b.commitment ? angka(b.commitment) : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {b.actual ? angka(b.actual) : "—"}
                        </td>
                        <td style={{
                          ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: b.variance == null ? C.muted : lewat ? "var(--danger)" : C.text,
                        }}>
                          {b.variance == null ? "—" : angka(b.variance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p style={{ fontSize: 11, color: C.muted, marginTop: 9, lineHeight: 1.6 }}>
            <b>Pagu</b> = yang boleh dibelanjakan (dari RAP) ·{" "}
            <b>Komitmen</b> = sudah terikat PO/borongan meski belum dibayar ·{" "}
            <b>Aktual</b> = yang benar-benar keluar. Selisih negatif berarti
            sudah melewati pagu.
          </p>
        </>
      )}
    </>
  );
}

function Pemilih({ proyek, nilai, onPilih }: {
  proyek: ProyekRingkas[]; nilai: string; onPilih: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <select
        className="isian-fokus"
        aria-label="Proyek"
        value={nilai}
        onChange={(e) => onPilih(e.target.value)}
        style={{
          width: "min(100%, 340px)", padding: "9px 12px",
          border: `1px solid var(--border-strong)`,
          borderRadius: "var(--radius-dense)",
          background: C.surface, color: C.text,
          fontSize: "var(--teks-label)", fontFamily: "inherit",
        }}
      >
        <option value="">— Pilih proyek —</option>
        {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "var(--pad-baris)",
  fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-subtle)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "var(--pad-baris)", borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};
