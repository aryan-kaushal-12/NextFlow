import { task, logger } from '@trigger.dev/sdk/v3';
import { GoogleGenerativeAI, Part, GenerativeModel } from '@google/generative-ai';
import prisma from '@/lib/prisma';

interface LLMNodePayload {
  executionId: string;
  model: string;
  systemPrompt?: string;
  userMessage: string;
  imageUrls?: string[];
}

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-pro',
] as const;

const OPENAI_MODELS      = ['openai:gpt-4o-mini', 'openai:gpt-4.1-mini'] as const;
const HUGGINGFACE_MODELS = ['hf:blip-image-captioning-base'] as const;
const OLLAMA_MODELS      = ['ollama:mistral', 'ollama:llama3.2'] as const;
const LOCAL_MODELS       = ['local:vit-gpt2-coco-en'] as const;

const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
// Local Python FastAPI server (started with `python app.py`)
const LOCAL_CAPTION_URL = process.env.CAPTION_API_URL ?? 'http://127.0.0.1:8000/caption';

// Primary HF model + automatic fallback
const HF_BLIP_URL     = 'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base';
const HF_FALLBACK_URL = 'https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning';

// Max image payload before we warn — HF drops large requests silently
const HF_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function isOllamaModel(model: string)      { return model.startsWith('ollama:'); }
function isOpenAIModel(model: string)      { return model.startsWith('openai:'); }
function isHuggingFaceModel(model: string) { return model.startsWith('hf:'); }
function isLocalModel(model: string)       { return model.startsWith('local:'); }
function toOllamaModelName(model: string)  { return model.replace(/^ollama:/, ''); }
function toOpenAIModelName(model: string)  { return model.replace(/^openai:/, ''); }

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('terminated') ||
    m.includes('fetch failed') ||
    m.includes('econnreset') ||
    m.includes('socket') ||
    m.includes('network') ||
    m.includes('aborted') ||
    err.name === 'AbortError'
  );
}

interface TextResponse { ok: boolean; status: number; headers: Headers; text: string }
interface BinaryResponse { ok: boolean; status: number; headers: Headers; buffer: ArrayBuffer }

/**
 * Fetch + read body as text inside one retry loop.
 * The `TypeError: terminated` error fires during body streaming (after headers),
 * so both fetch() and body reading must be inside the same try/catch.
 */
