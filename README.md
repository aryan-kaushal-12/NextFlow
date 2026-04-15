# NextFlow — Visual LLM Workflow Builder

A production-ready, visual drag-and-drop workflow builder for chaining LLM, image processing, and video processing nodes. Built with Next.js 14 App Router, React Flow, Trigger.dev, Transloadit, Prisma/Postgres, and Clerk authentication.

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Node Types](#5-node-types)
6. [LLM Models Supported](#6-llm-models-supported)
7. [Execution Engine](#7-execution-engine)
8. [Database Schema](#8-database-schema)
9. [REST API Reference](#9-rest-api-reference)
10. [Python Caption Server (FastAPI)](#10-python-caption-server-fastapi)
11. [Environment Variables](#11-environment-variables)
12. [Local Development Setup](#12-local-development-setup)
13. [Running All Services](#13-running-all-services)
14. [Workflow Execution Flow (end-to-end)](#14-workflow-execution-flow-end-to-end)
15. [Adding a New Node Type](#15-adding-a-new-node-type)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What It Does

NextFlow lets users build multi-step AI pipelines visually:

- **Drag** nodes onto a canvas (text inputs, image uploads, video uploads, LLM, crop, frame-extract)
- **Connect** nodes with typed edges (text → text, image-url → image-url, etc.)
- **Run** the workflow — execution is orchestrated by Trigger.dev, runs in the cloud, and polls back to the UI in real-time
- **View** run history with per-node status, duration, inputs, and outputs

Example workflow:
```
[Upload Image] ──images──▶ [Run LLM (BLIP)]  ──▶  caption text output
[Text: "describe"]──user_message──▶ ┘
```

Another example:
```
[Upload Video] ──video_url──▶ [Extract Frame @5s] ──images──▶ [Run LLM (GPT-4o)] ──▶ description
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│  React Flow canvas + Zustand store + Toolbar            │
│  Auto-saves to /api/workflow/save every 2 s             │
│  Polls /api/workflow/status every 450 ms during run     │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP (Next.js API Routes)
┌───────────────────▼─────────────────────────────────────┐
│              Next.js 14 App Router (port 3000)          │
│  /api/workflow/run    → triggers Trigger.dev task       │
│  /api/workflow/status → polls Prisma for run state      │
│  /api/workflow/save   → persists nodes/edges/viewport   │
│  /api/caption         → proxies to Python FastAPI       │
│  /api/upload          → Transloadit file upload         │
└────────────┬──────────────────┬──────────────────────────┘
             │ trigger()        │ Prisma (TCP)
┌────────────▼──────┐  ┌────────▼──────────────────────────┐
│  Trigger.dev       │  │  PostgreSQL (Neon)                │
│  workflow-         │  │  Workflow, WorkflowRun,           │
│  orchestrator      │  │  NodeExecution tables             │
│  llm-node          │  └───────────────────────────────────┘
│  crop-image        │
│  extract-frame     │
└────────────┬───────┘
             │ fetch()
┌────────────▼──────────────────────────────────────────────┐
│  External APIs                                            │
│  • Transloadit  (image crop, video frame extract)        │
│  • OpenAI       (GPT-4o mini, GPT-4.1 mini)             │
│  • Google Gemini (1.5-flash, 2.0-flash, etc.)           │
│  • Hugging Face Inference API (BLIP)                     │
│  • Local FastAPI (port 8000) ← vit-gpt2-coco-en         │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 App Router | SSR, routing, API routes |
| Canvas | React Flow 11 | Drag-and-drop node graph |
| State | Zustand + Immer | Client state, undo/redo |
| Auth | Clerk | Sign-in / sign-up, session |
| Database | Prisma + PostgreSQL (Neon) | Persist workflows, run history |
| Task runner | Trigger.dev v3 | Async task orchestration |
| File processing | Transloadit | Image crop, video frame extract |
| LLM (cloud) | OpenAI, Google Gemini, HF Inference | Text + multimodal generation |
| LLM (local) | Python FastAPI + HuggingFace Transformers | Local image captioning |
| Styling | Tailwind CSS | Utility-first styles |
| Language | TypeScript 5, Python 3 | Type safety |

---

## 4. Project Structure

```
NextFlow/
├── app/                          # Next.js App Router pages & API routes
│   ├── page.tsx                  # Root: redirects auth → /workflow, anon → /sign-in
│   ├── layout.tsx                # Root layout (ClerkProvider)
│   ├── globals.css               # Global styles, workflow-node CSS
│   ├── workflow/
│   │   ├── page.tsx              # Workflow list page (create / delete)
│   │   └── [id]/page.tsx         # Workflow editor page (loads WorkflowEditor)
│   ├── caption/
│   │   └── page.tsx              # Standalone image captioner UI (/caption)
│   ├── sign-in/[[...sign-in]]/   # Clerk hosted sign-in
│   ├── sign-up/[[...sign-up]]/   # Clerk hosted sign-up
│   └── api/
│       ├── caption/route.ts      # Proxy → Python FastAPI /caption
│       ├── upload/route.ts       # Direct Transloadit file upload
│       ├── transloadit/
│       │   ├── crop/route.ts     # Transloadit image crop helper
│       │   ├── extract-frame/    # Transloadit video frame extract helper
│       │   └── import/route.ts   # Transloadit URL import helper
│       └── workflow/
│           ├── save/route.ts     # Create or update workflow
│           ├── list/route.ts     # List user's workflows
│           ├── [id]/route.ts     # Get / delete single workflow
│           ├── run/route.ts      # Trigger a workflow run
│           ├── status/route.ts   # Poll run status + node executions
│           ├── history/route.ts  # List recent runs
│           └── history/[runId]/  # Get single run detail
│
├── components/
│   ├── WorkflowEditor.tsx        # Top-level editor (ReactFlowProvider + sidebars)
│   ├── Toolbar.tsx               # Run / Stop / Save / Undo / Export buttons
│   ├── ImageCaptioner.tsx        # Standalone caption UI component
│   ├── sidebar/
│   │   ├── LeftSidebar.tsx       # Node palette (drag to canvas)
│   │   └── RightSidebar.tsx      # Run history panel
│   └── nodes/
│       ├── NodeShell.tsx         # Shared node wrapper (header, running bar)
│       ├── TextNode.tsx          # Static text input node
│       ├── UploadImageNode.tsx   # Image upload via Transloadit
│       ├── UploadVideoNode.tsx   # Video upload via Transloadit
│       ├── LLMNode.tsx           # LLM execution node
│       ├── CropImageNode.tsx     # Image crop node
│       └── ExtractFrameNode.tsx  # Video frame extraction node
│
├── trigger/                      # Trigger.dev task definitions
│   ├── orchestrator.ts           # workflow-orchestrator: topological execution
│   ├── llm-node.ts               # llm-node: multi-provider LLM task
│   ├── crop-image.ts             # crop-image: Transloadit crop task
│   └── extract-frame.ts          # extract-frame: Transloadit frame task
│
├── lib/
│   ├── execution-engine.ts       # DAG utils: topological sort, input resolution
│   ├── transloadit.ts            # Transloadit API helpers
│   ├── prisma.ts                 # Prisma singleton client
│   └── clerk-appearance.ts       # Clerk dark theme config
│
├── store/
│   └── workflowStore.ts          # Zustand store (nodes, edges, run state, history)
│
├── types/
│   └── workflow.ts               # Shared TypeScript types + LLM_MODELS list
│
├── prisma/
│   ├── schema.prisma             # Database schema (Workflow, WorkflowRun, NodeExecution)
│   └── seed.ts                   # DB seed script
│
├── app.py                        # Python FastAPI caption server
├── requirements.txt              # Python dependencies
├── trigger.config.ts             # Trigger.dev project config
├── middleware.ts                 # Clerk auth middleware (protects /workflow/*)
├── next.config.mjs               # Next.js config
├── tailwind.config.ts            # Tailwind config
└── tsconfig.json                 # TypeScript config
```

---

## 5. Node Types

### Text Node (`textNode`)
- **Purpose**: Static text content — used as a prompt, label, or message.
- **Outputs**: `output` (text)
- **Data**: `{ text: string }`
- **Usage**: Connect to `user_message` or `system_prompt` of an LLM node.

### Upload Image Node (`uploadImageNode`)
- **Purpose**: Upload an image via Transloadit; stores the CDN URL.
- **Outputs**: `output` (image-url)
- **Data**: `{ imageUrl?: string }`
- **Usage**: Connect to `images` of an LLM node, or `image_url` of a Crop Image node.

### Upload Video Node (`uploadVideoNode`)
- **Purpose**: Upload a video via Transloadit; stores the CDN URL.
- **Outputs**: `output` (video-url)
- **Data**: `{ videoUrl?: string }`
- **Usage**: Connect to `video_url` of an Extract Frame node.

### LLM Node (`llmNode`)
- **Purpose**: Run a language/vision model.
- **Inputs**:
  - `system_prompt` (text, optional)
  - `user_message` (text, required)
  - `images` (image-url, optional, multiple)
- **Outputs**: `output` (text)
- **Data**: `{ model: LLMModelId }`
- **See Section 6** for all supported models.

### Crop Image Node (`cropImageNode`)
- **Purpose**: Crop an image to a percentage-based rectangle using Transloadit.
- **Inputs**: `image_url` (image-url)
- **Inputs (static or connected)**: `x_percent`, `y_percent`, `width_percent`, `height_percent`
- **Outputs**: `output` (image-url)
- **Data**: `{ x_percent: 0–100, y_percent: 0–100, width_percent: 0–100, height_percent: 0–100 }`

### Extract Frame Node (`extractFrameNode`)
- **Purpose**: Extract a single frame from a video at a given timestamp.
- **Inputs**: `video_url` (video-url)
- **Inputs (static or connected)**: `timestamp` (seconds or `"50%"`)
- **Outputs**: `output` (image-url)
- **Data**: `{ timestamp: string }`

---

## 6. LLM Models Supported

| Model ID | Provider | Type | Requires |
|---|---|---|---|
| `local:vit-gpt2-coco-en` | Local Python server | Image captioning | `python app.py` running |
| `openai:gpt-4o-mini` | OpenAI API | Text + vision | `OPENAI_API_KEY` |
| `openai:gpt-4.1-mini` | OpenAI API | Text + vision | `OPENAI_API_KEY` |
| `hf:blip-image-captioning-base` | HF Inference API | Image captioning | `HF_API_TOKEN` |
| `ollama:mistral` | Local Ollama | Text | Ollama running |
| `ollama:llama3.2` | Local Ollama | Text + vision | Ollama running |
| `gemini-1.5-flash` | Google Gemini | Text + vision | `GEMINI_API_KEY` |
| `gemini-2.0-flash` | Google Gemini | Text + vision | `GEMINI_API_KEY` |
| `gemini-2.0-flash-lite` | Google Gemini | Text + vision | `GEMINI_API_KEY` |

### Model routing logic (inside `trigger/llm-node.ts`)
```
model starts with "local:"  → generateWithLocalModel()   → Python FastAPI
model starts with "openai:" → generateWithOpenAI()       → api.openai.com
model starts with "hf:"     → generateWithHuggingFaceBLIP() → api-inference.huggingface.co
model starts with "ollama:" → generateWithOllama()       → localhost:11434
else                        → generateWithGeminiRetry()  → generativelanguage.googleapis.com
```

### HF BLIP cold-start handling
The HF free tier serverless model has two failure modes:
1. **TCP drop** (`TypeError: terminated`) — the model is loading and drops the connection
2. **JSON error** (`{"error":"loading","estimated_time":N}`) — same cause, graceful response

**Fix**: `x-wait-for-model: true` header tells HF to hold the connection until ready.
**Additional**: `loadHFModel()` first warms the model with a 1×1 dummy PNG, then `runHFInference()` sends the real image. Automatic fallback to `nlpconnect/vit-gpt2-image-captioning` if BLIP fails.

---

## 7. Execution Engine

### Overview
Located in `lib/execution-engine.ts`. Provides pure functions used by the Trigger.dev orchestrator.

### Topological Sort (`topologicalLevels`)
Returns an array of levels (Kahn's algorithm). Nodes in the same level have no edges between them and can execute in parallel.

```
Input → LLM → Output
         ↗
Image ──┘

Level 0: [Input, Image]   ← no dependencies
Level 1: [LLM]            ← depends on level 0
Level 2: [Output]         ← depends on level 1
```

### Input Resolution (`resolveInputs`)
For each incoming edge to a node, looks up the source node's output in the execution context (`ctx: Record<nodeId, Record<handleId, value>>`). The `images` handle is special — it collects multiple connected values into an array.

### Connection Validation (`isConnectionValid`)
Enforces type safety at draw-time using `HANDLE_TYPE_MAP`:
- `text` handles only connect to `text`
- `image-url` handles only connect to `image-url` / `images`
- `video-url` handles only connect to `video-url`

### Ancestor Expansion (`expandWithAncestors`)
For partial/single runs: given a set of selected node IDs, walks backwards through edges to include all upstream dependencies so the subgraph is self-contained.

---

## 8. Database Schema

### Workflow
| Column | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `name` | String | Workflow display name |
| `userId` | String | Clerk user ID |
| `nodes` | Json | Serialized React Flow nodes array |
| `edges` | Json | Serialized React Flow edges array |
| `viewport` | Json? | Last canvas pan/zoom state |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Auto-updated |

### WorkflowRun
| Column | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `workflowId` | String | FK → Workflow |
| `userId` | String | Clerk user ID |
| `status` | RunStatus | `RUNNING \| SUCCESS \| FAILED \| PARTIAL` |
| `scope` | RunScope | `FULL \| PARTIAL \| SINGLE` |
| `selectedNodes` | String[] | Node IDs included in partial/single run |
| `triggerId` | String? | Trigger.dev task handle ID |
| `duration` | Int? | Total milliseconds |

### NodeExecution
| Column | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `runId` | String | FK → WorkflowRun |
| `nodeId` | String | React Flow node ID |
| `nodeType` | String | e.g. `llmNode`, `cropImageNode` |
| `nodeLabel` | String? | Display label |
| `status` | ExecutionStatus | `RUNNING \| SUCCESS \| FAILED \| SKIPPED` |
| `inputs` | Json? | Resolved inputs passed to the task |
| `outputs` | Json? | `{ output: string }` |
| `error` | String? | Error message if FAILED |
| `duration` | Int? | Milliseconds |

---

## 9. REST API Reference

All routes require Clerk authentication (`Authorization: Bearer <session_token>` via cookie). Unauthenticated requests return `401`.

### Workflow CRUD

#### `POST /api/workflow/save`
Create a new workflow or update an existing one.

**Request body**
```json
{
  "workflowId": "optional-existing-id",
  "name": "My Workflow",
  "nodes": [...],
  "edges": [...],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```
**Response** `200`
```json
{ "workflow": { "id": "...", "name": "...", "updatedAt": "..." } }
```

---

#### `GET /api/workflow/list`
List all workflows for the authenticated user.

**Response** `200`
```json
{ "workflows": [{ "id": "...", "name": "...", "updatedAt": "...", "createdAt": "..." }] }
```

---

#### `GET /api/workflow/[id]`
Get a single workflow with full node/edge data.

**Response** `200`
```json
{ "workflow": { "id": "...", "name": "...", "nodes": [...], "edges": [...], "viewport": {...} } }
```

---

#### `DELETE /api/workflow/[id]`
Delete a workflow and all its runs.

**Response** `200`
```json
{ "ok": true }
```

---

### Execution

#### `POST /api/workflow/run`
Trigger a workflow execution via Trigger.dev.

**Request body**
```json
{
  "workflowId": "cm...",
  "nodes": [...],
  "edges": [...],
  "scope": "full",
  "selectedNodeIds": []
}
```

`scope` values:
- `"full"` — run all executable nodes
- `"partial"` — run selected nodes + their ancestors
- `"single"` — run exactly one selected node + ancestors

**Response** `200`
```json
{ "runId": "cm...", "triggerId": "trigger_..." }
```

---

#### `GET /api/workflow/status?runId=<id>`
Poll run status. Called every 450 ms by the Toolbar.

**Response** `200`
```json
{
  "run": {
    "id": "cm...",
    "status": "RUNNING",
    "duration": null,
    "nodeExecutions": [
      {
        "nodeId": "llmNode-123",
        "nodeType": "llmNode",
        "status": "SUCCESS",
        "outputs": { "output": "a group of people standing together" },
        "duration": 3420
      }
    ]
  }
}
```

---

#### `GET /api/workflow/history?workflowId=<id>`
Get recent run history for a workflow.

**Response** `200`
```json
{ "runs": [{ "id": "...", "status": "SUCCESS", "duration": 4200, "createdAt": "..." }] }
```

---

#### `GET /api/workflow/history/[runId]`
Get full detail of a single run including all node executions.

---

### Caption (Local Model Proxy)

#### `POST /api/caption`
Proxy an image to the local Python FastAPI server for captioning.

**Request**: `multipart/form-data`, field `file` = image blob.

**Response** `200`
```json
{ "caption": "a group of people in front of a building", "elapsed_ms": 2340 }
```

**Error responses**

| Status | Meaning |
|---|---|
| `400` | Missing `file` field |
| `413` | Image > 10 MB |
| `503` | Python server not running — start with `python app.py` |

---

### File Upload

#### `POST /api/upload`
Upload a file to Transloadit CDN. Used by `UploadImageNode` and `UploadVideoNode`.

**Request**: `multipart/form-data`, field `file`.
**Response** `200`
```json
{ "url": "https://...transloadit.com/.../file.jpg" }
```

---

## 10. Python Caption Server (FastAPI)

Located at `app.py`. Runs **locally** alongside the Next.js dev server.

### Swagger UI
Once running, open **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)** for the interactive Swagger UI.  
ReDoc is available at **[http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)**.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "ok", model: "..." }` |
| `POST` | `/caption` | Accepts `file` (image), returns `{ caption, elapsed_ms }` |

### Model loading
The model `ydshieh/vit-gpt2-coco-en` (957 MB) is loaded **once at startup** using:
- `VisionEncoderDecoderModel.from_pretrained(MODEL_ID)` — vision encoder + GPT-2 decoder
- `ViTImageProcessor.from_pretrained(MODEL_ID)` — ViT image preprocessor
- `AutoTokenizer.from_pretrained(MODEL_ID)` — GPT-2 tokenizer

First startup downloads weights (~3–5 min). Subsequent startups load from HuggingFace cache (~4 s).

### Request flow
```
POST /caption
  ├── Validate content-type (image/* or octet-stream)
  ├── PIL.Image.open(bytes).convert("RGB")
  ├── feature_extractor(images=image, return_tensors="pt")  → pixel_values
  ├── model.generate(pixel_values, max_length=16, num_beams=4)
  ├── tokenizer.decode(output_ids[0], skip_special_tokens=True)
  └── return { caption, elapsed_ms }
```

### Starting the server
```bash
# First time only
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Every time
source .venv/bin/activate
python app.py
```

---

## 11. Environment Variables

Copy `.env.example` to `.env` and fill in every value.

```env
# PostgreSQL (Neon serverless) — remove channel_binding=require if present
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Clerk (https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/workflow
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/workflow

# Transloadit (https://transloadit.com)
NEXT_PUBLIC_TRANSLOADIT_KEY="..."
TRANSLOADIT_SECRET="..."

# Google Gemini (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY="AIza..."

# OpenAI (https://platform.openai.com/api-keys)
OPENAI_API_KEY="sk-..."

# Hugging Face (https://huggingface.co/settings/tokens)
HF_API_TOKEN="hf_..."

# Trigger.dev (https://cloud.trigger.dev → project → API keys)
TRIGGER_SECRET_KEY="tr_dev_..."

# Optional: override local Python caption server URL
# CAPTION_API_URL="http://127.0.0.1:8000/caption"

# Optional: override local Ollama URL
# OLLAMA_BASE_URL="http://127.0.0.1:11434"
```

> **Warning**: Never commit your `.env` file. It is already in `.gitignore`.

---

## 12. Local Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+ (3.14 works but some packages may be slower to support it)
- A Neon PostgreSQL database (free tier at [neon.tech](https://neon.tech))
- A Clerk account (free tier at [clerk.com](https://clerk.com))
- A Trigger.dev account (free tier at [trigger.dev](https://trigger.dev))
- A Transloadit account (free tier at [transloadit.com](https://transloadit.com))

### Step-by-step

```bash
# 1. Clone and install Node.js dependencies
git clone <repo-url>
cd NextFlow
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env and fill in every value

# 3. Push the database schema
npx prisma db push

# 4. (Optional) Seed with a sample workflow
npm run db:seed

# 5. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 13. Running All Services

Open **three terminals** from the project root:

**Terminal 1 — Next.js frontend**
```bash
npm run dev
# http://localhost:3000
```

**Terminal 2 — Trigger.dev task worker**
```bash
npm run trigger:dev
# Connects to Trigger.dev cloud, hot-reloads trigger/* tasks
```

**Terminal 3 — Python caption server**
```bash
source .venv/bin/activate
python app.py
# http://127.0.0.1:8000
# Swagger: http://127.0.0.1:8000/docs
```

You only need Terminal 3 if you plan to use the `local:vit-gpt2-coco-en` model.

### Available npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run dev:clean` | Clear `.next` cache + start dev |
| `npm run build` | Production build |
| `npm run trigger:dev` | Start Trigger.dev local worker |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset and re-migrate database |

---

## 14. Workflow Execution Flow (end-to-end)

```
1. User clicks "Run" in Toolbar
   └── POST /api/workflow/run
       ├── Prisma: create WorkflowRun (status=RUNNING)
       └── workflowOrchestrator.trigger({ runId, nodes, edges, scope })

2. Trigger.dev picks up task: workflow-orchestrator
   ├── Pre-populate ctx from static nodes (textNode, uploadImageNode, uploadVideoNode)
   ├── topologicalLevels(nodes, edges) → [[level0], [level1], ...]
   └── For each level in parallel:
       ├── Create NodeExecution records (status=RUNNING)
       ├── resolveInputs(nodeId, edges, ctx) → { user_message, images, ... }
       └── triggerAndWait sub-task:
           ├── llmNode  → llmNodeTask   → OpenAI / Gemini / HF / Local
           ├── cropImageNode → cropImageTask → Transloadit /image/resize
           └── extractFrameNode → extractFrameTask → Transloadit /video/thumbs

3. Each sub-task:
   ├── Updates NodeExecution.status = RUNNING
   ├── Calls external API
   ├── Updates NodeExecution.status = SUCCESS / FAILED
   └── Returns { output: string }

4. Orchestrator:
   ├── Stores result in ctx[nodeId] = { output }
   ├── Marks blocked nodes as SKIPPED if upstream failed
   └── Updates WorkflowRun.status = SUCCESS / PARTIAL / FAILED

5. Browser polling (every 450 ms):
   GET /api/workflow/status?runId=...
   └── On SUCCESS:
       ├── updateNodeData(nodeId, { result: output })
       └── setRunningNodeIds([]) → stops running animation
```

---

## 15. Adding a New Node Type

Follow these steps to add a completely new node type (e.g. `translateNode`):

### 1. Define the type — `types/workflow.ts`
```typescript
export interface TranslateNodeData extends BaseNodeData {
  targetLanguage: string;
  result?: string;
}
// Add to HANDLE_TYPE_MAP:
translateNode: {
  text_input: 'text',
  output: 'text',
}
```

### 2. Create the React component — `components/nodes/TranslateNode.tsx`
```tsx
'use client';
import NodeShell from './NodeShell';
// ... handle definitions, select for language, result display
```

### 3. Register the node — `components/WorkflowEditor.tsx`
```typescript
import TranslateNode from './nodes/TranslateNode';
const nodeTypes: NodeTypes = {
  ...
  translateNode: TranslateNode,
};
```

### 4. Create the Trigger.dev task — `trigger/translate.ts`
```typescript
export const translateTask = task({ id: 'translate-node', ... });
```

### 5. Wire into the orchestrator — `trigger/orchestrator.ts`
```typescript
import { translateTask } from './translate';
// add case in the execution switch
```

### 6. Add to the sidebar — `components/sidebar/LeftSidebar.tsx`
```typescript
{ type: 'translateNode', label: 'Translate', icon: ... }
```

### 7. Set default data — `components/WorkflowEditor.tsx` (onDrop handler)
```typescript
if (nodeType === 'translateNode') defaultData.targetLanguage = 'Spanish';
```

---

## 16. Troubleshooting

### `Can't reach database server`
- Ensure `DATABASE_URL` does **not** contain `channel_binding=require` — remove it.
- Check your Neon database is not paused (free tier auto-suspends after 5 min idle; open the dashboard to wake it).

### `zsh: command not found: pip`
- Use `python3 -m venv .venv && source .venv/bin/activate` then `pip install -r requirements.txt`.

### `415 Unsupported Media Type` from Python server
- The server is running old code. Restart it: Ctrl+C → `python app.py`.
- Also restart the Trigger.dev worker: Ctrl+C → `npm run trigger:dev`.

### `TypeError: terminated` from Hugging Face
- Added `x-wait-for-model: true` header — restart the Trigger.dev worker to pick it up.
- HF free tier models sleep after inactivity; first request warms the model (~20–60 s).

### `Failed to connect to Ollama`
- Ollama is not running locally. Install it from [ollama.com](https://ollama.com) or use a cloud model instead.

### Workflow canvas shows 500 error
- Usually a stale `.next` cache. Run `npm run dev:clean`.

### Trigger.dev tasks not running
- Run `npm run trigger:dev` in a separate terminal — it must stay running during development.
- Check `TRIGGER_SECRET_KEY` is set correctly in `.env`.

### `Maximum update depth exceeded`
- Fixed by memoizing `styledNodes` in `WorkflowEditor.tsx`. Make sure you're on the latest code.

---

## License

Private — all rights reserved.
