export type ClipMark = 'in' | 'out';

export interface TimePayload {
  time: number;
}

export interface MarkPayload {
  mark: ClipMark;
  time: number;
}

export interface MarkRequestPayload {
  mark: ClipMark;
}

export interface FfmpegAvailabilityPayload {
  isInstalled: boolean;
  path: string;
}

export type ClipStatusTone = 'neutral' | 'success' | 'error';

export interface ClipStatusPayload {
  status: boolean;
  message?: string;
  tone?: ClipStatusTone;
}

export interface ProcessVideoClipPayload {
  startPos: string;
  endPos: string;
  hwaccel: boolean;
  verticalCrop: boolean;
}

export interface PluginToWebviewMessages {
  mark: MarkPayload;
  reset: undefined;
  'is-ffmpeg-installed': FfmpegAvailabilityPayload;
  'ffmpeg-status-out': ClipStatusPayload;
}

export interface WebviewToPluginMessages {
  markTime: MarkRequestPayload;
  seekTo: TimePayload;
  processVideoClip: ProcessVideoClipPayload;
  closeWindow: undefined;
  ready: undefined;
}

export type MessageName<TMessages> = Extract<keyof TMessages, string>;

const SECONDS_PATTERN = /^\d+(?:\.\d+)?$/;
const WHOLE_PATTERN = /^\d+$/;

// Accepts SS, M:SS or H:MM:SS, each with optional fractional seconds.
export function parseTimestamp(text: string): number | undefined {
  const parts = text.trim().split(':');
  if (parts.length > 3) return undefined;

  const [seconds = '', minutes, hours] = parts.reverse();
  if (!SECONDS_PATTERN.test(seconds)) return undefined;
  if (minutes !== undefined && (!WHOLE_PATTERN.test(minutes) || Number(seconds) >= 60)) {
    return undefined;
  }
  if (hours !== undefined && (!WHOLE_PATTERN.test(hours) || Number(minutes) >= 60)) {
    return undefined;
  }

  return Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds);
}

// Formats seconds as HH:MM:SS.mmm.
export function formatTimestamp(positionInSeconds: number): string {
  const safePosition = Number.isFinite(positionInSeconds) ? Math.max(0, positionInSeconds) : 0;
  const totalMilliseconds = Math.round(safePosition * 1_000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;

  return `${[hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')}.${String(milliseconds).padStart(3, '0')}`;
}
