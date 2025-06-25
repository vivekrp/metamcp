"use client";

import {
  ClientRequest,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolStatusEnum } from "@repo/zod-types";
import { AlertTriangle, Database, RefreshCw, Wrench } from "lucide-react";
import React, { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ToolManagementSkeleton } from "@/components/skeletons/tool-management-skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

import { EnhancedNamespaceToolsTable } from "./enhanced-namespace-tools-table";

interface NamespaceToolManagementProps {
  servers: Array<{
    uuid: string;
    name: string;
    status: string;
  }>;
  namespaceUuid: string;
  makeRequest?: <T extends z.ZodType>(
    request: ClientRequest,
    schema: T,
    options?: { suppressToast?: boolean },
  ) => Promise<z.output<T>>; // Optional makeRequest function for MetaMCP connections
}

export function NamespaceToolManagement({
  servers,
  namespaceUuid,
  makeRequest,
}: NamespaceToolManagementProps) {
  const [loading, setLoading] = useState(false);
  const [mcpTools, setMcpTools] = useState<
    Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }>
  >([]);
  const [hasAttemptedInitialFetch, setHasAttemptedInitialFetch] =
    useState(false);

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Get tools from namespace tool mapping table
  const {
    data: toolsResponse,
    isLoading: isToolsLoading,
    refetch: refetchTools,
  } = trpc.frontend.namespaces.getTools.useQuery({
    namespaceUuid,
  });

  const namespaceTools = toolsResponse?.success ? toolsResponse.data : [];

  // Refresh tools mutation
  const refreshToolsMutation =
    trpc.frontend.namespaces.refreshTools.useMutation({
      onSuccess: (response) => {
        if (response.success) {
          toast.success("Tools refreshed successfully", {
            description: response.message,
          });
          // Invalidate the namespace tools query to refresh the data
          utils.frontend.namespaces.getTools.invalidate({ namespaceUuid });
        } else {
          toast.error("Failed to refresh tools", {
            description: response.message,
          });
        }
      },
      onError: (error) => {
        console.error("Error refreshing tools:", error);
        toast.error("Failed to refresh tools", {
          description: error.message,
        });
      },
    });

  // Fetch tools from MetaMCP
  const fetchMetaMCPTools = useCallback(async () => {
    if (!makeRequest) {
      console.warn("MetaMCP connection not available");
      return;
    }

    try {
      const listToolsRequest: ClientRequest = {
        method: "tools/list",
        params: {},
      };

      const toolsListResponse = await makeRequest(
        listToolsRequest,
        ListToolsResultSchema,
        { suppressToast: true },
      );

      if (toolsListResponse && toolsListResponse.tools) {
        const mcpToolsData = toolsListResponse.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema,
        }));

        setMcpTools(mcpToolsData);
      } else {
        setMcpTools([]);
      }
    } catch (error) {
      console.error("Error fetching tools from MetaMCP:", error);
      setMcpTools([]);
    }
  }, [makeRequest]);

  // Safely auto-fetch MetaMCP tools when connection becomes available
  React.useEffect(() => {
    if (makeRequest && !hasAttemptedInitialFetch) {
      setHasAttemptedInitialFetch(true);
      fetchMetaMCPTools();
    }
  }, [makeRequest, hasAttemptedInitialFetch, fetchMetaMCPTools]);

  // Handle MCP refresh for all servers
  const handleRefreshAllTools = async () => {
    if (!makeRequest) {
      console.warn(
        "MetaMCP connection not available, falling back to database refresh",
      );
      setLoading(true);
      try {
        await refetchTools();
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      // First fetch the tools to see what's available from MetaMCP
      await fetchMetaMCPTools();

      // Then update the namespace with the tools
      const listToolsRequest: ClientRequest = {
        method: "tools/list",
        params: {},
      };

      const toolsListResponse = await makeRequest(
        listToolsRequest,
        ListToolsResultSchema,
        { suppressToast: true },
      );

      if (toolsListResponse && toolsListResponse.tools) {
        // The tools from MetaMCP already contain server names in the format "ServerName__toolName"
        // The backend will parse these names to extract server names and resolve server UUIDs
        const toolsForSubmission = toolsListResponse.tools.map((tool) => ({
          name: tool.name, // Keep the full "ServerName__toolName" format
          description: tool.description || "",
          inputSchema: tool.inputSchema,
          // Remove serverUuid - the backend will resolve it from the tool name
        }));

        // Submit the tools for update to namespace tool mapping records
        refreshToolsMutation.mutate({
          namespaceUuid,
          tools: toolsForSubmission,
        });
      } else {
        console.log("No tools found in MetaMCP response");
        toast.info("No tools found in MetaMCP connection");
      }
    } catch (error) {
      console.error("Error fetching tools from MetaMCP:", error);
      toast.error("Failed to fetch tools from MetaMCP connection", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate counts
  const serverCount = servers.length;
  const activeServerCount = servers.filter(
    (s) => s.status === ToolStatusEnum.Enum.ACTIVE,
  ).length;
  const savedToolCount = namespaceTools.length;
  const activeToolCount = namespaceTools.filter(
    (t) => t.status === ToolStatusEnum.Enum.ACTIVE,
  ).length;
  const mcpToolCount = mcpTools.length;

  // Calculate new tools count by comparing MetaMCP tools with saved tools
  // Parse the server__toolName format to get the actual tool name for comparison
  const newToolsCount = mcpTools.filter((mcpTool) => {
    const lastDoubleUnderscoreIndex = mcpTool.name.lastIndexOf("__");
    if (lastDoubleUnderscoreIndex === -1) return false;

    const serverName = mcpTool.name.substring(0, lastDoubleUnderscoreIndex);
    let actualToolName = mcpTool.name.substring(lastDoubleUnderscoreIndex + 2);

    // Handle nested MetaMCP scenarios - get actual server names from saved tools
    const actualServerNames = new Set(
      namespaceTools.map((tool) => tool.serverName),
    );

    if (!actualServerNames.has(serverName) && serverName.includes("__")) {
      const firstDoubleUnderscoreIndex = serverName.indexOf("__");
      const actualServerName = serverName.substring(
        0,
        firstDoubleUnderscoreIndex,
      );

      if (actualServerNames.has(actualServerName)) {
        // This is a nested MetaMCP tool - adjust parsing
        const nestedPart = serverName.substring(firstDoubleUnderscoreIndex + 2);
        actualToolName = `${nestedPart}__${actualToolName}`;
      }
    }

    return !namespaceTools.some(
      (savedTool) => savedTool.name === actualToolName,
    );
  }).length;

  // Show loading skeleton when initially loading
  if (isToolsLoading || loading) {
    return (
      <div className="space-y-4">
        {/* Header with counts and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Tools Overview:</span>
            <span className="text-sm text-muted-foreground">
              {serverCount} servers
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">
              {activeServerCount} active
            </span>
            <span className="text-muted-foreground">•</span>
            <Wrench className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">
              {mcpToolCount} from MetaMCP
            </span>
            <span className="text-muted-foreground">•</span>
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {savedToolCount} saved
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">
              {activeToolCount} active
            </span>
            {newToolsCount > 0 && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-amber-600 font-medium">
                  {newToolsCount} new
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAllTools}
              disabled={true}
            >
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Refresh Tools
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        <div className="rounded-lg border">
          <ToolManagementSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with counts and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">Tools Overview:</span>
          <span className="text-sm text-muted-foreground">
            {serverCount} servers
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">
            {activeServerCount} active
          </span>
          <span className="text-muted-foreground">•</span>
          <Wrench className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-muted-foreground">
            {mcpToolCount} from MetaMCP
          </span>
          <span className="text-muted-foreground">•</span>
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {savedToolCount} saved
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">
            {activeToolCount} active
          </span>
          {newToolsCount > 0 && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm text-amber-600 font-medium">
                {newToolsCount} new
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAllTools}
            disabled={loading || isToolsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading || isToolsLoading ? "animate-spin" : ""}`}
            />
            Refresh Tools
          </Button>
        </div>
      </div>

      {/* Show table when tools are available, or single empty state when no tools */}
      {savedToolCount > 0 || mcpToolCount > 0 ? (
        <div className="rounded-lg border">
          <EnhancedNamespaceToolsTable
            savedTools={namespaceTools}
            mcpTools={mcpTools}
            loading={false} // We handle loading state above
            onRefreshTools={handleRefreshAllTools}
            namespaceUuid={namespaceUuid}
            servers={servers}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <h4 className="text-sm font-medium">No Tools Available</h4>
          <p className="text-xs text-muted-foreground mt-1">
            No tools have been found from MetaMCP or saved to this namespace
            yet. Connect to MetaMCP and refresh to discover tools from your
            servers.
          </p>
        </div>
      )}
    </div>
  );
}
