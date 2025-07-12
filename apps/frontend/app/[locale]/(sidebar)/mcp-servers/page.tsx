"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateMcpServerRequest,
  CreateServerFormData,
  createServerFormSchema,
  McpServerTypeEnum,
} from "@repo/zod-types";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/hooks/useTranslations";
import { trpc } from "@/lib/trpc";

import { ExportImportButtons } from "./export-import-buttons";
import { McpServersList } from "./mcp-servers-list";

export default function McpServersPage() {
  const { t } = useTranslations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<CreateServerFormData>({
    resolver: zodResolver(createServerFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: McpServerTypeEnum.Enum.STDIO,
      command: "",
      args: "",
      env: "",
      url: "",
      bearerToken: "",
      user_id: undefined,
    },
  });

  const createMutation = trpc.frontend.mcpServers.create.useMutation({
    onSuccess: () => {
      setIsDialogOpen(false);
      form.reset();
      toast.success(t("mcp-servers:serverCreated"));
    },
    onError: (error) => {
      toast.error(t("mcp-servers:createError") + ": " + error.message);
    },
  });

  const onSubmit = (data: CreateServerFormData) => {
    // Parse args string into array by splitting on spaces
    const argsArray = data.args
      ? data.args
          .trim()
          .split(/\s+/)
          .filter((arg) => arg.length > 0)
      : [];

    // Parse env string into object
    const envObject: Record<string, string> = {};
    if (data.env) {
      const envLines = data.env.trim().split("\n");
      for (const line of envLines) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes("=")) {
          const [key, ...valueParts] = trimmedLine.split("=");
          const value = valueParts.join("="); // Handle values that contain '='
          if (key?.trim()) {
            envObject[key.trim()] = value;
          }
        }
      }
    }

    const request: CreateMcpServerRequest = {
      name: data.name,
      description: data.description,
      type: data.type,
      command: data.command,
      args: argsArray,
      env: envObject,
      url: data.url,
      bearerToken: data.bearerToken,
      user_id: data.user_id,
    };

    createMutation.mutate(request);
  };

  const serverTypeOptions = [
    { value: McpServerTypeEnum.Enum.STDIO, label: t("mcp-servers:stdio") },
    { value: McpServerTypeEnum.Enum.SSE, label: t("mcp-servers:sse") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("mcp-servers:title")}
          </h1>
          <p className="text-muted-foreground">
            {t("mcp-servers:description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportImportButtons />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("mcp-servers:addServer")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t("mcp-servers:addServer")}</DialogTitle>
                <DialogDescription>
                  {t("mcp-servers:addServerDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    {t("mcp-servers:name")}
                  </label>
                  <Input
                    id="name"
                    placeholder={t("mcp-servers:namePlaceholder")}
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    {t("mcp-servers:description")}
                  </label>
                  <Textarea
                    id="description"
                    placeholder={t("mcp-servers:descriptionPlaceholder")}
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="type" className="text-sm font-medium">
                    {t("mcp-servers:type")}
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {serverTypeOptions.find(
                          (option) => option.value === form.watch("type"),
                        )?.label || t("mcp-servers:selectType")}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {serverTypeOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => form.setValue("type", option.value)}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {form.formState.errors.type && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.type.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="command" className="text-sm font-medium">
                    {t("mcp-servers:command")}
                  </label>
                  <Input
                    id="command"
                    placeholder={t("mcp-servers:commandPlaceholder")}
                    {...form.register("command")}
                  />
                  {form.formState.errors.command && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.command.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="args" className="text-sm font-medium">
                    {t("mcp-servers:args")}
                  </label>
                  <Input
                    id="args"
                    placeholder={t("mcp-servers:argsPlaceholder")}
                    {...form.register("args")}
                  />
                  {form.formState.errors.args && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.args.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="env" className="text-sm font-medium">
                    {t("mcp-servers:env")}
                  </label>
                  <Textarea
                    id="env"
                    placeholder={t("mcp-servers:envPlaceholder")}
                    {...form.register("env")}
                  />
                  {form.formState.errors.env && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.env.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="url" className="text-sm font-medium">
                    {t("mcp-servers:url")}
                  </label>
                  <Input
                    id="url"
                    placeholder={t("mcp-servers:urlPlaceholder")}
                    {...form.register("url")}
                  />
                  {form.formState.errors.url && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.url.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="bearerToken" className="text-sm font-medium">
                    {t("mcp-servers:bearerToken")}
                  </label>
                  <Input
                    id="bearerToken"
                    placeholder={t("mcp-servers:bearerTokenPlaceholder")}
                    {...form.register("bearerToken")}
                  />
                  {form.formState.errors.bearerToken && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.bearerToken.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="user_id" className="text-sm font-medium">
                    {t("mcp-servers:user_id")}
                  </label>
                  <Input
                    id="user_id"
                    placeholder={t("mcp-servers:user_idPlaceholder")}
                    {...form.register("user_id")}
                  />
                  {form.formState.errors.user_id && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.user_id.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    {t("common:cancel")}
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending
                      ? t("common:creating")
                      : t("common:create")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <McpServersList />
    </div>
  );
}
