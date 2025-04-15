import { ProfileCapability, WorkspaceMode } from '@/db/schema';

export interface Profile {
  uuid: string;
  name: string;
  created_at: Date;
  project_uuid: string;
  enabled_capabilities: ProfileCapability[];
  workspace_mode: WorkspaceMode;
}
