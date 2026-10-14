// Aspect-ratio presets shared by the image and video croppers (spec §A3, §B3).

export const ASPECTS = [
  { value: 'free', label: 'Freeform', ratio: null },
  { value: 'original', label: 'Original', ratio: null },
  { value: '1:1', label: '1:1 Square', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:2', label: '3:2', ratio: 3 / 2 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '9:16', label: '9:16 Story', ratio: 9 / 16 },
  { value: '4:5', label: '4:5 Portrait', ratio: 4 / 5 },
] as const;

export type AspectChoice = (typeof ASPECTS)[number]['value'];

export function aspectRatio(choice: AspectChoice, frame: { width: number; height: number }): number | null {
  if (choice === 'original') return frame.width / frame.height;
  return ASPECTS.find((a) => a.value === choice)?.ratio ?? null;
}
