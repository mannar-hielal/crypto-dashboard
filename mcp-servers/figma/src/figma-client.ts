const FIGMA_BASE = 'https://api.figma.com/v1';

function getToken(): string {
  const token = process.env.FIGMA_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'FIGMA_ACCESS_TOKEN is not set. Add it to your .env file.\n' +
      'Generate one at: Figma → Settings → Security → Personal Access Tokens'
    );
  }
  return token;
}

async function figmaFetch<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const token = getToken();
  const url = new URL(`${FIGMA_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma API ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  schemaVersion: number;
  styles: Record<string, unknown>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  [key: string]: unknown;
}

export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  nodes: Record<string, { document: FigmaNode } | null>;
}

export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaMetaResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  editorType: string;
  version: string;
  linkAccess: string;
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  componentSetId: string | null;
}

export function getFile(fileKey: string, depth?: number): Promise<FigmaFile> {
  return figmaFetch<FigmaFile>(`/files/${fileKey}`, { depth });
}

export function getFileNodes(fileKey: string, nodeIds: string, depth?: number): Promise<FigmaNodesResponse> {
  return figmaFetch<FigmaNodesResponse>(`/files/${fileKey}/nodes`, { ids: nodeIds, depth });
}

export function getNodeImages(fileKey: string, nodeIds: string, format?: string, scale?: number): Promise<FigmaImagesResponse> {
  return figmaFetch<FigmaImagesResponse>(`/images/${fileKey}`, { ids: nodeIds, format, scale });
}

export function getFileMeta(fileKey: string): Promise<FigmaMetaResponse> {
  return figmaFetch<FigmaMetaResponse>(`/files/${fileKey}/meta`);
}

export function getFileStyles(fileKey: string): Promise<FigmaStyle[]> {
  return figmaFetch<FigmaStyle[]>(`/files/${fileKey}/styles`);
}

export function getFileComponents(fileKey: string): Promise<FigmaComponent[]> {
  return figmaFetch<FigmaComponent[]>(`/files/${fileKey}/components`);
}
