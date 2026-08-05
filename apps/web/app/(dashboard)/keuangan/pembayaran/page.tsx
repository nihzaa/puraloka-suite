"use client";

/**
 * PEMBAYARAN MASUK — uang yang benar-benar diterima dari klien.
 *
 * Berbeda dari /invoice: yang di sana adalah TAGIHAN (janji), yang di sini
 * PENERIMAAN (kenyataan). Membedakan keduanya adalah inti akuntansi kas, dan
 * menyatukannya di satu halaman — seperti sebelumnya, dua tab bersebelahan —
 * membuat orang membaca "Rp 2,1 M ditagih" seolah uangnya sudah ada.
 *
 * Bulan tersimpan di URL: laporan penerimaan bulanan adalah hal yang
 * dikirim ke pemilik, dan sebagai tab ia tak punya tautan.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, RefreshCw, Wallet, X } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Skeleton } from "../_bersama/komponen";
import { fmt, fmtDate, type Payment } from "../_bersama/tipe";

function metodeLabel(m: string) {
  if (m === "transfer_bank") return "Transfer Bank";
  if (m === "cash") return "Tunai";
  return m.toUpperCase();
}

function PembayaranInner() {
  const router = useRouter();
  const params = useSearchParams();
  const bulan = params.get("bulan") ?? "";

  const [data, setData] = useState<Payment[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [gagal, setGagal] = useState<string | null>(null);

  const setBulan = useCallback((v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set("bulan", v); else p.delete("bulan");
    router.replace(`/keuangan/pembayaran${p.size ? `?${p}` : ""}`, { scroll: false });
  }, [params, router]);

  const muat = useCallback((signal?: AbortSignal) => {
    setMemuat(true);
    // Awalan `finance/` WAJIB — sama seperti di /keuangan/invoice. Tanpa itu
    // hasilnya 404 yang hanya terlihat di konsol, sementara halamannya tampil
    // rapi dengan "Belum ada pembayaran". Dijaga `uji-endpoint-ada.mjs`.
    return api.get<{ payments: Payment[] }>("/api/v1/finance/payments", {
      params: bulan ? { limit: "100", month: bulan } : { limit: "100" }, signal,
    })
      .then((r) => { setData(r.data.payments); setGagal(null); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setData([]);
        setGagal(e?.response?.data?.error ?? "Gagal memuat riwayat pembayaran.");
      })
      .finally(() => setMemuat(false));
  }, [bulan]);

  // `queueMicrotask` — lihat catatan yang sama di /keuangan/invoice:
  // `muat()` menyetel state di baris pertamanya, dan setState sinkron di
  // dalam effect memicu render kedua sebelum yang pertama selesai.
  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const total = data.reduce((s, p) => s + Number(p.amount_paid), 0);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="pay-bulan" style={{
          fontSize: 12, fontWeight: 600, color: C.mid, whiteSpace: "nowrap",
        }}>Bulan:</label>
        <input id="pay-bulan" type="month" value={bulan}
          onChange={(e) => setBulan(e.target.value)}
          style={{
            padding: "6px 8px", border: `1px solid ${C.border}`,
            borderRadius: 6, fontSize: 13, color: C.text,
            outline: "none", background: "var(--surface)",
          }} />
        {bulan && (
          <button onClick={() => setBulan("")} style={{
            padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6,
            background: "var(--surface)", color: C.mid, fontSize: 12,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          }}>
            <X size={12} aria-hidden="true" /> Reset
          </button>
        )}
        <button onClick={() => muat()} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
          border: `1px solid ${C.border}`, borderRadius: 6,
          background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>
        {data.length > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.green,
            fontVariantNumeric: "tabular-nums",
          }}>
            Total diterima: {fmt(total)}
          </span>
        )}
      </div>

      {gagal && (
        <div role="alert" style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {gagal}{" "}
          <button onClick={() => muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      {memuat ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <Skeleton h={14} />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          <ArrowDownLeft size={36} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {gagal ? "Riwayat tak bisa dimuat" : "Belum ada pembayaran"}
          </p>
          <p>{bulan ? "Tidak ada penerimaan di bulan ini." : "Penerimaan muncul di sini setelah invoice dibayar."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((p) => {
            const inv = p.invoices as { invoice_number?: string; projects?: { name?: string } } | null;
            return (
              <div key={p.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.3fr) 150px 110px",
                alignItems: "center", gap: 16, padding: "12px 16px",
                borderRadius: 10, border: `1px solid ${C.border}`,
                background: "var(--surface-subtle)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 2,
                    fontFamily: "var(--font-display)",
                  }}>{inv?.invoice_number ?? "—"}</div>
                  <div style={{
                    fontSize: 11, color: C.mid,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{inv?.projects?.name ?? "—"}</div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>
                    {metodeLabel(p.payment_method)}
                    {p.bank_name && <span style={{ color: C.muted }}> · {p.bank_name}</span>}
                  </div>
                  {p.ref_number && (
                    <div style={{ fontSize: 11, color: C.muted }}>{p.ref_number}</div>
                  )}
                  {p.cash_account ? (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 2,
                      fontSize: 11, marginTop: 2, padding: "2px 6px", borderRadius: 6,
                      background: C.navyLight, color: C.navy, fontWeight: 600,
                    }}>
                      <Wallet size={10} aria-hidden="true" /> {p.cash_account.name}
                    </div>
                  ) : (
                    // Bukan sekadar keterangan: pembayaran yang tak masuk akun
                    // kas mana pun berarti saldo kas TIDAK mencerminkan uang
                    // yang sudah diterima. Itu selisih yang harus dicari, jadi
                    // ia ditandai, bukan dibiarkan sebagai baris kosong.
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 2,
                      fontSize: 11, marginTop: 2, padding: "2px 6px", borderRadius: 6,
                      background: C.yellowBg, color: C.onWarningBg, fontWeight: 600,
                    }}>Tidak tercatat ke kas</div>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: C.green,
                    fontVariantNumeric: "tabular-nums",
                  }}>{fmt(Number(p.amount_paid))}</div>
                </div>

                <div style={{ textAlign: "right", fontSize: 11, color: C.muted }}>
                  {fmtDate(p.paid_at)}
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: C.muted, textAlign: "right", paddingTop: 4 }}>
            {data.length} pembayaran ditampilkan
          </p>
        </div>
      )}
    </div>
  );
}

export default function PembayaranPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}><Skeleton h={40} /></div>}>
      <PembayaranInner />
    </Suspense>
  );
}
