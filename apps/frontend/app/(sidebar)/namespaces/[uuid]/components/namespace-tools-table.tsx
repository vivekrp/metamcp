"use client";

import { NamespaceTool, ToolStatusEnum } from "@repo/zod-types";
import {
  Calendar,
  ChevronDownIcon,
  ChevronUpIcon,
  Database,
  Eye,
  EyeOff,
  Hash,
  MoreHorizontal,
  Search,
  Server,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

interface NamespaceToolsTableProps {
  tools: NamespaceTool[];
  loading?: boolean;
  onRefreshTools?: () => void;
  namespaceUuid: string;
}

type SortField =
  | "name"
  | "serverName"
  | "status"
  | "description"
  | "updated_at";
type SortDirection = "asc" | "desc";

export function NamespaceToolsTable({
  tools,
  loading = false,
  namespaceUuid,
}: NamespaceToolsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Use namespace-specific tool status update mutation
  const updateToolStatusMutation =
    trpc.frontend.namespaces.updateToolStatus.useMutation({
      onSuccess: (response) => {
        if (response.success) {
          toast.success("Tool status updated successfully");
          // Invalidate the namespace tools query to refresh the data
          utils.frontend.namespaces.getTools.invalidate({ namespaceUuid });
        } else {
          toast.error("Failed to update tool status");
        }
      },
      onError: (error) => {
        console.error("Error updating tool status:", error);
        toast.error("Failed to update tool status", {
          description: error.message,
        });
      },
    });

  // Handle status toggle
  const handleStatusToggle = async (tool: NamespaceTool) => {
    const newStatus =
      tool.status === ToolStatusEnum.Enum.ACTIVE
        ? ToolStatusEnum.Enum.INACTIVE
        : ToolStatusEnum.Enum.ACTIVE;

    updateToolStatusMutation.mutate({
      namespaceUuid,
      toolUuid: tool.uuid,
      serverUuid: tool.serverUuid,
      status: newStatus,
    });
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort tools
  const filteredAndSortedTools = useMemo(() => {
    let filtered = tools;

    // Apply search filter
    if (searchTerm) {
      filtered = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tool.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tool.serverName.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue = a[sortField] || "";
      let bValue = b[sortField] || "";

      // Handle string comparison
      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [tools, searchTerm, sortField, sortDirection]);

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUpIcon className="h-3 w-3 ml-1" />
    ) : (
      <ChevronDownIcon className="h-3 w-3 ml-1" />
    );
  };

  // Toggle row expansion
  const toggleRowExpansion = (toolId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get tool parameters from schema
  const getToolParameters = (tool: NamespaceTool) => {
    const schema = tool.toolSchema as Record<string, unknown>;
    if (!schema || !schema.properties) return [];

    return Object.entries(
      schema.properties as Record<string, Record<string, unknown>>,
    ).map(([key, value]: [string, Record<string, unknown>]) => ({
      name: key,
      type: (value.type as string) || "unknown",
      description: (value.description as string) || "",
      required: (schema.required as string[])?.includes(key) || false,
    }));
  };

  // Generate tool ID for expansion
  const getToolId = (tool: NamespaceTool) => {
    return `${tool.serverUuid}-${tool.name}`;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-3">
          {/* Search bar skeleton */}
          <div className="h-10 bg-gray-200 rounded animate-pulse" />
          {/* Table header skeleton */}
          <div className="flex space-x-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-gray-200 rounded flex-1 animate-pulse"
              />
            ))}
          </div>
          {/* Table rows skeleton */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex space-x-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <div
                  key={j}
                  className="h-8 bg-gray-100 rounded flex-1 animate-pulse"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Search Bar */}
      <div className="flex items-center gap-2 px-2 mt-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredAndSortedTools.length} of {tools.length} tools
        </div>
      </div>

      {filteredAndSortedTools.length === 0 ? (
        <div className="p-8 text-center">
          <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <h4 className="text-sm font-medium">
            {searchTerm ? "No tools match your search" : "No Tools Found"}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {searchTerm
              ? "Try adjusting your search terms or clear the search to see all tools."
              : "No tools have been mapped to this namespace yet."}
          </p>
          {searchTerm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchTerm("")}
              className="mt-2"
            >
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead> {/* Expand button */}
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("name")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Tool Name
                  {renderSortIcon("name")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("serverName")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  MCP Server
                  {renderSortIcon("serverName")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("status")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Status
                  {renderSortIcon("status")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("description")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Description
                  {renderSortIcon("description")}
                </Button>
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("updated_at")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Updated At
                  {renderSortIcon("updated_at")}
                </Button>
              </TableHead>
              <TableHead className="w-[40px]"></TableHead> {/* Actions */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedTools.map((tool) => {
              const toolId = getToolId(tool);
              const isExpanded = expandedRows.has(toolId);
              const parameters = getToolParameters(tool);
              const isToggling = updateToolStatusMutation.isPending;

              return (
                <React.Fragment key={toolId}>
                  {/* Main row */}
                  <TableRow className="group">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleRowExpansion(toolId)}
                      >
                        {isExpanded ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-blue-500" />
                        <span>{tool.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/mcp-servers/${tool.serverUuid}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{tool.serverName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tool.status === "ACTIVE"}
                          onCheckedChange={() => handleStatusToggle(tool)}
                          disabled={isToggling}
                          className="data-[state=checked]:bg-green-600"
                        />
                        <span
                          className={`text-xs font-medium ${
                            tool.status === "ACTIVE"
                              ? "text-green-600"
                              : "text-gray-500"
                          }`}
                        >
                          {tool.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        {tool.description ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {tool.description}
                          </p>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">
                            No description
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Show namespace mapping source */}
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                        <Database className="h-3 w-3" />
                        Mapped
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {formatDate(tool.updated_at)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => toggleRowExpansion(toolId)}
                          >
                            {isExpanded ? (
                              <>
                                <EyeOff className="mr-2 h-4 w-4" />
                                Hide Details
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" />
                                Show Details
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/mcp-servers/${tool.serverUuid}`}>
                              <Server className="mr-2 h-4 w-4" />
                              View Server
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>

                  {/* Expanded details row */}
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/50">
                        <div className="py-4 space-y-4">
                          {/* Tool Info */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">UUID:</span>
                              <code className="text-sm bg-background px-2 py-1 rounded border">
                                {tool.uuid}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                Server:
                              </span>
                              <Link
                                href={`/mcp-servers/${tool.serverUuid}`}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                {tool.serverName}
                              </Link>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Source:
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                <Database className="h-3 w-3" />
                                Mapped
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Status:
                              </span>
                              <span
                                className={`text-xs font-medium ${
                                  tool.status === "ACTIVE"
                                    ? "text-green-600"
                                    : "text-gray-500"
                                }`}
                              >
                                {tool.status}
                              </span>
                            </div>
                          </div>

                          {/* Tool Schema */}
                          <div>
                            <h5 className="text-sm font-medium mb-2">
                              Tool Schema
                            </h5>
                            <div className="bg-background p-3 rounded border">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium">
                                  Type:
                                </span>
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                  {String(tool.toolSchema?.type || "object")}
                                </code>
                              </div>

                              {parameters.length > 0 && (
                                <div>
                                  <span className="text-xs font-medium">
                                    Parameters:
                                  </span>
                                  <div className="mt-2 space-y-2">
                                    {parameters.map((param, index) => (
                                      <div
                                        key={index}
                                        className="flex items-center gap-2 text-xs"
                                      >
                                        <div className="flex items-center gap-1">
                                          <code className="bg-muted px-2 py-1 rounded font-mono">
                                            {param.name}
                                          </code>
                                          <span className="text-muted-foreground">
                                            ({param.type})
                                          </span>
                                          {param.required && (
                                            <span className="text-red-500 text-xs">
                                              *
                                            </span>
                                          )}
                                        </div>
                                        {param.description && (
                                          <span className="text-muted-foreground">
                                            - {param.description}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {parameters.length === 0 && (
                                <div className="text-xs text-muted-foreground">
                                  No parameters defined
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Full Schema JSON (for debugging) */}
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Show full schema JSON
                            </summary>
                            <div className="mt-2">
                              <CodeBlock
                                language="json"
                                maxHeight="300px"
                                className="text-xs"
                              >
                                {JSON.stringify(tool.toolSchema, null, 2)}
                              </CodeBlock>
                            </div>
                          </details>

                          {Object.keys(parameters).length > 0 && (
                            <div className="mt-2">
                              <CodeBlock
                                language="json"
                                maxHeight="200px"
                                className="text-xs"
                              >
                                {JSON.stringify(parameters, null, 2)}
                              </CodeBlock>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
