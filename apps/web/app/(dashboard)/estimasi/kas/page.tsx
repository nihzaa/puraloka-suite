"use client";

/**
 * PROYEKSI KAS — perkiraan pencairan per periode dari satu RAB.
 *
 * Turunan langsung dari versi estimasi: `GET /estimate-versions/:id/
 * cashflow-forecast?periods=N`. Karena itu ia TIDAK bisa berdiri sendiri —
 * tanpa RAB, tak ada yang bisa diproyeksikan.
 *
 * Versi lama menyatakan itu dengan kalimat "Pilih proyek dan versi estimasi
 * untuk melihat proyeksi pencairan kas" di tengah kotak kosong — benar, tapi
 * buntu: pengguna yang belum punya RAB tak diberi tahu harus ke mana. Di sini
 * kekosongan itu diberi jalan keluar (spec §5).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { LayarKosong } from "@/components/layar-kosong";
import { angka, rp, type ProyekRingkas } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface VersiRingkas {
  id: string;
  version_number: number;
  status: string;
}
interface SkenarioLengkap {
  id: string;
  name: string;
  versions: VersiRingkas[];
}
interface TitikKas {
  period: number;
  disbursement: number;
  cumulative: number;
}
interface JawabKas {
  baseline_total: number;
  periods: number;
  forecast: TitikKas[];
}

const PERIODE = [6, 12, 18, 24];

// useSearchParams() memaksa render sisi-klien. Tanpa Suspense di atasnya,
// `next build` GAGAL saat prerender halaman ini — bukan peringatan, build
// berhenti. Kelas cacat yang sama sudah pernah menutup build di
// /procurement/lanjutan (UIR-0C); pola pembungkusnya disamakan.
export default function ProyeksiKasPage() {
  return (
    <Suspense fallback={null}>
      <IsiProyeksiKas />
    </Suspense>
  );
}

function IsiProyeksiKas() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const { data: dataProyek } = useData<{ projects?: ProyekRingkas[] }>("/api/v1/projects");
  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const [skenario, setSkenario] = useState<SkenarioLengkap[]>([]);
  const [versiId, setVersiId] = useState("");
  const [periode, setPeriode] = useState(12);
  const [jawab, setJawab] = useState<JawabKas | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let batal = false;
    if (!proyekId) { setSkenario([]); setVersiId(""); setJawab(null); return; }
    api.get<{ data: SkenarioLengkap[] }>(`/api/v1/projects/${proyekId}/scenarios`)
      .then((r) => { if (!batal) setSkenario(r.data.data ?? []); })
      .catch(() => { if (!batal) setSkenario([]); });
    return () => { batal = true; };
  }, [proyekId]);

  const semuaVersi = useMemo(
    () => skenario.flatMap((sc) =>
      (sc.versions ?? []).map((v) => ({ ...v, namaSkenario: sc.name }))),
    [skenario],
  );

  const muat = useCallback(async (vid: string, n: number) => {
    if (!vid) { setJawab(null); return; }
    setMemuat(true); setGalat("");
    try {
      const r = await api.get<JawabKas>(
        `/api/v1/estimate-versions/${vid}/cashflow-forecast?periods=${n}`);
      setJawab(r.data);
    } catch (e) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal memuat proyeksi");
      setJawab(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(versiId, periode); }, [versiId, periode, muat]);

  if (!proyekId) {
    return (
      <>
        <Pemilih proyek={proyek} nilai="" onPilih={(id) => router.push(`/estimasi/kas?proyek=${id}`)} />
        <LayarKosong
          ikon={<TrendingUp size={21} />}
          judul="Pilih proyek dulu"
          apa="Proyeksi kas dihitung dari RAB satu proyek."
          kenapa="Pilih proyeknya di atas untuk melihat perkiraan pencairannya."
          aksi={{ label: "Lihat daftar proyek", href: "/estimasi" }}
        />
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Pemilih
          proyek={proyek}
          nilai={proyekId}
          onPilih={(id) => router.push(id ? `/estimasi/kas?proyek=${id}` : "/estimasi/kas")}
        />

        {semuaVersi.length > 0 && (
          <>
            <Pilihan
              className="isian-fokus"
              aria-label="RAB sumber proyeksi"
              value={versiId}
              onChange={(e) => setVersiId(e.target.value)}
              style={gayaIsian}
            >
              <option value="">— pilih RAB —</option>
              {semuaVersi.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.namaSkenario} · Revisi {v.version_number}
                </option>
              ))}
            </Pilihan>

            <Pilihan
              className="isian-fokus"
              aria-label="Jumlah periode"
              value={periode}
              onChange={(e) => setPeriode(Number(e.target.value))}
              style={{ ...gayaIsian, width: 150 }}
            >
              {PERIODE.map((n) => <option key={n} value={n}>{n} periode</option>)}
            </Pilihan>
          </>
        )}
      </div>

      {galat && (
        <p role="alert" style={{
          background: "var(--danger-bg)", color: "var(--danger)",
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
          padding: "8px 12px", fontSize: "var(--teks-label)", marginBottom: 12,
        }}>{galat}</p>
      )}

      {semuaVersi.length === 0 && (
        <LayarKosong
          ikon={<TrendingUp size={21} />}
          judul="Belum ada RAB untuk diproyeksikan"
          apa="Proyeksi kas menyebar total RAB ke beberapa periode — jadi ia butuh RAB lebih dulu."
          kenapa="Proyek ini belum punya RAB sama sekali."
          aksi={{ label: "Susun RAB dulu", href: `/estimasi/rab?proyek=${proyekId}` }}
        />
      )}

      {semuaVersi.length > 0 && !versiId && !memuat && (
        <LayarKosong
          ikon={<TrendingUp size={21} />}
          judul="Pilih RAB-nya"
          apa="Tiap RAB punya proyeksi kasnya sendiri."
          kenapa={`Ada ${semuaVersi.length} RAB di proyek ini — pilih salah satu di atas.`}
          aksi={{ label: "Buka daftar RAB", href: `/estimasi/rab?proyek=${proyekId}` }}
        />
      )}

      {memuat && <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>Memuat…</p>}

      {!memuat && jawab && (jawab.forecast ?? []).length > 0 && (
        <>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
            background: C.subtle, padding: "var(--pad-kartu-lega, 16px)", marginBottom: 12,
          }}>
            <div style={{ fontSize: "var(--teks-label)", color: C.mid }}>Total RAB yang disebar</div>
            <div style={{
              fontFamily: "var(--font-display), sans-serif",
              fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.aksen,
              fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
            }}>
              {rp(jawab.baseline_total)}
            </div>
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 3 }}>
              dibagi rata ke {jawab.periods} periode
            </div>
          </div>

          <section style={{
            border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
            background: C.surface, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--teks-tabel)", fontVariantNumeric: "tabular-nums" }}>
                <caption className="sr-only">
                  Proyeksi arus kas per periode: nilai pencairan dan akumulasinya.
                </caption>
                <thead>
                  <tr>
                    <th style={th}>Periode</th>
                    <th style={{ ...th, textAlign: "right" }}>Pencairan</th>
                    <th style={{ ...th, textAlign: "right" }}>Kumulatif</th>
                  </tr>
                </thead>
                <tbody>
                  {jawab.forecast.map((t) => (
                    <tr key={t.period}>
                      <th scope="row" style={{ ...td, fontWeight: 400, textAlign: "left" }}>Periode {t.period}</th>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {angka(t.disbursement)}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {angka(t.cumulative)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Pemilih({ proyek, nilai, onPilih }: {
  proyek: ProyekRingkas[]; nilai: string; onPilih: (id: string) => void;
}) {
  return (
    <Pilihan
      className="isian-fokus"
      aria-label="Proyek"
      value={nilai}
      onChange={(e) => onPilih(e.target.value)}
      style={gayaIsian}
    >
      <option value="">— Pilih proyek —</option>
      {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Pilihan>
  );
}

const gayaIsian: React.CSSProperties = {
  width: "min(100%, 300px)", padding: "9px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-dense)",
  background: "var(--surface)", color: "var(--text-primary)",
  fontSize: "var(--teks-label)", fontFamily: "inherit",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "var(--pad-baris)",
  fontSize: "var(--t-kecil)", fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-subtle)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "var(--pad-baris)", borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};
