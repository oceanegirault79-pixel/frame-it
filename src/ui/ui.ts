import './styles.css';

import type {
  UIToPluginMessage,
  PluginToUIMessage,
  FrameCredentials,
  FrameUser,
  FrameTeam,
  FrameProject,
  FrameAsset,
  FrameReviewLink,
  FrameFolderFlat,
  ExportedFrame,
  FigmaFrameInfo,
  BatchResult,
  UploadItem,
  ProjectMapping,
  ExportFormat,
} from '../shared/types';

// ─── OAuth configuration ──────────────────────────────────────────────────────
// Register your app at https://developer.frame.io/app/oauth-applications
// Set redirect_uri to wherever you host callback.html (e.g. GitHub Pages).

const FRAME_CLIENT_ID  = '4b51e2a0-73c0-47b5-bfb0-f8796cf52d2f';
const FRAME_CALLBACK_URL = 'https://oceanegirault79-pixel.github.io/frame-it/callback.html';
const FRAME_OAUTH_URL  = 'https://applications.frame.io/oauth2/auth';
// Token exchange goes through our Vercel proxy (Frame.io blocks direct browser requests with CORS).
// Update this after deploying to Vercel: https://vercel.com/import
const FRAME_TOKEN_URL  = 'https://YOUR_PROJECT.vercel.app/api/frame-token';
const FRAME_SCOPES     = [
  'account.read',
  'asset.create',
  'asset.read',
  'project.create',
  'project.read',
  'team.read',
].join(' ');

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
// crypto.subtle is unavailable in Figma's plugin iframe (non-secure origin),
// so SHA-256 is implemented in pure JS below.

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes).map((b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Pure-JS SHA-256. Returns a 32-byte Uint8Array. */
function sha256(data: Uint8Array): Uint8Array {
  // Round constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const bitLen = data.length * 8;
  const padLen = data.length % 64 < 56 ? 56 - data.length % 64 : 120 - data.length % 64;
  const padded = new Uint8Array(data.length + padLen + 8);
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1   = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch   = (e & f) ^ (~e & g);
      const t1   = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0   = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj  = (a & b) ^ (a & c) ^ (b & c);
      const t2   = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov  = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v, false));
  return out;
}

/** Encode a string as UTF-8 bytes without TextEncoder (also unavailable in the sandbox). */
function toUtf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function generatePKCE(): { verifier: string; challenge: string } {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const verifier  = base64urlEncode(raw);
  const challenge = base64urlEncode(sha256(toUtf8Bytes(verifier)));
  return { verifier, challenge };
}

function randomState(): string {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  return base64urlEncode(raw);
}

// ─── Frame.io API client ──────────────────────────────────────────────────────

const FRAME_API = 'https://api.frame.io/v2';

class FrameClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${FRAME_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json() as Record<string, string>;
        detail = err['message'] ?? err['error'] ?? JSON.stringify(err);
      } catch {
        detail = res.statusText;
      }
      throw new Error(`Frame API ${res.status}: ${detail}`);
    }

    return res.json() as Promise<T>;
  }

  getMe()                    { return this.request<FrameUser>   ('GET',  '/me'); }
  getTeams()                 { return this.request<FrameTeam[]> ('GET',  '/teams'); }
  getProjects(teamId: string){ return this.request<FrameProject[]>('GET', `/teams/${teamId}/projects`); }
  getProject(id: string)     { return this.request<FrameProject>('GET',  `/projects/${id}`); }
  getChildren(assetId: string){ return this.request<FrameAsset[]>('GET', `/assets/${assetId}/children`); }

  createProject(teamId: string, name: string) {
    return this.request<FrameProject>('POST', `/teams/${teamId}/projects`, { name });
  }

  createAsset(parentId: string, name: string, filesize: number, filetype: string) {
    return this.request<FrameAsset>('POST', '/assets', {
      name,
      type: 'file',
      filetype,
      filesize,
      parent_id: parentId,
    });
  }

  async uploadFile(asset: FrameAsset, data: ArrayBuffer, mimeType: string): Promise<void> {
    if (!asset.upload?.url) throw new Error('No upload URL returned by Frame.io');
    const res = await fetch(asset.upload.url, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType, 'x-amz-acl': 'private' },
      body: data,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  createReviewLink(teamId: string, name: string, assetIds: string[]) {
    return this.request<FrameReviewLink>('POST', '/review_links', {
      name,
      asset_ids: assetIds,
      team_id: teamId,
    });
  }

  /** Exchange a refresh token for a fresh access token */
  static async refreshAccessToken(refreshToken: string): Promise<FrameCredentials> {
    const res = await fetch(FRAME_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: FRAME_CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json() as Record<string, string | number>;
    return {
      accessToken:  String(data['access_token']),
      refreshToken: data['refresh_token'] ? String(data['refresh_token']) : refreshToken,
      tokenType:    'Bearer',
      expiresAt:    data['expires_in'] ? Date.now() + Number(data['expires_in']) * 1000 : undefined,
    };
  }

  /**
   * Build a flat folder list by BFS-traversing the project root.
   * Stops at maxDepth to avoid hammering the API on deep hierarchies.
   */
  async getFolderTree(rootId: string, rootLabel: string, maxDepth = 3): Promise<FrameFolderFlat[]> {
    const result: FrameFolderFlat[] = [
      { id: rootId, name: rootLabel, path: '/', depth: 0 },
    ];

    const queue: Array<{ id: string; path: string; depth: number }> = [
      { id: rootId, path: '', depth: 0 },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      let children: FrameAsset[];
      try {
        children = await this.getChildren(item.id);
      } catch {
        continue;
      }

      for (const child of children) {
        if (child.type !== 'folder') continue;
        const childPath = `${item.path}/${child.name}`;
        result.push({ id: child.id, name: child.name, path: childPath, depth: item.depth + 1 });
        queue.push({ id: child.id, path: childPath, depth: item.depth + 1 });
      }
    }

    return result;
  }

  /**
   * Check if a file with `filename` already exists in `folderId`.
   * Returns { assetId, currentVersionCount } or null if it's a new file.
   */
  async getVersionInfo(
    folderId: string,
    filename: string,
  ): Promise<{ assetId: string; currentVersionCount: number } | null> {
    let children: FrameAsset[];
    try {
      children = await this.getChildren(folderId);
    } catch {
      return null;
    }

    const existing = children.find(
      (c) => c.name === filename && (c.type === 'file' || c.type === 'version_stack'),
    );
    if (!existing) return null;

    if (existing.type === 'version_stack') {
      try {
        const versions = await this.getChildren(existing.id);
        return { assetId: existing.id, currentVersionCount: versions.length };
      } catch {
        return { assetId: existing.id, currentVersionCount: 1 };
      }
    }

    // Single file — uploading same name will auto-stack to v2
    return { assetId: existing.id, currentVersionCount: 1 };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  // Auth
  credentials: FrameCredentials | null;
  me: FrameUser | null;

  // Frame.io workspace
  teams: FrameTeam[];
  selectedTeamId: string;
  projects: FrameProject[];
  selectedProjectId: string;
  folders: FrameFolderFlat[];
  selectedFolderId: string;
  selectedFolderPath: string;

  // Figma selection
  selectedFrames: FigmaFrameInfo[];
  checkedNodeIds: Set<string>;

  // Version info (populated after folder is selected)
  // key = sanitised filename WITH extension
  existingFilesMap: Map<string, { currentVersionCount: number; assetId: string }>;
  existingFilesLoading: boolean;

  // Upload settings
  exportFormat: ExportFormat;
  exportScale: number;

  // Persisted
  projectMapping: ProjectMapping;

  // Live upload items (for the uploading view)
  uploadItems: UploadItem[];

  // Final results
  batchResults: BatchResult[];
  reviewLink: string;

  view: 'auth' | 'main' | 'uploading' | 'success';
}

const state: AppState = {
  credentials: null,
  me: null,
  teams: [],
  selectedTeamId: '',
  projects: [],
  selectedProjectId: '',
  folders: [],
  selectedFolderId: '',
  selectedFolderPath: '/',
  selectedFrames: [],
  checkedNodeIds: new Set(),
  existingFilesMap: new Map(),
  existingFilesLoading: false,
  exportFormat: 'PNG',
  exportScale: 2,
  projectMapping: {},
  uploadItems: [],
  batchResults: [],
  reviewLink: '',
  view: 'auth',
};

// ─── Plugin bridge ────────────────────────────────────────────────────────────

function postToPlugin(msg: UIToPluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

/** Live OAuth session — cleared once a token is obtained or the user cancels */
const oauthSession = {
  verifier:   '',
  stateParam: '',
};

/**
 * Single message listener for BOTH Figma plugin messages (from parent frame)
 * and OAuth callback messages (from the popup via window.opener.postMessage).
 */
window.addEventListener('message', (event: MessageEvent) => {
  // ── OAuth callback from popup ─────────────────────────────────────────────
  if (event.data && event.data.type === 'frame-it-oauth') {
    handleOAuthCallback(event.data as OAuthCallbackPayload);
    return;
  }

  // ── Figma plugin messages from parent ─────────────────────────────────────
  const msg = event.data && event.data.pluginMessage as PluginToUIMessage | undefined;
  if (!msg) return;

  switch (msg.type) {
    case 'selection-info':
      handleSelectionInfo(msg.frames);
      break;

    case 'credentials-loaded':
      state.credentials = msg.credentials;
      if (msg.credentials) {
        void enterMain();
      } else {
        setView('auth');
      }
      break;

    case 'project-mapping':
      state.projectMapping = msg.mapping;
      break;

    case 'default-folder':
      if (msg.folderId) {
        state.selectedFolderId = msg.folderId;
        state.selectedFolderPath = msg.folderPath;
      }
      break;

    case 'export-progress':
      updateUploadItemStatus(msg.frameName, 'exporting');
      updateProgressHeader(msg.current, msg.total, `Exporting ${msg.current} of ${msg.total}…`);
      break;

    case 'export-complete':
      for (const name of msg.failedNames) {
        updateUploadItemStatus(name, 'failed', undefined, 'Export failed');
      }
      void handleExportComplete(msg.exports);
      break;

    case 'error':
      showError(msg.message);
      if (state.view === 'uploading') setView('main');
      break;
  }
});

// ─── View routing ─────────────────────────────────────────────────────────────

function setView(v: AppState['view']) {
  state.view = v;
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((el) => {
    el.style.display = el.dataset['view'] === v ? 'flex' : 'none';
  });
}

// ─── Selection ────────────────────────────────────────────────────────────────

function handleSelectionInfo(frames: FigmaFrameInfo[]) {
  // Preserve existing checked state — only add newly arrived nodes
  const prevIds = new Set(state.selectedFrames.map((f) => f.id));
  state.selectedFrames = frames;

  // Check any new frames by default
  for (const f of frames) {
    if (!prevIds.has(f.id)) state.checkedNodeIds.add(f.id);
  }
  // Remove IDs that are no longer in the selection
  for (const id of state.checkedNodeIds) {
    if (!frames.find((f) => f.id === id)) state.checkedNodeIds.delete(id);
  }

  if (state.view === 'main') renderFrameList();
  renderSendButton();
}

function toFilename(frameName: string, format: ExportFormat): string {
  const base = frameName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled';
  return base + (format === 'PDF' ? '.pdf' : '.png');
}

// ─── Auth view ────────────────────────────────────────────────────────────────

interface OAuthCallbackPayload {
  type: 'frame-it-oauth';
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

function setupAuthView() {
  document.getElementById('connect-btn')?.addEventListener('click', () => void startOAuth());
  document.getElementById('cancel-auth-btn')?.addEventListener('click', cancelOAuth);

  const codeInput  = document.getElementById('auth-code-input') as HTMLInputElement;
  const submitBtn  = document.getElementById('submit-code-btn') as HTMLButtonElement;

  // Enable submit button only when something is pasted
  codeInput.addEventListener('input', () => {
    submitBtn.disabled = codeInput.value.trim().length === 0;
  });

  submitBtn.addEventListener('click', () => void submitManualCode());
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) void submitManualCode();
  });
}

async function submitManualCode() {
  const codeInput = document.getElementById('auth-code-input') as HTMLInputElement;
  const code = codeInput.value.trim();
  if (!code) return;

  setAuthState('exchanging');

  try {
    const creds = await exchangeCodeForToken(code, oauthSession.verifier);
    oauthSession.verifier   = '';
    oauthSession.stateParam = '';
    state.credentials = creds;
    postToPlugin({ type: 'save-credentials', credentials: creds });
    await enterMain();
  } catch (err) {
    setAuthState('waiting');
    showAuthError(`Sign-in failed: ${String(err)}`);
  }
}

/** Begin the PKCE OAuth flow: generate verifier, open popup, start poll. */
async function startOAuth() {
  setAuthState('waiting');

  try {
    const { verifier, challenge } = generatePKCE();
    const stateParam = randomState();
    oauthSession.verifier   = verifier;
    oauthSession.stateParam = stateParam;

    const params = new URLSearchParams({
      client_id:             FRAME_CLIENT_ID,
      redirect_uri:          FRAME_CALLBACK_URL,
      response_type:         'code',
      scope:                 FRAME_SCOPES,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
      state:                 stateParam,
    });

    postToPlugin({ type: 'open-url', url: `${FRAME_OAUTH_URL}?${params.toString()}` });
  } catch (err) {
    setAuthState('idle');
    showAuthError(`Could not start authorization: ${String(err)}`);
  }
}

function cancelOAuth() {
  oauthSession.verifier   = '';
  oauthSession.stateParam = '';
  setAuthState('idle');
}

/** Received from the callback page via window.opener.postMessage */
async function handleOAuthCallback(payload: OAuthCallbackPayload) {
  if (payload.error) {
    setAuthState('idle');
    showAuthError(`Authorization denied: ${payload.errorDescription ?? payload.error}`);
    return;
  }

  if (!payload.code || payload.state !== oauthSession.stateParam) {
    setAuthState('idle');
    showAuthError('Invalid authorization response. Please try again.');
    return;
  }

  setAuthState('exchanging');

  try {
    const creds = await exchangeCodeForToken(payload.code, oauthSession.verifier);
    oauthSession.verifier   = '';
    oauthSession.stateParam = '';

    state.credentials = creds;
    postToPlugin({ type: 'save-credentials', credentials: creds });
    await enterMain();
  } catch (err) {
    setAuthState('idle');
    showAuthError(`Token exchange failed: ${String(err)}`);
  }
}

async function exchangeCodeForToken(code: string, verifier: string): Promise<FrameCredentials> {
  const res = await fetch(FRAME_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     FRAME_CLIENT_ID,
      redirect_uri:  FRAME_CALLBACK_URL,
      code,
      code_verifier: verifier,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }

  const data = await res.json() as Record<string, string | number>;
  return {
    accessToken:  String(data['access_token']),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : undefined,
    tokenType:    'Bearer',
    expiresAt:    data['expires_in']
      ? Date.now() + Number(data['expires_in']) * 1000
      : undefined,
  };
}

/** Toggle between 'idle', 'waiting' (popup open / paste code), and 'exchanging' (token call). */
function setAuthState(s: 'idle' | 'waiting' | 'exchanging') {
  const idle        = document.getElementById('auth-idle');
  const waiting     = document.getElementById('auth-waiting');
  const pasteSection = document.getElementById('auth-paste-section');
  const submitBtn   = document.getElementById('submit-code-btn') as HTMLButtonElement | null;
  const codeInput   = document.getElementById('auth-code-input') as HTMLInputElement | null;
  const errorEl     = document.getElementById('auth-error') as HTMLElement;

  if (idle)    idle.style.display    = s === 'idle' ? 'flex' : 'none';
  if (waiting) waiting.style.display = s !== 'idle' ? 'flex' : 'none';
  if (errorEl) errorEl.textContent   = '';

  // While exchanging: hide the paste area, show spinner label only
  if (pasteSection) pasteSection.style.display = s === 'exchanging' ? 'none' : 'block';
  if (submitBtn)    submitBtn.disabled = s === 'exchanging';
  if (codeInput)    codeInput.disabled = s === 'exchanging';

  const waitingLabel = document.getElementById('auth-waiting-label');
  if (waitingLabel) {
    waitingLabel.textContent = s === 'exchanging' ? 'Signing you in…' : 'Browser window opened';
  }

  // Clear the code input when returning to idle
  if (s === 'idle' && codeInput) codeInput.value = '';
}

function showAuthError(msg: string) {
  const el = document.getElementById('auth-error') as HTMLElement;
  if (el) el.textContent = msg;
}

// ─── Main view — data loading ─────────────────────────────────────────────────

async function enterMain() {
  if (!state.credentials) return;

  // Silent token refresh: if within 2 minutes of expiry (or already expired)
  const { expiresAt, refreshToken } = state.credentials;
  if (expiresAt && Date.now() > expiresAt - 2 * 60 * 1000) {
    if (refreshToken) {
      try {
        const fresh = await FrameClient.refreshAccessToken(refreshToken);
        state.credentials = fresh;
        postToPlugin({ type: 'save-credentials', credentials: fresh });
      } catch {
        // Refresh failed — send user back to auth
        state.credentials = null;
        postToPlugin({ type: 'clear-credentials' });
        setView('auth');
        showAuthError('Your session expired. Please sign in again.');
        return;
      }
    } else {
      state.credentials = null;
      postToPlugin({ type: 'clear-credentials' });
      setView('auth');
      showAuthError('Your session expired. Please sign in again.');
      return;
    }
  }

  const client = new FrameClient(state.credentials.accessToken);

  try {
    if (!state.me) state.me = await client.getMe();
    state.teams = await client.getTeams();
    if (state.teams.length > 0) {
      state.selectedTeamId = state.teams[0].id;
      state.projects = await client.getProjects(state.selectedTeamId);
      if (state.projects.length > 0) {
        state.selectedProjectId = state.projects[0].id;
        await loadFolderTree(client, state.projects[0]);
      }
    }
  } catch (err) {
    showError(`Failed to load Frame.io workspace: ${String(err)}`);
    return;
  }

  postToPlugin({ type: 'get-project-mapping' });
  postToPlugin({ type: 'get-default-folder' });
  setView('main');
  renderMain();
}

async function loadFolderTree(client: FrameClient, project: FrameProject) {
  state.folders = [];
  try {
    state.folders = await client.getFolderTree(project.root_asset_id, project.name);
  } catch {
    state.folders = [{ id: project.root_asset_id, name: project.name, path: '/', depth: 0 }];
  }

  // If no saved folder, default to root
  if (!state.selectedFolderId && state.folders.length > 0) {
    state.selectedFolderId = state.folders[0].id;
    state.selectedFolderPath = state.folders[0].path;
  }
}

async function refreshVersionInfo() {
  if (!state.credentials || !state.selectedFolderId || state.selectedFrames.length === 0) return;

  state.existingFilesLoading = true;
  renderFrameList(); // show loading badge

  const client = new FrameClient(state.credentials.accessToken);
  state.existingFilesMap = new Map();

  const uniqueFilenames = [...new Set(
    state.selectedFrames.map((f) => toFilename(f.name, state.exportFormat)),
  )];

  await Promise.all(
    uniqueFilenames.map(async (filename) => {
      const info = await client.getVersionInfo(state.selectedFolderId, filename).catch(() => null);
      if (info) state.existingFilesMap.set(filename, info);
    }),
  );

  state.existingFilesLoading = false;
  renderFrameList();
}

// ─── Main view — rendering ────────────────────────────────────────────────────

function renderMain() {
  if (state.view !== 'main') return;

  // User badge
  const userEl = document.getElementById('user-name');
  if (userEl && state.me) userEl.textContent = state.me.name;

  renderTeamSelect();
  renderProjectSelect();
  renderFolderSelect();
  renderFrameList();
  renderSendButton();
}

function renderTeamSelect() {
  const sel = document.getElementById('team-select') as HTMLSelectElement;
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = state.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  if (prev && state.teams.find((t) => t.id === prev)) sel.value = prev;
}

function renderProjectSelect() {
  const sel = document.getElementById('project-select') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML =
    `<option value="">+ Create new project</option>` +
    state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (state.selectedProjectId) sel.value = state.selectedProjectId;
}

function renderFolderSelect() {
  const sel = document.getElementById('folder-select') as HTMLSelectElement;
  if (!sel) return;

  if (state.folders.length === 0) {
    sel.innerHTML = '<option value="">Loading folders…</option>';
    return;
  }

  sel.innerHTML = state.folders
    .map((f) => {
      const indent = '\u00a0\u00a0\u00a0'.repeat(f.depth); // non-breaking spaces for indent
      const label = f.depth === 0 ? `📁 ${esc(f.path)} (root)` : `${indent}📁 ${esc(f.name)}`;
      return `<option value="${f.id}" data-path="${esc(f.path)}">${label}</option>`;
    })
    .join('');

  // Restore saved selection
  if (state.selectedFolderId) {
    sel.value = state.selectedFolderId;
    if (!sel.value && state.folders.length > 0) {
      sel.value = state.folders[0].id;
      state.selectedFolderId = state.folders[0].id;
    }
  }

  renderFolderPath();
}

function renderFolderPath() {
  const display = document.getElementById('folder-path-display');
  if (display) display.textContent = state.selectedFolderPath || '/';
}

function renderFrameList() {
  const container = document.getElementById('frame-list') as HTMLUListElement;
  const summary   = document.getElementById('selection-summary');
  const selectAll = document.getElementById('select-all-btn') as HTMLButtonElement | null;

  const checkedCount = [...state.checkedNodeIds].filter((id) =>
    state.selectedFrames.find((f) => f.id === id),
  ).length;

  if (summary) {
    summary.textContent = state.selectedFrames.length === 0
      ? 'No frames selected in Figma'
      : `${state.selectedFrames.length} frame${state.selectedFrames.length > 1 ? 's' : ''} in selection — ${checkedCount} checked`;
  }

  if (selectAll) {
    selectAll.textContent = checkedCount === state.selectedFrames.length ? 'Deselect all' : 'Select all';
  }

  if (!container) return;
  container.innerHTML = state.selectedFrames.length === 0
    ? `<li class="frame-empty">Select frames in Figma to see them here.</li>`
    : state.selectedFrames.map((f) => renderFrameItem(f)).join('');

  // Wire checkbox events
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.checkedNodeIds.add(cb.dataset['nodeId']!);
      else state.checkedNodeIds.delete(cb.dataset['nodeId']!);
      renderSendButton();
      renderFrameList();
    });
  });
}

