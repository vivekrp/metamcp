"use client";

import { AlertCircle, Trash2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function ErrorLogsPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Query logs
  const { data: logsResponse, refetch, isLoading } = trpc.frontend.logs.get.useQuery(
    { limit: 500 },
    {
      refetchInterval: autoRefresh ? 2000 : false, // Auto-refresh every 2 seconds
    }
  );

  // Clear logs mutation
  const clearLogsMutation = trpc.frontend.logs.clear.useMutation({
    onSuccess: () => {
      toast.success("Logs cleared successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to clear logs: ${error.message}`);
    },
  });

  const logs = logsResponse?.data || [];
  const totalCount = logsResponse?.totalCount || 0;

  const handleClearLogs = () => {
    if (confirm("Are you sure you want to clear all logs? This action cannot be undone.")) {
      clearLogsMutation.mutate();
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warn":
        return "secondary";
      case "info":
        return "default";
      default:
        return "outline";
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Error logs</h1>
            <p className="text-sm text-muted-foreground">
              MetaMCP server logs and error messages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {totalCount} total logs
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Stop" : "Start"} Auto-refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearLogs}
            disabled={clearLogsMutation.isPending || logs.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            Clear logs
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Console Output</span>
            {autoRefresh && (
              <Badge variant="secondary" className="text-xs">
                Live
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black rounded-lg p-4 font-mono text-sm max-h-[600px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                No logs to display
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-gray-300 hover:bg-gray-800 px-2 py-1 rounded">
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Badge
                      variant={getLevelColor(log.level) as any}
                      className="text-xs"
                    >
                      {log.level.toUpperCase()}
                    </Badge>
                    <span className="text-blue-400 font-medium">
                      [{log.serverName}]
                    </span>
                    <span className="flex-1">
                      {log.message}
                      {log.error && (
                        <span className="text-red-400 ml-2">
                          {log.error}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Showing {logs.length} of {totalCount} logs (newest first)
        </div>
      )}
    </div>
  );
} 