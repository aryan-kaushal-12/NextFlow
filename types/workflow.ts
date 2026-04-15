import { Node, Edge } from 'reactflow';

// ─── Node Data Types ──────────────────────────────────────────────────────────

export interface BaseNodeData {
  label: string;
  isRunning?: boolean;
  error?: string;
  outputs?: Record<string, string>;
}

export interface TextNodeData extends BaseNodeData {
  text: string;
}

export interface UploadImageNodeData extends BaseNodeData {
  imageUrl?: string;
}

export interface UploadVideoNodeData extends BaseNodeData {
  videoUrl?: string;
}

export interface LLMNodeData extends BaseNodeData {
  model: string;
  result?: string;
  // inputs are connected via handles
}

export interface CropImageNodeData extends BaseNodeData {
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  result?: string;
}

export interface ExtractFrameNodeData extends BaseNodeData {
  timestamp: string; // hh:mm:ss, seconds, or "50%"
  result?: string;
}

export type WorkflowNodeData =
  | TextNodeData
  | UploadImageNodeData
  | UploadVideoNodeData
  | LLMNodeData
  | CropImageNodeData
  | ExtractFrameNodeData;

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

// ─── Execution Types ──────────────────────────────────────────────────────────

export type HandleType = 'text' | 'image-url' | 'video-url';

export const HANDLE_TYPE_MAP: Record<string, Record<string, HandleType>> = {
  textNode:         { output: 'text' },
  uploadImageNode:  { output: 'image-url' },
  uploadVideoNode:  { output: 'video-url' },
  llmNode: {
    system_prompt:  'text',
    user_message:   'text',
    images:         'image-url',
    output:         'text',
  },
  cropImageNode: {
    image_url:      'image-url',
    x_percent:      'text',
    y_percent:      'text',
    width_percent:  'text',
    height_percent: 'text',
    output:         'image-url',
  },
  extractFrameNode: {
    video_url:      'video-url',
    timestamp:      'text',
    output:         'image-url',
  },
};

// nodeId → handleId → resolved value
export type ExecutionContext = Record<string, Record<string, string>>;

// ─── API Types ────────────────────────────────────────────────────────────────

export interface WorkflowRunPayload {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  scope: 'full' | 'partial' | 'single';
  selectedNodeIds?: string[];
}

export interface NodeExecutionDetail {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeLabel?: string | null;
  status: string;
  inputs?: unknown;
  outputs?: unknown;
  error?: string | null;
  duration?: number | null;
  createdAt: Date;
}

export interface WorkflowRunDetail {
  id: string;
  workflowId: string;
  status: string;
  scope: string;
  duration?: number | null;
  createdAt: Date;
  nodeExecutions: NodeExecutionDetail[];
}

// ─── Transloadit ─────────────────────────────────────────────────────────────

export interface TransloaditAssembly {
  ok: string;
  assembly_id: string;
  assembly_ssl_url: string;
  status: string;
  results: Record<string, TransloaditResult[]>;
  error?: string;
}

export interface TransloaditResult {
  id: string;
  name: string;
  basename: string;
  ext: string;
  size: number;
  mime: string;
  type: string;
  url: string;
  ssl_url: string;
  meta: Record<string, unknown>;
}

// ─── LLM Models ───────────────────────────────────────────────────────────────

export const LLM_MODELS = [
  { id: 'local:vit-gpt2-coco-en', label: '⚡ Local: vit-gpt2-coco-en (fastest, no API key)' },
  { id: 'openai:gpt-4o-mini',     label: 'OpenAI: GPT-4o mini (cloud)' },
  { id: 'openai:gpt-4.1-mini',    label: 'OpenAI: GPT-4.1 mini (cloud)' },
  { id: 'hf:blip-image-captioning-base', label: 'Hugging Face: BLIP image captioning (cloud)' },
  { id: 'ollama:mistral',         label: 'Ollama: Mistral (free, local)' },
  { id: 'ollama:llama3.2',        label: 'Ollama: Llama 3.2 (free, local)' },
  { id: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash' },
  { id: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite',  label: 'Gemini 2.0 Flash Lite' },
] as const;

export type LLMModelId = (typeof LLM_MODELS)[number]['id'];
