"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useUserRole } from "@/lib/hooks/use-user-role";

const BASE_TABS = [
  { label: "Geral", href: "/settings/general", value: "general" },
  { label: "Meta / Instagram", href: "/settings/instagram", value: "instagram" },
] as const;

const ADMIN_TABS = [
  ...BASE_TABS,
  { label: "Usuários", href: "/settings/users", value: "users" },
  { label: "Tráfego", href: "/settings/traffic", value: "traffic" },
  { label: "Auditoria", href: "/settings/audit", value: "audit" },
] as const;

type Tab = { label: string; href: string; value: string };

function getActiveTab(tabs: readonly Tab[], pathname: string) {
  return tabs.find((t) => pathname.startsWith(t.href)) ?? tabs[0];
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useUserRole();
  const isAdmin = role === "admin" || role === "manager";
  const settingsTabs: readonly Tab[] = isAdmin ? ADMIN_TABS : BASE_TABS;
  const activeTab = getActiveTab(settingsTabs, pathname);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/settings">Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{activeTab.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Desktop: vertical tab sidebar */}
        <nav className="hidden md:flex flex-col gap-1 w-[200px] shrink-0">
          {settingsTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.value}
                href={tab.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile: dropdown selector */}
        <div className="md:hidden">
          <Select
            value={activeTab.value}
            onValueChange={(value) => {
              const tab = settingsTabs.find((t) => t.value === value);
              if (tab) router.push(tab.href);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settingsTabs.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