async function fetchText(
  url: string,
  init: RequestInit,
  { retries = 3, timeoutMs = 60_000, delayMs = 1_500 } = {}
): Promise<TextResponse> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();   // ← body read INSIDE try/catch
      clearTimeout(tid);
      return { ok: res.ok, status: res.status, headers: res.headers, text };
    } catch (err) {
      clearTimeout(tid);
      lastErr = err;
      if (attempt < retries && isTransient(err)) {
        const wait = delayMs * attempt;
        logger.warn(`Transient network error – retry ${attempt}/${retries} in ${wait}ms`, {
          url: url.slice(0, 80),
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`fetchText: all retries exhausted for ${url}`);
}

/** Same as fetchText but reads body as raw bytes (for image downloads). */
async function fetchBinary(
  url: string,
  init: RequestInit,
  { retries = 3, timeoutMs = 30_000, delayMs = 1_000 } = {}
): Promise<BinaryResponse> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const buffer = await res.arrayBuffer();  // ← body read INSIDE try/catch
      clearTimeout(tid);
      return { ok: res.ok, status: res.status, headers: res.headers, buffer };
    } catch (err) {
      clearTimeout(tid);
      lastErr = err;
      if (attempt < retries && isTransient(err)) {
        const wait = delayMs * attempt;
        logger.warn(`Transient network error – retry ${attempt}/${retries} in ${wait}ms`, {
          url: url.slice(0, 80),
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`fetchBinary: all retries exhausted for ${url}`);
}

/**
 * Call the local Python FastAPI server (`python app.py`).
 * The model is loaded ONCE at server startup — no cold-start penalty per request.
 * Target latency: 1–5 s on CPU.
 */
async function generateWithLocalModel(imageUrls: string[] | undefined): Promise<string> {
  const firstImageUrl = imageUrls?.[0];
  if (!firstImageUrl) {
    throw new Error(
      'Local vit-gpt2 model requires an image input. ' +
      'Connect an image node to the "images" handle.'
    );
  }

  // Download the image (same pattern as PIL.Image.open in Python)
  logger.info('Downloading image for local model', { url: firstImageUrl.slice(0, 100) });
  const imgRes = await fetchBinary(
    firstImageUrl,
    { method: 'GET' },
    { retries: 3, timeoutMs: 30_000, delayMs: 1_000 }
  );
  if (!imgRes.ok) throw new Error(`Failed to download image (HTTP ${imgRes.status})`);

  logger.info('Image downloaded', { bytes: imgRes.buffer.byteLength });

  // Extract MIME type from the download response; fall back to image/jpeg.
  // Without this the Blob defaults to application/octet-stream and FastAPI
  // rejects it with HTTP 415.
  const mimeType = imgRes.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';
  logger.info('Building form data', { mimeType });

  const blob = new Blob([imgRes.buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `image.${mimeType.split('/')[1] || 'jpg'}`);

  logger.info('Sending to local FastAPI', { url: LOCAL_CAPTION_URL });

  let res: TextResponse;
  try {
    res = await fetchText(
      LOCAL_CAPTION_URL,
      { method: 'POST', body: form },
      { retries: 2, timeoutMs: 30_000, delayMs: 2_000 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach local caption server at ${LOCAL_CAPTION_URL}. ` +
      `Make sure it is running: python app.py\n(${msg})`
    );
  }

  let parsed: unknown;
  try { parsed = JSON.parse(res.text); } catch {
    throw new Error(`Local server non-JSON response (${res.status}): ${res.text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const p = parsed as Record<string, unknown>;
    throw new Error(`Local server error (${res.status}): ${p?.detail ?? p?.error ?? res.text.slice(0, 200)}`);
  }

  const caption = (parsed as { caption?: string }).caption?.trim();
  if (!caption) throw new Error('Local server returned empty caption');

  logger.info('Local model caption', { caption });
  return caption;
}

async function loadImageParts(
  imageUrls: string[] | undefined
): Promise<{ geminiParts: Part[]; ollamaImages: string[] }> {
  const geminiParts: Part[] = [];
  const ollamaImages: string[] = [];
  if (!imageUrls?.length) return { geminiParts, ollamaImages };

  const results = await Promise.all(
    imageUrls.map(async url => {
      try {
        const res = await fetchBinary(url, { method: 'GET' });
        const base64 = Buffer.from(res.buffer).toString('base64');
        const rawMime = res.headers.get('content-type') || 'image/jpeg';
        const mimeType = rawMime.split(';')[0].trim() as
          'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        logger.info('Image loaded', { url: url.slice(0, 60), mimeType, bytes: res.buffer.byteLength });
        return { gemini: { inlineData: { data: base64, mimeType } } as Part, ollama: base64 };
      } catch (imgErr) {
        logger.warn('Failed to load image, skipping', { url, error: String(imgErr) });
        return null;
      }
    })
  );

  for (const item of results) {
    if (!item) continue;
    geminiParts.push(item.gemini);
    ollamaImages.push(item.ollama);
  }
  return { geminiParts, ollamaImages };
}

function parseRetryDelayMs(errMessage: string, defaultMs = 15_000): number {
  const match = errMessage.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (match) return Math.max(Math.ceil(parseFloat(match[1]) * 1000) + 500, 5_000);
  const secs = errMessage.match(/retry in ([\d.]+)s/i);
  if (secs) return Math.max(Math.ceil(parseFloat(secs[1]) * 1000) + 500, 5_000);
  return defaultMs;
}

function is429(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('429') || err.message.includes('Too Many Requests') || err.message.toLowerCase().includes('quota');
}

async function generateWithGeminiRetry(
  genAI: GoogleGenerativeAI,
  modelName: string,
  systemPrompt: string | undefined,
  parts: Part[],
  maxAttempts = 3
): Promise<string> {
  const fallbackModel = 'gemini-1.5-flash';
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const useModel = attempt === maxAttempts && modelName !== fallbackModel ? fallbackModel : modelName;
    if (attempt > 1) logger.warn(`Gemini retry ${attempt}/${maxAttempts}`, { model: useModel });

    const geminiModel: GenerativeModel = genAI.getGenerativeModel({
      model: useModel,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    });

    try {
      const result = await geminiModel.generateContent({ contents: [{ role: 'user', parts }] });
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if ((is429(err) || isTransient(err)) && attempt < maxAttempts) {
        const delay = is429(err)
          ? parseRetryDelayMs(err instanceof Error ? err.message : '')
          : 2_000 * attempt;
        logger.warn(`Gemini error – waiting ${(delay / 1000).toFixed(1)}s`, { attempt, model: useModel, error: err instanceof Error ? err.message : String(err) });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('generateWithGeminiRetry: exhausted attempts');
}

async function generateWithOllama(
  model: string,
  systemPrompt: string | undefined,
  userMessage: string,
  imagesBase64: string[]
): Promise<string> {
  const ollamaModel = toOllamaModelName(model);
  const bodyObj = {
    model: ollamaModel,
    stream: false,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      {
        role: 'user',
        content: userMessage,
        ...(imagesBase64.length ? { images: imagesBase64 } : {}),
      },
    ],
    options: { temperature: 0.7, num_predict: 2048 },
  };

  let res: TextResponse;
  try {
    res = await fetchText(
      `${DEFAULT_OLLAMA_BASE_URL}/api/chat`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) },
      { retries: 3, timeoutMs: 90_000, delayMs: 1_500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to connect to Ollama at ${DEFAULT_OLLAMA_BASE_URL}. Run: ollama pull ${ollamaModel}. (${msg})`);
  }

  if (!res.ok) throw new Error(`Ollama request failed (${res.status}): ${res.text}`);
  const data = JSON.parse(res.text) as { message?: { content?: string } };
  const text = data.message?.content?.trim();
  if (!text) throw new Error('Ollama returned empty response');
  return text;
}

async function generateWithOpenAI(
  model: string,
  systemPrompt: string | undefined,
  userMessage: string,
  imageUrls: string[] | undefined
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing. Set it in your .env file.');

  const openAIModel = toOpenAIModelName(model);
  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: userMessage }];
  for (const url of imageUrls ?? []) {
    userContent.push({ type: 'image_url', image_url: { url } });
  }

  const bodyObj = {
    model: openAIModel,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  };

  const res = await fetchText(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(bodyObj),
    },
    { retries: 3, timeoutMs: 90_000, delayMs: 1_500 }
  );

  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${res.text}`);
  const data = JSON.parse(res.text) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty response');
  return text;
}

// Minimal 1×1 white pixel PNG — used only to trigger cold-model loading.
// Sending actual image data during the load step is unnecessary overhead.
const WARMUP_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
  'AABjkB6QAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * STEP 1 — Load / warm up the model.
 *
 * Mirrors Python's `VisionEncoderDecoderModel.from_pretrained(...)`:
 *   - Checks the HF status API to see if the model is already loaded.
 *   - If not, sends a cheap warmup request (1×1 PNG) with `x-wait-for-model: true`
 *     so HF holds the connection open until the model finishes loading.
 *   - Returns once the model is confirmed ready, before any real image is sent.
 */
async function loadHFModel(modelUrl: string, token: string): Promise<void> {
  const modelId = modelUrl.replace('https://api-inference.huggingface.co/models/', '');

  // Check live status — same as polling for from_pretrained to finish
  try {
    const statusRes = await fetchText(
      `https://api-inference.huggingface.co/status/${modelId}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      { retries: 2, timeoutMs: 10_000, delayMs: 1_000 }
    );
    if (statusRes.ok) {
      const s = JSON.parse(statusRes.text) as Record<string, unknown>;
      logger.info('HF model status', { modelId, state: s.state, loaded: s.loaded });
      if (s.loaded === true || s.state === 'Loaded') {
        logger.info('Model already loaded — skipping warmup', { modelId });
        return;
      }
    }
  } catch {
    // Status API is best-effort; proceed to warmup regardless
  }

  // Model is cold — boot it with a minimal dummy request before touching real data.
  // x-wait-for-model keeps the connection open while the model initialises
  // (prevents the "terminated" TCP drop that happens on cold starts).
  logger.info('Loading HF model (warmup)…', { modelId });
  try {
    const warmupRes = await fetchText(
      modelUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-wait-for-model': 'true',
        },
        body: WARMUP_PNG.buffer,
      },
      { retries: 1, timeoutMs: 180_000, delayMs: 0 }
    );
    logger.info('Warmup complete', { modelId, status: warmupRes.status });
  } catch (err) {
    // Warmup failures are non-fatal; inference will retry on its own
    logger.warn('Warmup request failed — will retry during inference', {
      modelId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * STEP 2 — Run inference.
 *
 * Mirrors Python's `model.generate(pixel_values, ...)` + `tokenizer.decode(...)`:
 *   - Sends the real image bytes to the already-loaded model.
 *   - Parses `[{ generated_text: "..." }]` from the response.
 *   - Retries on transient network errors only (model is already warm at this point).
 */
async function runHFInference(
  modelUrl: string,
  token: string,
  imageBuffer: ArrayBuffer,
  label: string,
  maxAttempts = 3
): Promise<string> {
  const modelId = modelUrl.replace('https://api-inference.huggingface.co/models/', '');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info(`${label} inference attempt ${attempt}/${maxAttempts}`, {
      modelId,
      bytes: imageBuffer.byteLength,
      mb: (imageBuffer.byteLength / 1024 / 1024).toFixed(2),
    });

    let res: TextResponse;
    try {
      res = await fetchText(
        modelUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-wait-for-model': 'true',  // safety net if model cooled between load + infer
          },
          body: imageBuffer,
        },
        { retries: 1, timeoutMs: 120_000, delayMs: 0 }
      );
    } catch (err) {
      if (isTransient(err) && attempt < maxAttempts) {
        const wait = 10_000 * attempt;
        logger.warn(`${label} network drop – retrying in ${wait / 1000}s`, {
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }

    logger.info(`${label} HTTP ${res.status}`, { body: res.text.slice(0, 200) });

    let parsed: unknown;
    try { parsed = JSON.parse(res.text); } catch {
      throw new Error(`${label}: non-JSON response (${res.status}): ${res.text.slice(0, 300)}`);
    }

    // ✅ Success — same shape as Python's tokenizer.decode output
    if (Array.isArray(parsed) && parsed.length > 0) {
      const caption = (parsed[0] as { generated_text?: string }).generated_text?.trim();
      if (caption) {
        logger.info(`${label} caption generated`, { caption: caption.slice(0, 120) });
        return caption;
      }
    }

    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      const errMsg = typeof p.error === 'string' ? p.error : '';
      const estimatedSec = typeof p.estimated_time === 'number' ? p.estimated_time : 20;

      // Still loading despite warmup step (race condition) — wait and retry
      const isLoading =
        errMsg.toLowerCase().includes('loading') ||
        errMsg.toLowerCase().includes('currently') ||
        res.status === 503;
      if (isLoading && attempt < maxAttempts) {
        const wait = Math.max(estimatedSec * 1000 + 3_000, 15_000);
        logger.warn(`${label} model still loading – waiting ${(wait / 1000).toFixed(0)}s`, { attempt });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (errMsg) throw new Error(`${label} error: ${errMsg}`);
    }

    throw new Error(`${label}: unexpected response (${res.status}): ${res.text.slice(0, 300)}`);
  }
  throw new Error(`${label}: inference failed after ${maxAttempts} attempts.`);
}

/**
 * Full pipeline for one HF captioning model:
 *   loadHFModel()  → like `from_pretrained()` in Python
 *   runHFInference() → like `model.generate()` + `tokenizer.decode()` in Python
 */
async function captionWithHFModel(
  modelUrl: string,
  token: string,
  imageBuffer: ArrayBuffer,
  label: string
): Promise<string> {
  await loadHFModel(modelUrl, token);
  return runHFInference(modelUrl, token, imageBuffer, label);
}

async function generateWithHuggingFaceBLIP(imageUrls: string[] | undefined): Promise<string> {
  const token =
    process.env.HF_API_TOKEN ||
    process.env.HUGGINGFACE_API_TOKEN ||
    process.env.HUGGINGFACEHUB_API_TOKEN;
  if (!token) throw new Error('HF_API_TOKEN is missing. Set HF_API_TOKEN in your .env file.');

  const firstImageUrl = imageUrls?.[0];
  if (!firstImageUrl) {
    throw new Error(
      'Hugging Face BLIP requires at least one image input. ' +
      'Connect an image node to the "images" handle.'
    );
  }

  // Download the image (equivalent to PIL.Image.open + requests.get in Python)
  logger.info('Downloading image', { url: firstImageUrl.slice(0, 100) });
  const imgRes = await fetchBinary(
    firstImageUrl,
    { method: 'GET' },
    { retries: 3, timeoutMs: 30_000, delayMs: 1_000 }
  );
  if (!imgRes.ok) throw new Error(`Failed to download input image (HTTP ${imgRes.status}).`);

  const bytes = imgRes.buffer.byteLength;
  logger.info('Image downloaded', { bytes, mb: (bytes / 1024 / 1024).toFixed(2) });
  if (bytes > HF_MAX_BYTES) {
    logger.warn(`Image is ${(bytes / 1024 / 1024).toFixed(1)} MB — consider resizing to < 2 MB for best reliability.`);
  }

  // Try primary (BLIP) → auto-fallback to vit-gpt2 if it fails
  try {
    return await captionWithHFModel(HF_BLIP_URL, token, imgRes.buffer, 'HF BLIP');
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    logger.warn('BLIP failed — falling back to vit-gpt2', { error: primaryMsg });
    try {
      return await captionWithHFModel(HF_FALLBACK_URL, token, imgRes.buffer, 'HF vit-gpt2');
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `Both HF captioning models failed.\n  BLIP: ${primaryMsg}\n  vit-gpt2: ${fallbackMsg}`
      );
    }
  }
}

export const llmNodeTask = task({
  id: 'llm-node',
  maxDuration: 300,
  run: async (payload: LLMNodePayload) => {
    const { executionId, model, systemPrompt, userMessage, imageUrls } = payload;
    const startTime = Date.now();

    logger.info('LLM node executing', { model, hasSystem: !!systemPrompt, imageCount: imageUrls?.length });

    try {
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'RUNNING', inputs: { model, systemPrompt, userMessage, imageUrls } },
      });

      let modelToUse = model || 'openai:gpt-4o-mini';
      const known =
        (OLLAMA_MODELS      as readonly string[]).includes(modelToUse) ||
        (GEMINI_MODELS      as readonly string[]).includes(modelToUse) ||
        (OPENAI_MODELS      as readonly string[]).includes(modelToUse) ||
        (HUGGINGFACE_MODELS as readonly string[]).includes(modelToUse) ||
        (LOCAL_MODELS       as readonly string[]).includes(modelToUse) ||
        isOllamaModel(modelToUse) ||
        isOpenAIModel(modelToUse) ||
        isHuggingFaceModel(modelToUse) ||
        isLocalModel(modelToUse);
      if (!known) {
        logger.warn(`Unknown model "${modelToUse}", falling back to openai:gpt-4o-mini`);
        modelToUse = 'openai:gpt-4o-mini';
      }

      let output: string;
      if (isLocalModel(modelToUse)) {
        // Runs against local Python FastAPI server — no API key needed, no cold start
        output = await generateWithLocalModel(imageUrls);
      } else if (isOpenAIModel(modelToUse)) {
        output = await generateWithOpenAI(modelToUse, systemPrompt, userMessage, imageUrls);
      } else if (isHuggingFaceModel(modelToUse)) {
        output = await generateWithHuggingFaceBLIP(imageUrls);
      } else if (isOllamaModel(modelToUse)) {
        const { ollamaImages } = await loadImageParts(imageUrls);
        output = await generateWithOllama(modelToUse, systemPrompt, userMessage, ollamaImages);
      } else {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY is missing. Use an OpenAI/HF model or set GEMINI_API_KEY.');
        }
        const { geminiParts } = await loadImageParts(imageUrls);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const parts: Part[] = [...geminiParts, { text: userMessage }];
        output = await generateWithGeminiRetry(genAI, modelToUse, systemPrompt, parts);
      }

      const duration = Date.now() - startTime;
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'SUCCESS', outputs: { output }, duration },
      });

      logger.info('LLM node completed', { duration, outputLength: output.length });
      return { output };

    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('LLM node failed', { message });
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'FAILED', error: message, duration },
      });
      throw error;
    }
  },
});
