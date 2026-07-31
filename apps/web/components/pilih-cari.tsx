"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X, Check } from "lucide-react";

// Dropdown yang bisa dicari — untuk daftar yang terlalu panjang bagi `<select>`.
//
// ── Kenapa `<select>` biasa tak cukup di sini
//
// Pemilih analisa di Komposer memuat 3.040 pilihan. `<select>` asli hanya bisa
// diloncati dengan mengetik huruf awal, jadi menemukan "Pasangan dinding bata
// merah tebal 1/2 batu" berarti menggulung ribuan baris. Orang lapangan yang
// tahu barangnya tapi tidak hafal urutan katalog praktis tak bisa memakainya.
//
// ── Yang SENGAJA dipertahankan dari `<select>`
//
// Keyboard: ↑/↓ berpindah, Enter memilih, Esc menutup, Tab keluar. Label tetap
// terhubung lewat `aria-labelledby`, dan status buka/tutup diumumkan lewat
// `aria-expanded` + `role="listbox"`. Komponen kustom yang mengorbankan ini
// menukar satu masalah dengan masalah yang lebih buruk bagi pemakai keyboard
// dan pembaca layar.
//
// ── Batas yang disadari
//
// Daftar dirender penuh saat terbuka (tanpa virtualisasi), tapi HANYA setelah
// disaring dan dibatasi `maksTampil`. Untuk 3.040 item, hasil saringan yang
// realistis puluhan — jauh di bawah ambang yang membebani browser.

export interface OpsiPilih {
  value: string;
  /** Teks utama yang dicari & ditampilkan. */
  label: string;
  /** Baris kedua yang lebih redup — mis. satuan atau kode. */
  keterangan?: string;
  /** Nama kelompok. Opsi tanpa grup tampil di atas. */
  grup?: string;
  /** Penanda kecil di kanan (mis. "3 tanpa harga"). */
  badge?: string;
  nonaktif?: boolean;
}

