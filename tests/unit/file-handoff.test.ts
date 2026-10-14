// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileHandoff } from '@/hooks/useFileHandoff';
import { useImageQueue } from '@/features/images/useImageQueue';
import { imageEngine } from '@/lib/image-processing/engine';
import { MediaError } from '@/lib/media/errors';
import { validateFile } from '@/lib/media/validate';
import { useHandoff } from '@/stores/handoff';

vi.mock('@/lib/image-processing/engine', () => ({
  imageEngine: { inspect: vi.fn(), process: vi.fn() },
}));
vi.mock('@/lib/media/validate', () => ({ validateFile: vi.fn() }));

function Editor() {
  const queue = useImageQueue({ multiple: false, operation: 'compressed' });
  useFileHandoff(queue.add);
  const item = queue.items[0];
  return createElement(
    'div',
    null,
    createElement('p', null, item?.status ?? 'empty'),
    item?.preview && createElement('img', { src: item.preview.url, alt: item.file.name }),
    createElement('button', { disabled: !item?.probe }, 'Compress'),
  );
}

describe('file handoff during Strict Mode mounting', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:preview');
        static override revokeObjectURL = vi.fn();
      },
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    useHandoff.setState({ file: null, fromTool: null });
    vi.mocked(validateFile).mockImplementation(async (file) => ({
      file,
      format: 'png',
      kind: 'image',
      header: null,
      extensionMismatch: false,
    }));
    vi.mocked(imageEngine.inspect).mockImplementation(async (_file, _maxEdge, signal) => {
      if (signal?.aborted) throw new MediaError('CANCELLED');
      return {
        probe: {
          format: 'png',
          width: 10,
          height: 10,
          hasAlpha: false,
          animated: false,
          orientation: 1,
        },
        preview: { blob: new Blob(['preview']), width: 10, height: 10 },
      };
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useHandoff.setState({ file: null, fromTool: null });
    vi.unstubAllGlobals();
  });

  it('loads the uploaded image once and keeps its preview ready through effect replay', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    useHandoff.getState().give(file, 'home');
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Editor)));
    });

    expect(container.querySelector('p')?.textContent).toBe('ready');
    expect(container.querySelector('img')?.alt).toBe('photo.png');
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(imageEngine.inspect).toHaveBeenCalledTimes(1);
    expect(vi.mocked(imageEngine.inspect).mock.calls[0]?.[2]?.aborted).toBe(false);
    expect(useHandoff.getState().file).toBeNull();
  });

  it('still aborts image loading when the editor actually unmounts', async () => {
    vi.mocked(imageEngine.inspect).mockImplementation(() => new Promise(() => {}));
    useHandoff.getState().give(new File(['image'], 'photo.png'), 'home');
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Editor)));
    });
    const signal = vi.mocked(imageEngine.inspect).mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);
    await act(async () => root.unmount());
    expect(signal?.aborted).toBe(true);
  });

  it('releases preview URLs when the editor actually unmounts', async () => {
    useHandoff.getState().give(new File(['image'], 'photo.png'), 'home');
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Editor)));
    });
    await act(async () => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