function renderFrameItem(f: FigmaFrameInfo): string {
  const checked  = state.checkedNodeIds.has(f.id);
  const filename = toFilename(f.name, state.exportFormat);
  const existing = state.existingFilesMap.get(filename);

  let versionBadge = '';
  if (state.existingFilesLoading) {
    versionBadge = `<span class="version-badge version-badge--loading">…</span>`;
  } else if (existing) {
    const nextVer = existing.currentVersionCount + 1;
    versionBadge = `<span class="version-badge" title="Will upload as version ${nextVer}">v${nextVer}</span>`;
  } else {
    versionBadge = `<span class="version-badge version-badge--new">new</span>`;
  }

  return `
    <li class="frame-item${checked ? '' : ' frame-item--unchecked'}">
      <label class="frame-checkbox">
        <input type="checkbox" data-node-id="${f.id}" ${checked ? 'checked' : ''} />
        <span class="checkmark"></span>
      </label>
      <span class="frame-icon">▤</span>
      <div class="frame-info">
        <span class="frame-name">${esc(f.name)}</span>
        <span class="frame-filename">${esc(filename)}</span>
      </div>
      <span class="frame-dims">${f.width}×${f.height}</span>
      ${versionBadge}
    </li>`;
}

function renderSendButton() {
  const btn = document.getElementById('send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  const checked = [...state.checkedNodeIds].filter((id) => state.selectedFrames.find((f) => f.id === id));
  const disabled = checked.length === 0 || !state.selectedTeamId || !state.credentials || !state.selectedFolderId;
  btn.disabled = disabled;
  btn.textContent = checked.length === 0 ? 'Upload Batch' : `🚀 Upload ${checked.length} frame${checked.length > 1 ? 's' : ''}`;
}

// ─── Main view — event setup ──────────────────────────────────────────────────

function setupMainView() {
  document.getElementById('disconnect-btn')?.addEventListener('click', () => {
    state.credentials = null;
    state.me = null;
    state.teams = [];
    state.projects = [];
    state.folders = [];
    postToPlugin({ type: 'clear-credentials' });
    setAuthState('idle');
    setView('auth');
  });

  // Team change → reload projects + folder tree
  document.getElementById('team-select')?.addEventListener('change', async (e) => {
    if (!state.credentials) return;
    state.selectedTeamId = (e.target as HTMLSelectElement).value;
    const client = new FrameClient(state.credentials.accessToken);
    try {
      state.projects = await client.getProjects(state.selectedTeamId);
      state.selectedProjectId = state.projects[0]?.id ?? '';
      if (state.selectedProjectId) await loadFolderTree(client, state.projects[0]);
    } catch { state.projects = []; }
    renderProjectSelect();
    renderFolderSelect();
  });

  // Project change → reload folder tree
  document.getElementById('project-select')?.addEventListener('change', async (e) => {
    if (!state.credentials) return;
    state.selectedProjectId = (e.target as HTMLSelectElement).value;
    if (!state.selectedProjectId) { state.folders = []; renderFolderSelect(); return; }
    const client = new FrameClient(state.credentials.accessToken);
    const project = state.projects.find((p) => p.id === state.selectedProjectId);
    if (project) await loadFolderTree(client, project);
    renderFolderSelect();
    void refreshVersionInfo();
  });

  // Folder change
  document.getElementById('folder-select')?.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    state.selectedFolderId = sel.value;
    const opt = sel.options[sel.selectedIndex];
    state.selectedFolderPath = opt?.dataset['path'] ?? '/';
    postToPlugin({ type: 'save-default-folder', folderId: state.selectedFolderId, folderPath: state.selectedFolderPath });
    renderFolderPath();
    renderSendButton();
    void refreshVersionInfo();
  });

  // Refresh folder tree
  document.getElementById('refresh-folders-btn')?.addEventListener('click', async () => {
    if (!state.credentials || !state.selectedProjectId) return;
    const client = new FrameClient(state.credentials.accessToken);
    const project = state.projects.find((p) => p.id === state.selectedProjectId);
    if (project) { await loadFolderTree(client, project); renderFolderSelect(); }
  });

  // Select all / Deselect all
  document.getElementById('select-all-btn')?.addEventListener('click', () => {
    const allChecked = state.selectedFrames.every((f) => state.checkedNodeIds.has(f.id));
    if (allChecked) {
      state.checkedNodeIds.clear();
    } else {
      state.selectedFrames.forEach((f) => state.checkedNodeIds.add(f.id));
    }
    renderFrameList();
    renderSendButton();
  });

  // Format toggle
  document.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.exportFormat = radio.value as ExportFormat;
      const scaleRow = document.getElementById('scale-row');
      if (scaleRow) scaleRow.style.display = state.exportFormat === 'PNG' ? 'flex' : 'none';
      renderFrameList(); // update filenames shown
      void refreshVersionInfo();
    });
  });

  // Scale selector
  document.getElementById('scale-select')?.addEventListener('change', (e) => {
    state.exportScale = Number((e.target as HTMLSelectElement).value);
  });

  // Upload batch button
  document.getElementById('send-btn')?.addEventListener('click', startBatchExport);
}