export function PilihCari({
  opsi, value, onChange, placeholder = "— pilih —", labelId,
  maksTampil = 200, kosong = "Tidak ada yang cocok.",
}: {
  opsi: OpsiPilih[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  labelId?: string;
  maksTampil?: number;
  kosong?: string;
}) {
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const wadah = useRef<HTMLDivElement | null>(null);
  const daftarId = useId();

  const terpilih = opsi.find(o => o.value === value) ?? null;

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const cocok = q
      ? opsi.filter(o =>
          o.label.toLowerCase().includes(q) ||
          (o.keterangan ?? "").toLowerCase().includes(q))
      : opsi;
    return cocok.slice(0, maksTampil);
  }, [opsi, cari, maksTampil]);

  const terpotong = cari.trim()
    ? false
    : opsi.length > hasil.length;

  // Klik di luar menutup. Tanpa ini, dropdown tetap terbuka saat pemakai
  // beralih ke bagian lain dan menutupi isinya.
  useEffect(() => {
    if (!buka) return;
    const onKlik = (e: MouseEvent) => {
      if (wadah.current && !wadah.current.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", onKlik);
    return () => document.removeEventListener("mousedown", onKlik);
  }, [buka]);

  function pilih(o: OpsiPilih) {
    if (o.nonaktif) return;
    onChange(o.value);
    setBuka(false);
    setCari("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (!buka && (e.key === "ArrowDown" || e.key === "Enter")) {
      setBuka(true); setSorot(0); e.preventDefault(); return;
    }
    if (!buka) return;
    if (e.key === "ArrowDown") { setSorot(s => Math.min(s + 1, hasil.length - 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setSorot(s => Math.max(s - 1, 0)); e.preventDefault(); }
    else if (e.key === "Enter") { if (hasil[sorot]) pilih(hasil[sorot]); e.preventDefault(); }
    else if (e.key === "Escape") { setBuka(false); setCari(""); }
  }

  const kotak: React.CSSProperties = {
    width: "100%", padding: "9px 11px", fontSize: 13, borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface)",
    color: "var(--text-primary)", minHeight: 38, textAlign: "left", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 8,
  };

  return (
    <div ref={wadah} style={{ position: "relative" }}>
      {/* Tombol pembuka dan tombol "kosongkan" BERSEBELAHAN, bukan bersarang:
          <button> di dalam <button> adalah HTML tidak sah — browser
          memperbaikinya sendiri dengan cara yang tak bisa diandalkan, dan
          pembaca layar mengumumkannya secara aneh. */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button type="button" style={{ ...kotak, paddingRight: terpilih ? 34 : 11 }}
          onClick={() => { setBuka(b => !b); setSorot(0); }}
          onKeyDown={onKey} aria-haspopup="listbox" aria-expanded={buka}
          aria-controls={buka ? daftarId : undefined} aria-labelledby={labelId}>
          <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden="true" />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: terpilih ? "var(--text-primary)" : "var(--text-muted)" }}>
            {terpilih ? terpilih.label : placeholder}
          </span>
        </button>
        {terpilih && (
          <button type="button" aria-label="Kosongkan pilihan"
            onClick={() => onChange("")}
            style={{ position: "absolute", right: 8, display: "flex", padding: 4,
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)" }}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {buka && (
        <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
            {/* autoFocus disengaja: dropdown baru saja dibuka atas permintaan
                pemakai, dan mengetik langsung adalah alasan utama ia dibuka. */}
            <input autoFocus type="search" value={cari} onChange={e => { setCari(e.target.value); setSorot(0); }}
              onKeyDown={onKey} placeholder="Ketik untuk mencari…"
              aria-label="Cari pilihan"
              style={{ width: "100%", padding: "7px 9px", fontSize: 13, borderRadius: 7,
                border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--text-primary)", boxSizing: "border-box" }} />
          </div>

          <div id={daftarId} role="listbox" aria-labelledby={labelId}
            style={{ maxHeight: 300, overflowY: "auto" }}>
            {hasil.length === 0 && (
              <p style={{ margin: 0, padding: "14px 12px", fontSize: 12.5, color: "var(--text-muted)" }}>
                {kosong}
              </p>
            )}
            {hasil.map((o, i) => {
              const grupBaru = i === 0 || hasil[i - 1].grup !== o.grup;
              return (
                <div key={o.value}>
                  {grupBaru && o.grup && (
                    <div style={{ padding: "7px 12px 4px", fontSize: 11, fontWeight: 700,
                      color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4,
                      background: "var(--bg)" }}>
                      {o.grup}
                    </div>
                  )}
                  {/* `<button>`, bukan `<div role="option">` yang bisa diklik:
                      elemen div dengan onClick tak bisa dicapai keyboard maupun
                      diaktifkan dengan Enter/Space. Tombol memberi keduanya
                      secara bawaan — dan `role="option"` tetap dipasang supaya
                      pembaca layar mengenalinya sebagai bagian listbox. */}
                  <button type="button" role="option" aria-selected={o.value === value}
                    disabled={o.nonaktif}
                    onMouseEnter={() => setSorot(i)}
                    onClick={() => pilih(o)}
                    style={{ width: "100%", border: "none", font: "inherit", textAlign: "left",
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "8px 12px", fontSize: 12.5, lineHeight: 1.45,
                      cursor: o.nonaktif ? "not-allowed" : "pointer",
                      opacity: o.nonaktif ? 0.45 : 1,
                      background: i === sorot ? "var(--bg)" : "transparent",
                      color: "var(--text-primary)" }}>
                    <span style={{ flex: 1 }}>
                      {o.label}
                      {o.keterangan && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                          {o.keterangan}
                        </span>
                      )}
                    </span>
                    {o.badge && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--warning)",
                        background: "var(--warning-bg)", padding: "1px 6px", borderRadius: 999,
                        whiteSpace: "nowrap" }}>
                        {o.badge}
                      </span>
                    )}
                    {o.value === value && <Check size={14} style={{ color: "var(--success)", flexShrink: 0 }} />}
                  </button>
                </div>
              );
            })}
            {terpotong && (
              <p style={{ margin: 0, padding: "8px 12px", fontSize: 11.5, color: "var(--text-muted)",
                borderTop: "1px solid var(--border)" }}>
                Menampilkan {hasil.length} dari {opsi.length.toLocaleString("id-ID")} — ketik untuk mempersempit.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
