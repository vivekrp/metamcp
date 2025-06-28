"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateMcpServerRequest,
  CreateServerFormData,
  createServerFormSchema,
  McpServerTypeEnum,
} from "@repo/zod-types";
import { ChevronDown, Plus, Server } from "lucide-react";
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

import { ExportImportButtons } from "./export-import-buttons";
import { McpServersList } from "./mcp-servers-list";

export default function MCPServersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get the tRPC query client for cache invalidation
  const utils = trpc.useUtils();

  // tRPC mutation for creating MCP server
  const createServerMutation = trpc.frontend.mcpServers.create.useMutation({
    onSuccess: (data) => {
      // Check if the operation was actually successful
      if (data.success) {
        toast.success("MCP Server Created", {
          description: `Successfully created "${form.getValues().name}" server`,
        });
        setCreateOpen(false);
        form.reset({
          name: "",
          description: "",
          type: McpServerTypeEnum.Enum.STDIO,
          command: "",
          args: "",
          url: "",
          bearerToken: "",
          env: "",
        });
        // Invalidate and refetch the server list
        utils.frontend.mcpServers.list.invalidate();
      } else {
        // Handle business logic errors returned by the backend
        const errorMessage = data.message || "Failed to create MCP server";

        // Check if this is a unique constraint violation for server name
        if (
          errorMessage.includes("already exists") &&
          errorMessage.includes("Server names must be unique")
        ) {
          // Set form error for the name field
          form.setError("name", {
            type: "manual",
            message: errorMessage,
          });
          toast.error("Server Name Already Exists", {
            description: "Please choose a different server name",
          });
        } else if (
          errorMessage.includes("is invalid") &&
          errorMessage.includes("Server names must only contain")
        ) {
          // Handle invalid server name format
          form.setError("name", {
            type: "manual",
            message: errorMessage,
          });
          toast.error("Invalid Server Name", {
            description:
              "Server names must only contain letters, numbers, underscores, and hyphens",
          });
        } else {
          // Generic error handling
          toast.error("Failed to Create Server", {
            description: errorMessage,
          });
        }
      }
    },
    onError: (error) => {
      console.error("Error creating server:", error);

      // Check if this is a unique constraint violation for server name
      if (
        error.message.includes("already exists") &&
        error.message.includes("Server names must be unique")
      ) {
        // Set form error for the name field
        form.setError("name", {
          type: "manual",
          message: error.message,
        });
        toast.error("Server Name Already Exists", {
          description: "Please choose a different server name",
        });
      } else if (
        error.message.includes("is invalid") &&
        error.message.includes("Server names must only contain")
      ) {
        // Handle invalid server name format
        form.setError("name", {
          type: "manual",
          message: error.message,
        });
        toast.error("Invalid Server Name", {
          description:
            "Server names must only contain letters, numbers, underscores, and hyphens",
        });
      } else {
        // Generic error handling
        toast.error("Failed to Create Server", {
          description: error.message || "An unexpected error occurred",
        });
      }
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const form = useForm<CreateServerFormData>({
    resolver: zodResolver(createServerFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: McpServerTypeEnum.Enum.STDIO,
      command: "",
      args: "",
      url: "",
      bearerToken: "",
      env: "",
    },
  });

  const onSubmit = async (data: CreateServerFormData) => {
    setIsSubmitting(true);
    try {
      // Parse args string into array by splitting on spaces
      const argsArray = data.args
        ? data.args
            .trim()
            .split(/\s+/)
            .filter((arg) => arg.length > 0)
        : [];

      // Parse env string into object
      const envObject: Record<string, string> = {};
      if (data.env) {
        const envLines = data.env.trim().split("\n");
        for (const line of envLines) {
          const trimmedLine = line.trim();
          if (trimmedLine && trimmedLine.includes("=")) {
            const [key, ...valueParts] = trimmedLine.split("=");
            const value = valueParts.join("="); // Handle values that contain '='
            if (key?.trim()) {
              envObject[key.trim()] = value;
            }
          }
        }
      }

      // Create the API request payload
      const apiPayload: CreateMcpServerRequest = {
        name: data.name,
        description: data.description,
        type: data.type,
        command: data.command,
        args: argsArray,
        env: envObject,
        url: data.url,
        bearerToken: data.bearerToken,
      };

      // Use tRPC mutation instead of direct fetch
      createServerMutation.mutate(apiPayload);
    } catch (error) {
      setIsSubmitting(false);
      console.error("Error preparing server data:", error);
      toast.error("Failed to Create Server", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">MCP Servers</h1>
            <p className="text-muted-foreground">
              Manage your MCP server configurations
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportImportButtons />

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create MCP Server
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create MCP Server</DialogTitle>
                <DialogDescription>
                  Configure a new Model Context Protocol server.
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
                    placeholder="My MCP Server"
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
                  <Input
                    id="description"
                    {...form.register("description")}
                    placeholder="Server description"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Type</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        type="button"
                      >
                        {form.watch("type") === McpServerTypeEnum.Enum.STDIO
                          ? "Stdio"
                          : form.watch("type") === McpServerTypeEnum.Enum.SSE
                            ? "SSE"
                            : form.watch("type") ===
                                McpServerTypeEnum.Enum.STREAMABLE_HTTP
                              ? "Streamable HTTP"
                              : "Select type"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                      <DropdownMenuItem
                        onClick={() =>
                          form.setValue("type", McpServerTypeEnum.Enum.STDIO)
                        }
                      >
                        Stdio
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          form.setValue("type", McpServerTypeEnum.Enum.SSE)
                        }
                      >
                        SSE
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          form.setValue(
                            "type",
                            McpServerTypeEnum.Enum.STREAMABLE_HTTP,
                          )
                        }
                      >
                        Streamable HTTP
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {form.watch("type") === McpServerTypeEnum.Enum.STDIO && (
                  <>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="command" className="text-sm font-medium">
                        Command
                      </label>
                      <Input
                        id="command"
                        {...form.register("command")}
                        placeholder="uvx"
                      />
                      {form.formState.errors.command && (
                        <p className="text-sm text-red-500">
                          {form.formState.errors.command.message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label htmlFor="args" className="text-sm font-medium">
                        Args (Optional)
                      </label>
                      <Input
                        id="args"
                        {...form.register("args")}
                        placeholder="mcp_server_time --local-timezone=America/New_York"
                      />
                      <p className="text-xs text-muted-foreground">
                        Separate arguments with spaces
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label htmlFor="env" className="text-sm font-medium">
                        Environment Variables (Optional)
                      </label>
                      <Textarea
                        id="env"
                        {...form.register("env")}
                        placeholder="KEY=value                                                                                ANOTHER_KEY=another_value"
                        className="h-24"
                      />
                      <p className="text-xs text-muted-foreground">
                        One environment variable per line in KEY=VALUE format
                      </p>
                    </div>
                  </>
                )}

                {(form.watch("type") === McpServerTypeEnum.Enum.SSE ||
                  form.watch("type") ===
                    McpServerTypeEnum.Enum.STREAMABLE_HTTP) && (
                  <>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="url" className="text-sm font-medium">
                        URL
                      </label>
                      <Input
                        id="url"
                        {...form.register("url")}
                        placeholder={
                          form.watch("type") === McpServerTypeEnum.Enum.SSE
                            ? "https://example.com/sse"
                            : "https://example.com/mcp"
                        }
                      />
                      {form.formState.errors.url && (
                        <p className="text-sm text-red-500">
                          {form.formState.errors.url.message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="bearerToken"
                        className="text-sm font-medium"
                      >
                        Auth Bearer Token (Optional)
                      </label>
                      <Input
                        id="bearerToken"
                        {...form.register("bearerToken")}
                        placeholder="your-bearer-token"
                        type="password"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      form.reset({
                        name: "",
                        description: "",
                        type: McpServerTypeEnum.Enum.STDIO,
                        command: "",
                        args: "",
                        url: "",
                        bearerToken: "",
                        env: "",
                      });
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Server"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <McpServersList />
    </div>
  );
}
