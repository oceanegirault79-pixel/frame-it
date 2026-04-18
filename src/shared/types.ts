// ─── Credentials & Auth ───────────────────────────────────────────────────────

export interface FrameCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenType: 'Bearer';
  expiresAt?: number; // unix ms; undefined = non-expiring personal token
}

// ─── Frame.io API shapes ──────────────────────────────────────────────────────

export interface FrameUser {
  id: string;
  name: string;
  email: string;
  account_id: string;
}

export interface FrameTeam {
  id: string;
  name: string;
}

export interface FrameProject {
  id: string;
  name: string;
  root_asset_id: string;
  team_id: string;
}

export interface FrameAsset {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'version_stack';
  parent_id?: string;
  upload?: {
    url: string;
    [key: string]: string;
  };
}

export interface FrameReviewLink {
  id: string;
  name: string;
  short_url: string;
  url: string;
}

/** Flat folder entry with its display path, used in the folder picker dropdown */
export interface FrameFolderFlat {
  id: string;
  name: string;
  path: string;   // e.g. "/Designs/Components"
  depth: number;  // for visual indentation
}

// ─── Export payloads ──────────────────────────────────────────────────────────

export type ExportFormat = 'PNG' | 'PDF';

export interface ExportedFrame {
  name: string;     // sanitised filename WITHOUT extension
  nodeId: string;
  bytes: number[];  // Uint8Array serialised for postMessage
  width: number;
  height: number;
}

export interface FigmaFrameInfo {
  id: string;
  name: string;
  width: number;
  height: number;
}

// ─── Batch upload results ─────────────────────────────────────────────────────

export interface BatchResult {
  nodeId: string;
  frameName: string;
  filename: string;
  status: 'done' | 'failed';
  /** Which version number was written (1 = new file, ≥2 = stacked) */
  versionNumber?: number;
  assetId?: string;
  error?: string;
}

/** Live status item shown in the uploading progress view */
export interface UploadItem {
  filename: string;
  frameName: string;
  status: 'pending' | 'exporting' | 'checking' | 'uploading' | 'done' | 'failed';
  versionNumber?: number;
  error?: string;
}

// ─── Persisted mappings ───────────────────────────────────────────────────────

export type ProjectMapping = Record<string, string>;  // figmaNodeId → frameProjectId

export interface DefaultFolder {
  folderId: string;
  folderPath: string;
}

// ─── Message bus: UI → Plugin (controller) ────────────────────────────────────

export type UIToPluginMessage =
  | { type: 'init' }
  /** Export specific nodes by ID (batch, continues on individual failure) */
  | { type: 'export-nodes'; nodeIds: string[]; format: ExportFormat; scale: number }
  | { type: 'get-credentials' }
  | { type: 'save-credentials'; credentials: FrameCredentials }
  | { type: 'clear-credentials' }
  | { type: 'get-project-mapping' }
  | { type: 'save-project-mapping'; nodeId: string; projectId: string }
  | { type: 'open-url'; url: string }
  | { type: 'get-default-folder' }
  | { type: 'save-default-folder'; folderId: string; folderPath: string }
  | { type: 'resize'; width: number; height: number }
  | { type: 'close' };

// ─── Message bus: Plugin (controller) → UI ────────────────────────────────────

export type PluginToUIMessage =
  | { type: 'selection-info'; frames: FigmaFrameInfo[] }
  | { type: 'export-progress'; current: number; total: number; frameName: string }
  | { type: 'export-complete'; exports: ExportedFrame[]; failedNames: string[] }
  | { type: 'credentials-loaded'; credentials: FrameCredentials | null }
  | { type: 'project-mapping'; mapping: ProjectMapping }
  | { type: 'default-folder'; folderId: string; folderPath: string }
  | { type: 'error'; message: string };
