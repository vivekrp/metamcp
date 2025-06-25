/* eslint-disable @next/next/no-img-element */
"use client";

import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ClientRequest,
  GetPromptResultSchema,
  ListPromptsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Play,
  RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface PromptMessage {
  role: "user" | "assistant" | "system";
  content: {
    type: "text" | "image" | "audio" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  };
}

interface PromptGetResponse {
  description?: string;
  messages: PromptMessage[];
}

interface InspectorPromptsProps {
  makeRequest: <T extends z.ZodType>(
    request: ClientRequest,
    schema: T,
    options?: RequestOptions & { suppressToast?: boolean },
  ) => Promise<z.output<T>>;
  enabled?: boolean;
}

export function InspectorPrompts({
  makeRequest,
  enabled = true,
}: InspectorPromptsProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});
  const [promptResult, setPromptResult] = useState<PromptGetResponse | null>(
    null,
  );
  const [getting, setGetting] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  const fetchPrompts = useCallback(
    async (cursor?: string) => {
      if (!enabled) return;

      setLoading(true);
      try {
        const response = await makeRequest(
          {
            method: "prompts/list" as const,
            params: cursor ? { cursor } : {},
          },
          ListPromptsResultSchema,
          { suppressToast: true },
        );

        if (cursor) {
          // Append to existing prompts if we're fetching more
          setPrompts((prev) => [...prev, ...(response.prompts || [])]);
        } else {
          // Replace prompts if this is the first fetch
          setPrompts(response.prompts || []);
        }

        setNextCursor(response.nextCursor);

        if (response.prompts && response.prompts.length === 0 && !cursor) {
          toast.info("No prompts found on MCP server");
        }
      } catch (error) {
        console.error("Error fetching prompts:", error);
        toast.error("Failed to fetch prompts from MCP server", {
          description: error instanceof Error ? error.message : String(error),
        });
        if (!cursor) {
          setPrompts([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, enabled],
  );

  const clearPrompts = () => {
    setPrompts([]);
    setSelectedPrompt(null);
    setPromptResult(null);
    setNextCursor(undefined);
  };

  const handlePromptGet = async () => {
    if (!selectedPrompt) return;

    setGetting(true);
    setPromptResult(null);

    try {
      const response = await makeRequest(
        {
          method: "prompts/get" as const,
          params: {
            name: selectedPrompt.name,
            arguments: promptArgs,
          },
        },
        GetPromptResultSchema,
        { suppressToast: true },
      );

      setPromptResult(response);
      toast.success(`Prompt "${selectedPrompt.name}" retrieved successfully`);
    } catch (error) {
      console.error("Error getting prompt:", error);
      toast.error(`Failed to get prompt "${selectedPrompt.name}"`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGetting(false);
    }
  };

  const handleArgChange = (argName: string, value: string) => {
    setPromptArgs((prev) => ({
      ...prev,
      [argName]: value,
    }));
  };

  const renderMessage = (message: PromptMessage, index: number) => {
    const getRoleColor = (role: string) => {
      switch (role) {
        case "user":
          return "text-blue-700 bg-blue-50 border-blue-200";
        case "assistant":
          return "text-green-700 bg-green-50 border-green-200";
        case "system":
          return "text-orange-700 bg-orange-50 border-orange-200";
        default:
          return "text-gray-700 bg-gray-50 border-gray-200";
      }
    };

    return (
      <div
        key={index}
        className={`p-3 rounded-lg border ${getRoleColor(message.role)}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium uppercase">{message.role}</span>
          <span className="text-xs opacity-75">({message.content.type})</span>
        </div>
        {message.content.type === "text" && message.content.text && (
          <div className="text-sm whitespace-pre-wrap">
            {message.content.text}
          </div>
        )}
        {message.content.type === "image" && (
          <div className="text-xs text-muted-foreground">
            [Image data - {message.content.mimeType || "unknown format"}]
            {message.content.data && (
              <img
                src={`data:${message.content.mimeType};base64,${message.content.data}`}
                alt="Prompt image"
                className="mt-2 max-w-full h-auto"
              />
            )}
          </div>
        )}
        {message.content.type === "audio" && (
          <div className="text-xs text-muted-foreground">
            [Audio data - {message.content.mimeType || "unknown format"}]
            {message.content.data && (
              <audio
                controls
                className="mt-2 w-full"
                src={`data:${message.content.mimeType};base64,${message.content.data}`}
              >
                Your browser does not support the audio element.
              </audio>
            )}
          </div>
        )}
        {message.content.type === "resource" && (
          <div className="text-xs text-muted-foreground">
            [Resource - {message.content.resource?.mimeType || "unknown format"}
            ]
            <div className="mt-2 p-2 bg-gray-100 rounded border">
              <div className="font-mono text-xs break-all">
                URI: {message.content.resource?.uri}
              </div>
              {message.content.resource?.text && (
                <div className="mt-1 text-sm">
                  {message.content.resource.text}
                </div>
              )}
              {message.content.resource?.blob && (
                <div className="mt-1 text-xs">
                  [Binary data: {message.content.resource.blob.length} chars]
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h4 className="text-sm font-medium">Prompts Not Supported</h4>
        <p className="text-xs text-muted-foreground mt-1">
          This MCP server doesn&apos;t support prompts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple-500" />
          <span className="text-sm font-medium">
            Prompts ({prompts.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearPrompts}
            disabled={loading || prompts.length === 0}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPrompts()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Loading..." : "Load Prompts"}
          </Button>
          {nextCursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPrompts(nextCursor)}
              disabled={loading}
            >
              Load More
            </Button>
          )}
        </div>
      </div>

      {/* Prompts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Prompt Selection and Arguments */}
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Available Prompts</h4>
            {loading && prompts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Loading prompts...
              </div>
            ) : prompts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Click &quot;Load Prompts&quot; to fetch available prompts from
                the MCP server.
              </div>
            ) : (
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <div
                    key={prompt.name}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedPrompt?.name === prompt.name
                        ? "border-purple-500 bg-purple-50"
                        : "hover:border-gray-300"
                    }`}
                    onClick={() => {
                      setSelectedPrompt(prompt);
                      setPromptResult(null);
                      // Reset args when selecting a new prompt
                      const initialArgs: Record<string, string> = {};
                      if (prompt.arguments) {
                        prompt.arguments.forEach((arg) => {
                          initialArgs[arg.name] = "";
                        });
                      }
                      setPromptArgs(initialArgs);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-purple-500" />
                        <div>
                          <div className="font-medium text-sm">
                            {prompt.name}
                          </div>
                          {prompt.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {prompt.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {prompt.arguments && prompt.arguments.length > 0 && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            {prompt.arguments.length} arg
                            {prompt.arguments.length > 1 ? "s" : ""}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedPrompt(
                              expandedPrompt === prompt.name
                                ? null
                                : prompt.name,
                            );
                          }}
                        >
                          {expandedPrompt === prompt.name ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {expandedPrompt === prompt.name && (
                      <div className="mt-2 pt-2 border-t space-y-2">
                        <div className="text-xs text-muted-foreground">
                          <div>Name: {prompt.name}</div>
                          {prompt.description && (
                            <div>Description: {prompt.description}</div>
                          )}
                        </div>
                        {prompt.arguments && prompt.arguments.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1">
                              Arguments:
                            </div>
                            <div className="space-y-1">
                              {prompt.arguments.map((arg) => (
                                <div
                                  key={arg.name}
                                  className="text-xs bg-white p-2 rounded border"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">
                                      {arg.name}
                                    </span>
                                    {arg.required && (
                                      <span className="text-red-500 text-xs">
                                        required
                                      </span>
                                    )}
                                  </div>
                                  {arg.description && (
                                    <div className="text-muted-foreground mt-1">
                                      {arg.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Arguments Form */}
          {selectedPrompt &&
            selectedPrompt.arguments &&
            selectedPrompt.arguments.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Arguments</h4>
                <div className="space-y-3">
                  {selectedPrompt.arguments.map((arg) => (
                    <div key={arg.name}>
                      <label className="text-xs font-medium">
                        {arg.name}
                        {arg.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {arg.description && (
                        <div className="text-xs text-muted-foreground mb-1">
                          {arg.description}
                        </div>
                      )}
                      <Input
                        value={promptArgs[arg.name] || ""}
                        onChange={(e) =>
                          handleArgChange(arg.name, e.target.value)
                        }
                        placeholder={`Enter ${arg.name} value`}
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Get Prompt Button */}
          {selectedPrompt && (
            <Button
              onClick={handlePromptGet}
              disabled={getting}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              {getting ? "Getting..." : "Get Prompt"}
            </Button>
          )}
        </div>

        {/* Right: Prompt Result */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Prompt Result</h4>
          {!selectedPrompt ? (
            <div className="text-sm text-muted-foreground">
              Select a prompt to view its result
            </div>
          ) : getting ? (
            <div className="text-sm text-muted-foreground">
              Getting prompt result...
            </div>
          ) : !promptResult ? (
            <div className="text-sm text-muted-foreground">
              Click &quot;Get Prompt&quot; to retrieve the result for &quot;
              {selectedPrompt.name}&quot;
            </div>
          ) : (
            <div className="space-y-4">
              {promptResult.description && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Description
                  </div>
                  <div className="text-sm">{promptResult.description}</div>
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Messages ({promptResult.messages.length})
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {promptResult.messages.map((message, index) =>
                    renderMessage(message, index),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="rounded-lg bg-purple-50 border border-purple-200 p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-purple-500 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-purple-900 mb-1">
              About Prompts
            </h4>
            <p className="text-xs text-purple-700">
              Prompts are reusable templates that can generate messages for AI
              conversations. They can accept arguments to customize the
              generated content and help maintain consistent interactions across
              different contexts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
