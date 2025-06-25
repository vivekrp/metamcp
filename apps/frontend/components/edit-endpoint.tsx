"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  EditEndpointFormData,
  editEndpointFormSchema,
  EndpointWithNamespace,
  UpdateEndpointRequest,
} from "@repo/zod-types";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

interface EditEndpointProps {
  endpoint: EndpointWithNamespace | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedEndpoint: EndpointWithNamespace) => void;
}

export function EditEndpoint({
  endpoint,
  isOpen,
  onClose,
  onSuccess,
}: EditEndpointProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedNamespaceUuid, setSelectedNamespaceUuid] =
    useState<string>("");
  const [selectedNamespaceName, setSelectedNamespaceName] =
    useState<string>("");

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Fetch namespaces list
  const { data: namespacesResponse, isLoading: namespacesLoading } =
    trpc.frontend.namespaces.list.useQuery();
  const availableNamespaces = namespacesResponse?.success
    ? namespacesResponse.data
    : [];

  // tRPC mutation for updating endpoint
  const updateEndpointMutation = trpc.frontend.endpoints.update.useMutation({
    onSuccess: (data) => {
      if (data.success && data.data) {
        // Invalidate both the list and individual endpoint queries
        utils.frontend.endpoints.list.invalidate();
        if (endpoint) {
          utils.frontend.endpoints.get.invalidate({ uuid: endpoint.uuid });
        }

        toast.success("Endpoint Updated", {
          description: "Endpoint has been updated successfully",
        });

        // Get the updated endpoint with namespace info for the callback
        const updatedEndpoint: EndpointWithNamespace = {
          ...data.data,
          namespace:
            availableNamespaces.find(
              (ns) => ns.uuid === data.data!.namespace_uuid,
            ) || endpoint!.namespace,
        };

        onSuccess(updatedEndpoint);
        onClose();
        editForm.reset();
      } else {
        toast.error("Update Failed", {
          description: data.message || "Failed to update endpoint",
        });
      }
    },
    onError: (error) => {
      console.error("Error updating endpoint:", error);
      toast.error("Update Failed", {
        description: error.message || "An unexpected error occurred",
      });
    },
    onSettled: () => {
      setIsUpdating(false);
    },
  });

  const editForm = useForm<EditEndpointFormData>({
    resolver: zodResolver(editEndpointFormSchema),
    defaultValues: {
      name: "",
      description: "",
      namespaceUuid: "",
      enableApiKeyAuth: true,
      useQueryParamAuth: false,
    },
  });

  // Pre-populate form when endpoint changes
  useEffect(() => {
    if (endpoint && isOpen) {
      editForm.reset({
        name: endpoint.name,
        description: endpoint.description || "",
        namespaceUuid: endpoint.namespace.uuid,
        enableApiKeyAuth: endpoint.enable_api_key_auth ?? true,
        useQueryParamAuth: endpoint.use_query_param_auth ?? false,
      });
      setSelectedNamespaceUuid(endpoint.namespace.uuid);
      setSelectedNamespaceName(endpoint.namespace.name);
    }
  }, [endpoint, isOpen, editForm]);

  // Handle namespace selection
  const handleNamespaceSelect = (
    namespaceUuid: string,
    namespaceName: string,
  ) => {
    setSelectedNamespaceUuid(namespaceUuid);
    setSelectedNamespaceName(namespaceName);
    editForm.setValue("namespaceUuid", namespaceUuid);
    editForm.clearErrors("namespaceUuid");
  };

  // Handle edit endpoint
  const handleEditEndpoint = async (data: EditEndpointFormData) => {
    if (!endpoint) return;

    setIsUpdating(true);
    try {
      // Create the API request payload
      const apiPayload: UpdateEndpointRequest = {
        uuid: endpoint.uuid,
        name: data.name,
        description: data.description,
        namespaceUuid: data.namespaceUuid,
        enableApiKeyAuth: data.enableApiKeyAuth,
        useQueryParamAuth: data.useQueryParamAuth,
      };

      // Use tRPC mutation
      updateEndpointMutation.mutate(apiPayload);
    } catch (error) {
      setIsUpdating(false);
      console.error("Error preparing endpoint data:", error);
      toast.error("Update Failed", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    }
  };

  const handleClose = () => {
    onClose();
    editForm.reset();
    setSelectedNamespaceUuid("");
    setSelectedNamespaceName("");
  };

  if (!endpoint) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Endpoint</DialogTitle>
          <DialogDescription>
            Update the endpoint name, description, and reassign to a different
            namespace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={editForm.handleSubmit(handleEditEndpoint)}>
          <div className="grid gap-4 py-4">
            {/* Endpoint Name */}
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name *
              </label>
              <Input
                id="edit-name"
                placeholder="Enter endpoint name"
                {...editForm.register("name")}
                disabled={isUpdating}
              />
              {editForm.formState.errors.name && (
                <p className="text-sm text-red-500">
                  {editForm.formState.errors.name.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                URL-compatible name (alphanumeric, underscore, and hyphen only).
                This will be accessible at /metamcp/[name]
              </p>
            </div>

            {/* Endpoint Description */}
            <div className="space-y-2">
              <label htmlFor="edit-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="edit-description"
                placeholder="Enter endpoint description (optional)"
                {...editForm.register("description")}
                disabled={isUpdating}
                rows={3}
              />
              {editForm.formState.errors.description && (
                <p className="text-sm text-red-500">
                  {editForm.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Namespace Selection */}
            <div className="space-y-2">
              <label htmlFor="edit-namespace" className="text-sm font-medium">
                Namespace *
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={namespacesLoading || isUpdating}
                  >
                    {selectedNamespaceName || "Select namespace"}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-full"
                  style={{
                    minWidth: "var(--radix-dropdown-menu-trigger-width)",
                  }}
                >
                  {availableNamespaces.map((namespace) => (
                    <DropdownMenuItem
                      key={namespace.uuid}
                      onClick={() =>
                        handleNamespaceSelect(namespace.uuid, namespace.name)
                      }
                      className="flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{namespace.name}</span>
                        {namespace.description && (
                          <span className="text-xs text-muted-foreground">
                            {namespace.description}
                          </span>
                        )}
                      </div>
                      {selectedNamespaceUuid === namespace.uuid && (
                        <Check className="h-4 w-4" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {editForm.formState.errors.namespaceUuid && (
                <p className="text-sm text-red-500">
                  {editForm.formState.errors.namespaceUuid.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Select the namespace this endpoint should map to.
              </p>
            </div>

            {/* API Key Authentication Settings */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">API Key Authentication</h4>

              {/* Enable API Key Auth */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    Enable API Key Authentication
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Require API key for endpoint access
                  </p>
                </div>
                <Switch
                  checked={editForm.watch("enableApiKeyAuth")}
                  onCheckedChange={(checked) =>
                    editForm.setValue("enableApiKeyAuth", checked)
                  }
                  disabled={isUpdating}
                />
              </div>

              {/* Query Parameter Auth */}
              {editForm.watch("enableApiKeyAuth") && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">
                      Use Query Parameter Authentication
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Accept API key via ?api_key= in addition to Authorization
                      header
                    </p>
                  </div>
                  <Switch
                    checked={editForm.watch("useQueryParamAuth")}
                    onCheckedChange={(checked) =>
                      editForm.setValue("useQueryParamAuth", checked)
                    }
                    disabled={isUpdating}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUpdating || !selectedNamespaceUuid}
            >
              {isUpdating ? "Updating..." : "Update Endpoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
