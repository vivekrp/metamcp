"use client";

import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ClientRequest,
  CompatibilityCallToolResult,
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Code,
  Loader2,
  Play,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface InspectorToolsProps {
  makeRequest: <T extends z.ZodType>(
    request: ClientRequest,
    schema: T,
    options?: RequestOptions & { suppressToast?: boolean },
  ) => Promise<z.output<T>>;
  enabled?: boolean;
}

interface ToolExecution {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: Date;
  status: "running" | "success" | "error";
  result?: CompatibilityCallToolResult;
  error?: string;
  duration?: number;
}

interface ArgumentInput {
  key: string;
  value: string;
  type: string;
  required: boolean;
  description?: string;
}

export function InspectorTools({
  makeRequest,
  enabled = true,
}: InspectorToolsProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [argumentInputs, setArgumentInputs] = useState<ArgumentInput[]>([]);
  const [executions, setExecutions] = useState<ToolExecution[]>([]);
  const [executing, setExecuting] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Fetch available tools with proper error handling pattern from official inspector
  const fetchTools = async (cursor?: string) => {
    if (!enabled) {
      toast.warning("Tools capability not available on this server");
      return;
    }

    setLoading(true);
    try {
      const response = await makeRequest(
        {
          method: "tools/list" as const,
          params: cursor ? { cursor } : {},
        },
        ListToolsResultSchema,
        { suppressToast: true },
      );

      if (cursor) {
        // Append to existing tools if we're fetching more
        setTools((prev) => [...prev, ...(response.tools || [])]);
      } else {
        // Replace tools if this is the first fetch
        setTools(response.tools || []);
      }

      setNextCursor(response.nextCursor);

      if (response.tools && response.tools.length > 0) {
        toast.success(`Found ${response.tools.length} tools`);
        // Auto-select first tool if none selected
        if (!selectedTool && response.tools.length > 0) {
          // @ts-expect-error TODO resolve MCP SDK Tool schema mismatch
          setSelectedTool(response.tools[0]);
        }
      } else {
        toast.info("No tools found");
      }
    } catch (error) {
      console.error("Error listing tools:", error);
      toast.error("Failed to list tools", {
        description: error instanceof Error ? error.message : String(error),
      });
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  const clearTools = () => {
    setTools([]);
    setSelectedTool(null);
    setNextCursor(undefined);
    setExecutions([]);
  };

  // Update argument inputs when selected tool changes
  useEffect(() => {
    if (!selectedTool) {
      setArgumentInputs([]);
      return;
    }

    const properties = selectedTool.inputSchema?.properties || {};
    const required = selectedTool.inputSchema?.required || [];

    const inputs: ArgumentInput[] = Object.entries(properties).map(
      // @ts-expect-error TODO resolve MCP SDK Tool schema mismatch
      ([key, schema]: [string, Record<string, unknown>]) => {
        let defaultValue = "";
        let type = "text";

        // Determine input type and default value based on schema
        if (schema.type === "string") {
          defaultValue =
            (schema.default as string) || (schema.example as string) || "";
          type = "text";
        } else if (schema.type === "number" || schema.type === "integer") {
          defaultValue =
            schema.default?.toString() || schema.example?.toString() || "0";
          type = "number";
        } else if (schema.type === "boolean") {
          defaultValue = schema.default?.toString() || "false";
          type = "boolean";
        } else if (schema.type === "array" || schema.type === "object") {
          defaultValue = JSON.stringify(
            schema.default ||
              schema.example ||
              (schema.type === "array" ? [] : {}),
            null,
            2,
          );
          type = "json";
        } else {
          defaultValue = JSON.stringify(
            schema.default || schema.example || null,
            null,
            2,
          );
          type = "json";
        }

        return {
          key,
          value: defaultValue,
          type,
          required: required.includes(key),
          description: schema.description as string | undefined,
        };
      },
    );

    setArgumentInputs(inputs);
  }, [selectedTool]);

  // Execute the selected tool using the proper result schema from official inspector
  const executeTool = async () => {
    if (!selectedTool) return;

    const arguments_obj: Record<string, unknown> = {};

    // Parse all argument inputs
    for (const input of argumentInputs) {
      try {
        if (input.type === "number") {
          arguments_obj[input.key] = input.value ? parseFloat(input.value) : 0;
        } else if (input.type === "boolean") {
          arguments_obj[input.key] = input.value === "true";
        } else if (input.type === "json") {
          arguments_obj[input.key] = input.value
            ? JSON.parse(input.value)
            : null;
        } else {
          arguments_obj[input.key] = input.value;
        }
      } catch (_error) {
        toast.error(`Invalid JSON in parameter "${input.key}"`, {
          description: "Please check your JSON syntax and try again.",
        });
        return;
      }
    }

    setExecuting(true);
    const startTime = Date.now();
    const executionId = `exec-${Date.now()}`;

    const newExecution: ToolExecution = {
      id: executionId,
      toolName: selectedTool.name,
      arguments: arguments_obj,
      timestamp: new Date(),
      status: "running",
    };

    setExecutions((prev) => [newExecution, ...prev]);

    try {
      // Use CompatibilityCallToolResultSchema for better compatibility
      const response = await makeRequest(
        {
          method: "tools/call" as const,
          params: {
            name: selectedTool.name,
            arguments: arguments_obj,
          },
        },
        CompatibilityCallToolResultSchema,
        { suppressToast: true },
      );

      const duration = Date.now() - startTime;
      const successExecution: ToolExecution = {
        ...newExecution,
        status: "success",
        result: response,
        duration,
      };

      setExecutions((prev) =>
        prev.map((exec) => (exec.id === executionId ? successExecution : exec)),
      );

      toast.success(`Tool "${selectedTool.name}" executed successfully`, {
        description: `Completed in ${duration}ms`,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorString =
        error instanceof Error ? error.message : String(error);

      const failedExecution: ToolExecution = {
        ...newExecution,
        status: "error",
        error: errorString,
        duration,
      };

      setExecutions((prev) =>
        prev.map((exec) => (exec.id === executionId ? failedExecution : exec)),
      );

      toast.error(`Tool "${selectedTool.name}" execution failed`, {
        description: errorString,
      });
    } finally {
      setExecuting(false);
    }
  };

  const updateArgumentValue = (key: string, value: string) => {
    setArgumentInputs((prev) =>
      prev.map((input) => (input.key === key ? { ...input, value } : input)),
    );
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) {
      return `${duration}ms`;
    }
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Check if tools capability is disabled
  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h4 className="text-sm font-medium">Tools Not Available</h4>
        <p className="text-sm text-muted-foreground mt-1">
          This MCP server does not support the tools capability.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-blue-500" />
          <span className="text-sm font-medium">Tools Testing</span>
          <span className="text-xs text-muted-foreground">
            Test and debug available tools
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearTools}
            disabled={loading || tools.length === 0}
          >
            Clear
          </Button>
          <Button onClick={() => fetchTools()} disabled={loading} size="sm">
            {loading ? "Loading..." : "List Tools"}
          </Button>
          {nextCursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTools(nextCursor)}
              disabled={loading}
            >
              Load More
            </Button>
          )}
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Tools List */}
        <div className="space-y-4">
          <h5 className="text-sm font-medium">
            Available Tools ({tools.length})
          </h5>

          {tools.length > 0 ? (
            <div className="space-y-2">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedTool?.name === tool.name
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedTool(tool)}
                >
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-blue-500" />
                    <span className="font-mono text-sm">{tool.name}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Wrench className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click &quot;List Tools&quot; to load available tools
                </p>
              </div>
            )
          )}

          {/* Tool Details and Arguments */}
          {selectedTool && (
            <div className="space-y-4">
              <div>
                <h6 className="text-sm font-medium mb-2">Tool Details</h6>
                <div className="rounded-lg border p-3">
                  <div className="font-mono text-sm mb-1">
                    {selectedTool.name}
                  </div>
                  {selectedTool.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTool.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Arguments Form */}
              {argumentInputs.length > 0 && (
                <div>
                  <h6 className="text-sm font-medium mb-2">Arguments</h6>
                  <div className="space-y-3">
                    {argumentInputs.map((input) => (
                      <div key={input.key}>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          {input.key}
                          {input.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                        {input.description && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {input.description}
                          </p>
                        )}
                        {input.type === "json" ? (
                          <Textarea
                            value={input.value}
                            onChange={(e) =>
                              updateArgumentValue(input.key, e.target.value)
                            }
                            placeholder={`Enter ${input.type} value...`}
                            className="font-mono text-xs"
                            rows={3}
                          />
                        ) : (
                          <Input
                            type={input.type === "number" ? "number" : "text"}
                            value={input.value}
                            onChange={(e) =>
                              updateArgumentValue(input.key, e.target.value)
                            }
                            placeholder={`Enter ${input.type} value...`}
                            className={
                              input.type === "number" ? "" : "font-mono"
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execute Button */}
              <Button
                onClick={executeTool}
                disabled={executing}
                className="w-full flex items-center gap-2"
              >
                {executing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {executing ? "Calling..." : "Call Tool"}
              </Button>
            </div>
          )}
        </div>

        {/* Right Column - Execution and History */}
        <div className="space-y-4">
          <h5 className="text-sm font-medium">
            Execution History ({executions.length})
          </h5>

          {executions.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {executions.map((execution) => (
                <div key={execution.id} className="rounded-lg border p-3">
                  {/* Execution Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(execution.status)}
                      <span className="font-mono text-sm">
                        {execution.toolName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {execution.timestamp.toLocaleTimeString()}
                      {execution.duration &&
                        ` • ${formatDuration(execution.duration)}`}
                    </div>
                  </div>

                  {/* Arguments */}
                  {Object.keys(execution.arguments).length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Arguments:
                      </div>
                      <CodeBlock
                        language="json"
                        maxHeight="200px"
                        className="text-xs"
                      >
                        {JSON.stringify(execution.arguments, null, 2)}
                      </CodeBlock>
                    </div>
                  )}

                  {/* Error */}
                  {execution.error && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded mb-2">
                      <div className="font-medium mb-1">Error:</div>
                      {execution.error}
                    </div>
                  )}

                  {/* Result */}
                  {execution.result && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Result:
                      </div>
                      <CodeBlock
                        language="json"
                        maxHeight="200px"
                        className="text-xs"
                      >
                        {JSON.stringify(execution.result, null, 2)}
                      </CodeBlock>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No executions yet. Select a tool and execute it to see results.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
