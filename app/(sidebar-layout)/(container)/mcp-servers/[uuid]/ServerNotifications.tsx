import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatus } from "@/lib/constants";

interface ServerNotificationsProps {
  connectionStatus: ConnectionStatus;
  notifications: any[];
  clearNotifications: () => void;
}

export default function ServerNotifications({ 
  connectionStatus, 
  notifications, 
  clearNotifications 
}: ServerNotificationsProps) {
  if (connectionStatus !== 'connected') {
    return null;
  }

  return (
    <Card className="mt-8">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-2xl font-bold">Server Notifications</CardTitle>
          <CardDescription>
            Real-time notifications from the MCP server connection
          </CardDescription>
        </div>
        {notifications.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearNotifications}>
            Clear All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-muted-foreground">No notifications received yet.</p>
        ) : (
          <div className="h-64 overflow-y-auto border rounded-md p-4">
            {notifications.slice().reverse().map((notification, index) => (
              <div key={index} className="mb-3 p-2 bg-secondary rounded-md">
                <div className="font-semibold">{notification.method}</div>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words mt-1">
                  {JSON.stringify(notification.params, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 