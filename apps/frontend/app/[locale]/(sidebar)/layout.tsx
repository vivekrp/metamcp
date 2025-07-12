"use client";

import {
  FileTerminal,
  Key,
  Link as LinkIcon,
  Package,
  Search,
  SearchCode,
  Server,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LogsStatusIndicator } from "@/components/logs-status-indicator";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useTranslations } from "@/hooks/useTranslations";
import { authClient } from "@/lib/auth-client";

// Menu items function
const getMenuItems = (t: (key: string) => string) => [
  {
    title: t("navigation:exploreMcpServers"),
    url: "/search",
    icon: Search,
  },
  {
    title: t("navigation:mcpServers"),
    url: "/mcp-servers",
    icon: Server,
  },
  {
    title: t("navigation:metamcpNamespaces"),
    url: "/namespaces",
    icon: Package,
  },
  {
    title: t("navigation:metamcpEndpoints"),
    url: "/endpoints",
    icon: LinkIcon,
  },
  {
    title: t("navigation:mcpInspector"),
    url: "/mcp-inspector",
    icon: SearchCode,
  },
  {
    title: t("navigation:apiKeys"),
    url: "/api-keys",
    icon: Key,
  },
  {
    title: t("navigation:settings"),
    url: "/settings",
    icon: Settings,
  },
];

function LiveLogsMenuItem() {
  const { t } = useTranslations();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link href="/live-logs">
          <FileTerminal />
          <span>{t("navigation:liveLogs")}</span>
          <LogsStatusIndicator />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserInfoFooter() {
  const { t } = useTranslations();
  const [user, setUser] = useState<any>(null);

  // Get user info
  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setUser(session.data.user);
      }
    });
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarFooter>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex items-center justify-between">
          <LanguageSwitcher />
        </div>
        <Separator />
        {user && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {user.name || user.email}
              </span>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              {t("auth:signOut")}
            </Button>
          </div>
        )}
      </div>
    </SidebarFooter>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslations();
  const items = getMenuItems(t);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="flex flex-col justify-center items-center px-2 py-4">
          <div className="flex items-center gap-4 mb-2">
            <Image
              src="/favicon.ico"
              alt="MetaMCP Logo"
              width={256}
              height={256}
              className="h-12 w-12"
            />
            <h2 className="text-2xl font-semibold">MetaMCP</h2>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("navigation:application")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <LiveLogsMenuItem />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <UserInfoFooter />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
