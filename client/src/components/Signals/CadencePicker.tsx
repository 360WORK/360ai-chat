import { useEffect, useMemo, useState } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

/**
 * A human-friendly cadence picker that maps to a cron expression. Users should
 * never see raw cron. Supports weekly (day + time), daily (time), and hourly
 * (minute) frequencies, plus a best-effort reverse-parse so an existing cron
 * (e.g. when editing) populates the controls.
 */

export type CadenceFrequency = 'weekly' | 'daily' | 'hourly';

const DAYS: Array<{ value: number; cron: number; key: TranslationKeys }> = [
  { value: 0, cron: 1, key: 'com_signals_day_mon' },
  { value: 1, cron: 2, key: 'com_signals_day_tue' },
  { value: 2, cron: 3, key: 'com_signals_day_wed' },
  { value: 3, cron: 4, key: 'com_signals_day_thu' },
  { value: 4, cron: 5, key: 'com_signals_day_fri' },
  { value: 5, cron: 6, key: 'com_signals_day_sat' },
  { value: 6, cron: 0, key: 'com_signals_day_sun' },
];

/** Pad a number to 2 digits. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Build a cron expression from frequency + day + time. Day is 0=Mon..6=Sun
 * (UI order); mapped to cron's SUN=0..SAT=6.
 */
export function buildCron(
  frequency: CadenceFrequency,
  day: number,
  hour: number,
  minute: number,
): string {
  if (frequency === 'hourly') {
    return `${minute} * * * *`;
  }
  if (frequency === 'daily') {
    return `${minute} ${hour} * * *`;
  }
  const cronDay = DAYS.find((d) => d.value === day)?.cron ?? 1;
  return `${minute} ${hour} * * ${cronDay}`;
}

/** Best-effort parse of a cron back into picker state (for edit prefill). */
export function parseCron(cron: string): {
  frequency: CadenceFrequency;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = (cron || '').trim().split(/\s+/);
  if (parts.length !== 5) {
    return { frequency: 'weekly', day: 0, hour: 8, minute: 0 };
  }
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  const safeMinute = Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0;
  const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 8;
  const dayField = parts[4]; // 5th field (day of week)

  // weekly: "M H * * D" (day-of-week is a concrete value)
  if (parts[2] === '*' && parts[3] === '*' && dayField !== '*') {
    const cronDay = Number(dayField);
    const found = DAYS.find((d) => d.cron === cronDay);
    return {
      frequency: 'weekly',
      day: found ? found.value : 0,
      hour: safeHour,
      minute: safeMinute,
    };
  }
  // hourly: "M * * * *" (hour field is wildcard)
  if (parts[1] === '*' && parts[2] === '*' && parts[3] === '*' && dayField === '*') {
    return { frequency: 'hourly', day: 0, hour: 0, minute: safeMinute };
  }
  // daily: "M H * * *" (all day-of-week/day-of-month fields wildcard)
  if (parts[2] === '*' && parts[3] === '*' && dayField === '*') {
    return { frequency: 'daily', day: 0, hour: safeHour, minute: safeMinute };
  }
  // unknown shape → default weekly Monday 08:00
  return { frequency: 'weekly', day: 0, hour: 8, minute: 0 };
}

/** A human-readable label for a cron, e.g. "Every Monday at 08:00". */
export function describeCron(cron: string, localize: (k: TranslationKeys) => string): string {
  const { frequency, day, hour, minute } = parseCron(cron);
  const time = `${pad(hour)}:${pad(minute)}`;
  if (frequency === 'hourly') {
    return localize('com_signals_cadence_hourly').replace('{min}', pad(minute));
  }
  if (frequency === 'daily') {
    return localize('com_signals_cadence_daily').replace('{time}', time);
  }
  const dayLabel = localize(DAYS.find((d) => d.value === day)?.key ?? 'com_signals_day_mon');
  return localize('com_signals_cadence_weekly').replace('{day}', dayLabel).replace('{time}', time);
}

export type CadencePickerProps = {
  /** Current cron expression. */
  value: string;
  /** Called with a new cron whenever the selection changes. */
  onChange: (cron: string) => void;
};

const FREQUENCIES: Array<{ value: CadenceFrequency; key: TranslationKeys }> = [
  { value: 'weekly', key: 'com_signals_freq_weekly' },
  { value: 'daily', key: 'com_signals_freq_daily' },
  { value: 'hourly', key: 'com_signals_freq_hourly' },
];

const pillCls = (selected: boolean) =>
  `inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
    selected
      ? 'border-transparent bg-primary text-primary-foreground'
      : 'border-border-light bg-surface-secondary text-text-secondary hover:border-border-medium'
  }`;

export default function CadencePicker({ value, onChange }: CadencePickerProps) {
  const localize = useLocalize();
  const initial = useMemo(() => parseCron(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [frequency, setFrequency] = useState<CadenceFrequency>(initial.frequency);
  const [day, setDay] = useState<number>(initial.day);
  const [hour, setHour] = useState<number>(initial.hour);
  const [minute, setMinute] = useState<number>(initial.minute);

  // Re-emit a cron whenever any control changes.
  useEffect(() => {
    onChange(buildCron(frequency, day, hour, minute));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency, day, hour, minute]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={frequency === f.value}
            onClick={() => setFrequency(f.value)}
            className={pillCls(frequency === f.value)}
          >
            {localize(f.key)}
          </button>
        ))}
      </div>

      {frequency === 'weekly' ? (
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={day === d.value}
              onClick={() => setDay(d.value)}
              className={pillCls(day === d.value)}
            >
              {localize(d.key)}
            </button>
          ))}
        </div>
      ) : null}

      {frequency === 'hourly' ? (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          {localize('com_signals_cadence_at_minute')}
          <select
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="rounded-md border border-border-light bg-surface-secondary px-2 py-1 text-text-primary"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          {localize('com_signals_cadence_at_time')}
          <input
            type="time"
            value={`${pad(hour)}:${pad(minute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setHour(Number.isFinite(h) ? h : 8);
              setMinute(Number.isFinite(m) ? m : 0);
            }}
            className="rounded-md border border-border-light bg-surface-secondary px-2 py-1 text-text-primary"
          />
        </label>
      )}

      <p className="text-xs font-medium text-text-primary">
        {describeCron(buildCron(frequency, day, hour, minute), localize)}
      </p>
    </div>
  );
}