// ─── Batch export + upload flow ───────────────────────────────────────────────

function startBatchExport() {
  const nodeIds = [...state.checkedNodeIds].filter((id) =>
    state.selectedFrames.find((f) => f.id === id),
  );
  if (nodeIds.length === 0) return;

  // Build upload items for live progress display
  state.uploadItems = state.selectedFrames
    .filter((f) => nodeIds.includes(f.id))
    .map((f) => ({
      filename: toFilename(f.name, state.exportFormat),
      frameName: f.name,
      status: 'pending' as const,
    }));

  setView('uploading');
  renderUploadItems();
  updateProgressHeader(0, nodeIds.length, 'Preparing export…');

  postToPlugin({ type: 'export-nodes', nodeIds, format: state.exportFormat, scale: state.exportScale });
}

function renderUploadItems() {
  const list = document.getElementById('upload-items-list');
  if (!list) return;
  list.innerHTML = state.uploadItems.map((item) => {
    const statusIcon =
      item.status === 'done'      ? '<span class="ui-status ui-status--done">✓</span>'
      : item.status === 'failed'  ? '<span class="ui-status ui-status--fail">✕</span>'
      : item.status === 'pending' ? '<span class="ui-status ui-status--pending">○</span>'
      :                             '<span class="ui-spinner"></span>';

    const versionTag = item.versionNumber
      ? `<span class="ui-version">v${item.versionNumber}</span>`
      : '';
    const errorTag = item.error
      ? `<span class="ui-error-tag">${esc(item.error)}</span>`
      : '';

    return `
      <div class="upload-item upload-item--${item.status}" data-filename="${esc(item.filename)}">
        ${statusIcon}
        <div class="ui-info">
          <span class="ui-filename">${esc(item.filename)}</span>
          ${errorTag}
        </div>
        ${versionTag}
      </div>`;
  }).join('');
}

