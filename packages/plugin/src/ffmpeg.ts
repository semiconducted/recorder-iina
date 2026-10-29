import { parseTimestamp } from '@recorder/contracts';

export const FFMPEG_FALLBACK_PATHS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'] as const;

// Containers that support the faststart moov-atom relocation.
const FASTSTART_CONTAINERS = new Set(['mp4', 'mov', 'm4v']);

export interface FfmpegArgumentsOptions {
  sourcePath: string;
  startPosition: string;
  endPosition: string;
  hardwareAcceleration: boolean;
  verticalCrop: boolean;
  outputPath: string;
}

export function resolveFfmpegPath(
  preferredPath: unknown,
  fileInPath: (path: string) => boolean,
): string | undefined {
  const preferred = typeof preferredPath === 'string' ? preferredPath.trim() : '';
  const candidates = [preferred, ...FFMPEG_FALLBACK_PATHS];

  return candidates.find((candidate) => candidate.length > 0 && fileInPath(candidate));
}

export function isLocalSourcePath(sourcePath: string): boolean {
  return sourcePath.length > 0 && !sourcePath.includes('://');
}

export function isValidClipRange(startPosition: string, endPosition: string): boolean {
  const start = parseTimestamp(startPosition);
  const end = parseTimestamp(endPosition);
  return start !== undefined && end !== undefined && end > start;
}

// Lowercase extension without the dot, or an empty string when there is none.
export function fileExtension(pathOrName: string): string {
  const lastSlash = pathOrName.lastIndexOf('/');
  const name = lastSlash >= 0 ? pathOrName.slice(lastSlash + 1) : pathOrName;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : '';
}

export function createClipOutputPath(
  sourcePath: string,
  filename: string,
  lossless = true,
): string {
  const lastSlash = sourcePath.lastIndexOf('/');
  const directory = lastSlash >= 0 ? sourcePath.slice(0, lastSlash) : '';
  const lastDot = filename.lastIndexOf('.');
  const basename = (lastDot > 0 ? filename.slice(0, lastDot) : filename).trim() || 'clip';

  // A stream copy keeps the original container. A re-encode targets mov.
  const sourceExtension = fileExtension(filename);
  const extension = lossless && sourceExtension.length > 0 ? sourceExtension : 'mov';
  const outputName = `${basename}_clip.${extension}`;

  return directory ? `${directory}/${outputName}` : lastSlash === 0 ? `/${outputName}` : outputName;
}

export function createAvailableClipOutputPath(
  sourcePath: string,
  filename: string,
  fileExists: (path: string) => boolean,
  lossless = true,
): string {
  const preferredPath = createClipOutputPath(sourcePath, filename, lossless);
  if (!fileExists(preferredPath)) return preferredPath;

  const suffix = `.${fileExtension(preferredPath)}`;
  const stem = preferredPath.slice(0, -suffix.length);
  let index = 2;
  while (fileExists(`${stem}_${index}${suffix}`)) index += 1;
  return `${stem}_${index}${suffix}`;
}

function roundToMilliseconds(seconds: number): number {
  return Math.round(seconds * 1_000) / 1_000;
}

export function createFfmpegArguments(options: FfmpegArgumentsOptions): string[] {
  const args: string[] = [];
  const start = parseTimestamp(options.startPosition);
  const end = parseTimestamp(options.endPosition);

  // Cropping needs decoded frames, so it cannot be combined with a stream copy.
  if (!options.verticalCrop && start !== undefined && end !== undefined && end > start) {
    // Placing -ss before -i is input seeking. It is near instant and snaps back
    // to the nearest preceding keyframe, so the clip may begin slightly early.
    args.push(
      '-ss',
      String(start),
      '-i',
      options.sourcePath,
      '-t',
      String(roundToMilliseconds(end - start)),
    );
    args.push('-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero');

    if (FASTSTART_CONTAINERS.has(fileExtension(options.outputPath))) {
      args.push('-movflags', '+faststart');
    }

    args.push(options.outputPath);
    return args;
  }

  if (options.hardwareAcceleration) {
    args.push('-hwaccel', 'videotoolbox');
  }

  args.push('-i', options.sourcePath);
  if (start !== undefined && end !== undefined) {
    args.push('-ss', String(start), '-to', String(end));
  }
  args.push('-vf', 'crop=w=ih*(9/16):h=ih:x=(iw-ow)/2:y=0,format=yuv420p');

  if (options.hardwareAcceleration) {
    args.push('-c:v', 'h264_videotoolbox', '-q:v', '70');
  } else {
    args.push('-c:v', 'libx264', '-crf', '23');
  }

  args.push('-c:a', 'copy', '-movflags', '+faststart', options.outputPath);
  return args;
}
