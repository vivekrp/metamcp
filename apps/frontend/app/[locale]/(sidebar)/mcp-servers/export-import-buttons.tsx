"use client";

import {
  BulkImportMcpServersRequest,
  McpServerTypeEnum,
} from "@repo/zod-types";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export function ExportImportButtons() {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");

  // Use tRPC query for data fetching
  const { data: serversResponse } = trpc.frontend.mcpServers.list.useQuery();
  const servers = serversResponse?.success ? serversResponse.data : [];

  // Get the utils for invalidating queries
  const utils = trpc.useUtils();

  // Use tRPC mutation for bulk import
  const bulkImportMutation = trpc.frontend.mcpServers.bulkImport.useMutation({
    onSuccess: (result) => {
      // Check if the operation was actually successful
      if (result.success) {
        console.log(`Successfully imported ${result.imported} MCP servers`);
        toast.success("MCP Servers Imported", {
          description: `Successfully imported ${result.imported} server${result.imported !== 1 ? "s" : ""}`,
        });
        if (result.errors && result.errors.length > 0) {
          console.warn("Import errors:", result.errors);
          toast.warning("Import Completed with Warnings", {
            description: `${result.errors.length} server${result.errors.length !== 1 ? "s" : ""} failed to import`,
          });
        }

        // Invalidate the MCP servers list query to refetch data
        utils.frontend.mcpServers.list.invalidate();

        // Close the dialog and reset
        setImportOpen(false);
        setImportJson("");
        setImportError("");
      } else {
        // Handle business logic failures
        console.error("Import failed:", result.message);
        toast.error("Import Failed", {
          description: result.message || "Failed to import servers",
        });
        setImportError(result.message || "Failed to import servers");
      }
    },
    onError: (error) => {
      console.error("Error importing MCP servers:", error);
      toast.error("Import Failed", {
        description: error.message || "Failed to import servers",
      });
      setImportError(
        "Failed to import servers. Check the console for details.",
      );
    },
  });

  // Function to generate export JSON
  const generateExportJson = () => {
    const mcpServersConfig: Record<string, Record<string, unknown>> = {};

    servers.forEach((server) => {
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

      mcpServersConfig[server.name] = config;
    });

    return {
      mcpServers: mcpServersConfig,
    };
  };

  // Function to download JSON file
  const downloadExportJson = () => {
    const exportData = generateExportJson();
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mcp-servers-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Export Downloaded", {
      description: "MCP servers configuration has been downloaded",
    });
  };

  // Function to copy JSON to clipboard
  const copyExportJson = () => {
    const exportData = generateExportJson();
    const jsonString = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      toast.success("Copied to Clipboard", {
        description: "MCP servers configuration has been copied to clipboard",
      });
    });
  };

  // Function to handle import
  const handleImport = async () => {
    // Parse the JSON
    let parsedJson;
    try {
      parsedJson = JSON.parse(importJson);
    } catch (_e) {
      setImportError("Invalid JSON format");
      return;
    }

    // Validate the JSON structure
    if (!parsedJson.mcpServers || typeof parsedJson.mcpServers !== "object") {
      setImportError('JSON must contain a "mcpServers" object');
      return;
    }

    console.log("Importing servers:", parsedJson);

    // Call the tRPC mutation
    const apiPayload: BulkImportMcpServersRequest = {
      mcpServers: parsedJson.mcpServers,
    };

    bulkImportMutation.mutate(apiPayload);
  };

  return (
    <div className="flex gap-2">
      {/* Export Button */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Export MCP Servers</DialogTitle>
            <DialogDescription>
              Export your MCP server configurations as JSON. You can download
              the file or copy it to clipboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Preview:</label>
              <CodeBlock language="json" maxHeight="256px" className="text-xs">
                {JSON.stringify(generateExportJson(), null, 2)}
              </CodeBlock>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setExportOpen(false)}
              >
                Close
              </Button>
              <Button type="button" variant="outline" onClick={copyExportJson}>
                Copy to Clipboard
              </Button>
              <Button type="button" onClick={downloadExportJson}>
                Download JSON
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Button */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import JSON
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import MCP Servers</DialogTitle>
            <DialogDescription>
              Import multiple MCP server configurations from JSON. This will
              incrementally add MCP servers without overwriting what you have
              here. The JSON should follow the format:
            </DialogDescription>
            <CodeBlock
              language="json"
              maxHeight="128px"
              className="mt-2 text-xs"
            >
              {`{
  "mcpServers": {
    "CommandBasedServerName": {
      "command": "command",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "value"
      },
      "description": "Optional description",
      "type": "stdio" // optional, defaults to "stdio"
    },
    "UrlBasedServerName": {
      "url": "https://example.com/sse",
      "description": "Optional description",
      "type": "sse" // optional, defaults to "stdio"
    },
    "StreamableHttpServerName": {
      "url": "https://example.com/mcp",
      "description": "Optional description",
      "type": "streamable_http"
    }
  }
}`}
            </CodeBlock>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden">
            <div className="flex flex-col h-full">
              <label className="text-sm font-medium mb-2">JSON Content:</label>
              <Textarea
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value);
                  setImportError("");
                }}
                placeholder="Paste your JSON here"
                className="font-mono text-sm flex-1 min-h-[200px] max-h-[300px] resize-none overflow-y-auto"
              />
              {importError && (
                <p className="text-sm text-red-500 mt-1">{importError}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportOpen(false);
                setImportJson("");
                setImportError("");
              }}
              disabled={bulkImportMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={bulkImportMutation.isPending}
              onClick={handleImport}
            >
              {bulkImportMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
