"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.78;

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Multi-image field: upload files and/or paste URLs (one per line under the hood).
 */
export function ImageUrlListField({
  label = "Images",
  value,
  onChange,
  className,
  maxImages = 8,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  maxImages?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const urls = parseLines(value);

  function write(next: string[]) {
    onChange(next.join("\n"));
  }

  function removeAt(index: number) {
    write(urls.filter((_, i) => i !== index));
  }

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (urls.length >= maxImages) {
      setError(`Maximum ${maxImages} images`);
      return;
    }
    write([...urls, u]);
    setUrlDraft("");
    setError("");
  }

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const next = [...urls];
      for (const file of Array.from(files)) {
        if (next.length >= maxImages) break;
        if (!file.type.startsWith("image/")) {
          setError("Only image files are allowed (JPG, PNG, WebP)");
          continue;
        }
        if (file.size > MAX_FILE_BYTES * 3) {
          setError("Image too large (max ~2MB after compress)");
          continue;
        }
        const dataUrl = await fileToCompressedDataUrl(file);
        next.push(dataUrl);
      }
      write(next);
    } catch {
      setError("Could not process image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || urls.length >= maxImages}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
          {busy ? "Uploading…" : "Upload images"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => void onFilesSelected(e.target.files)}
        />
        <p className="text-[11px] text-muted-foreground self-center">
          JPG/PNG · auto-compressed · max {maxImages}
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="Or paste image URL…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={addUrl} disabled={!urlDraft.trim()}>
          <Link2 className="w-3.5 h-3.5 mr-1" />
          Add URL
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {urls.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {urls.map((src, i) => (
            <div key={`${i}-${src.slice(0, 24)}`} className="relative rounded-lg border overflow-hidden bg-muted aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-1 right-1 h-7 w-7"
                onClick={() => removeAt(i)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No images yet — upload or paste a URL.</p>
      )}
    </div>
  );
}
