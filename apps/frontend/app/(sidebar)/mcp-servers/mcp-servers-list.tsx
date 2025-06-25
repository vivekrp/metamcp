"use client";

import { McpServer, McpServerTypeEnum } from "@repo/zod-types";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Copy,
  Edit,
  Eye,
  FileText,
  MoreHorizontal,
  Search,
  SearchCode,
  Server,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EditMcpServer } from "@/components/edit-mcp-server";
import { McpServersListSkeleton } from "@/components/skeletons/mcp-servers-list-skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

interface McpServersListProps {
  onRefresh?: () => void;
}

export function McpServersList({ onRefresh }: McpServersListProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "created_at",
      desc: true,
    },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<McpServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<McpServer | null>(null);

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Use tRPC query for data fetching
  const {
    data: serversResponse,
    error,
    isLoading,
    refetch,
  } = trpc.frontend.mcpServers.list.useQuery();

  // tRPC mutation for deleting server
  const deleteServerMutation = trpc.frontend.mcpServers.delete.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the server list
      utils.frontend.mcpServers.list.invalidate();
      setDeleteDialogOpen(false);
      setServerToDelete(null);
      toast.success("Server deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting server:", error);
      toast.error("Failed to delete server", {
        description: error.message,
      });
    },
    onSettled: () => {
      setIsDeleting(false);
    },
  });

  const servers = serversResponse?.success ? serversResponse.data : [];

  // Handle delete server
  const handleDeleteServer = async (server: McpServer) => {
    setIsDeleting(true);
    deleteServerMutation.mutate({
      uuid: server.uuid,
    });
  };

  // Handle successful edit
  const handleEditSuccess = () => {
    // Invalidate and refetch the server list
    utils.frontend.mcpServers.list.invalidate();
    setEditDialogOpen(false);
    setServerToEdit(null);
  };

  // Define columns for the data table
  const columns: ColumnDef<McpServer>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div className="space-y-1 px-3 py-2">
            <div
              className="font-medium cursor-pointer hover:bg-muted/50 hover:text-primary rounded px-2 py-1 -mx-2 -my-1 transition-colors"
              onClick={() => router.push(`/mcp-servers/${server.uuid}`)}
            >
              {server.name}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Type
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <div className="px-3 py-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              {type.toUpperCase()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "details",
      header: "Configuration",
      cell: ({ row }) => {
        const server = row.original;
        const details = [];

        if (server.command) {
          details.push(`Command: ${server.command}`);
        }
        if (server.args.length > 0) {
          details.push(`Args: ${server.args.join(" ")}`);
        }
        if (server.url) {
          details.push(`URL: ${server.url}`);
        }
        if (Object.keys(server.env).length > 0) {
          details.push(`Env: ${Object.keys(server.env).length} vars`);
        }

        return (
          <div className="text-sm space-y-1">
            {details.map((detail, index) => (
              <div key={index} className="text-muted-foreground">
                {detail}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const date = new Date(row.getValue("created_at"));
        return (
          <div className="text-sm text-muted-foreground px-3 py-2">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const server = row.original;

        const copyServerJson = () => {
          const config: Record<string, unknown> = {
            type: server.type,
          };

          if (server.description) {
            config.description = server.description;
          }

          if (server.type === McpServerTypeEnum.Enum.STDIO) {
            if (server.command) {
              config.command = server.command;
            }
            if (server.args && server.args.length > 0) {
              config.args = server.args;
            }
            if (server.env && Object.keys(server.env).length > 0) {
              config.env = server.env;
            }
          } else if (
            server.type === McpServerTypeEnum.Enum.SSE ||
            server.type === McpServerTypeEnum.Enum.STREAMABLE_HTTP
          ) {
            if (server.url) {
              config.url = server.url;
            }
            if (server.bearerToken) {
              config.bearerToken = server.bearerToken;
            }
          }

          const exportFormat = {
            mcpServers: {
              [server.name]: config,
            },
          };

          const serverJson = JSON.stringify(exportFormat, null, 2);
          navigator.clipboard.writeText(serverJson);
        };

        const handleInspect = () => {
          router.push(
            `/mcp-inspector?server=${encodeURIComponent(server.uuid)}`,
          );
        };

        const handleViewDetails = () => {
          router.push(`/mcp-servers/${server.uuid}`);
        };

        const handleDeleteClick = () => {
          setServerToDelete(server);
          setDeleteDialogOpen(true);
        };

        const handleEditClick = () => {
          setServerToEdit(server);
          setEditDialogOpen(true);
        };

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(server.uuid)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy server UUID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyServerJson}>
                <FileText className="mr-2 h-4 w-4" />
                Copy server JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleInspect}>
                <SearchCode className="mr-2 h-4 w-4" />
                Inspect
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleViewDetails}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEditClick}>
                <Edit className="mr-2 h-4 w-4" />
                Edit server
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={handleDeleteClick}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: servers,
    columns,
    onSortingChange: setSorting,
    onGlobalFilterChange: (value) => setGlobalFilter(value || ""),
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.uuid,
    state: {
      sorting,
      globalFilter,
    },
  });

  // Expose mutate function for parent component
  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <div className="flex flex-col items-center justify-center mx-auto max-w-md">
          <Server className="size-12 text-red-400" />
          <h3 className="mt-4 text-lg font-semibold">
            Error Loading MCP Servers
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "Failed to load MCP servers"}
          </p>
          <Button onClick={handleRefresh} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <McpServersListSkeleton />;
  }

  if (servers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <div className="flex flex-col items-center justify-center mx-auto max-w-md">
          <Server className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No MCP Servers</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You haven&apos;t configured any MCP servers yet. Click &quot;Create
            MCP Server&quot; to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Edit Server Dialog */}
      <EditMcpServer
        server={serverToEdit}
        isOpen={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setServerToEdit(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MCP Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{serverToDelete?.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setServerToDelete(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                serverToDelete && handleDeleteServer(serverToDelete)
              }
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search servers by name..."
              value={globalFilter || ""}
              onChange={(event) => setGlobalFilter(event.target.value || "")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} server(s) total
          </div>
        </div>
      </div>
    </>
  );
}