function updateProgressHeader(current: number, total: number, label: string) {
  const bar   = document.getElementById('progress-bar');
  const pct   = document.getElementById('progress-pct');
  const lbl   = document.getElementById('progress-label');
  const pctVal = total > 0 ? Math.round((current / total) * 100) : 0;
  if (bar) bar.style.width = `${pctVal}%`;
  if (pct) pct.textContent = `${pctVal}%`;
  if (lbl) lbl.textContent = label;
}

function updateUploadItemStatus(
  frameName: string,
  status: UploadItem['status'],
  versionNumber?: number,
  error?: string,
) {
  const item = state.uploadItems.find((i) => i.frameName === frameName);
  if (!item) return;
  item.status = status;
  if (versionNumber !== undefined) item.versionNumber = versionNumber;
  if (error !== undefined) item.error = error;
  renderUploadItems();
}

async function handleExportComplete(exports: ExportedFrame[]) {
  if (!state.credentials) return;
  const client = new FrameClient(state.credentials.accessToken);
  const batchResults: BatchResult[] = [];
  const uploadedAssetIds: string[] = [];

  // Mark exported frames as 'checking' (version lookup)
  for (const ex of exports) updateUploadItemStatus(ex.name, 'checking');

  const totalSteps = exports.length + 1; // +1 for review link
  let step = 0;

  // Resolve target folder: use selectedFolderId, fall back to project root
  let targetFolderId = state.selectedFolderId;
  if (!targetFolderId && state.selectedProjectId) {
    try {
      const project = await client.getProject(state.selectedProjectId);
      targetFolderId = project.root_asset_id;
    } catch (err) {
      showError(`Cannot resolve upload folder: ${String(err)}`);
      setView('main');
      return;
    }
  }

  // Pre-check version info for all files in one pass
  const preCheckMap = new Map<string, { currentVersionCount: number; assetId: string }>();
  try {
    const children = await client.getChildren(targetFolderId);
    const mimeExt = state.exportFormat === 'PDF' ? '.pdf' : '.png';

    await Promise.all(
      exports.map(async (ex) => {
        const filename = `${ex.name}${mimeExt}`;
        const existing = children.find(
          (c) => c.name === filename && (c.type === 'file' || c.type === 'version_stack'),
        );
        if (!existing) return;

        let count = 1;
        if (existing.type === 'version_stack') {
          const versions = await client.getChildren(existing.id).catch(() => [] as FrameAsset[]);
          count = versions.length;
        }
        preCheckMap.set(filename, { currentVersionCount: count, assetId: existing.id });
      }),
    );
  } catch {
    // Continue without version info — uploads will still work
  }

  // Upload each export
  for (const ex of exports) {
    step++;
    const mimeType = state.exportFormat === 'PDF' ? 'application/pdf' : 'image/png';
    const mimeExt  = state.exportFormat === 'PDF' ? '.pdf' : '.png';
    const filename  = `${ex.name}${mimeExt}`;
    const existingInfo = preCheckMap.get(filename);
    const nextVersion  = existingInfo ? existingInfo.currentVersionCount + 1 : 1;

    updateUploadItemStatus(ex.name, 'uploading', nextVersion);
    updateProgressHeader(step, totalSteps, `Uploading ${step} of ${exports.length}: ${filename}`);

    try {
      const buffer = new Uint8Array(ex.bytes).buffer;
      // Frame.io auto-stacks when uploading same filename to same folder
      const asset = await client.createAsset(targetFolderId, filename, buffer.byteLength, mimeType);
      await client.uploadFile(asset, buffer, mimeType);

      uploadedAssetIds.push(asset.id);
      updateUploadItemStatus(ex.name, 'done', nextVersion);

      batchResults.push({
        nodeId: ex.nodeId,
        frameName: ex.name,
        filename,
        status: 'done',
        versionNumber: nextVersion,
        assetId: asset.id,
      });

      postToPlugin({ type: 'save-project-mapping', nodeId: ex.nodeId, projectId: state.selectedProjectId });
    } catch (err) {
      updateUploadItemStatus(ex.name, 'failed', undefined, String(err));
      batchResults.push({
        nodeId: ex.nodeId,
        frameName: ex.name,
        filename,
        status: 'failed',
        error: String(err),
      });
      // Continue uploading the remaining files
    }
  }

  // Create one review link for all successful uploads
  if (uploadedAssetIds.length > 0) {
    updateProgressHeader(totalSteps, totalSteps, 'Creating review link…');
    try {
      const reviewName = exports.length === 1
        ? exports[0].name
        : `Design Review — ${new Date().toLocaleDateString()}`;
      const review = await client.createReviewLink(state.selectedTeamId, reviewName, uploadedAssetIds);
      state.reviewLink = review.short_url || review.url;
    } catch {
      state.reviewLink = '';
    }
  }

  state.batchResults = batchResults;
  setView('success');
  renderSuccessView();
}

