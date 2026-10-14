import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowUpDown, Pencil, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { applyGeometricOp, release } from '@/lib/image-processing/canvas-ops';
import { ASPECTS, aspectRatio, type AspectChoice } from '@/lib/image-processing/aspects';
import { roundRect } from '@/lib/image-processing/crop-math';
import { centeredAspectRect, rotatedBounds } from '@/lib/image-processing/geometry';
import type { ImageOperation, Rect } from '@/lib/image-processing/types';
import { acceptedImageFormats } from '@/lib/media/capabilities';
import { FORMATS } from '@/lib/media/formats';
import { useHandoff } from '@/stores/handoff';
import { Alert, Button, Card, NumberInput, Select, Slider } from '@/components/ui/primitives';
import { Cropper } from '@/components/tool/Cropper';
import { ErrorAlert } from '@/components/tool/ErrorAlert';
import { FileInfo } from '@/components/tool/FileInfo';
import { ProgressBar } from '@/components/tool/ProgressBar';
import { ResultCard } from '@/components/tool/ResultCard';
import { ToolLayout } from '@/components/tool/ToolLayout';
import { UploadZone } from '@/components/tool/UploadZone';
import { DEFAULT_ENCODE, EncodeFields, toEncodeSettings, transparencyWarning, type EncodeFormSettings } from './EncodeFields';
import { imageInfoRows } from './ImageToolShell';
import { useImageQueue } from './useImageQueue';

interface CropSettings extends EncodeFormSettings {
  aspect: AspectChoice;
}

const DEFAULTS: CropSettings = { ...DEFAULT_ENCODE, aspect: 'free' };

