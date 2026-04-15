"""
NextFlow — Image Caption Server
================================
Loads `ydshieh/vit-gpt2-coco-en` ONCE at startup and serves it over HTTP.

Swagger UI  → http://127.0.0.1:8000/docs
ReDoc       → http://127.0.0.1:8000/redoc
OpenAPI JSON→ http://127.0.0.1:8000/openapi.json

Start:
    source .venv/bin/activate
    python app.py
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import Optional

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from transformers import AutoTokenizer, VisionEncoderDecoderModel, ViTImageProcessor

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger(__name__)
load_dotenv()

# ─── Load model ONCE at startup ────────────────────────────────────────────────
# Mirrors Python notebook pattern:
#   model       = VisionEncoderDecoderModel.from_pretrained(MODEL_ID)
#   extractor   = ViTImageProcessor.from_pretrained(MODEL_ID)
#   tokenizer   = AutoTokenizer.from_pretrained(MODEL_ID)
#
# All three objects are module-level globals.  FastAPI serves every request
# with the same in-memory model — no reload overhead per request.

MODEL_ID = os.getenv("CAPTION_MODEL_ID", "ydshieh/vit-gpt2-coco-en")
FALLBACK_CAPTION = "an image"
MODEL_LOAD_ERROR: Optional[str] = None

log.info("Loading model %s …", MODEL_ID)
t0 = time.time()

feature_extractor: Optional[ViTImageProcessor] = None
tokenizer: Optional[AutoTokenizer] = None
model: Optional[VisionEncoderDecoderModel] = None

try:
    feature_extractor = ViTImageProcessor.from_pretrained(MODEL_ID)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID)

    model.eval()     # disable dropout / batchnorm training mode
    model.to("cpu")  # explicit CPU — no GPU required
    log.info("Model ready in %.1f s", time.time() - t0)
except Exception as exc:
    MODEL_LOAD_ERROR = str(exc)
    log.exception("Model failed to load. Falling back to lightweight caption mode")


# ─── Pydantic response/error models ────────────────────────────────────────────

class CaptionResponse(BaseModel):
    """Successful caption result."""
    caption: str = Field(
        ...,
        description="Generated image caption text.",
        examples=["a group of people standing in front of a building"],
    )
    elapsed_ms: int = Field(
        ...,
        description="Time taken for preprocessing + generation in milliseconds.",
        examples=[2340],
    )

class HealthResponse(BaseModel):
    """Server health check result."""
    status: str = Field("ok", description="`ok` when model is loaded, `degraded` when fallback mode is active.")
    model: str = Field(..., description="Hugging Face model ID currently loaded.", examples=[MODEL_ID])
    device: str = Field(..., description="PyTorch device the model runs on.", examples=["cpu"])
    fallback: bool = Field(False, description="True when model failed to load and fallback captioning is active.")
    detail: Optional[str] = Field(None, description="Optional model load error detail when in fallback mode.")

class ErrorResponse(BaseModel):
    """HTTP error detail."""
    detail: str = Field(..., description="Human-readable error message.")


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="NextFlow — Image Caption API",
    description="""
## Overview
Local Python FastAPI server that powers the **`local:vit-gpt2-coco-en`** LLM node
inside the NextFlow visual workflow builder.

The model (`ydshieh/vit-gpt2-coco-en`) is a **ViT + GPT-2** vision-encoder-decoder
fine-tuned on the COCO captions dataset. It generates short, accurate English captions
for any image in **2–5 seconds on CPU**.

## Model loading
The model is loaded **once** at server startup (globally, outside any request handler).
This mirrors the Python notebook pattern:

```python
model       = VisionEncoderDecoderModel.from_pretrained("ydshieh/vit-gpt2-coco-en")
extractor   = ViTImageProcessor.from_pretrained("ydshieh/vit-gpt2-coco-en")
tokenizer   = AutoTokenizer.from_pretrained("ydshieh/vit-gpt2-coco-en")
```

First startup downloads ~957 MB of weights (3–5 min).  
Subsequent startups load from the HuggingFace local cache (~4 s).

## Usage from NextFlow
This server is called automatically when the **LLM node** has
`local:vit-gpt2-coco-en` selected and an image connected to its `images` handle.

The Next.js route `/api/caption` proxies the request here.

