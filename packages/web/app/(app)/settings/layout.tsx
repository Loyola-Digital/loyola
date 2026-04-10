"use client";

import { useState, useEffect } from "react";
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
  { label: "Vendas", href: "/settings/sales", value: "sales" },
] as const;

const META_TABS = [
  { label: "Instagram", href: "/settings/instagram", value: "instagram" },
  { label: "Ads / Tráfego", href: "/settings/traffic", value: "traffic" },
] as const;

const GOOGLE_TABS = [
  { label: "YouTube Ads", href: "/settings/google-ads", value: "google-ads" },
  { label: "YouTube Canal", href: "/settings/youtube", value: "youtube" },
] as const;

const ADMIN_TABS = [
  ...BASE_TABS,
  { label: "Usuários", href: "/settings/users", value: "users" },
  { label: "Auditoria", href: "/settings/audit", value: "audit" },
] as const;

type Tab = { label: string; href: string; value: string };

function getAllTabs(isAdmin: boolean): readonly Tab[] {
  const tabs: Tab[] = [...BASE_TABS];
  // Meta tabs available to all users
  tabs.push(...META_TABS);
  // Google tabs available to all users
  tabs.push(...GOOGLE_TABS);
  if (isAdmin) {
    tabs.push(
      { label: "Usuários", href: "/settings/users", value: "users" },
      { label: "Auditoria", href: "/settings/audit", value: "audit" },
    );
  }
  return tabs;
}

function getActiveTab(tabs: readonly Tab[], pathname: string) {
  return tabs.find((t) => pathname.startsWith(t.href)) ?? tabs[0];
}

function getActiveBreadcrumb(pathname: string): string {
  const metaTab = META_TABS.find((t) => pathname.startsWith(t.href));
  if (metaTab) return `Meta / ${metaTab.label}`;
  const googleTab = GOOGLE_TABS.find((t) => pathname.startsWith(t.href));
  if (googleTab) return `Google / ${googleTab.label}`;
  const allTabs = [...BASE_TABS, ...ADMIN_TABS];
  return allTabs.find((t) => pathname.startsWith(t.href))?.label ?? "Settings";
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useUserRole();
  const isAdmin = role === "admin" || role === "manager";
  const allTabs = getAllTabs(isAdmin);
  const activeTab = getActiveTab(allTabs, pathname);
  const isMetaActive = META_TABS.some((t) => pathname.startsWith(t.href));
  const isGoogleActive = GOOGLE_TABS.some((t) => pathname.startsWith(t.href));
  const [metaOpen, setMetaOpen] = useState(isMetaActive);
  const [googleOpen, setGoogleOpen] = useState(isGoogleActive);

  // Keep in sync
  useEffect(() => {
    if (isMetaActive) setMetaOpen(true);
  }, [isMetaActive]);

  useEffect(() => {
    if (isGoogleActive) setGoogleOpen(true);
  }, [isGoogleActive]);

  // Tabs without meta (for flat rendering)
  const topTabs = BASE_TABS;
  const bottomTabs = isAdmin
    ? [
        { label: "Usuários", href: "/settings/users", value: "users" },
        { label: "Auditoria", href: "/settings/audit", value: "audit" },
      ]
    : [];

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
            <BreadcrumbPage>{getActiveBreadcrumb(pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Desktop: vertical tab sidebar */}
        <nav className="hidden md:flex flex-col gap-1 w-[200px] shrink-0">
          {topTabs.map((tab) => (
            <Link
              key={tab.value}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(tab.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}

          {/* Meta collapsible group */}
          <button
            onClick={() => setMetaOpen((o) => !o)}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
              isMetaActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <span>Meta</span>
            <svg
              className={cn("h-4 w-4 transition-transform", metaOpen && "rotate-180")}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {metaOpen && (
            <div className="flex flex-col gap-0.5 ml-3">
              {META_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    pathname.startsWith(tab.href)
                      ? "bg-accent/70 text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}

          {/* Google collapsible group */}
          <button
            onClick={() => setGoogleOpen((o) => !o)}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
              isGoogleActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <span>Google</span>
            <svg
              className={cn("h-4 w-4 transition-transform", googleOpen && "rotate-180")}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {googleOpen && (
            <div className="flex flex-col gap-0.5 ml-3">
              {GOOGLE_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    pathname.startsWith(tab.href)
                      ? "bg-accent/70 text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}

          {bottomTabs.map((tab) => (
            <Link
              key={tab.value}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(tab.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Mobile: dropdown selector */}
        <div className="md:hidden">
          <Select
            value={activeTab.value}
            onValueChange={(value) => {
              const tab = allTabs.find((t) => t.value === value);
              if (tab) router.push(tab.href);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allTabs.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {META_TABS.some((m) => m.value === tab.value)
                    ? `Meta / ${tab.label}`
                    : GOOGLE_TABS.some((g) => g.value === tab.value)
                      ? `Google / ${tab.label}`
                      : tab.label}
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