export default function CropImagePage() {
  const tool = toolById('image-crop')!;
  const queue = useImageQueue({ multiple: false, operation: 'cropped' });
  const [s, update] = usePersistentSettings('image-crop', DEFAULTS);
  const item = queue.items[0];
  const probe = item?.probe;
  const take = useHandoff((st) => st.take);
  const { add } = queue;

  const [rot90, setRot90] = useState(0);
  const [fine, setFine] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  // Selection is stored together with the frame/aspect it belongs to; when those change it resets to the default.
  const [stored, setStored] = useState<{ key: string; rect: Rect } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sourceBitmap, setSourceBitmap] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    const handed = take();
    if (handed) add([handed]);
  }, [add, take]);

  const degrees = rot90 + fine;
  const frame = useMemo(() => (probe ? rotatedBounds(probe.width, probe.height, degrees) : { width: 1, height: 1 }), [probe, degrees]);
  const ratio = aspectRatio(s.aspect, frame);

  const selectionKey = `${item?.id}|${frame.width}x${frame.height}|${ratio ?? 'free'}`;
  const rect = stored?.key === selectionKey ? stored.rect : ratio ? centeredAspectRect(frame, ratio) : { x: 0, y: 0, width: frame.width, height: frame.height };
  const setRect = (next: Rect) => setStored({ key: selectionKey, rect: next });

  // Decode the preview once, then draw it rotated/flipped for the cropper.
  useEffect(() => {
    if (!item?.preview) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void fetch(item.preview.url)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .then((bm) => {
        if (cancelled) bm.close();
        else {
          bitmap = bm;
          setSourceBitmap(bm);
        }
      });
    return () => {
      cancelled = true;
      bitmap?.close();
      setSourceBitmap(null);
    };
  }, [item?.preview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceBitmap) return;
    let current: OffscreenCanvas | null = null;
    if (degrees !== 0) current = applyGeometricOp(sourceBitmap, { type: 'rotate', degrees, background: s.background });
    if (flipH || flipV) {
      const flipped = applyGeometricOp(current ?? sourceBitmap, { type: 'flip', horizontal: flipH, vertical: flipV });
      if (current) release(current);
      current = flipped;
    }
    const src = current ?? sourceBitmap;
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')?.drawImage(src, 0, 0);
    if (current) release(current);
  }, [sourceBitmap, degrees, flipH, flipV, s.background]);

  const rounded = roundRect(rect, frame.width, frame.height);
  const setField = (key: keyof Rect, v: number | '') => {
    if (v === '') return;
    setRect(roundRect({ ...rounded, [key]: v }, frame.width, frame.height));
  };

  const resetAll = () => {
    setRot90(0);
    setFine(0);
    setFlipH(false);
    setFlipV(false);
    update({ aspect: 'free' });
    setStored(null);
  };

  const apply = () => {
    if (!item) return;
    const ops: ImageOperation[] = [];
    if (degrees % 360 !== 0) ops.push({ type: 'rotate', degrees, background: s.background });
    if (flipH || flipV) ops.push({ type: 'flip', horizontal: flipH, vertical: flipV });
    ops.push({ type: 'crop', rect: rounded });
    void queue.run((it) => ({ file: it.file, ops, encode: toEncodeSettings(s, it.probe!) }));
  };

  const processing = item?.status === 'processing';

  const aside = item && probe && !item.result && (
    <>
      <Card className="flex flex-col gap-5">
        <h2 className="font-semibold">Crop</h2>
        <Select<AspectChoice> label="Aspect ratio" value={s.aspect} onChange={(aspect) => update({ aspect })} options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))} />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="X" suffix="px" value={rounded.x} min={0} max={frame.width - 1} onChange={(v) => setField('x', v)} />
          <NumberInput label="Y" suffix="px" value={rounded.y} min={0} max={frame.height - 1} onChange={(v) => setField('y', v)} />
          <NumberInput
            label="Width"
            suffix="px"
            value={rounded.width}
            min={1}
            max={frame.width}
            onChange={(v) => v !== '' && setRect(roundRect(ratio ? { ...rounded, width: v, height: v / ratio } : { ...rounded, width: v }, frame.width, frame.height))}
          />
          <NumberInput
            label="Height"
            suffix="px"
            value={rounded.height}
            min={1}
            max={frame.height}
            onChange={(v) => v !== '' && setRect(roundRect(ratio ? { ...rounded, height: v, width: v * ratio } : { ...rounded, height: v }, frame.width, frame.height))}
          />
        </div>
        <p className="text-xs text-muted">Coordinates are in full-resolution pixels of the {frame.width} × {frame.height} image.</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Rotate & flip</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setRot90((r) => (r + 270) % 360)} icon={<RotateCcw className="size-4" aria-hidden />} aria-label="Rotate left 90°" />
            <Button size="sm" onClick={() => setRot90((r) => (r + 90) % 360)} icon={<RotateCw className="size-4" aria-hidden />} aria-label="Rotate right 90°" />
            <Button size="sm" aria-pressed={flipH} variant={flipH ? 'primary' : 'secondary'} onClick={() => setFlipH((v) => !v)} icon={<ArrowLeftRight className="size-4" aria-hidden />}>
              Flip H
            </Button>
            <Button size="sm" aria-pressed={flipV} variant={flipV ? 'primary' : 'secondary'} onClick={() => setFlipV((v) => !v)} icon={<ArrowUpDown className="size-4" aria-hidden />}>
              Flip V
            </Button>
          </div>
        </div>
        <Slider label="Straighten" value={fine} min={-45} max={45} step={0.5} onChange={setFine} format={(v) => `${v}°`} hint="Corners are filled with the background colour." />
      </Card>
      <Card className="flex flex-col gap-5">
        <h2 className="font-semibold">Output</h2>
        <EncodeFields value={s} onChange={update} probe={probe} />
      </Card>
      <Card className="flex flex-col gap-3">
        {processing ? (
          <Button variant="danger" size="lg" onClick={() => queue.cancel()} icon={<X className="size-5" aria-hidden />}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={apply} data-testid="process">
            Apply crop
          </Button>
        )}
        <Button onClick={resetAll} disabled={processing} icon={<Undo2 className="size-4" aria-hidden />}>
          Reset
        </Button>
      </Card>
    </>
  );

  return (
    <ToolLayout tool={tool} aside={aside || undefined}>
      {!item && <UploadZone accept={acceptedImageFormats()} onFiles={add} allowPaste />}
      {item && (
        <Card className="flex flex-col gap-4">
          <FileInfo
            title={item.file.name}
            rows={imageInfoRows(item)}
            actions={
              <Button size="sm" variant="ghost" onClick={queue.clear} disabled={processing} icon={<RotateCcw className="size-4" aria-hidden />}>
                Start over
              </Button>
            }
          />
          {item.status === 'checking' && <ProgressBar fraction={null} label="Reading image" />}
          {item.error && <ErrorAlert error={item.error} action={!item.probe && <Button onClick={queue.clear}>Choose another file</Button>} />}
          {transparencyWarning(s, item).map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          {probe && !item.result && (
            <div className="checkerboard mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border">
              <Cropper width={frame.width} height={frame.height} value={rect} onChange={setRect} aspect={ratio}>
                <canvas ref={canvasRef} className="size-full" aria-label="Image being cropped" role="img" />
              </Cropper>
            </div>
          )}
          {processing && item.progress && <ProgressBar fraction={item.progress.fraction} label="Cropping" />}
        </Card>
      )}
      {item?.result && (
        <ResultCard
          blob={item.result.blob}
          filename={item.result.filename}
          originalFile={item.file}
          resultKind="image"
          currentToolId={tool.id}
          notes={item.result.notes}
          details={[
            { label: 'Format', value: FORMATS[item.result.format].label },
            { label: 'Dimensions', value: `${item.result.width} × ${item.result.height} px` },
          ]}
        >
          <div className="checkerboard flex justify-center overflow-hidden rounded-lg border border-border">
            <img src={item.result.url} alt="Cropped result" className="max-h-[60vh] object-contain" data-testid="result-image" />
          </div>
          <Button onClick={() => queue.discardResult(item.id)} icon={<Pencil className="size-4" aria-hidden />}>
            Edit again
          </Button>
        </ResultCard>
      )}
    </ToolLayout>
  );
}
