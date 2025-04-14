import { Copy, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { refreshSseTools } from "@/app/actions/refresh-sse-tools";
import { getToolsByMcpServerUuid } from "@/app/actions/tools";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { McpServerType } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";

import ToolsList from "./ToolsList";


interface ToolManagementProps {
    mcpServer: {
        uuid: string;
        type: McpServerType;
    };
    hasToolsManagement: boolean;
    apiKey?: {
        api_key: string;
    } | null;
}

export default function ToolManagement({ mcpServer, hasToolsManagement, apiKey }: ToolManagementProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { mutate: mutateTools } = useSWR(
        mcpServer.uuid ? ['getToolsByMcpServerUuid', mcpServer.uuid] : null,
        () => getToolsByMcpServerUuid(mcpServer.uuid)
    );

    if (!hasToolsManagement) {
        return (
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Tool Management</CardTitle>
                    <CardDescription>
                        Tool management is currently disabled. To enable this feature and manage tools for your MCP servers, please visit the Tool Management tab in your profile settings.
                    </CardDescription>
                    <Button
                        variant="outline"
                        className="mt-4 w-fit"
                        onClick={() => router.push('/tool-management')}
                    >
                        Go to Tool Management
                    </Button>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Tools</h2>
                {mcpServer.type === McpServerType.STDIO ? (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="w-full max-w-4xl">
                            <DialogHeader>
                                <DialogTitle>Refresh Tools</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <p className="mb-4">
                                    Command-based MCP servers need to run locally. On next time you run MetaMCP MCP server, it will automatically refresh tools. To refresh tools manually for all installed MCP servers, run the following command:
                                </p>
                                <div className="relative">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="absolute top-2 right-2 z-10"
                                        onClick={() => {
                                            const command = `npx -y @metamcp/mcp-server-metamcp@latest --metamcp-api-key=${apiKey?.api_key ?? '<create an api key first>'} --metamcp-api-base-url http://localhost:12005 --report`;
                                            navigator.clipboard.writeText(command);
                                            toast({
                                                description: "Command copied to clipboard"
                                            });
                                        }}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <div className="overflow-x-auto max-w-full">
                                        <pre className="bg-[#f6f8fa] text-[#24292f] p-4 rounded-md whitespace-pre-wrap break-words">
                                            {`npx -y @metamcp/mcp-server-metamcp@latest --metamcp-api-key=${apiKey?.api_key ?? '<create an api key first>'} --metamcp-api-base-url http://localhost:12005 --report`}
                                        </pre>
                                    </div>
                                </div>
                                <p className="mt-4 text-sm text-muted-foreground">
                                    After running the command, your tools will be refreshed.
                                </p>
                            </div>
                        </DialogContent>
                    </Dialog>
                ) : (
                    <Button size="sm" onClick={async () => {
                        try {
                            await refreshSseTools(mcpServer.uuid);
                            await mutateTools();
                            toast({
                                description: "SSE tools refreshed successfully"
                            });
                        } catch (error) {
                            console.error("Error refreshing SSE tools:", error);
                            toast({
                                variant: "destructive",
                                title: "Error refreshing tools",
                                description: error instanceof Error ? error.message : "An unknown error occurred"
                            });
                        }
                    }}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                )}
            </div>
            <ToolsList mcpServerUuid={mcpServer.uuid} />
        </div>
    );
} 