"use client";

import { EndpointWithNamespace } from "@repo/zod-types";
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
  Link,
  MoreHorizontal,
  Package,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EditEndpoint } from "@/components/edit-endpoint";
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

import { getAppUrl } from "../../../lib/env";

interface EndpointsListProps {
  onRefresh?: () => void;
}

export function EndpointsList({ onRefresh }: EndpointsListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [endpointToDelete, setEndpointToDelete] =
    useState<EndpointWithNamespace | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [endpointToEdit, setEndpointToEdit] =
    useState<EndpointWithNamespace | null>(null);
  const router = useRouter();

  const utils = trpc.useUtils();

  // Fetch endpoints using tRPC
  const {
    data: endpointsResponse,
    isLoading,
    error,
  } = trpc.frontend.endpoints.list.useQuery();

  // Fetch user's API keys to use in URLs
  const { data: apiKeysResponse } = trpc.apiKeys.list.useQuery();

  // Delete mutation
  const deleteEndpointMutation = trpc.frontend.endpoints.delete.useMutation({
    onSuccess: () => {
      toast.success("Endpoint deleted successfully");
      utils.frontend.endpoints.list.invalidate();
      setDeleteDialogOpen(false);
      setEndpointToDelete(null);
      onRefresh?.();
    },
    onError: (error) => {
      toast.error("Failed to delete endpoint", {
        description: error.message,
      });
    },
  });

  const endpoints = endpointsResponse?.success ? endpointsResponse.data : [];

  const handleDeleteEndpoint = (endpoint: EndpointWithNamespace) => {
    setEndpointToDelete(endpoint);
    setDeleteDialogOpen(true);
  };

  const handleEditEndpoint = (endpoint: EndpointWithNamespace) => {
    setEndpointToEdit(endpoint);
    setEditDialogOpen(true);
  };

  const handleEditSuccess = (_updatedEndpoint: EndpointWithNamespace) => {
    // The cache invalidation is handled in the EditEndpoint component
    onRefresh?.();
  };

  const confirmDelete = () => {
    if (endpointToDelete) {
      deleteEndpointMutation.mutate({ uuid: endpointToDelete.uuid });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Define columns for the data table
  const columns: ColumnDef<EndpointWithNamespace>[] = [
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
        const endpoint = row.original;
        return (
          <div className="space-y-1 px-3 py-2">
            <div className="font-medium">{endpoint.name}</div>
            <div className="text-xs text-muted-foreground">
              SSE: {getAppUrl()}/metamcp/{endpoint.name}/sse
              <br />
              Streamable HTTP: {getAppUrl()}/metamcp/
              {endpoint.name}
              /mcp
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const description = row.getValue("description") as string | null;
        return (
          <div className="px-3 pl-0 py-2">
            {description ? (
              <p className="text-sm">{description}</p>
            ) : (
              <span className="text-sm text-muted-foreground italic">
                No description
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "namespace",
      header: "Namespace",
      cell: ({ row }) => {
        const endpoint = row.original;
        return (
          <div className="px-3 pl-0 py-2">
            <div
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 hover:text-primary rounded px-2 py-1 -mx-2 -my-1 transition-colors"
              onClick={() =>
                router.push(`/namespaces/${endpoint.namespace.uuid}`)
              }
            >
              <Package className="h-4 w-4" />
              <span className="font-medium">{endpoint.namespace.name}</span>
            </div>
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
        const date = formatDate(row.getValue("created_at"));
        return (
          <div className="text-sm text-muted-foreground px-3 py-2">{date}</div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const endpoint = row.original;

        const copyFullSseUrl = () => {
          const baseUrl = `${getAppUrl()}/metamcp/${endpoint.name}/sse`;
          navigator.clipboard.writeText(baseUrl);
          toast.success("SSE URL copied to clipboard");
        };

        const copyFullShttpUrl = () => {
          const baseUrl = `${getAppUrl()}/metamcp/${endpoint.name}/mcp`;
          navigator.clipboard.writeText(baseUrl);
          toast.success("SHTTP URL copied to clipboard");
        };

        const getApiKey = () => {
          const apiKeys = apiKeysResponse?.apiKeys || [];
          const activeApiKey = apiKeys.find((key) => key.is_active);
          return activeApiKey?.key || "YOUR_API_KEY";
        };

        const copyFullSseUrlWithApiKey = () => {
          const apiKey = getApiKey();
          const baseUrl = `${getAppUrl()}/metamcp/${endpoint.name}/sse?api_key=${apiKey}`;
          navigator.clipboard.writeText(baseUrl);
          toast.success("SSE URL with API key parameter copied to clipboard");
        };

        const copyFullShttpUrlWithApiKey = () => {
          const apiKey = getApiKey();
          const baseUrl = `${getAppUrl()}/metamcp/${endpoint.name}/mcp?api_key=${apiKey}`;
          navigator.clipboard.writeText(baseUrl);
          toast.success("SHTTP URL with API key parameter copied to clipboard");
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
              <DropdownMenuItem onClick={() => handleEditEndpoint(endpoint)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit endpoint
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(endpoint.uuid)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy endpoint UUID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyFullSseUrl}>
                <Link className="mr-2 h-4 w-4" />
                Copy full SSE URL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyFullShttpUrl}>
                <Link className="mr-2 h-4 w-4" />
                Copy full SHTTP URL
              </DropdownMenuItem>
              {endpoint.use_query_param_auth && (
                <>
                  <DropdownMenuItem onClick={copyFullSseUrlWithApiKey}>
                    <Link className="mr-2 h-4 w-4" />
                    Copy SSE URL with API key
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copyFullShttpUrlWithApiKey}>
                    <Link className="mr-2 h-4 w-4" />
                    Copy SHTTP URL with API key
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/namespaces/${endpoint.namespace.uuid}`)
                }
              >
                <Package className="mr-2 h-4 w-4" />
                View namespace
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteEndpoint(endpoint)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete endpoint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: endpoints,
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
    // Maintain sorting stability
    manualSorting: false,
    enableSorting: true,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border p-8">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              Loading endpoints...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 p-8">
        <div className="text-center text-destructive">
          <p className="font-medium">Failed to load endpoints</p>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <div className="flex flex-col items-center justify-center mx-auto max-w-md">
          <Link className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No Endpoints</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You haven&apos;t created any endpoints yet. Get started by creating
            your first endpoint to make your namespaces publicly accessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search endpoints..."
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

      {/* Edit Endpoint Dialog */}
      <EditEndpoint
        endpoint={endpointToEdit}
        isOpen={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEndpointToEdit(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Endpoint
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the endpoint &quot;
              {endpointToDelete?.name}&quot;? This action cannot be undone and
              will make the endpoint inaccessible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteEndpointMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteEndpointMutation.isPending}
            >
              {deleteEndpointMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
