import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ToastProvider } from "@/components/toast";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
