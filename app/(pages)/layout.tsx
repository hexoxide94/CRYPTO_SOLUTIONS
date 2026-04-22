import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { UsdtProvider } from "@/lib/usdt-context";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UsdtProvider>
    <div className="relative min-h-screen w-full max-w-md mx-auto">
      <TopBar />
      <main
        className="min-h-screen bg-background"
        style={{
          paddingTop: "var(--topbar-h, 48px)",
          paddingBottom: "calc(var(--bottomnav-h, 60px) + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
    </UsdtProvider>
  );
}
