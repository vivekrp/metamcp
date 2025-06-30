"use client";

import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
} from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notification } from "@/lib/notificationTypes";

interface NotificationEntry {
  id: string;
  notification: Notification;
  timestamp: Date;
  type: "notification" | "stderr";
}

interface NotificationsPanelProps {
  notifications: NotificationEntry[];
  onClearNotifications: () => void;
  onRemoveNotification: (id: string) => void;
}

export function NotificationsPanel({
  notifications,
  onClearNotifications,
  onRemoveNotification,
}: NotificationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  const getNotificationTypeInfo = (notification: NotificationEntry) => {
    if (notification.type === "stderr") {
      return {
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        badge: "stderr",
        badgeVariant: "destructive" as const,
      };
    }

    // Handle different notification methods
    const method = notification.notification.method;
    if (method?.includes("progress")) {
      return {
        icon: Bell,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        badge: "progress",
        badgeVariant: "secondary" as const,
      };
    }

    return {
      icon: Bell,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      badge: "info",
      badgeVariant: "default" as const,
    };
  };

  const renderNotificationContent = (notification: NotificationEntry) => {
    if (notification.type === "stderr") {
      return (
        <div className="text-xs text-red-700 font-mono bg-red-50 p-1.5 rounded border">
          {(notification.notification as any).params?.content ||
            "stderr output"}
        </div>
      );
    }

    // For other notifications, display the method and params
    const method = notification.notification.method;
    const params = (notification.notification as any).params;

    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-700">
          Method:{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">{method}</code>
        </div>
        {params && (
          <div className="text-xs text-gray-600">
            <div className="font-medium mb-0.5">Parameters:</div>
            <pre className="text-xs bg-gray-50 p-1.5 rounded border overflow-x-auto">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="py-1 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm">MCP Notifications</CardTitle>
            <Badge variant="outline" className="text-xs h-4 px-1">
              {notifications.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearNotifications}
              disabled={notifications.length === 0}
              className="h-6 text-xs px-2"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-0.5 max-h-64 overflow-y-auto pt-0 px-2 pb-2">
          {notifications.map((notification) => {
            const typeInfo = getNotificationTypeInfo(notification);
            const Icon = typeInfo.icon;

            return (
              <div key={notification.id}>
                <div
                  className={`p-1.5 rounded border ${typeInfo.bgColor} ${typeInfo.borderColor}`}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Icon
                        className={`h-3 w-3 flex-shrink-0 ${typeInfo.color}`}
                      />
                      <Badge
                        variant={typeInfo.badgeVariant}
                        className="text-xs py-0 h-3.5 px-1"
                      >
                        {typeInfo.badge}
                      </Badge>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatTimestamp(notification.timestamp)}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 flex-shrink-0"
                      onClick={() => onRemoveNotification(notification.id)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>

                  <div>{renderNotificationContent(notification)}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
