'use client';

import { useCallback, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';

interface CaptionResult {
  caption: string;
  elapsed_ms?: number;
}

export default function ImageCaptioner() {
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<CaptionResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────────────

  const pickFile = useCallback((picked: File | null) => {
    if (!picked) return;
    if (!picked.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP, …)');
      return;
    }
    if (picked.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10 MB');
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    setResult(null);
    setError(null);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    pickFile(e.target.files?.[0] ?? null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      pickFile(e.dataTransfer.files[0] ?? null);
    },
    [pickFile]
  );

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const generate = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/caption', { method: 'POST', body });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? data.detail ?? `Server error ${res.status}`);
        return;
      }
      setResult(data as CaptionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — is the dev server running?');
    } finally {
      setLoading(false);
    }
  };

  // ── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: '#0A0A0A' }}>

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#A855F7,#7C3AED)' }}>
            <Sparkles size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: '#F0F0F0' }}>
            Image Captioner
          </h1>
        </div>
        <p style={{ fontSize: 13, color: '#666' }}>
          Powered by <code style={{ color: '#A855F7', fontSize: 12 }}>ydshieh/vit-gpt2-coco-en</code> running locally
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#111', border: '1px solid #272727' }}>

        {/* Drop zone / Preview */}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !preview && inputRef.current?.click()}
          className="relative flex items-center justify-center cursor-pointer transition-colors"
          style={{
            minHeight: 220,
            background: preview ? 'transparent' : '#0D0D0D',
            borderBottom: '1px solid #272727',
          }}
        >
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="preview"
                className="w-full object-contain"
                style={{ maxHeight: 320 }}
              />
              <button
                onClick={e => { e.stopPropagation(); clearImage(); }}
                className="absolute top-3 right-3 flex items-center justify-center w-7 h-7 rounded-full"
                style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #444' }}
              >
                <X size={13} style={{ color: '#ccc' }} />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3" style={{ color: '#444' }}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: '#181818', border: '1px dashed #333' }}>
                <ImageIcon size={24} style={{ color: '#555' }} />
              </div>
              <div className="text-center">
                <p style={{ fontSize: 13, color: '#777' }}>
                  Drop an image here or <span style={{ color: '#A855F7' }}>browse</span>
                </p>
                <p style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                  JPEG, PNG, WebP — max 10 MB
                </p>
              </div>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onInputChange}
          className="hidden"
        />

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">

          {/* File info */}
          {file && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: '#0D0D0D', border: '1px solid #1E1E1E' }}>
              <Upload size={12} style={{ color: '#666', flexShrink: 0 }} />
              <span className="truncate" style={{ fontSize: 12, color: '#888' }}>{file.name}</span>
              <span className="ml-auto shrink-0" style={{ fontSize: 11, color: '#444' }}>
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={!file || loading}
            className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 font-medium transition-all"
            style={{
              fontSize: 13,
              background: !file || loading ? '#1A1A1A' : 'linear-gradient(135deg,#A855F7,#7C3AED)',
              color: !file || loading ? '#444' : '#fff',
              cursor: !file || loading ? 'not-allowed' : 'pointer',
              border: '1px solid',
              borderColor: !file || loading ? '#272727' : 'transparent',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating caption…
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate Caption
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-lg px-4 py-3"
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 12, color: '#EF4444', lineHeight: 1.6,
              }}>
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(168,85,247,0.3)' }}>
              <div className="px-4 py-2 flex items-center gap-2"
                style={{ background: 'rgba(168,85,247,0.1)', borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
                <Sparkles size={11} style={{ color: '#A855F7' }} />
                <span style={{ fontSize: 11, color: '#A855F7', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Caption
                </span>
                {result.elapsed_ms !== undefined && (
                  <span className="ml-auto" style={{ fontSize: 10, color: '#555' }}>
                    {result.elapsed_ms} ms
                  </span>
                )}
              </div>
              <div className="px-4 py-4"
                style={{ background: '#0D0D0D', fontSize: 14, color: '#E0E0E0', lineHeight: 1.7 }}>
                {result.caption}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Setup hint */}
      <p className="mt-6 text-center" style={{ fontSize: 11, color: '#333', maxWidth: 420 }}>
        Python server must be running locally.&nbsp;
        <code style={{ color: '#555', fontSize: 11 }}>pip install -r requirements.txt && python app.py</code>
      </p>
    </div>
  );
}
