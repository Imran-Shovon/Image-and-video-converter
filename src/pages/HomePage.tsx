import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { availableTools, toolsForKind, type ToolInfo } from '@/features/tools';
import {
  acceptedImageFormats,
  acceptedVideoFormats,
  advertisedAudioOutputs,
  advertisedImageInputs,
  advertisedImageOutputs,
  advertisedVideoInputs,
  advertisedVideoOutputs,
} from '@/lib/media/capabilities';
import { toMediaError, type MediaError } from '@/lib/media/errors';
import { FORMATS, type FormatId } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { formatBytes } from '@/lib/media/sizes';
import { validateFile, type ValidatedFile } from '@/lib/media/validate';
import { useHandoff } from '@/stores/handoff';
import { Badge, Card } from '@/components/ui/primitives';
import { ErrorAlert } from '@/components/tool/ErrorAlert';
import { UploadZone } from '@/components/tool/UploadZone';

function ToolCard({ tool, onClick }: { tool: ToolInfo; onClick?: () => void }) {
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <tool.icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{tool.title}</span>
        <span className="text-sm text-muted">{tool.short}</span>
      </span>
      <ArrowRight className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  const cls = 'group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/60 hover:bg-surface-2';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  ) : (
    <Link to={tool.path} className={cls}>
      {content}
    </Link>
  );
}

const unique = (ids: FormatId[]) => [...new Set(ids.map((id) => FORMATS[id].label))];

export default function HomePage() {
  const navigate = useNavigate();
  const give = useHandoff((s) => s.give);
  const [detected, setDetected] = useState<ValidatedFile | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const tools = availableTools();
  const limits = getLimits();
  const accept = useMemo(() => [...acceptedImageFormats(), ...acceptedVideoFormats()], []);

  useEffect(() => {
    document.title = 'Media Toolkit — Image & Video Converter, Compressor and Editor';
  }, []);

  const onFiles = async (files: File[]) => {
    setError(null);
    setDetected(null);
    try {
      setDetected(await validateFile(files[0]!, { accept, limits }));
    } catch (e) {
      setError(toMediaError(e));
    }
  };

  const openWith = (tool: ToolInfo) => {
    if (detected) give(detected.file, 'home');
    navigate(tool.path);
  };

  const suggestions = detected ? toolsForKind(detected.kind) : [];
  const faq = [
    {
      q: 'Are my files uploaded anywhere?',
      a: 'No. Every tool runs inside your browser using WebAssembly and your device’s built-in encoders. Files never leave your device, and nothing is stored after you close the tab.',
    },
    {
      q: 'Which formats are supported?',
      a: `Images: ${unique(advertisedImageInputs().map((c) => c.format)).join(', ')} in; ${unique(advertisedImageOutputs().map((c) => c.format)).join(', ')} out. Videos: ${unique(
        advertisedVideoInputs().map((c) => c.format),
      ).join(', ')} in; ${advertisedVideoOutputs()
        .map((c) => c.label)
        .join(', ')} out. Audio: ${unique(advertisedAudioOutputs().map((c) => c.format)).join(', ')}.`,
    },
    {
      q: 'How large can files be?',
      a: `On this device: images up to ${formatBytes(limits.imageBytes)} and ${(limits.imagePixels / 1e6).toFixed(0)} megapixels; videos up to ${formatBytes(limits.videoBytes)} and ${Math.round(
        limits.videoSeconds / 60,
      )} minutes. Phones and tablets have lower limits because they have less memory.`,
    },
    {
      q: 'Why is video processing slower than desktop apps?',
      a: 'Video encoding runs in WebAssembly inside your browser, which is several times slower than native software. Where your browser supports hardware encoding (WebCodecs), it is used automatically.',
    },
    {
      q: 'Is my photo’s location data kept?',
      a: 'No. Metadata such as GPS location and camera details is removed when an image is re-encoded, which protects your privacy.',
    },
  ];

  return (
    <div className="flex flex-col gap-16 pb-8">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge tone="success" className="w-fit">
              <ShieldCheck className="size-3.5" aria-hidden /> Private by design — nothing is uploaded
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Convert, compress and edit images & videos in your browser</h1>
            <p className="text-lg text-muted">
              Fast, free tools for everyday media tasks. Drop a file to get started — we’ll suggest the right tool.
            </p>
          </div>
          <UploadZone accept={accept} onFiles={onFiles} title="Drop an image or video" allowPaste />
          {error && <ErrorAlert error={error} />}
          {detected && (
            <Card className="flex flex-col gap-3" aria-live="polite">
              <p className="font-semibold">
                {detected.file.name} — {FORMATS[detected.format].label} {detected.kind}, {formatBytes(detected.file.size)}. What would you like to do?
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((t) => (
                  <ToolCard key={t.id} tool={t} onClick={() => openWith(t)} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6" aria-labelledby="popular">
        <h2 id="popular" className="text-2xl font-bold tracking-tight">
          Popular tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools
            .filter((t) => t.popular)
            .map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2">
        {(['image', 'video'] as const).map((kind) => (
          <div key={kind} className="flex flex-col gap-4" aria-labelledby={`${kind}-tools`}>
            <h2 id={`${kind}-tools`} className="text-2xl font-bold tracking-tight">
              {kind === 'image' ? 'Image tools' : 'Video tools'}
            </h2>
            <div className="grid gap-3">
              {tools
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4" aria-label="Features">
        {[
          { icon: Lock, title: 'Private', text: 'Processing happens on your device. No uploads, no accounts, no tracking.' },
          { icon: Zap, title: 'Fast', text: 'Hardware-accelerated video encoding where your browser supports it.' },
          { icon: Sparkles, title: 'Easy', text: 'Sensible presets, live previews and before/after comparison.' },
          {
            icon: ShieldCheck,
            title: 'Honest results',
            text: 'Every output is verified before download, and real sizes are always shown.',
          },
        ].map((f) => (
          <Card key={f.title} as="div" className="flex flex-col gap-2">
            <f.icon className="size-6 text-accent" aria-hidden />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-muted">{f.text}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="flex flex-col gap-2">
          {faq.map((item) => (
            <details key={item.q} className="group rounded-xl border border-border bg-surface p-4">
              <summary className="flex min-h-6 cursor-pointer items-center justify-between font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="text-sm text-muted">
          See the full list of <Link to="/formats" className="text-accent underline underline-offset-2">supported formats</Link> and{' '}
          <Link to="/browser-support" className="text-accent underline underline-offset-2">
            browser limitations
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
