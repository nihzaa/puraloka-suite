"use client";

/**
 * "KENAPA ANGKANYA SEGINI?" — penjelasan satu item RAB, langkah demi langkah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INI JANJI INTI CECEP, BUKAN FITUR TAMBAHAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Judul modul ini berbunyi *"setiap rupiah bisa ditelusuri ke koefisien &
 * harga sumbernya"*. Modal inilah yang menepatinya: ia membuka satu angka
 * jadi rantai — koefisien × harga satuan → subtotal → BUK → pembulatan —
 * lengkap dengan tanggal harga dan alasan override kalau ada.
 *
 * Tanpa ini, RAB kembali jadi angka yang harus dipercaya begitu saja, dan
 * itu persis keadaan yang membuat orang balik ke Excel.
 *
 * ── Yang DISALIN apa adanya, dan kenapa penting
 *
 * Latar gelapnya `<button>` SUNGGUHAN, bukan `<div>` ber-onClick. Div yang
 * hanya bisa diklik tak terjangkau keyboard sama sekali — pola yang sudah
 * menyumbang 232 pelanggaran WCAG di repo ini. Jangan "dirapikan" jadi div.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";

const fmtRp = formatRupiah;

export function JelaskanModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  useTutupEsc(onClose);
  const [data, setData] = useState<{
    nama: string; satuan: string | null; volume: number | null; utuh: boolean;
    langkah: { no: number; judul: string; uraian: string; nilai?: number }[];
    komponen: { kode: string; koefisien: number; hargaSatuan: number; subtotal: number;
      sumber: string; tanggalHarga: string | null; alasanOverride: string | null }[];
    peringatan: string[];
  } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: NonNullable<typeof data> }>(`/api/v1/estimate-items/${itemId}/explain`)
      .then(r => setData(r.data.data))
      .catch(() => setGalat("Gagal memuat penjelasan"))
      .finally(() => setMemuat(false));
  }, [itemId]);

  return createPortal(
    // Latar gelap dibuat <button> SUNGGUHAN, bukan div ber-onClick. Div yang
    // hanya bisa diklik tak terjangkau keyboard sama sekali — pola yang sudah
    // menyumbang 232 pelanggaran WCAG di repo ini. Sebagai <button> ia
    // otomatis dapat fokus, Enter/Space, dan nama aksesibel.
    <div
      role="dialog" aria-modal="true" aria-label="Penjelasan perhitungan item"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}>
      <button
        aria-label="Tutup penjelasan"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "transparent",
          border: "none", cursor: "default", padding: 0,
        }}
      />
      <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
      <div style={{
        background: "var(--surface)", borderRadius: 14, width: "100%",
        boxShadow: "var(--naik-3)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Kenapa angkanya segini?</h3>
          {data && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{data.nama}</p>}
        </div>

        <div style={{ padding: "var(--pad-kartu-lega)" }}>
          {memuat && <div style={{ color: C.mid, fontSize: 13 }}>Memuat penjelasan…</div>}
          {galat && <div style={{ color: C.red, fontSize: 13 }}>{galat}</div>}

          {data && data.peringatan.length > 0 && (
            <div style={{
              padding: "12px var(--pad-kartu-lega)", borderRadius: 10, marginBottom: 16,
              background: "var(--warning-bg)", border: `1px solid var(--warning-border)`,
              fontSize: 12, color: "var(--warning)",
            }}>
              <strong>Penjelasan ini belum utuh:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {data.peringatan.map((p, i) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
              </ul>
            </div>
          )}

          {data && data.langkah.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {data.langkah.map(l => (
                <li key={l.no} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                    background: "var(--navy-light)", color: C.navy, fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{l.no}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{l.judul}</div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{l.uraian}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {data && data.komponen.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                Rincian komponen
              </div>
              {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                  scope="row", tabular-nums, dan overflow-x dijamin komponen.

                  `kepalaBaris` di Kode: di modal "kenapa angkanya segini?" inilah
                  satu-satunya kolom yang mengidentifikasi komponennya. Koefisien
                  dan subtotal justru angka yang sedang dipertanyakan — dipakai
                  sebagai nama baris, penjelasannya jadi melingkar. */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <Tabel<NonNullable<typeof data>["komponen"][number]>
              berpermukaan
                  caption="Rincian analisa harga satuan pos ini: kode resource, koefisien, harga satuan, subtotal, dan sumber harganya."
                  data={data.komponen}
                  kunciBaris={k => k.kode}
                  kolom={[
                    { kunci: "kode", judul: "Kode", kepalaBaris: true, render: k => (
                      <code style={{ fontFamily: "ui-monospace, monospace" }}>{k.kode}</code>
                    ) },
                    { kunci: "koef", judul: "Koef.", rata: "kanan", render: k => k.koefisien },
                    { kunci: "harga", judul: "Harga satuan", rata: "kanan", render: k => fmtRp(k.hargaSatuan) },
                    { kunci: "subtotal", judul: "Subtotal", rata: "kanan", render: k => (
                      <span style={{ fontWeight: 600 }}>{fmtRp(k.subtotal)}</span>
                    ) },
                    { kunci: "sumber", judul: "Sumber", render: k => (
                      <span style={{ color: C.mid }}>{k.sumber}{k.tanggalHarga ? ` · ${k.tanggalHarga}` : ""}</span>
                    ) },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer",
          }}>Tutup</button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}