#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as figma from './figma-client.js';

function textResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function jsonResponse(data: unknown) {
  return textResponse(JSON.stringify(data, null, 2));
}

const TOOLS: Tool[] = [
  {
    name: 'get_figma_file',
    description: 'Get the full Figma file document tree (pages, frames, layers, and their properties)',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key (from the URL: figma.com/file/{fileKey}/...)',
        },
        depth: {
          type: 'number',
          description: 'How deep to traverse the node tree (1 = only pages, 2 = pages + top-level frames, omit for full tree)',
        },
      },
      required: ['fileKey'],
    },
  },
  {
    name: 'get_figma_node',
    description: 'Get specific node(s) from a Figma file by their node IDs',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key',
        },
        nodeIds: {
          type: 'string',
          description: 'Comma-separated node IDs (found in Figma URLs as ?node-id=xxx)',
        },
        depth: {
          type: 'number',
          description: 'How deep to traverse from the requested nodes (1 = direct children only)',
        },
      },
      required: ['fileKey', 'nodeIds'],
    },
  },
  {
    name: 'get_figma_node_image',
    description: 'Render Figma node(s) as images (PNG, SVG, or PDF)',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key',
        },
        nodeIds: {
          type: 'string',
          description: 'Comma-separated node IDs to render',
        },
        format: {
          type: 'string',
          description: 'Image format (png, svg, pdf)',
          enum: ['png', 'svg', 'pdf'],
          default: 'png',
        },
        scale: {
          type: 'number',
          description: 'Image scale factor (0.01 to 4). 2 = 2x Retina quality.',
          minimum: 0.01,
          maximum: 4,
        },
      },
      required: ['fileKey', 'nodeIds'],
    },
  },
  {
    name: 'get_figma_file_info',
    description: 'Get file metadata (name, version, thumbnail URL, editor type)',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key',
        },
      },
      required: ['fileKey'],
    },
  },
  {
    name: 'get_figma_styles',
    description: 'Get all published styles (color swatches, text styles, effect styles) from a Figma file',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key',
        },
      },
      required: ['fileKey'],
    },
  },
  {
    name: 'get_figma_components',
    description: 'Get all published component definitions in a Figma file',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: {
          type: 'string',
          description: 'The Figma file key',
        },
      },
      required: ['fileKey'],
    },
  },
];

const server = new Server(
  { name: 'figma-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return textResponse('Error: no arguments provided');
  }

  try {
    switch (name) {
      case 'get_figma_file': {
        const data = await figma.getFile(args.fileKey as string, args.depth as number | undefined);
        return jsonResponse(data);
      }

      case 'get_figma_node': {
        const data = await figma.getFileNodes(
          args.fileKey as string,
          args.nodeIds as string,
          args.depth as number | undefined,
        );
        return jsonResponse(data);
      }

      case 'get_figma_node_image': {
        const data = await figma.getNodeImages(
          args.fileKey as string,
          args.nodeIds as string,
          args.format as string | undefined,
          args.scale as number | undefined,
        );
        if (data.err) {
          return textResponse(`Error: ${data.err}`);
        }
        const urls = Object.entries(data.images)
          .map(([id, url]) => `${id}: ${url}`)
          .join('\n');
        return textResponse(urls);
      }

      case 'get_figma_file_info': {
        const data = await figma.getFileMeta(args.fileKey as string);
        return jsonResponse(data);
      }

      case 'get_figma_styles': {
        const data = await figma.getFileStyles(args.fileKey as string);
        return jsonResponse(data);
      }

      case 'get_figma_components': {
        const data = await figma.getFileComponents(args.fileKey as string);
        return jsonResponse(data);
      }

      default:
        return textResponse(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResponse(`Error: ${message}`);
  }
});

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error('Failed to start Figma MCP server:', err);
    process.exit(1);
  }
}

main();
