// "Continue with another tool" (spec §4): passes a processed file to the next tool in memory,
// without downloading or re-uploading it.
import { create } from 'zustand';

interface HandoffState {
  file: File | null;
  fromTool: string | null;
  give: (file: File, fromTool: string) => void;
  take: () => File | null;
}

export const useHandoff = create<HandoffState>((set, get) => ({
  file: null,
  fromTool: null,
  give: (file, fromTool) => set({ file, fromTool }),
  take: () => {
    const file = get().file;
    if (file) set({ file: null, fromTool: null });
    return file;
  },
}));
