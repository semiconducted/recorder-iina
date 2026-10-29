import { CheckCircle, CircleNotch, Play, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import {
  formatTimestamp,
  parseTimestamp,
  type ClipMark,
  type ClipStatusPayload,
  type FfmpegAvailabilityPayload,
} from '@recorder/contracts';
import { recorderBridge } from './bridge';
import './recorder.css';

const MARK_LABELS: Record<ClipMark, { name: string; hotkey: string }> = {
  in: { name: 'In', hotkey: '⌥⇧I' },
  out: { name: 'Out', hotkey: '⌥⇧O' },
};

interface MarkFieldProps {
  mark: ClipMark;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function MarkField({ mark, value, disabled, onChange }: MarkFieldProps) {
  const { name, hotkey } = MARK_LABELS[mark];
  const seconds = parseTimestamp(value);
  const isInvalid = value.trim().length > 0 && seconds === undefined;

  function normalize(): void {
    if (seconds !== undefined) onChange(formatTimestamp(seconds));
  }

  return (
    <div className="mark-row">
      <button
        type="button"
        className="mark-button"
        onClick={() => recorderBridge.post('markTime', { mark })}
        disabled={disabled}
        title={`Set ${name} to the playhead (${hotkey})`}
      >
        Set {name}
        <small>{hotkey}</small>
      </button>
      <input
        className="mark-input"
        type="text"
        inputMode="decimal"
        spellCheck={false}
        placeholder="00:00:00.000"
        aria-label={`${name} time`}
        aria-invalid={isInvalid}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={normalize}
        onKeyDown={(event) => {
          if (event.key === 'Enter') normalize();
        }}
      />
      <button
        type="button"
        className="seek-button"
        onClick={() => {
          if (seconds !== undefined) recorderBridge.post('seekTo', { time: seconds });
        }}
        disabled={disabled || seconds === undefined}
        aria-label={`Jump to ${name}`}
        title={`Jump to ${name}`}
      >
        <Play size={12} weight="fill" aria-hidden="true" />
      </button>
    </div>
  );
}

export function App() {
  const [startPosition, setStartPosition] = useState('');
  const [endPosition, setEndPosition] = useState('');
  const [availability, setAvailability] = useState<FfmpegAvailabilityPayload>();
  const [clipStatus, setClipStatus] = useState<ClipStatusPayload>();
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [verticalCrop, setVerticalCrop] = useState(false);

  useEffect(() => {
    const unsubscribe = [
      recorderBridge.subscribe('mark', ({ mark, time }) => {
        const setPosition = mark === 'in' ? setStartPosition : setEndPosition;
        setPosition(formatTimestamp(time));
        setClipStatus(undefined);
      }),
      recorderBridge.subscribe('reset', () => {
        setStartPosition('');
        setEndPosition('');
        setClipStatus(undefined);
      }),
      recorderBridge.subscribe('is-ffmpeg-installed', setAvailability),
      recorderBridge.subscribe('ffmpeg-status-out', setClipStatus),
    ];

    recorderBridge.post('ready', undefined);

    return () => {
      for (const stopListening of unsubscribe) stopListening();
    };
  }, []);

  const isProcessing = clipStatus?.status === true;
  const startSeconds = parseTimestamp(startPosition);
  const endSeconds = parseTimestamp(endPosition);
  const hasValidRange =
    startSeconds !== undefined && endSeconds !== undefined && endSeconds > startSeconds;
  const canCreateClip = availability?.isInstalled === true && hasValidRange && !isProcessing;

  function createClip(): void {
    if (!canCreateClip) return;
    recorderBridge.post('processVideoClip', {
      startPos: formatTimestamp(startSeconds),
      endPos: formatTimestamp(endSeconds),
      hwaccel: hardwareAcceleration,
      verticalCrop,
    });
  }

  function closeRecorder(): void {
    setEndPosition('');
    setClipStatus(undefined);
    recorderBridge.post('closeWindow', undefined);
  }

  return (
    <main className="recorder-shell">
      <header className="recorder-heading">
        <p>Recorder</p>
        <h1>Create a clip</h1>
        <span>Set In and Out at the playhead, or type a time.</span>
      </header>

      <section className="clip-controls" aria-labelledby="clip-range-heading">
        <div className="section-heading">
          <h2 id="clip-range-heading">Clip range</h2>
          <span>
            {hasValidRange
              ? `Length ${formatTimestamp(endSeconds - startSeconds)}`
              : 'Out must follow In'}
          </span>
        </div>

        <div className="mark-list">
          {(['in', 'out'] as const).map((mark) => (
            <MarkField
              key={mark}
              mark={mark}
              value={mark === 'in' ? startPosition : endPosition}
              disabled={isProcessing}
              onChange={(value) => {
                setClipStatus(undefined);
                (mark === 'in' ? setStartPosition : setEndPosition)(value);
              }}
            />
          ))}
        </div>

        <p className="range-help">
          Accepts 83, 1:23 or 0:01:23.5. Lossless clips start at the keyframe at or before In.
        </p>

        <div className="toggle-list" aria-label="Encoding options">
          <label className="option-row">
            <span className="option-copy">
              <strong>Hardware acceleration</strong>
              <small>Export with Apple VideoToolbox.</small>
            </span>
            <span className="switch-control">
              <input
                type="checkbox"
                aria-label="Use hardware acceleration"
                checked={hardwareAcceleration}
                onChange={(event) => setHardwareAcceleration(event.target.checked)}
                disabled={isProcessing}
              />
              <span aria-hidden="true" />
            </span>
          </label>

          <label className="option-row">
            <span className="option-copy">
              <strong>Vertical crop</strong>
              <small>Center the video in a 9:16 frame.</small>
            </span>
            <span className="switch-control">
              <input
                type="checkbox"
                aria-label="Create a vertical crop"
                checked={verticalCrop}
                onChange={(event) => setVerticalCrop(event.target.checked)}
                disabled={isProcessing}
              />
              <span aria-hidden="true" />
            </span>
          </label>
        </div>
      </section>

      <div className="action-grid">
        <button
          type="button"
          className="primary-button"
          onClick={createClip}
          disabled={!canCreateClip}
        >
          {isProcessing ? <CircleNotch className="spin" size={16} aria-hidden="true" /> : null}
          {isProcessing ? 'Creating…' : 'Create clip'}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={closeRecorder}
          disabled={isProcessing}
        >
          Close
        </button>
      </div>

      {clipStatus?.message ? (
        <p
          className={`clip-feedback clip-feedback--${clipStatus.tone ?? 'neutral'}`}
          aria-live="polite"
        >
          {clipStatus.message}
        </p>
      ) : null}

      <div
        className={`dependency-status dependency-status--${
          availability?.isInstalled ? 'available' : availability ? 'missing' : 'checking'
        }`}
        aria-live="polite"
      >
        {availability?.isInstalled ? (
          <CheckCircle size={16} weight="fill" aria-hidden="true" />
        ) : availability ? (
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
        ) : (
          <CircleNotch className="spin" size={16} aria-hidden="true" />
        )}
        <span>
          {availability?.isInstalled
            ? 'FFmpeg available'
            : availability
              ? 'FFmpeg unavailable'
              : 'Checking FFmpeg'}
        </span>
      </div>
    </main>
  );
}
