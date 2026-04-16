import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen max-w-[390px] mx-auto">
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
  );
}
