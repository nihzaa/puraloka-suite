import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F8F9FA",
        color: "#111827",
      }}
    >
      <Sidebar />
      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar />
        <main style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
