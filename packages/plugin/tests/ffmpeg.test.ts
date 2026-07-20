import { describe, expect, it, vi } from 'vitest';
import {
  createAvailableClipOutputPath,
  createClipOutputPath,
  createFfmpegArguments,
  fileExtension,
  isLocalSourcePath,
  isValidClipRange,
  resolveFfmpegPath,
} from '../src/ffmpeg';

describe('resolveFfmpegPath', () => {
  it('prefers a configured executable path', () => {
    const fileInPath = vi.fn((path: string) => path === '/custom/bin/ffmpeg');

    expect(resolveFfmpegPath('  /custom/bin/ffmpeg  ', fileInPath)).toBe('/custom/bin/ffmpeg');
    expect(fileInPath).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Apple Silicon Homebrew path', () => {
    const fileInPath = vi.fn((path: string) => path === '/opt/homebrew/bin/ffmpeg');

    expect(resolveFfmpegPath('', fileInPath)).toBe('/opt/homebrew/bin/ffmpeg');
  });

  it('returns undefined when no executable exists', () => {
    expect(resolveFfmpegPath(undefined, () => false)).toBeUndefined();
  });
});

describe('fileExtension', () => {
  it('reads a lowercase extension', () => {
    expect(fileExtension('/Movies/Demo.MKV')).toBe('mkv');
  });

  it('returns an empty string when there is no extension', () => {
    expect(fileExtension('/Movies/demo')).toBe('');
  });

  it('ignores dots in parent directories', () => {
    expect(fileExtension('/Movies/my.folder/demo')).toBe('');
  });
});

describe('clip input and output paths', () => {
  it('accepts local files and rejects remote media URLs', () => {
    expect(isLocalSourcePath('/Users/example/Movies/demo.mp4')).toBe(true);
    expect(isLocalSourcePath('https://example.com/demo.mp4')).toBe(false);
  });

  it('requires the end timestamp to follow the start timestamp', () => {
    expect(isValidClipRange('00:01:10', '00:01:25')).toBe(true);
    expect(isValidClipRange('00:01:25', '00:01:10')).toBe(false);
    expect(isValidClipRange('invalid', '00:01:25')).toBe(false);
  });

  it('keeps the source container when copying streams', () => {
    expect(createClipOutputPath('/Users/example/Movies/demo.mkv', 'demo.mkv', true)).toBe(
      '/Users/example/Movies/demo_clip.mkv',
    );
  });

  it('targets mov when the clip is re-encoded', () => {
    expect(createClipOutputPath('/Users/example/Movies/demo.mkv', 'demo.mkv', false)).toBe(
      '/Users/example/Movies/demo_clip.mov',
    );
  });

  it('supports filenames without an extension', () => {
    expect(createClipOutputPath('demo', 'demo', true)).toBe('demo_clip.mov');
  });

  it('adds a numeric suffix using the correct container', () => {
    const existingPaths = new Set([
      '/Users/example/Movies/demo_clip.mkv',
      '/Users/example/Movies/demo_clip_2.mkv',
    ]);

    expect(
      createAvailableClipOutputPath(
        '/Users/example/Movies/demo.mkv',
        'demo.mkv',
        (path) => existingPaths.has(path),
        true,
      ),
    ).toBe('/Users/example/Movies/demo_clip_3.mkv');
  });
});

describe('createFfmpegArguments', () => {
  const baseOptions = {
    sourcePath: '/Movies/demo.mp4',
    startPosition: '00:01:10',
    endPosition: '00:01:25',
    outputPath: '/Movies/demo_clip.mp4',
  };

  it('copies streams when no crop is requested', () => {
    expect(
      createFfmpegArguments({
        ...baseOptions,
        hardwareAcceleration: false,
        verticalCrop: false,
      }),
    ).toEqual([
      '-ss',
      '70',
      '-i',
      '/Movies/demo.mp4',
      '-t',
      '15',
      '-map',
      '0',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      '/Movies/demo_clip.mp4',
    ]);
  });

  it('seeks before the input so the copy is fast', () => {
    const args = createFfmpegArguments({
      ...baseOptions,
      hardwareAcceleration: false,
      verticalCrop: false,
    });

    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });

  it('omits faststart for containers that do not support it', () => {
    const args = createFfmpegArguments({
      ...baseOptions,
      sourcePath: '/Movies/demo.mkv',
      outputPath: '/Movies/demo_clip.mkv',
      hardwareAcceleration: false,
      verticalCrop: false,
    });

    expect(args).not.toContain('-movflags');
    expect(args).toContain('copy');
  });

  it('ignores hardware acceleration when copying streams', () => {
    const args = createFfmpegArguments({
      ...baseOptions,
      hardwareAcceleration: true,
      verticalCrop: false,
    });

    expect(args).not.toContain('-hwaccel');
    expect(args).not.toContain('libx264');
  });

  it('re-encodes when a vertical crop is requested', () => {
    const args = createFfmpegArguments({
      ...baseOptions,
      outputPath: '/Movies/demo_clip.mov',
      hardwareAcceleration: true,
      verticalCrop: true,
    });

    expect(args.slice(0, 4)).toEqual(['-hwaccel', 'videotoolbox', '-i', '/Movies/demo.mp4']);
    expect(args).toContain('crop=w=ih*(9/16):h=ih:x=(iw-ow)/2:y=0,format=yuv420p');
    expect(args).toContain('h264_videotoolbox');
    expect(args).not.toContain('libx264');
  });

  it('falls back to re-encoding when the range cannot be parsed', () => {
    const args = createFfmpegArguments({
      ...baseOptions,
      startPosition: 'invalid',
      outputPath: '/Movies/demo_clip.mov',
      hardwareAcceleration: false,
      verticalCrop: false,
    });

    expect(args).toContain('libx264');
  });
});
