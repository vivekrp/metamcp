import { zodResolver } from "@hookform/resolvers/zod";
import { CreateMcpServerRequest, McpServerTypeEnum } from "@repo/zod-types";
import { CreateServerFormData, createServerFormSchema } from "@repo/zod-types";
import { Github, Plus } from "lucide-react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { SearchIndex } from "@/types/search";

interface CreateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: CreateServerFormData;
}

function CreateServerDialog({
  open,
  onOpenChange,
  defaultValues,
}: CreateServerDialogProps) {
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
        onOpenChange(false);
        form.reset(defaultValues);
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
    defaultValues,
  });

  // Reset form when dialog opens with new defaultValues
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    } else {
      // Reset form when dialog closes to ensure clean state
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

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

      // Use tRPC mutation
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create MCP Server</DialogTitle>
          <DialogDescription>
            Configure a new Model Context Protocol server.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter server name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter server description"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {field.value || "Select type"}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {Object.values(McpServerTypeEnum.Enum).map((type) => (
                        <DropdownMenuItem
                          key={type}
                          onClick={() => field.onChange(type)}
                        >
                          {type}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("type") === McpServerTypeEnum.Enum.STDIO && (
              <>
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Command</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., npx" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="args"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Arguments</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Space-separated arguments"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="env"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Environment Variables</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="KEY=value (one per line)"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {(form.watch("type") === McpServerTypeEnum.Enum.SSE ||
              form.watch("type") ===
                McpServerTypeEnum.Enum.STREAMABLE_HTTP) && (
              <>
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://example.com"
                          type="url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bearerToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bearer Token (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Bearer token" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset(defaultValues);
                  onOpenChange(false);
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CardGrid({ items }: { items: SearchIndex }) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CreateServerFormData | null>(
    null,
  );

  const handleAddServer = (item: SearchIndex[string]) => {
    // Prepare default values for the form
    const sanitizedName = item.name.replace(/[^a-zA-Z0-9_-]/g, "-");
    const envString =
      item.envs && item.envs.length > 0
        ? item.envs.map((env) => `${env}=`).join("\n")
        : "";

    const defaultValues: CreateServerFormData = {
      name: sanitizedName,
      description: item.description,
      type: McpServerTypeEnum.Enum.STDIO,
      command: item.command,
      args: item.args?.join(" ") || "",
      url: "",
      bearerToken: "",
      env: envString,
    };

    setSelectedItem(defaultValues);
    setCreateDialogOpen(true);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(items).map(([key, item]) => (
          <Card key={key} className="flex flex-col">
            <CardHeader>
              <CardTitle>
                <span>{item.name}</span>
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-3">
              {item.package_name && (
                <div>
                  <span className="text-sm font-medium">Package:</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {item.package_name}
                  </span>
                </div>
              )}

              <div>
                <span className="text-sm font-medium">Command:</span>{" "}
                <code className="text-sm bg-muted px-1 py-0.5 rounded">
                  {item.command}
                </code>
              </div>

              {item.args && item.args.length > 0 && (
                <div>
                  <span className="text-sm font-medium">Args:</span>{" "}
                  <code className="text-sm bg-muted px-1 py-0.5 rounded">
                    {item.args.join(" ")}
                  </code>
                </div>
              )}

              {item.envs.length > 0 && (
                <div>
                  <span className="text-sm font-medium block mb-2">
                    Environment Variables:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.envs.map((env) => (
                      <Badge key={env} variant="secondary" className="text-xs">
                        {env}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {item.package_registry && (
                <div>
                  <span className="text-sm font-medium">Registry:</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {item.package_registry}
                  </span>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              {item.githubUrl && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={item.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    GitHub
                  </Link>
                </Button>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={() => handleAddServer(item)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Server
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {selectedItem && (
        <CreateServerDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          defaultValues={selectedItem}
        />
      )}
    </>
  );
}