// ─── Success view ─────────────────────────────────────────────────────────────

function renderSuccessView() {
  const done   = state.batchResults.filter((r) => r.status === 'done').length;
  const failed = state.batchResults.filter((r) => r.status === 'failed').length;

  const titleEl = document.getElementById('success-title');
  const subEl   = document.getElementById('success-sub');
  if (titleEl) titleEl.textContent = failed === 0 ? 'All uploaded!' : `${done} uploaded, ${failed} failed`;
  if (subEl) subEl.textContent = failed === 0
    ? 'Your designs are live in Frame.io. Share the review link below.'
    : 'Some files could not be uploaded. See details below.';

  // Review link
  const linkBox     = document.getElementById('review-link-box');
  const linkEl      = document.getElementById('review-link') as HTMLAnchorElement;
  if (linkBox) linkBox.style.display = state.reviewLink ? 'block' : 'none';
  if (linkEl && state.reviewLink) {
    linkEl.href = state.reviewLink;
    linkEl.textContent = state.reviewLink;
  }

  // Batch result rows
  const resultsEl = document.getElementById('batch-results');
  if (resultsEl) {
    resultsEl.innerHTML = state.batchResults.map((r) => {
      const icon = r.status === 'done' ? '✓' : '✕';
      const meta = r.status === 'done'
        ? `Uploaded as v${r.versionNumber}`
        : `Failed: ${r.error ?? 'Unknown error'}`;
      return `
        <div class="result-row result-row--${r.status}">
          <span class="result-icon">${icon}</span>
          <div class="result-info">
            <span class="result-filename">${esc(r.filename)}</span>
            <span class="result-meta">${esc(meta)}</span>
          </div>
        </div>`;
    }).join('');
  }
}

