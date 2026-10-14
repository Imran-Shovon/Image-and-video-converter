import { useEffect } from 'react';
import { useHandoff } from '@/stores/handoff';

/** Start loading only after the mount survives Strict Mode's effect cleanup replay. */
export function useFileHandoff(add: (files: File[]) => void) {
  const take = useHandoff((s) => s.take);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const file = take();
      if (file) add([file]);
    });
    return () => {
      active = false;
    };
  }, [add, take]);
}
