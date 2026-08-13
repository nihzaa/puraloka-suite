"use client";

/**
 * KAS — AKUN. Daftar akun kas, dikelompokkan per jenis.
 *
 * Isinya dipindah dari tab pertama `kas/page.tsx`, tidak ditulis ulang.
 * Pengelompokan per jenis dan pewarnaan saldo minus dipertahankan persis:
 * total grup yang negatif tetap merah, karena "−Rp 275.025.000" yang tampil
 * hitam netral terbaca sebagai angka wajar — padahal saldo kas gabungan yang
 * negatif tak mungkin secara fisik.
 */

import { useCallback, useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { Plus, RefreshCw, Wallet } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { AccountCard, RangkaBaris } from "../_bersama/komponen";
import { CreateAccountModal } from "../_bersama/modal";
import { type CashAccount, ACCOUNT_TYPE_LABEL, fmtCompact } from "../_bersama/tipe";

export default function AkunKasPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <AkunKasIsi />;
}

function AkunKasIsi() {
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`
  // pada `POST /api/v1/cash/accounts`.
  const bolehKelola = useIzin("cash:account:manage");

  const [akun, setAkun] = useState<CashAccount[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [bukaBuat, setBukaBuat] = useState(false);

  const muat = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true);
    try {
      const r = await api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts", { signal });
      setAkun(r.data.accounts);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    // `queueMicrotask`: setState di baris pertama `muat()` jatuh di dalam
    // fase render effect. Menundanya satu microtask memindahkannya keluar
    // tanpa jeda yang terlihat — `ac.abort()` di cleanup tetap bekerja,
    // karena pembatalan terjadi belakangan.
    queueMicrotask(() => { void muat(ac.signal).catch(() => {}); });
    return () => ac.abort();
  }, [muat]);

  return (
    // Token lebar diulang di tiap halaman bagian, bukan hanya di `layout.tsx`.
    // Itu bukan kelebihan: `tata-letak-ratchet.mjs` memeriksa `page.tsx` satu
    // per satu dan tak membaca layout induknya, jadi halaman yang menyandarkan
    // lebarnya pada layout akan lolos hari ini lalu terlepas diam-diam saat
    // seseorang menyalinnya ke tempat yang tak punya layout itu. Polanya
    // mengikuti sub-halaman keuangan.
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Semua akun kas yang aktif dalam sistem</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void muat()} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)",
            color: C.mid, fontSize: 12, cursor: "pointer",
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
          {bolehKelola && (
            <button onClick={() => setBukaBuat(true)} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
              border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)",
              color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={13} aria-hidden="true" /> Akun Baru
            </button>
          )}
        </div>
      </div>

      {memuat ? (
        <RangkaBaris />
      ) : akun.length === 0 ? (
        <Kosong
          ikon={<Wallet size={40} aria-hidden="true" />}
          judul="Belum ada akun kas"
          sebab="Akun kas adalah tempat uang perusahaan dicatat — kas utama, kas kolektor, dan kas kecil per proyek. Selama belum ada satu pun, transfer dan pengeluaran tak punya sumber dana."
          aksi={bolehKelola ? (
            <button onClick={() => setBukaBuat(true)} style={{
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: "var(--grad-aksen)", color: "var(--surface)", fontSize: 13, cursor: "pointer",
            }}>Buat Akun Kas</button>
          ) : undefined}
        />
      ) : (
        (["main", "collector", "petty_cash"] as const).map(jenis => {
          const grup = akun.filter(a => a.type === jenis);
          if (!grup.length) return null;
          const meta = ACCOUNT_TYPE_LABEL[jenis];
          const totalGrup = grup.reduce((s, a) => s + Number(a.balance), 0);
          return (
            <section key={jenis} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color, margin: 0 }}>
                  {meta.icon}
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {meta.label}
                  </span>
                </h2>
                {/* Total grup minus diberi warna juga. Tanpa ini,
                    "−Rp 275.025.000" tampil hitam netral seolah angka wajar —
                    padahal saldo kas gabungan yang negatif tak mungkin. */}
                <span style={{ fontSize: 13, fontWeight: 700, color: totalGrup < 0 ? C.red : C.text }}>
                  {fmtCompact(totalGrup)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grup.map(a => <AccountCard key={a.id} acc={a} onClick={() => {}} />)}
              </div>
            </section>
          );
        })
      )}

      {bukaBuat && bolehKelola && (
        <CreateAccountModal
          onClose={() => setBukaBuat(false)}
          onSuccess={() => { setBukaBuat(false); void muat(); }}
        />
      )}
    </div>
  );
}
