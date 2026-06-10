import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grain-dark"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: `
          radial-gradient(ellipse at 15% 30%, rgba(0,51,102,0.5) 0%, transparent 45%),
          radial-gradient(ellipse at 85% 70%, rgba(0,80,160,0.25) 0%, transparent 45%),
          radial-gradient(ellipse at 50% 100%, rgba(0,30,80,0.3) 0%, transparent 50%),
          #080c14
        `,
        color: "#e8ecf4",
      }}
    >
      <Sidebar />
      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar />
        <main
          className="dark-scroll"
          style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
