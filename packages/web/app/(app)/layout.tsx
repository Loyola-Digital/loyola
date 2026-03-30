import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserStatusGuard } from "@/components/layout/user-status-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserStatusGuard>
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-3 md:p-6">{children}</main>
        </div>
      </div>
    </UserStatusGuard>
  );
}
