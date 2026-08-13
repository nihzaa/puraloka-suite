"use client";

import { useTheme } from "next-themes";
import { useTerpasang } from "@/lib/use-terpasang";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // `useTerpasang`, bukan `useState`+`useEffect`: pola lama memaksa render
  // KEDUA pada tiap muat halaman hanya untuk menjawab "sudah di klien?".
  // Lihat lib/use-terpasang.ts.
  const mounted = useTerpasang();

  if (!mounted) {
    return <div style={{ width: 38, height: 38 }} />;
  }

  const isDark = theme === "dark";

  return (
    <button aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      style={{
        width: 38,
        height: 38,
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