## Direct usage
```bash
curl -X POST http://127.0.0.1:8000/caption \\
  -F "file=@/path/to/image.jpg"
```
    """,
    version="1.0.0",
    contact={
        "name": "NextFlow",
        "url": "http://localhost:3000",
    },
    license_info={
        "name": "Private",
    },
    openapi_tags=[
        {
            "name": "inference",
            "description": "Image captioning endpoints — send an image, receive a caption.",
        },
        {
            "name": "health",
            "description": "Server and model health checks.",
        },
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    tags=["health"],
    summary="Server health check",
    description="Returns `{ status: 'ok' }` plus the loaded model ID and device. "
                "Use this to confirm the server and model are ready before sending images.",
    response_model=HealthResponse,
    responses={200: {"description": "Server is healthy and model is loaded."}},
)
def health() -> HealthResponse:
    if model is None:
        return HealthResponse(
            status="degraded",
            model=MODEL_ID,
            device="none",
            fallback=True,
            detail=MODEL_LOAD_ERROR,
        )

    return HealthResponse(
        status="ok",
        model=MODEL_ID,
        device=str(next(model.parameters()).device),
        fallback=False,
    )


@app.post(
    "/caption",
    tags=["inference"],
    summary="Generate image caption",
    description="""
Accept a single image uploaded as **multipart/form-data** (field name `file`) and
return a short English caption generated by `ydshieh/vit-gpt2-coco-en`.

### Pipeline (mirrors the Python notebook)
1. **Read bytes** — `await file.read()`
2. **Decode image** — `PIL.Image.open(bytes).convert("RGB")`
3. **Preprocess** — `feature_extractor(images=image, return_tensors="pt")` → `pixel_values`
4. **Generate** — `model.generate(pixel_values, max_length=16, num_beams=4)`
5. **Decode** — `tokenizer.decode(output_ids[0], skip_special_tokens=True)`
6. **Return** — `{ caption, elapsed_ms }`

### Accepted image formats
JPEG, PNG, WebP, GIF, BMP — anything PIL can open.

### Size limit
10 MB hard limit. Images over ~2 MB may take longer; consider resizing beforehand.
    """,
    response_model=CaptionResponse,
    responses={
        200: {
            "description": "Caption generated successfully.",
            "content": {
                "application/json": {
                    "example": {
                        "caption": "a group of people standing in front of a building",
                        "elapsed_ms": 2340,
                    }
                }
            },
        },
        400: {"description": "Bad request (missing file field)."},
        413: {"description": "Payload too large — image exceeds 10 MB."},
        415: {
            "description": "Unsupported media type — file must be an image.",
            "content": {
                "application/json": {
                    "example": {"detail": "Expected an image file, got 'text/plain'"}
                }
            },
        },
        422: {"description": "Image could not be decoded by PIL."},
        500: {"description": "Internal model inference error."},
    },
)
async def caption(
    file: UploadFile = File(
        ...,
        description="Image file to caption. "
                    "Accepted types: image/jpeg, image/png, image/webp, image/gif, application/octet-stream. "
                    "Max size: 10 MB.",
    ),
) -> CaptionResponse:
    # ── Validate content-type ──────────────────────────────────────────────────
    ct = file.content_type or ""
    # Accept image/* or raw octet-stream (some HTTP proxies strip the MIME type)
    if ct and not ct.startswith("image/") and ct != "application/octet-stream":
        raise HTTPException(
            status_code=415,
            detail=f"Expected an image file, got {ct!r}. "
                   "Send the file as multipart/form-data with content-type image/jpeg, "
                   "image/png, image/webp, or application/octet-stream.",
        )

    # ── Read bytes ─────────────────────────────────────────────────────────────
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB).")

    # ── Decode image ───────────────────────────────────────────────────────────
    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot decode image: {exc}") from exc

    log.info(
        "Received image: size=%s  content_type=%s  bytes=%d",
        image.size,
        ct or "unknown",
        len(contents),
    )

    # ── Inference ──────────────────────────────────────────────────────────────
    # Equivalent to the notebook:
    #   pixel_values = feature_extractor(images=image, return_tensors="pt").pixel_values
    #   output_ids   = model.generate(pixel_values, max_length=16)
    #   caption      = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    t_start = time.time()

    try:
        if model is None or feature_extractor is None or tokenizer is None:
            # Keep the API usable in constrained-memory machines.
            caption_text = f"{FALLBACK_CAPTION} ({image.width}x{image.height})"
        else:
            pixel_values = feature_extractor(images=image, return_tensors="pt").pixel_values

            with torch.no_grad():
                output_ids = model.generate(
                    pixel_values,
                    max_length=12,
                    num_beams=5,
                    early_stopping=True,
                    no_repeat_ngram_size=2,
                    repetition_penalty=1.2,
                    length_penalty=1.0,
                )

            caption_text = tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()
    except Exception as exc:
        log.exception("Inference failed")
        raise HTTPException(status_code=500, detail=f"Model inference error: {exc}") from exc

    elapsed = round((time.time() - t_start) * 1000)
    log.info("Caption: %r  (%d ms)", caption_text, elapsed)

    return CaptionResponse(caption=caption_text, elapsed_ms=elapsed)


# ─── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=False,   # reload=True would re-load the 957 MB model on every file save
        log_level="info",
    )
