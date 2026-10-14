import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Image as ImageIcon,
  Film,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toolsForKind, type ToolInfo } from '@/features/tools';
import { acceptedImageFormats, acceptedVideoFormats } from '@/lib/media/capabilities';
import { toMediaError, type MediaError } from '@/lib/media/errors';
import { FORMATS } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { formatBytes } from '@/lib/media/sizes';
import { validateFile, type ValidatedFile } from '@/lib/media/validate';
import { useHandoff } from '@/stores/handoff';
import { Button } from '@/components/ui/primitives';
import { ErrorAlert } from '@/components/tool/ErrorAlert';
import { UploadZone } from '@/components/tool/UploadZone';
import { WorkflowSteps } from '@/components/tool/WorkflowSteps';

function FilePreview({ media }: { media: ValidatedFile }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const next = URL.createObjectURL(media.file);
    (imageRef.current ?? videoRef.current)?.setAttribute('src', next);
    return () => URL.revokeObjectURL(next);
  }, [media.file]);
  const Icon = media.kind === 'image' ? ImageIcon : Film;
  return (
    <div className="file-preview checkerboard">
      {failed ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-muted">
          <Icon className="size-10" aria-hidden />
          <p className="text-sm">Preview unavailable. Your file is ready to edit.</p>
        </div>
      ) : media.kind === 'image' ? (
        <img ref={imageRef} alt={`Preview of ${media.file.name}`} onError={() => setFailed(true)} />
      ) : (
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          aria-label={`Preview of ${media.file.name}`}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const give = useHandoff((s) => s.give);
  const take = useHandoff((s) => s.take);
  const [detected, setDetected] = useState<ValidatedFile | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  const choiceRef = useRef<HTMLHeadingElement>(null);
  const accept = useMemo(() => [...acceptedImageFormats(), ...acceptedVideoFormats()], []);
  const limits = useMemo(() => getLimits(), []);

  useEffect(() => {
    document.title = 'Media Toolkit — Image & Video Tools';
  }, []);
  useEffect(() => {
    if (detected) choiceRef.current?.focus({ preventScroll: true });
  }, [detected]);

  const onFiles = async (files: File[]) => {
    if (!files[0]) return;
    const id = ++request.current;
    setError(null);
    setChecking(true);
    try {
      const media = await validateFile(files[0], { accept, limits });
      if (id === request.current) setDetected(media);
    } catch (e) {
      if (id === request.current) setError(toMediaError(e));
    } finally {
      if (id === request.current) setChecking(false);
    }
  };

  useEffect(() => {
    const file = take();
    if (!file) return;
    const id = ++request.current;
    void validateFile(file, { accept, limits })
      .then((media) => {
        if (id === request.current) setDetected(media);
      })
      .catch((e: unknown) => {
        if (id === request.current) setError(toMediaError(e));
      });
  }, [accept, limits, take]);

  const openWith = (tool: ToolInfo) => {
    if (!detected) return;
    give(detected.file, 'home');
    navigate(tool.path);
  };

  return (
    <div className="home-page mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="home-intro">
        <p className="home-step-label">Step {detected ? '2' : '1'} of 3</p>
        <h1>{detected ? 'Choose an action for your file' : 'Upload an image or video'}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          {detected
            ? 'Select a tool below, adjust its settings, then download your finished file.'
            : 'Start with a file. Then choose to convert, compress, resize, or edit it.'}
        </p>
      </section>
      <div className="mx-auto max-w-4xl">
        <WorkflowSteps current={detected ? 2 : 1} />
        <section
          className="upload-workspace"
          aria-label={detected ? 'Choose an action for your file' : 'Upload your media'}
        >
          {!detected ? (
            <>
              <div className="workspace-caption">
                <span>Select a file to get started</span>
                <LockKeyhole className="size-4" aria-label="Private processing" />
              </div>
              <UploadZone
                accept={accept}
                onFiles={onFiles}
                title={checking ? 'Checking your file…' : 'Drop your image or video here'}
                allowPaste
                disabled={checking}
                simplified
              />
              <div className="upload-limits">
                <span>Images up to {formatBytes(limits.imageBytes)}</span>
                <span>Videos up to {formatBytes(limits.videoBytes)}</span>
              </div>
            </>
          ) : (
            <div className="selected-workspace">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="size-4" aria-hidden /> File ready
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="size-4" aria-hidden />}
                  onClick={() => {
                    ++request.current;
                    setDetected(null);
                    setError(null);
                    setChecking(false);
                  }}
                >
                  Choose another file
                </Button>
              </div>
              <div className="mt-6 grid gap-7 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="min-w-0">
                  <FilePreview media={detected} />
                  <p className="mt-4 break-all text-sm font-semibold">{detected.file.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {FORMATS[detected.format].label} {detected.kind},{' '}
                    {formatBytes(detected.file.size)}
                  </p>
                  {detected.header && (
                    <p className="mt-1 text-xs text-muted">
                      {detected.header.width} × {detected.header.height} px
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <h2
                    ref={choiceRef}
                    tabIndex={-1}
                    className="mb-1 text-xl font-semibold tracking-tight outline-none"
                  >
                    What would you like to do?
                  </h2>
                  <p className="mb-5 text-sm text-muted">Choose an action to see its settings.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {toolsForKind(detected.kind).map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => openWith(tool)}
                        className="action-tile group"
                      >
                        <tool.icon className="size-5 shrink-0 text-accent" aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{tool.title}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted">
                            {tool.short}
                          </span>
                        </span>
                        <ArrowRight
                          className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
        {error && (
          <div className="mt-4">
            <ErrorAlert error={error} />
          </div>
        )}
        {checking && (
          <p role="status" className="mt-4 text-center text-sm text-muted">
            Reading your file and finding the available tools…
          </p>
        )}
        <div className="trust-line">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span>Your files stay on your device.</span>
          <span className="hidden sm:inline">No uploads. No sign-ups. Just done.</span>
        </div>
      </div>
      <section
        className="how-it-works mx-auto grid max-w-4xl gap-6 sm:grid-cols-3"
        aria-label="How it works"
      >
        {[
          {
            number: '01',
            title: 'Start with a file',
            text: 'Drop an image or video, or choose one from your device.',
          },
          {
            number: '02',
            title: 'Make it yours',
            text: 'Pick an action, then adjust the settings to get it just right.',
          },
          {
            number: '03',
            title: 'Save and go',
            text: 'Download your finished file. It’s that simple.',
          },
        ].map((item) => (
          <div key={item.number}>
            <span className="text-xs font-semibold text-accent">{item.number}</span>
            <h2 className="mt-3 text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
          </div>
        ))}
      </section>
      <p className="pb-8 text-center text-xs text-muted">
        JPG, PNG, WebP, MP4, MOV, and more.{' '}
        <Link to="/formats" className="underline underline-offset-4 hover:text-accent">
          See supported formats
        </Link>
      </p>
    </div>
  );
}
