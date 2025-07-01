"use client";

import { FileTerminal, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLogsStore } from "@/lib/stores/logs-store";

export default function LiveLogsPage() {
  const {
    logs,
    isLoading,
    isAutoRefreshing,
    totalCount,
    lastFetch,
    fetchLogs,
    clearLogs,
    setAutoRefresh,
  } = useLogsStore();

  const handleClearLogs = async () => {
    if (
      confirm(
        "Are you sure you want to clear all logs? This action cannot be undone.",
      )
    ) {
      try {
        await clearLogs();
        toast.success("Logs cleared successfully");
      } catch (error) {
        toast.error("Failed to clear logs");
      }
    }
  };

  const handleRefresh = async () => {
    try {
      await fetchLogs();
      toast.success("Logs refreshed");
    } catch (error) {
      toast.error("Failed to refresh logs");
    }
  };

  const handleToggleAutoRefresh = () => {
    setAutoRefresh(!isAutoRefreshing);
    if (!isAutoRefreshing) {
      toast.success("Auto-refresh enabled");
    } else {
      toast.info("Auto-refresh disabled");
    }
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
          <FileTerminal className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Live Logs</h1>
            <p className="text-sm text-muted-foreground">
              MetaMCP server logs and error messages
              {lastFetch && (
                <span className="ml-2">
                  (Last updated: {formatTimestamp(lastFetch)})
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{totalCount} total logs</Badge>
          <Button variant="outline" size="sm" onClick={handleToggleAutoRefresh}>
            {isAutoRefreshing ? "Stop" : "Start"} Auto-refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearLogs}
            disabled={isLoading || logs.length === 0}
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
            {isAutoRefreshing && (
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
                {isLoading ? "Loading logs..." : "No logs to display"}
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 text-gray-300 hover:bg-gray-800 px-2 py-1 rounded"
                  >
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {formatTimestamp(new Date(log.timestamp))}
                    </span>
                    <Badge
                      variant={getLevelColor(log.level)}
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
                        <span className="text-red-400 ml-2">{log.error}</span>
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
