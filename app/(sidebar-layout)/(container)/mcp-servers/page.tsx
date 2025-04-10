'use client';
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  SSEClientTransport,
  SseError,
} from "@modelcontextprotocol/sdk/client/sse.js";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Copy, Download, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { v4 as uuidv4 } from 'uuid';

import {
  bulkImportMcpServers,
  createMcpServer,
  deleteMcpServerByUuid,
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from "@/hooks/use-toast";
import { createAuthProvider } from "@/lib/auth";
import { SESSION_KEYS } from "@/lib/constants";
import packageJson from "@/package.json";
import { McpServer } from '@/types/mcp-server';


const columnHelper = createColumnHelper<McpServer>();

export default function MCPServersPage() {
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

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

  const { data: servers = [], mutate } = useSWR<McpServer[]>(
    currentProfile?.uuid ? `${currentProfile.uuid}/mcp-servers` : null,
    () => getMcpServers(currentProfile?.uuid || '')
  );

  // Check for any pending MCP server creation that might have been interrupted by OAuth flow
  useEffect(() => {
    // Clean up any leftover pending MCP server data
    // This is just a safety measure as the OAuth callback should have handled the creation
    sessionStorage.removeItem(SESSION_KEYS.PENDING_MCP_SERVER);
  }, []);

  const columns = [
    columnHelper.accessor('name', {
      cell: (info) => (
        <Link
          href={`/mcp-servers/${info.row.original.uuid}`}
          className='text-blue-600 hover:underline'>
          {info.getValue()}
        </Link>
      ),
      header: 'Name',
    }),
    columnHelper.accessor('description', {
      cell: (info) => info.getValue(),
      header: 'Description',
    }),
    columnHelper.accessor('command', {
      cell: (info) => info.getValue() || '-',
      header: 'Command',
    }),
    columnHelper.accessor('args', {
      cell: (info) => info.getValue().join(' ') || '-',
      header: 'Arguments',
    }),
    columnHelper.accessor('type', {
      cell: (info) => info.getValue(),
      header: 'Type',
    }),
    columnHelper.accessor('url', {
      cell: (info) => info.getValue() || '-',
      header: 'URL',
    }),
    columnHelper.accessor('status', {
      cell: (info) => (
        <Switch
          checked={info.getValue() === McpServerStatus.ACTIVE}
          onCheckedChange={async (checked) => {
            if (!currentProfile?.uuid || !info.row.original.uuid) return;
            await toggleMcpServerStatus(
              currentProfile.uuid,
              info.row.original.uuid,
              checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
            );
            mutate();
          }}
        />
      ),
      header: 'Status',
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => new Date(info.getValue()).toLocaleString(),
      header: 'Created At',
    }),
    columnHelper.display({
      id: 'actions',
      cell: (info) => (
        <Button
          variant='destructive'
          size='sm'
          onClick={async () => {
            if (!currentProfile?.uuid || !info.row.original.uuid) return;
            if (confirm('Are you sure you want to delete this MCP server?')) {
              await deleteMcpServerByUuid(
                currentProfile.uuid,
                info.row.original.uuid
              );
              mutate();
            }
          }}>
          <Trash2 size={16} />
        </Button>
      ),
      header: 'Actions',
    }),
  ];

  const table = useReactTable({
    data: servers,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportServerConfig = () => {
    if (!servers.length) {
      toast({
        title: 'Export Failed',
        description: 'No MCP servers to export.',
        variant: 'destructive',
      });
      return;
    }

    // Transform servers array to the required JSON format
    const mcpServers = servers.reduce((acc, server) => {
      const serverConfig: any = {
        description: server.description || '',
        type: server.type.toLowerCase(),
      };

      if (server.type === McpServerType.STDIO) {
        serverConfig.command = server.command;
        serverConfig.args = server.args || [];
        serverConfig.env = server.env || {};
      } else if (server.type === McpServerType.SSE) {
        serverConfig.url = server.url;
      }

      acc[server.name] = serverConfig;
      return acc;
    }, {} as Record<string, any>);

    // Create the final JSON structure
    const exportData = {
      mcpServers,
    };

    // Convert to JSON string with formatting
    const jsonString = JSON.stringify(exportData, null, 2);
    setExportJson(jsonString);
    setExportOpen(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportJson).then(
      () => {
        setCopiedToClipboard(true);
        toast({
          title: 'Copied to Clipboard',
          description: 'MCP server configuration copied to clipboard.',
          variant: 'default',
        });
        setTimeout(() => setCopiedToClipboard(false), 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
        toast({
          title: 'Copy Failed',
          description: 'Failed to copy to clipboard.',
          variant: 'destructive',
        });
      }
    );
  };

  const downloadJson = () => {
    // Create and trigger download
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mcp-servers-config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Download Successful',
      description: `Downloaded ${servers.length} MCP server${servers.length !== 1 ? 's' : ''} configuration.`,
      variant: 'default',
    });
  };

  const handleAuthError = async (sseUrl: string, error: unknown) => {
    // Handle OAuth authentication if needed
    if (error instanceof SseError && error.code === 401) {
      // Store server URL for OAuth callback
      sessionStorage.setItem(SESSION_KEYS.SERVER_URL, sseUrl);
      
      // Store pending server creation data for after auth
      const serverUuid = uuidv4();
      const pendingServer = {
        uuid: serverUuid,
        name: form.getValues().name,
        description: form.getValues().description || '',
        url: form.getValues().url || sseUrl,
        type: McpServerType.SSE,
        status: McpServerStatus.ACTIVE,
        profileUuid: currentProfile?.uuid,
      };
      sessionStorage.setItem(SESSION_KEYS.PENDING_MCP_SERVER, JSON.stringify(pendingServer));

      // Start the OAuth flow - server will be created after successful authentication in the callback
      const authProvider = createAuthProvider(serverUuid, currentProfile?.uuid);
      const result = await auth(authProvider, { serverUrl: sseUrl });
      return result === "AUTHORIZED";
    }

    return false;
  };

  const connectToMcpServer = async (_e?: unknown, retryCount: number = 0) => {
    const client = new Client(
      {
        name: "metamcp-app",
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {}
        },
      },
    );

    const headers: HeadersInit = {};

    // Use manually provided bearer token if available, otherwise use OAuth tokens
    const serverUuid = uuidv4();
    const authProvider = createAuthProvider(serverUuid, currentProfile?.uuid);
    const token = (await authProvider.tokens())?.access_token || '';
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const clientTransport = new SSEClientTransport(new URL(form.getValues('url') || 'http://localhost:8787/sse'), {
      eventSourceInit: {
        fetch: (url, init) => fetch(url, { ...init, headers }),
      },
      requestInit: {
        headers,
      },
    });

    try {
      await client.connect(clientTransport);
    } catch (error) {
      console.error(
        `Failed to connect to MCP Server`,
        error,
      );
      const shouldRetry = await handleAuthError(form.getValues('url') || 'http://localhost:8787/sse', error);
      if (shouldRetry) {
        return connectToMcpServer(undefined, retryCount + 1);
      }

      if (error instanceof SseError && error.code === 401) {
        // Don't set error state if we're about to redirect for auth
        return;
      }
      throw error;
    }
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl font-bold'>MCP Servers</h1>
        <div className='flex space-x-2'>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant='outline'>
                <Upload className='mr-2 h-4 w-4' />
                Import JSON
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[500px]'>
              <DialogHeader>
                <DialogTitle>Import MCP Servers</DialogTitle>
                <DialogDescription>
                  Import multiple MCP server configurations from JSON. This will incrementally add MCP servers without overwriting what you have here. The JSON
                  should follow the format:
                </DialogDescription>
                <pre className='mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all'>
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
    }
  }
}`}
                </pre>
              </DialogHeader>
              <div className='space-y-4'>
                <div>
                  <Textarea
                    value={importJson}
                    onChange={(e) => {
                      setImportJson(e.target.value);
                      setImportError('');
                    }}
                    placeholder='Paste your JSON here'
                    className='font-mono text-sm h-48'
                  />
                  {importError && (
                    <p className='text-sm text-red-500 mt-1'>{importError}</p>
                  )}
                </div>
                <div className='flex justify-end space-x-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      setImportOpen(false);
                      setImportJson('');
                      setImportError('');
                    }}
                    disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type='button'
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        // Parse the JSON
                        let parsedJson;
                        try {
                          parsedJson = JSON.parse(importJson);
                        } catch (_e) {
                          setImportError('Invalid JSON format');
                          setIsSubmitting(false);
                          return;
                        }

                        // Validate the JSON structure
                        if (
                          !parsedJson.mcpServers ||
                          typeof parsedJson.mcpServers !== 'object'
                        ) {
                          setImportError(
                            'JSON must contain a "mcpServers" object'
                          );
                          setIsSubmitting(false);
                          return;
                        }

                        // Process each server based on its type
                        const processedJson = {
                          mcpServers: Object.entries(parsedJson.mcpServers).reduce((acc, [name, serverConfig]) => {
                            const config = serverConfig as any;
                            const serverType = config.type?.toLowerCase() === 'sse'
                              ? McpServerType.SSE
                              : McpServerType.STDIO;

                            // Create server config based on type
                            if (serverType === McpServerType.SSE) {
                              acc[name] = {
                                name,
                                description: config.description || '',
                                url: config.url,
                                type: serverType,
                                status: McpServerStatus.ACTIVE,
                              };
                            } else {
                              // STDIO type
                              acc[name] = {
                                name,
                                description: config.description || '',
                                command: config.command,
                                args: config.args || [],
                                env: config.env || {},
                                type: serverType,
                                status: McpServerStatus.ACTIVE,
                              };
                            }
                            return acc;
                          }, {} as Record<string, any>)
                        };

                        // Import the servers
                        const result = await bulkImportMcpServers(
                          processedJson,
                          currentProfile?.uuid
                        );

                        // Refresh the server list
                        await mutate();

                        // Close the dialog and reset
                        setImportOpen(false);
                        setImportJson('');
                        setImportError('');

                        // Show success toast
                        toast({
                          title: 'Import Successful',
                          description: `Successfully imported ${result.count} MCP server${result.count !== 1 ? 's' : ''}.`,
                          variant: 'default',
                        });
                      } catch (error) {
                        console.error('Error importing MCP servers:', error);
                        setImportError(
                          'Failed to import servers. Check the console for details.'
                        );

                        // Show error toast
                        toast({
                          title: 'Import Failed',
                          description:
                            'Failed to import MCP servers. Please check the console for details.',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}>
                    {isSubmitting ? 'Importing...' : 'Import'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant='outline' onClick={exportServerConfig}>
            <Download className='mr-2 h-4 w-4' />
            Export JSON
          </Button>
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent className='sm:max-w-[500px]'>
              <DialogHeader>
                <DialogTitle>Export MCP Servers JSON</DialogTitle>
                <DialogDescription>
                  MCP server configurations in JSON format.
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-4'>
                <div className='relative'>
                  <pre className='mt-2 p-4 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all h-80 overflow-y-auto'>
                    {exportJson}
                  </pre>
                  <Button
                    variant='outline'
                    size='sm'
                    className='absolute top-2 right-6'
                    onClick={copyToClipboard}>
                    <Copy className='h-4 w-4 mr-1' />
                    {copiedToClipboard ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div className='flex justify-end space-x-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      setExportOpen(false);
                    }}>
                    Close
                  </Button>
                  <Button
                    type='button'
                    onClick={downloadJson}>
                    <Download className='mr-2 h-4 w-4' />
                    Download
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add MCP Server</Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                <DialogTitle>Add MCP Server</DialogTitle>
                <DialogDescription>
                  Create a new MCP server configuration. Choose between STDIO
                  (command-based) or SSE (URL-based) server type.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue={McpServerType.STDIO} className='w-full'>
                <TabsList className='grid w-full grid-cols-2'>
                  <TabsTrigger value={McpServerType.STDIO}>
                    Command-based (STDIO)
                  </TabsTrigger>
                  <TabsTrigger value={McpServerType.SSE}>
                    URL-based (SSE)
                  </TabsTrigger>
                </TabsList>
                <TabsContent value={McpServerType.STDIO}>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(async (data) => {
                        if (!currentProfile?.uuid) return;
                        setIsSubmitting(true);
                        try {
                          const processedData = {
                            ...data,
                            type: McpServerType.STDIO,
                            args: data.args
                              .split(',')
                              .map((arg) => arg.trim())
                              .filter(Boolean),
                            env: Object.fromEntries(
                              data.env
                                .split('\n')
                                .filter((line) => line.includes('='))
                                .map((line) => {
                                  const [key, ...values] = line.split('=');
                                  return [key.trim(), values.join('=').trim()];
                                })
                            ),
                            status: McpServerStatus.ACTIVE,
                            url: undefined,
                          };

                          await createMcpServer(
                            currentProfile.uuid,
                            processedData
                          );
                          await mutate();
                          setOpen(false);
                          form.reset();
                        } catch (error) {
                          console.error('Error creating MCP server:', error);
                        } finally {
                          setIsSubmitting(false);
                        }
                      })}
                      className='space-y-4'>
                      <FormField
                        control={form.control}
                        name='name'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='e.g., mcp-server-time'
                                required
                              />
                            </FormControl>
                            <FormMessage />
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
                              <Textarea
                                {...field}
                                placeholder="(Optional) Brief description of the server's purpose"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='command'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Command</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='e.g., npx or uvx'
                                required
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='args'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Arguments</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='e.g., mcp-server-time, --local-timezone=America/Los_Angeles'
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='env'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environment Variables</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder='KEY=value                                                                                ANOTHER_KEY=another_value'
                                className='font-mono text-sm'
                              />
                            </FormControl>
                            <p className='text-sm text-muted-foreground'>
                              Enter environment variables in KEY=value format,
                              one per line
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className='flex justify-end space-x-2'>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => {
                            setOpen(false);
                            form.reset();
                          }}
                          disabled={isSubmitting}>
                          Cancel
                        </Button>
                        <Button type='submit' disabled={isSubmitting}>
                          {isSubmitting ? 'Creating...' : 'Create'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>
                <TabsContent value={McpServerType.SSE}>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(async (data) => {
                        if (!currentProfile?.uuid) return;
                        setIsSubmitting(true);
                        try {
                          const processedData = {
                            ...data,
                            type: McpServerType.SSE,
                            args: [],
                            env: {},
                            status: McpServerStatus.ACTIVE,
                            command: undefined,
                          };

                          await createMcpServer(
                            currentProfile.uuid,
                            processedData
                          );
                          await mutate();
                          setOpen(false);
                          form.reset();
                        } catch (error) {
                          console.error('Error creating MCP server:', error);
                        } finally {
                          setIsSubmitting(false);
                        }
                      })}
                      className='space-y-4'>
                      <FormField
                        control={form.control}
                        name='name'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='e.g., figma-mcp-server'
                                required
                              />
                            </FormControl>
                            <FormMessage />
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
                              <Textarea
                                {...field}
                                placeholder="(Optional) Brief description of the server's purpose"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                pattern='^(http|https)://[^\s/$.?#].[^\s]*$'
                              />
                            </FormControl>
                            <p className='text-sm text-muted-foreground'>
                              Must be a valid HTTP/HTTPS URL
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className='flex justify-end space-x-2'>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => {
                            setOpen(false);
                            form.reset();
                          }}
                          disabled={isSubmitting}>
                          Cancel
                        </Button>
                        <Button
                          type='submit'
                          disabled={isSubmitting}
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              setIsSubmitting(true);
                              
                              // For SSE servers, try to connect first before creating
                              await connectToMcpServer();
                              
                              // If it's an SSE server and requires OAuth, the connectToMcpServer function 
                              // will store the pending server data and redirect to the OAuth flow.
                              // The server will be created after successful OAuth in the callback.
                              
                              // If no OAuth was needed, create the server now
                              if (!sessionStorage.getItem(SESSION_KEYS.PENDING_MCP_SERVER)) {
                                form.handleSubmit(async (data) => {
                                  if (!currentProfile?.uuid) return;
                                  try {
                                    const processedData = {
                                      ...data,
                                      type: McpServerType.SSE,
                                      args: [],
                                      env: {},
                                      status: McpServerStatus.ACTIVE,
                                      command: undefined,
                                    };

                                    const createdServer = await createMcpServer(
                                      currentProfile.uuid,
                                      processedData
                                    );
                                    
                                    await mutate();
                                    setOpen(false);
                                    form.reset();
                                    
                                    // Redirect to the specific server page
                                    if (createdServer && createdServer.uuid) {
                                      window.location.href = `/mcp-servers/${createdServer.uuid}`;
                                    }
                                  } catch (error) {
                                    console.error('Error creating MCP server:', error);
                                    toast({
                                      title: 'Creation Failed',
                                      description: 'Failed to create the MCP server.',
                                      variant: 'destructive',
                                    });
                                  } finally {
                                    setIsSubmitting(false);
                                  }
                                })();
                              }
                            } catch (error) {
                              console.error('Error connecting to MCP server:', error);
                              toast({
                                title: 'Connection Failed',
                                description: 'Failed to connect to the MCP server. Please check the URL and try again.',
                                variant: 'destructive',
                              });
                              setIsSubmitting(false);
                            }
                          }}>
                          {isSubmitting ? 'Connecting...' : 'Connect and Create'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className='mb-4'>
        <Input
          placeholder='Search all columns...'
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(String(e.target.value))}
          className='max-w-sm'
        />
      </div>
      <div className='overflow-x-auto'>
        <table className='min-w-full bg-white border border-gray-300'>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className='py-2 px-4 border-b text-left font-semibold bg-gray-100'
                    onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {{
                      asc: ' 🔼',
                      desc: ' 🔽',
                    }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className='hover:bg-gray-50'>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className='py-2 px-4 border-b'>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
