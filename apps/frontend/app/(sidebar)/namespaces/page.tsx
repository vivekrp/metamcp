"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateNamespaceFormData,
  createNamespaceFormSchema,
  CreateNamespaceRequest,
} from "@repo/zod-types";
import { ChevronDown, Package, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

import { NamespacesList } from "./namespaces-list";

export default function NamespacesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedServerUuids, setSelectedServerUuids] = useState<string[]>([]);

  // Get the tRPC query client for cache invalidation
  const utils = trpc.useUtils();

  // Fetch available MCP servers for selection
  const { data: serversResponse, isLoading: serversLoading } =
    trpc.frontend.mcpServers.list.useQuery();

  const availableServers = serversResponse?.success ? serversResponse.data : [];

  // tRPC mutation for creating namespace
  const createNamespaceMutation = trpc.frontend.namespaces.create.useMutation({
    onSuccess: (data) => {
      console.log("Namespace created successfully:", data);
      toast.success("Namespace Created", {
        description: `Successfully created "${form.getValues().name}" namespace`,
      });
      setCreateOpen(false);
      form.reset({
        name: "",
        description: "",
        user_id: undefined, // Default to "For myself" (Private)
      });
      setSelectedServerUuids([]);
      // Invalidate and refetch the namespace list
      utils.frontend.namespaces.list.invalidate();
    },
    onError: (error) => {
      console.error("Error creating namespace:", error);
      toast.error("Failed to Create Namespace", {
        description: error.message || "An unexpected error occurred",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const form = useForm<CreateNamespaceFormData>({
    resolver: zodResolver(createNamespaceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      mcpServerUuids: [],
      user_id: undefined, // Default to "For myself" (Private)
    },
  });

  const onSubmit = async (data: CreateNamespaceFormData) => {
    setIsSubmitting(true);
    try {
      // Create the API request payload
      const apiPayload: CreateNamespaceRequest = {
        name: data.name,
        description: data.description,
        mcpServerUuids: selectedServerUuids,
        user_id: data.user_id,
      };

      // Use tRPC mutation
      createNamespaceMutation.mutate(apiPayload);
    } catch (error) {
      setIsSubmitting(false);
      console.error("Error preparing namespace data:", error);
      toast.error("Failed to Create Namespace", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    }
  };

  const handleServerToggle = (serverUuid: string) => {
    setSelectedServerUuids((prev) =>
      prev.includes(serverUuid)
        ? prev.filter((uuid) => uuid !== serverUuid)
        : [...prev, serverUuid],
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              MetaMCP Namespaces
            </h1>
            <p className="text-muted-foreground">
              Group your MCP servers into namespaces and get ready to host with
              a single unified MCP Server endpoint for the namespace
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Namespace
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Namespace</DialogTitle>
                <DialogDescription>
                  Create a new namespace and select MCP servers to include.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="flex flex-col gap-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    id="name"
                    {...form.register("name")}
                    placeholder="My Namespace"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description (Optional)
                  </label>
                  <Textarea
                    id="description"
                    {...form.register("description")}
                    placeholder="Namespace description"
                    className="h-20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Ownership</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        type="button"
                      >
                        {form.watch("user_id") === null
                          ? "Everyone (Public)"
                          : "For myself (Private)"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                      <DropdownMenuItem
                        onClick={() => form.setValue("user_id", undefined)}
                      >
                        For myself (Private)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => form.setValue("user_id", null)}
                      >
                        Everyone (Public)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="text-xs text-muted-foreground">
                    Private namespaces are only accessible to you. Public
                    namespaces are accessible to all users.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">
                    MCP Servers (Optional)
                  </label>
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                    {serversLoading ? (
                      <div className="text-sm text-muted-foreground">
                        Loading servers...
                      </div>
                    ) : availableServers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No MCP servers available. Create some servers first.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableServers.map((server) => (
                          <div
                            key={server.uuid}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="checkbox"
                              id={server.uuid}
                              checked={selectedServerUuids.includes(
                                server.uuid,
                              )}
                              onChange={() => handleServerToggle(server.uuid)}
                              className="rounded border-gray-300"
                            />
                            <label
                              htmlFor={server.uuid}
                              className="text-sm flex-1 cursor-pointer"
                            >
                              <div className="font-medium">{server.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {server.type} •{" "}
                                {server.description || "No description"}
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select MCP servers to include in this namespace. You can
                    modify this later.
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      form.reset({
                        name: "",
                        description: "",
                        user_id: undefined, // Default to "For myself" (Private)
                      });
                      setSelectedServerUuids([]);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Namespace"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <NamespacesList />
    </div>
  );
}
