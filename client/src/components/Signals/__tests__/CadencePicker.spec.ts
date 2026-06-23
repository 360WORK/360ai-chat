import { buildCron, parseCron, describeCron } from '../CadencePicker';

const identity = (k: string) => k;

describe('buildCron', () => {
  it('builds a weekly cron (Monday 08:00)', () => {
    expect(buildCron('weekly', 0, 8, 0)).toBe('0 8 * * 1');
  });
  it('maps Sunday (ui 6) to cron 0', () => {
    expect(buildCron('weekly', 6, 9, 30)).toBe('30 9 * * 0');
  });
  it('builds a daily cron', () => {
    expect(buildCron('daily', 0, 8, 0)).toBe('0 8 * * *');
  });
  it('builds an hourly cron (minute only)', () => {
    expect(buildCron('hourly', 0, 0, 15)).toBe('15 * * * *');
  });
  it('pads single-digit minutes/hours', () => {
    expect(buildCron('daily', 0, 9, 5)).toBe('5 9 * * *');
  });
});

describe('parseCron (round-trips buildCron)', () => {
  it('parses a weekly cron back to Monday', () => {
    const p = parseCron('0 8 * * 1');
    expect(p).toEqual({ frequency: 'weekly', day: 0, hour: 8, minute: 0 });
  });
  it('parses a daily cron', () => {
    expect(parseCron('30 9 * * *')).toEqual({ frequency: 'daily', day: 0, hour: 9, minute: 30 });
  });
  it('parses an hourly cron', () => {
    expect(parseCron('15 * * * *')).toEqual({ frequency: 'hourly', day: 0, hour: 0, minute: 15 });
  });
  it('parses Sunday (cron 0) to ui day 6', () => {
    expect(parseCron('0 8 * * 0')).toEqual({ frequency: 'weekly', day: 6, hour: 8, minute: 0 });
  });
  it('falls back to weekly Monday 08:00 for an unrecognised cron', () => {
    expect(parseCron('*/7 9-17 * * 1,3,5')).toEqual({
      frequency: 'weekly',
      day: 0,
      hour: 8,
      minute: 0,
    });
    expect(parseCron('')).toEqual({ frequency: 'weekly', day: 0, hour: 8, minute: 0 });
  });
});

describe('describeCron', () => {
  it('returns the weekly cadence key for a weekly cron', () => {
    // NB: with an identity localize the {day}/{time} placeholders live in the
    // translation VALUE (not the key), so only the key is asserted here. The
    // real localize substitutes the template in SignalsManager.
    expect(describeCron('0 8 * * 1', identity)).toContain('com_signals_cadence_weekly');
  });
  it('returns the hourly cadence key for an hourly cron', () => {
    expect(describeCron('15 * * * *', identity)).toContain('com_signals_cadence_hourly');
  });
});
