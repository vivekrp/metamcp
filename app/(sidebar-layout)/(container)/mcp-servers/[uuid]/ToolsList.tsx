import { createColumnHelper } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import useSWR from "swr";

import { getToolsByMcpServerUuid, toggleToolStatus } from "@/app/actions/tools";
import { Switch } from "@/components/ui/switch";
import { ToggleStatus } from "@/db/schema";

interface ToolsListProps {
    mcpServerUuid: string;
}

export default function ToolsList({ mcpServerUuid }: ToolsListProps) {
    const { data: tools, error, mutate } = useSWR(
        mcpServerUuid ? ['getToolsByMcpServerUuid', mcpServerUuid] : null,
        () => getToolsByMcpServerUuid(mcpServerUuid)
    );

    // Calculate enabled vs total tools
    const totalTools = tools?.length || 0;
    const enabledTools = tools?.filter(tool => tool.status === ToggleStatus.ACTIVE).length || 0;

    const columnHelper = createColumnHelper<any>();

    const columns = [
        columnHelper.accessor('name', {
            cell: (info) => info.getValue(),
            header: 'Name',
        }),
        columnHelper.accessor('description', {
            cell: (info) => info.getValue() || '-',
            header: 'Description',
        }),
        columnHelper.accessor('status', {
            cell: (info) => (
                <Switch
                    checked={info.getValue() === ToggleStatus.ACTIVE}
                    onCheckedChange={async (checked) => {
                        await toggleToolStatus(
                            info.row.original.uuid,
                            checked ? ToggleStatus.ACTIVE : ToggleStatus.INACTIVE
                        );
                        mutate();
                    }}
                />
            ),
            header: 'Status',
        }),
        columnHelper.accessor('created_at', {
            cell: (info) => new Date(info.getValue()).toLocaleString(),
            header: 'Reported At',
        }),
    ];

    const table = useReactTable({
        data: tools || [],
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    if (error) return <div>Failed to load tools</div>;
    if (!tools) return <div>Loading tools...</div>;
    if (tools.length === 0) return <div>No tools found for this MCP server, you may need to refresh tools for this MCP server manually.</div>;

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-green-600">{enabledTools} enabled</span>
                    <span className="mx-2">•</span>
                    <span className="font-medium">{totalTools} total tools</span>
                </div>
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-300">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="py-2 px-4 border-b text-left font-semibold bg-gray-100"
                                >
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext()
                                    )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="py-2 px-4 border-b">
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