function setupSuccessView() {
  document.getElementById('copy-link-btn')?.addEventListener('click', () => {
    if (!state.reviewLink) return;
    navigator.clipboard.writeText(state.reviewLink).then(() => {
      const btn = document.getElementById('copy-link-btn') as HTMLButtonElement;
      const orig = btn.textContent!;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  });

  document.getElementById('open-frame-btn')?.addEventListener('click', () => {
    if (state.reviewLink) window.open(state.reviewLink, '_blank');
  });

  document.getElementById('export-again-btn')?.addEventListener('click', () => {
    setView('main');
    renderMain();
    void refreshVersionInfo();
  });

  document.getElementById('close-btn')?.addEventListener('click', () => {
    postToPlugin({ type: 'close' });
  });
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message: string) {
  const bar = document.getElementById('error-bar');
  const msg = document.getElementById('error-msg');
  if (bar && msg) {
    msg.textContent = message;
    bar.style.display = 'flex';
    setTimeout(() => { bar.style.display = 'none'; }, 8000);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  setupAuthView();
  setupMainView();
  setupSuccessView();

  document.getElementById('error-dismiss')?.addEventListener('click', () => {
    const bar = document.getElementById('error-bar');
    if (bar) bar.style.display = 'none';
  });

  postToPlugin({ type: 'get-credentials' });
}

document.addEventListener('DOMContentLoaded', init);
