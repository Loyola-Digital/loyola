import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserStatusGuard } from "@/components/layout/user-status-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserStatusGuard>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          <Topbar />
          <main className="flex-1 overflow-auto p-3 md:p-6 min-h-0">{children}</main>
        </div>
      </div>
    </UserStatusGuard>
  );
}
