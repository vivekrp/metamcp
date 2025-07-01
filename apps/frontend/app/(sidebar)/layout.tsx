"use client";

import {
  FileTerminal,
  Key,
  Link,
  Package,
  Search,
  SearchCode,
  Server,
} from "lucide-react";
import Image from "next/image";

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
import { authClient } from "@/lib/auth-client";
import { LogsStatusIndicator } from "@/components/logs-status-indicator";

// Menu items (removed Home item)
const items = [
  {
    title: "Explore MCP Servers (beta)",
    url: "/search",
    icon: Search,
  },
  {
    title: "MCP Servers",
    url: "/mcp-servers",
    icon: Server,
  },
  {
    title: "MetaMCP Namespaces",
    url: "/namespaces",
    icon: Package,
  },
  {
    title: "MetaMCP Endpoints",
    url: "/endpoints",
    icon: Link,
  },
  {
    title: "MCP Inspector",
    url: "/mcp-inspector",
    icon: SearchCode,
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: Key,
  },
];

function LiveLogsMenuItem() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <a href="/live-logs" className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <FileTerminal className="h-4 w-4" />
            <span>Live Logs</span>
          </div>
          <LogsStatusIndicator />
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserInfoFooter() {
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  };

  if (!session?.user) {
    return null;
  }

  return (
    <SidebarFooter>
      <div className="space-y-3 p-2">
        <Separator />
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="space-y-1">
            <div className="text-sm font-medium truncate">
              {session.user.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {session.user.email}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="w-full"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </SidebarFooter>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
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
            <SidebarTrigger className="-ml-1 cursor-pointer" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
