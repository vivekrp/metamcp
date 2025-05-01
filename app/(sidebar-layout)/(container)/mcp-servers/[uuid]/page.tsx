'use client';

import { ArrowLeft, Pencil, PlayCircle, StopCircle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import {
  deleteMcpServerByUuid,
  getMcpServerByUuid,
  toggleMcpServerStatus,
  updateMcpServer,
} from '@/app/actions/mcp-servers';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { McpServerStatus, McpServerType, ProfileCapability } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { useConnection } from '@/hooks/useConnection';
import { ConnectionStatus } from '@/lib/constants';
import { McpServer } from '@/types/mcp-server';

import ServerNotifications from "./ServerNotifications";
import ToolManagement from "./ToolManagement";


export default function McpServerDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { currentProfile } = useProfiles();
  const { currentProject } = useProjects();
  const { uuid } = use(params);
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectionAttemptedRef = useRef(false);

  const hasToolsManagement = currentProfile?.enabled_capabilities?.includes(ProfileCapability.TOOLS_MANAGEMENT);

  const {
    data: mcpServer,
    error,
    mutate: mutateMcpServer,
  } = useSWR<McpServer | undefined>(
    uuid && currentProfile?.uuid
      ? ['getMcpServerByUuid', uuid, currentProfile?.uuid]
      : null,
    () => getMcpServerByUuid(currentProfile?.uuid || '', uuid!)
  );

  const { data: apiKey } = useSWR(
    currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );

  const handleNotification = (notification: any) => {
    setNotifications((prev) => [...prev, notification]);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const {
    connectionStatus,
    connect,
    disconnect,
    makeRequest
  } = useConnection({
    mcpServerUuid: uuid,
    currentProfileUuid: currentProfile?.uuid,
    onNotification: handleNotification,
    onStdErrNotification: handleNotification,
  });

  const handleConnect = useCallback(async () => {
    setConnectionError(null);
    try {
      await connect();
    } catch (error) {
      console.error("Connection error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to the MCP server";
      setConnectionError(errorMessage);
      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [connect, toast]);

  const handleDisconnect = async () => {
    try {
      await disconnect();
      clearNotifications();
      setConnectionError(null);
    } catch (error) {
      console.error("Disconnection error:", error);
      toast({
        title: "Disconnection Error",
        description: error instanceof Error ? error.message : "Failed to disconnect from the MCP server",
        variant: "destructive",
      });
    }
  };

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      args: '',
      env: '',
      url: '',
      type: McpServerType.STDIO,
    },
  });

  useEffect(() => {
    if (mcpServer) {
      form.reset({
        name: mcpServer.name,
        description: mcpServer.description || '',
        command: mcpServer.command || '',
        args: mcpServer.args.join(' '),
        env: Object.entries(mcpServer.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
        url: mcpServer.url || '',
        type: mcpServer.type,
      });
    }
  }, [mcpServer, form]);

  useEffect(() => {
    if (mcpServer &&
      !connectionAttemptedRef.current &&
      connectionStatus === 'disconnected' &&
      mcpServer.status === McpServerStatus.ACTIVE) {
      connectionAttemptedRef.current = true;
      handleConnect();
    }
  }, [mcpServer, connectionStatus, handleConnect]);

  const onSubmit = async (data: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string;
    type: McpServerType;
  }) => {
    if (!mcpServer || !currentProfile?.uuid) return;

    // Process args and env before submission
    const processedData = {
      ...data,
      args: data.type === McpServerType.STDIO
        ? data.args
          .trim()
          .split(/\s+/)
          .map((arg) => arg.trim())
        : [],
      env: data.type === McpServerType.STDIO
        ? Object.fromEntries(
          data.env
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => {
              const [key, ...values] = line.split('=');
              return [key.trim(), values.join('=').trim()];
            })
        ) || {}
        : {},
      command: data.type === McpServerType.STDIO ? data.command : undefined,
      url: data.type === McpServerType.SSE ? data.url : undefined,
    };

    await updateMcpServer(currentProfile.uuid, mcpServer.uuid, processedData);
    await mutateMcpServer();
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!mcpServer || !currentProfile?.uuid) return;
    if (confirm('Are you sure you want to delete this MCP server?')) {
      await deleteMcpServerByUuid(currentProfile.uuid, mcpServer.uuid);
      router.push('/mcp-servers');
    }
  };

  if (error) return <div>Failed to load MCP server</div>;
  if (!mcpServer) return <div>Loading...</div>;

  const getConnectionStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      case 'error-connecting-to-proxy':
        return 'Proxy Connection Error';
      default:
        return 'Unknown Status';
    }
  };

  const getConnectionStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'disconnected':
        return 'text-gray-500';
      case 'error':
      case 'error-connecting-to-proxy':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="container mx-auto px-4 max-w-4xl">
      <div className='flex justify-between items-center mb-8 pt-6'>
        <Button
          variant='outline'
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/mcp-servers');
            }
          }}
          className='flex items-center p-4'>
          <ArrowLeft className='mr-2' size={16} />
          Back
        </Button>

        <div className='flex gap-2'>
          {connectionStatus === 'connected' ? (
            <Button
              variant='outline'
              onClick={handleDisconnect}
              className='flex items-center'
            >
              <StopCircle className='mr-2' size={16} />
              Disconnect
              {notifications.length > 0 && (
                <span className="ml-2 bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                  {notifications.length}
                </span>
              )}
            </Button>
          ) : (
            <Button
              variant='outline'
              onClick={handleConnect}
              className='flex items-center'
              disabled={connectionStatus === 'connecting'}
            >
              {connectionStatus === 'connecting' ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <PlayCircle className='mr-2' size={16} />
                  Connect
                </>
              )}
            </Button>
          )}
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button variant='outline'>
                <Pencil className='h-4 w-4 mr-2' />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit MCP Server</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-4'>
                  <FormField
                    control={form.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder='Name' required />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='description'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="(Optional) Brief description of the server's purpose"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='type'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server Type</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className='w-full p-2 border rounded-md'
                            onChange={(e) => {
                              field.onChange(e);
                              form.setValue('command', '');
                              form.setValue('url', '');
                            }}>
                            <option value={McpServerType.STDIO}>STDIO Server</option>
                            <option value={McpServerType.SSE}>SSE Server</option>
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch('type') === McpServerType.STDIO ? (
                    <>
                      <FormField
                        control={form.control}
                        name='command'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Command</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder='e.g., npx or uvx' required />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='args'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Arguments (space-separated)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='e.g., mcp-server-time'
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='env'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Environment Variables (key=value, one per line)
                            </FormLabel>
                            <FormControl>
                              <textarea
                                className='w-full min-h-[100px] px-3 py-2 rounded-md border'
                                {...field}
                                placeholder='KEY=value                                                                                ANOTHER_KEY=another_value'
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  ) : (
                    <FormField
                      control={form.control}
                      name='url'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Server URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder='http://localhost:3000/sse'
                              required
                              pattern="^(http|https)://[^\s/$.?#].[^\s]*$"
                            />
                          </FormControl>
                          <p className='text-sm text-muted-foreground'>
                            Must be a valid HTTP/HTTPS URL
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        form.reset({
                          name: mcpServer.name,
                          description: mcpServer.description || '',
                          command: mcpServer.command || '',
                          args: mcpServer.args.join(' '),
                          env: Object.entries(mcpServer.env)
                            .map(([key, value]) => `${key}=${value}`)
                            .join('\n'),
                          url: mcpServer.url || '',
                          type: mcpServer.type,
                        });
                        setIsEditing(false);
                      }}>
                      Cancel
                    </Button>
                    <Button type='submit'>Save Changes</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Button variant='destructive' onClick={handleDelete}>
            <Trash2 className='mr-2' size={16} />
            Delete Server
          </Button>
        </div>
      </div>

      {/* Connection Error Alert */}
      {connectionError && connectionStatus !== 'connected' && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium">Connection Error</h3>
              <div className="mt-2 text-sm">{connectionError}</div>
            </div>
          </div>
        </div>
      )}

      <Card className="mb-12 border-none shadow-none">
        <CardHeader className="text-center pb-0">
          <CardTitle className="text-4xl font-bold">{mcpServer.name}</CardTitle>
          {mcpServer.description && (
            <CardDescription className="max-w-2xl mx-auto text-lg">{mcpServer.description}</CardDescription>
          )}
        </CardHeader>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-8 mb-12'>
        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-bold">Server Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className='mb-3'>
              <strong>UUID:</strong> {mcpServer.uuid}
            </p>

            <p className='mb-3 flex items-center gap-2'>
              <strong>Status:</strong>{' '}
              <Switch
                checked={mcpServer.status === McpServerStatus.ACTIVE}
                onCheckedChange={async (checked) => {
                  if (!currentProfile?.uuid || !mcpServer.uuid) return;
                  await toggleMcpServerStatus(
                    currentProfile.uuid,
                    mcpServer.uuid,
                    checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                  );
                  mutateMcpServer();
                }}
              />
            </p>

            <p className='mb-3'>
              <strong>Connection Status:</strong>{' '}
              <span className={getConnectionStatusColor(connectionStatus)}>
                {getConnectionStatusText(connectionStatus)}
              </span>
            </p>

            <p className='mb-3'>
              <strong>Created At:</strong>{' '}
              {new Date(mcpServer.created_at).toLocaleString()}
            </p>

            <p className='mb-3'>
              <strong>Type:</strong> {mcpServer.type}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-bold">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mcpServer.type === McpServerType.STDIO ? (
              <>
                <div className='mb-3'>
                  <strong>Command:</strong>
                  <pre className='mt-2 p-2 bg-secondary rounded-md whitespace-pre-wrap break-words'>
                    {mcpServer.command}
                  </pre>
                </div>

                <div className='mb-3'>
                  <strong>Arguments:</strong>
                  <pre className='mt-2 p-2 bg-secondary rounded-md whitespace-pre-wrap break-words'>
                    {mcpServer.args.join(' ')}
                  </pre>
                </div>

                <div className='mb-3'>
                  <strong>Environment Variables:</strong>
                  <pre className='mt-2 p-2 bg-secondary rounded-md whitespace-pre-wrap break-words'>
                    {Object.entries(mcpServer.env).length > 0
                      ? Object.entries(mcpServer.env).map(
                        ([key, value]) => `${key}=${value}\n`
                      )
                      : 'No environment variables set'}
                  </pre>
                </div>
              </>
            ) : (
              <div className='mb-3'>
                <strong>Server URL:</strong>
                <pre className='mt-2 p-2 bg-secondary rounded-md whitespace-pre-wrap break-words'>
                  {mcpServer.url}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tool Management Section */}
      <ToolManagement
        mcpServer={mcpServer}
        hasToolsManagement={hasToolsManagement || false}
        apiKey={apiKey}
        makeRequest={makeRequest}
      />

      {/* Server Notifications Section */}
      <ServerNotifications
        connectionStatus={connectionStatus}
        notifications={notifications}
        clearNotifications={clearNotifications}
      />
    </div>
  );
}
