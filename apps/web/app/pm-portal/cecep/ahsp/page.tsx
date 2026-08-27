"use client";

// ============================================================================
// Katalog AHSP — Master Data CECEP (Tahap 3, Task 18), READ-ONLY.
//
// PM punya `cecep:assembly:view` TAPI TIDAK `cecep:assembly:manage` — halaman
// ini sengaja tanpa tombol tambah/ubah/hapus, bukan kelalaian.
//
// Pencarian SERVER-SIDE (parameter `q`, bukan filter di klien): katalog
// berisi 3.000+ baris dan respons dibatasi (default 100, cap keras 5.000 di
// backend + batas PostgREST 1.000/halaman yang sudah ditangani server lewat
// paging bertahap) — menyaring di klien berarti baris di luar batas awal
// TIDAK PERNAH bisa ditemukan. Debounce 300ms supaya tak mengetik = tak
// mengirim request per huruf.
//
// Bentuk `AssemblyKatalog`/`RespAssemblyKatalog` diverifikasi PERSIS ke
// `apps/api/src/routes/v1/ahsp.ts:285-345` (GET /cecep/assemblies) — dua kali
// (brief + verifikasi ulang independen Task 18).
// ============================================================================

import { useEffect, useState } from "react";
import { Search, Layers, ChevronRight } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespAssemblyKatalog, AssemblyKatalog, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function PmKatalogAhspPage() {
  const [cari, setCari] = useState("");
  const cariDebounced = useDebounced(cari, 300);
  const [dipilih, setDipilih] = useState<AssemblyKatalog | null>(null);

  const url = `/api/v1/cecep/assemblies?limit=100${cariDebounced ? `&q=${encodeURIComponent(cariDebounced)}` : ""}`;
  const { data, memuat, galat } = useData<RespAssemblyKatalog>(url);

  const daftar = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Katalog AHSP
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Analisa harga satuan pekerjaan nasional — rujukan, bukan alat sunting.
        </p>
      </div>

      <label style={{ position: "relative", display: "block" }}>
        <span className="sr-only">Cari kode atau nama analisa</span>
        <Search
          size={15}
          aria-hidden="true"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
        />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari kode atau nama analisa…"
          style={{ width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", background: "var(--surface)", color: "var(--text-primary)" }}
        />
      </label>

      {data?.total != null && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Menampilkan {daftar.length} dari {data.total} analisa
        </div>
      )}

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && (
        <EmptyState icon={Layers} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
      )}
      {!memuat && !galat && daftar.length === 0 && (
        <EmptyState
          icon={Layers}
          judul={cariDebounced ? "Tidak ditemukan" : "Katalog kosong"}
          deskripsi={cariDebounced ? `Tak ada analisa cocok "${cariDebounced}".` : "Belum ada analisa AHSP terdaftar."}
        />
      )}

      {daftar.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => setDipilih(a)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gap-grid)", padding: "var(--pad-kartu)", borderRadius: "var(--portal-radius-card)", background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{a.code}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {a.output_unit_code ?? "—"} · {a.components.length} komponen · {a.edition?.code ?? a.source}
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-secondary)" aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      ))}

      <BottomSheet terbuka={dipilih !== null} onTutup={() => setDipilih(null)} judul={dipilih?.code ?? ""}>
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{dipilih.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Satuan {dipilih.output_unit_code ?? "—"} · Faktor limbah {dipilih.waste_factor ?? "—"}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginTop: 4 }}>Komponen</div>
            {dipilih.components.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Belum ada komponen tercatat.</div>
            )}
            {dipilih.components.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.resource?.name ?? "—"}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.coefficient} {c.resource?.unit_code ?? ""}</div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
