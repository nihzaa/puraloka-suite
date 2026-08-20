"use client";

// ============================================================================
// MiniChart — sparkline / mini-bar bergaya mobile, dipakai di dalam KpiCard.
//
// Dekoratif: `aria-hidden="true"` karena tren yang sama sudah tersedia dalam
// bentuk teks eksplisit di KpiCard (ikon panah + tanda +/- + persen). Chart
// ini tidak membawa informasi yang tak ada di teks, jadi screen reader tidak
// perlu membacanya dua kali.
//
// `isAnimationActive={false}` dipasang eksplisit — animasi masuk recharts
// adalah animasi JS, bukan CSS, jadi `prefers-reduced-motion` di OS tidak
// otomatis mematikannya. Ini menghormati preferensi pengurangan gerak.
//
// `value: number | null` (Task 21 fix) — beberapa sumber data (mis. kurva
// aktual `kurva-s.ts:365-372`) SENGAJA mengirim `null` untuk titik yang
// belum punya data (minggu yang belum lewat), beda dari 0 (nilai aktual
// nol). Memaksanya jadi 0 di pemanggil membuat kurva terjun ke nol dan
// datar untuk sisa periode — terbaca seperti proyek berhenti, padahal cuma
// belum terjadi. Recharts `type="monotone"` menangani `null` dengan benar
// (melompatinya, bukan menariknya ke 0), jadi tipe di sini WAJIB
// meneruskan null apa adanya, bukan menormalkannya.
// ============================================================================

import { ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";

export interface MiniChartProps {
  data: Array<{ label: string; value: number | null }>;
  tipe: "area" | "bar";
  warna?: string;
  tinggi?: number;
}

export default function MiniChart({
  data,
  tipe,
  warna = "var(--navy)",
  tinggi = 48,
}: MiniChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: tinggi }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {tipe === "area" ? (
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={warna}
              strokeWidth={2}
              fill={warna}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <Bar dataKey="value" fill={warna} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
