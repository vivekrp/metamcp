"use client";

import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ClientRequest,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ReadResourceResultSchema,
  Resource,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

interface InspectorResourcesProps {
  makeRequest: <T extends z.ZodType>(
    request: ClientRequest,
    schema: T,
    options?: RequestOptions & { suppressToast?: boolean },
  ) => Promise<z.output<T>>;
  enabled?: boolean;
}

export function InspectorResources({
  makeRequest,
  enabled = true,
}: InspectorResourcesProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceTemplates, setResourceTemplates] = useState<
    ResourceTemplate[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  );
  const [resourceContent, setResourceContent] =
    useState<ResourceContent | null>(null);
  const [reading, setReading] = useState(false);
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [nextResourceCursor, setNextResourceCursor] = useState<
    string | undefined
  >();
  const [nextTemplateCursor, setNextTemplateCursor] = useState<
    string | undefined
  >();
  const [resourceSubscriptions, setResourceSubscriptions] = useState<
    Set<string>
  >(new Set());

  const fetchResources = useCallback(
    async (cursor?: string) => {
      if (!enabled) return;

      setLoading(true);
      try {
        const response = await makeRequest(
          {
            method: "resources/list" as const,
            params: cursor ? { cursor } : {},
          },
          ListResourcesResultSchema,
          { suppressToast: true },
        );

        if (cursor) {
          // Append to existing resources if we're fetching more
          setResources((prev) => [...prev, ...(response.resources || [])]);
        } else {
          // Replace resources if this is the first fetch
          setResources(response.resources || []);
        }

        setNextResourceCursor(response.nextCursor);

        if (response.resources && response.resources.length === 0 && !cursor) {
          toast.info("No resources found on MCP server");
        }
      } catch (error) {
        console.error("Error fetching resources:", error);
        toast.error("Failed to fetch resources from MCP server", {
          description: error instanceof Error ? error.message : String(error),
        });
        if (!cursor) {
          setResources([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, enabled],
  );

  const fetchResourceTemplates = useCallback(
    async (cursor?: string) => {
      if (!enabled) return;

      setTemplatesLoading(true);
      try {
        const response = await makeRequest(
          {
            method: "resources/templates/list" as const,
            params: cursor ? { cursor } : {},
          },
          ListResourceTemplatesResultSchema,
          { suppressToast: true },
        );

        if (cursor) {
          // Append to existing templates if we're fetching more
          setResourceTemplates((prev) => [
            ...prev,
            ...(response.resourceTemplates || []),
          ]);
        } else {
          // Replace templates if this is the first fetch
          setResourceTemplates(response.resourceTemplates || []);
        }

        setNextTemplateCursor(response.nextCursor);

        if (
          response.resourceTemplates &&
          response.resourceTemplates.length === 0 &&
          !cursor
        ) {
          toast.info("No resource templates found on MCP server");
        }
      } catch (error) {
        console.error("Error fetching resource templates:", error);
        // Templates are optional, so don't show error toast for missing capability
        if (!cursor) {
          setResourceTemplates([]);
        }
      } finally {
        setTemplatesLoading(false);
      }
    },
    [makeRequest, enabled],
  );

  const clearResources = () => {
    setResources([]);
    setSelectedResource(null);
    setResourceContent(null);
    setNextResourceCursor(undefined);
  };

  const clearResourceTemplates = () => {
    setResourceTemplates([]);
    setNextTemplateCursor(undefined);
  };

  const handleResourceRead = async (resource: Resource) => {
    setReading(true);
    setResourceContent(null);

    try {
      const response = await makeRequest(
        {
          method: "resources/read" as const,
          params: {
            uri: resource.uri,
          },
        },
        ReadResourceResultSchema,
        { suppressToast: true },
      );

      if (response?.contents && response.contents.length > 0) {
        setResourceContent(response.contents[0]!);
        toast.success(
          `Resource "${resource.name || resource.uri}" read successfully`,
        );
      } else {
        toast.error("No content found in resource");
      }
    } catch (error) {
      console.error("Error reading resource:", error);
      toast.error(
        `Failed to read resource "${resource.name || resource.uri}"`,
        {
          description: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      setReading(false);
    }
  };

  const subscribeToResource = async (uri: string) => {
    if (resourceSubscriptions.has(uri)) return;

    try {
      await makeRequest(
        {
          method: "resources/subscribe" as const,
          params: { uri },
        },
        z.object({}),
        { suppressToast: true },
      );

      const newSubscriptions = new Set(resourceSubscriptions);
      newSubscriptions.add(uri);
      setResourceSubscriptions(newSubscriptions);

      toast.success(`Subscribed to resource "${uri}"`);
    } catch (error) {
      console.error("Error subscribing to resource:", error);
      toast.error(`Failed to subscribe to resource "${uri}"`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const unsubscribeFromResource = async (uri: string) => {
    if (!resourceSubscriptions.has(uri)) return;

    try {
      await makeRequest(
        {
          method: "resources/unsubscribe" as const,
          params: { uri },
        },
        z.object({}),
        { suppressToast: true },
      );

      const newSubscriptions = new Set(resourceSubscriptions);
      newSubscriptions.delete(uri);
      setResourceSubscriptions(newSubscriptions);

      toast.success(`Unsubscribed from resource "${uri}"`);
    } catch (error) {
      console.error("Error unsubscribing from resource:", error);
      toast.error(`Failed to unsubscribe from resource "${uri}"`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const formatResourceContent = (content: ResourceContent) => {
    if (content.text) {
      return content.text;
    } else if (content.blob) {
      return `[Binary content - ${content.blob.length} characters]`;
    }
    return "[No content available]";
  };

  const getResourceDisplayName = (resource: Resource) => {
    return resource.name || resource.uri.split("/").pop() || resource.uri;
  };

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h4 className="text-sm font-medium">Resources Not Supported</h4>
        <p className="text-xs text-muted-foreground mt-1">
          This MCP server doesn&apos;t support resources.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium">
            Resources ({resources.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearResources}
            disabled={loading || resources.length === 0}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchResources()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Loading..." : "Load Resources"}
          </Button>
          {nextResourceCursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchResources(nextResourceCursor)}
              disabled={loading}
            >
              Load More
            </Button>
          )}
        </div>
      </div>

      {/* Resource Templates Section */}
      {resourceTemplates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">
                Resource Templates ({resourceTemplates.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearResourceTemplates}
                disabled={templatesLoading || resourceTemplates.length === 0}
              >
                Clear Templates
              </Button>
              {nextTemplateCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchResourceTemplates(nextTemplateCursor)}
                  disabled={templatesLoading}
                >
                  Load More Templates
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {resourceTemplates.map((template) => (
              <div
                key={template.uriTemplate}
                className="border rounded-lg p-3 bg-blue-50 border-blue-200"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Plus className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">
                    {template.name || "Unnamed Template"}
                  </span>
                </div>
                {template.description && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {template.description}
                  </div>
                )}
                <div className="text-xs font-mono bg-white p-2 rounded border">
                  {template.uriTemplate}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resources List */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: Resource List */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Available Resources</h4>
          {loading && resources.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Loading resources...
            </div>
          ) : resources.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Click &quot;Load Resources&quot; to fetch available resources from
              the MCP server.
            </div>
          ) : (
            <div className="space-y-1">
              {resources.map((resource) => (
                <div
                  key={resource.uri}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedResource?.uri === resource.uri
                      ? "border-green-500 bg-green-50"
                      : "hover:border-gray-300"
                  }`}
                  onClick={() => {
                    setSelectedResource(resource);
                    setExpandedResource(resource.uri);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-500" />
                      <div>
                        <div className="text-sm font-medium">
                          {getResourceDisplayName(resource)}
                        </div>
                        {resource.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {resource.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {resourceSubscriptions.has(resource.uri) && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Subscribed
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedResource(
                            expandedResource === resource.uri
                              ? null
                              : resource.uri,
                          );
                        }}
                      >
                        {expandedResource === resource.uri ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {expandedResource === resource.uri && (
                    <div className="mt-2 pt-2 border-t space-y-2">
                      <div className="text-xs text-muted-foreground">
                        <div>URI: {resource.uri}</div>
                        {resource.mimeType && (
                          <div>MIME Type: {resource.mimeType}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResourceRead(resource);
                          }}
                          disabled={reading}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Read
                        </Button>
                        {!resourceSubscriptions.has(resource.uri) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              subscribeToResource(resource.uri);
                            }}
                          >
                            Subscribe
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              unsubscribeFromResource(resource.uri);
                            }}
                          >
                            Unsubscribe
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Resource Content */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Resource Content</h4>
          {!selectedResource ? (
            <div className="text-sm text-muted-foreground">
              Select a resource to view its content
            </div>
          ) : reading ? (
            <div className="text-sm text-muted-foreground">
              Reading resource content...
            </div>
          ) : !resourceContent ? (
            <div className="text-sm text-muted-foreground">
              Click &quot;Read&quot; to load the content of &quot;
              {getResourceDisplayName(selectedResource)}&quot;
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                <div>URI: {resourceContent.uri}</div>
                {resourceContent.mimeType && (
                  <div>MIME Type: {resourceContent.mimeType}</div>
                )}
              </div>
              <div className="border rounded-lg p-3 bg-gray-50 max-h-96 overflow-y-auto">
                <CodeBlock
                  language="json"
                  maxHeight="384px"
                  className="text-xs"
                  wrapLines={true}
                >
                  {formatResourceContent(resourceContent)}
                </CodeBlock>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="rounded-lg bg-green-50 border border-green-200 p-4">
        <div className="flex items-start gap-3">
          <FileText className="h-5 w-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-green-900 mb-1">
              About Resources
            </h4>
            <p className="text-xs text-green-700">
              Resources provide access to data that the MCP server can read.
              This includes files, web content, databases, or any other data
              sources. You can subscribe to resources to receive notifications
              when they change.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
