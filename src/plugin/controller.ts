/// <reference types="@figma/plugin-typings" />

import type {
  UIToPluginMessage,
  PluginToUIMessage,
  ExportFormat,
} from '../shared/types';

// ─── Boot ─────────────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 440, height: 640, title: 'Frame It' });

sendSelectionInfo();
figma.on('selectionchange', sendSelectionInfo);

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async (raw: UIToPluginMessage) => {
  switch (raw.type) {
    case 'init': {
      sendSelectionInfo();
      break;
    }

    case 'export-nodes': {
      await handleExportNodes(raw.nodeIds, raw.format, raw.scale);
      break;
    }

    case 'get-credentials': {
      const stored = await figma.clientStorage.getAsync('frame-credentials');
      post({ type: 'credentials-loaded', credentials: stored ?? null });
      break;
    }

    case 'save-credentials': {
      await figma.clientStorage.setAsync('frame-credentials', raw.credentials);
      break;
    }

    case 'clear-credentials': {
      await figma.clientStorage.deleteAsync('frame-credentials');
      break;
    }

    case 'get-project-mapping': {
      const mapping = (await figma.clientStorage.getAsync('project-mapping')) ?? {};
      post({ type: 'project-mapping', mapping });
      break;
    }

    case 'save-project-mapping': {
      const existing = (await figma.clientStorage.getAsync('project-mapping')) ?? {};
      existing[raw.nodeId] = raw.projectId;
      await figma.clientStorage.setAsync('project-mapping', existing);
      break;
    }

    case 'open-url': {
      figma.openExternal(raw.url);
      break;
    }

    case 'get-default-folder': {
      const saved = await figma.clientStorage.getAsync('default-folder');
      post({
        type: 'default-folder',
        folderId: saved?.folderId ?? '',
        folderPath: saved?.folderPath ?? '',
      });
      break;
    }

    case 'save-default-folder': {
      await figma.clientStorage.setAsync('default-folder', {
        folderId: raw.folderId,
        folderPath: raw.folderPath,
      });
      break;
    }

    case 'resize': {
      figma.ui.resize(raw.width, raw.height);
      break;
    }

    case 'close': {
      figma.closePlugin();
      break;
    }
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg);
}

function sendSelectionInfo() {
  const exportable = figma.currentPage.selection.filter(
    (n): n is FrameNode | ComponentNode | GroupNode =>
      n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'GROUP' || n.type === 'SECTION',
  );

  post({
    type: 'selection-info',
    frames: exportable.map((n) => ({
      id: n.id,
      name: n.name,
      width: 'width' in n ? Math.round(n.width) : 0,
      height: 'height' in n ? Math.round(n.height) : 0,
    })),
  });
}

/**
 * Export specific nodes by ID.
 * Continues on per-node failure so a single bad node doesn't abort the batch.
 */
async function handleExportNodes(nodeIds: string[], format: ExportFormat, scale: number) {
  if (nodeIds.length === 0) {
    post({ type: 'error', message: 'No frames selected for export.' });
    return;
  }

  const nodes = nodeIds
    .map((id) => figma.getNodeById(id))
    .filter((n): n is SceneNode => n !== null && 'exportAsync' in n);

  if (nodes.length === 0) {
    post({ type: 'error', message: 'Could not find the selected frames. Try re-selecting them in Figma.' });
    return;
  }

  const results: Array<{
    name: string;
    bytes: number[];
    nodeId: string;
    width: number;
    height: number;
  }> = [];
  const failedNames: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    post({ type: 'export-progress', current: i + 1, total: nodes.length, frameName: node.name });

    try {
      const settings: ExportSettings =
        format === 'PDF'
          ? { format: 'PDF' }
          : { format: 'PNG', constraint: { type: 'SCALE', value: scale } };

      const bytes = await node.exportAsync(settings);
      results.push({
        name: sanitiseName(node.name),
        bytes: Array.from(bytes),
        nodeId: node.id,
        width: 'width' in node ? Math.round((node as FrameNode).width * scale) : 0,
        height: 'height' in node ? Math.round((node as FrameNode).height * scale) : 0,
      });
    } catch (err) {
      failedNames.push(node.name);
      // Intentionally continue — do not abort the whole batch
    }
  }

  post({ type: 'export-complete', exports: results, failedNames });
}

/** Strip characters Frame.io rejects in filenames */
function sanitiseName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled';
}
