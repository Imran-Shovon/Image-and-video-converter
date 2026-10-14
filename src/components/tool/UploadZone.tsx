import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Film, Plus } from 'lucide-react';
import { FORMATS, type FormatId } from '@/lib/media/formats';
import { cx } from '@/components/ui/primitives';

export interface UploadZoneProps {
  accept: readonly FormatId[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  /** Enable Ctrl/Cmd+V paste of images from the clipboard. */
  allowPaste?: boolean;
  title?: string;
  compact?: boolean;
  disabled?: boolean;
  simplified?: boolean;
}

export function acceptAttribute(formats: readonly FormatId[]): string {
  const parts = new Set<string>();
  for (const id of formats) {
    const f = FORMATS[id];
    parts.add(f.mime.split(';')[0]!);
    for (const ext of f.extensions) parts.add(`.${ext}`);
  }
  return [...parts].join(',');
}

export function UploadZone({
  accept,
  multiple = false,
  onFiles,
  allowPaste = false,
  title,
  compact = false,
  disabled,
  simplified = false,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descId = useId();
  const labels = [...new Set(accept.map((id) => FORMATS[id].label))];

  const emit = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || disabled) return;
      const files = Array.from(list);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  useEffect(() => {
    if (!allowPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        emit(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [allowPaste, disabled, emit]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        emit(e.dataTransfer.files);
      }}
      className={cx(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'p-4' : 'px-4 py-10 sm:py-14',
        dragging ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
        disabled && 'opacity-60',
        simplified && 'upload-zone-main',
      )}
      data-testid="upload-zone"
    >
      {simplified ? (
        <div className="upload-illustration" aria-hidden>
          <span>
            <ImageIcon className="size-7" />
          </span>
          <span>
            <Film className="size-7" />
          </span>
          <i>
            <Plus className="size-3.5" />
          </i>
        </div>
      ) : (
        !compact && (
          <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Upload className="size-6" aria-hidden />
          </div>
        )
      )}
      <div className="flex flex-col gap-1">
        <p className={cx('font-semibold', compact ? 'text-sm' : 'text-lg')}>
          {title ?? (multiple ? 'Drop files here' : 'Drop a file here')}
        </p>
        <p id={descId} className="text-sm text-muted">
          {simplified ? 'or choose a file from your device' : labels.join(', ')}
          {allowPaste && !simplified && ' · or paste with Ctrl/Cmd+V'}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby={descId}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-accent-fg shadow-sm hover:bg-accent-hover disabled:opacity-50"
      >
        <Upload className="size-4" aria-hidden /> {multiple ? 'Choose files' : 'Choose file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={acceptAttribute(accept)}
        multiple={multiple}
        data-testid="file-input"
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = '';
        }}
      />
      {!compact && (
        <p className="text-xs text-muted">
          {simplified
            ? 'Images & videos · You can also paste with Ctrl/Cmd+V'
            : 'Files are processed on your device and never uploaded.'}
        </p>
      )}
    </div>
  );
}
