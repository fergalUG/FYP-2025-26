import type { Event } from '@types';
import { EventType } from '@types';

import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import { buildScoreTimelineSeries } from '@utils/scoring/buildScoreTimelineSeries';

const makeEvent = (partial: Partial<Event> & Pick<Event, 'timestamp' | 'type'>): Event => {
  return {
    id: partial.id ?? 1,
    journeyId: partial.journeyId ?? 1,
    timestamp: partial.timestamp,
    type: partial.type,
    latitude: partial.latitude ?? 53,
    longitude: partial.longitude ?? -6,
    speed: partial.speed ?? 0,
    family: partial.family ?? null,
    severity: partial.severity ?? null,
    metadata: partial.metadata ?? null,
  };
};

describe('buildScoreTimelineSeries', () => {
  it('captures the minimum and end score from a recovery curve', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 0, type: EventType.DrivingEvent, family: 'braking', severity: 'harsh' }),
      makeEvent({ id: 3, timestamp: 600000, type: EventType.JourneyEnd }),
    ];

    const scoreResult = calculateEfficiencyScore(events, 0);
    const series = buildScoreTimelineSeries(events, { maxPoints: 40 });

    expect(series.length).toBeLessThanOrEqual(40);
    expect(series[0]?.score).toBeCloseTo(scoreResult.stats.minScore, 5);
    expect(Math.min(...series.map((point) => point.score))).toBeCloseTo(scoreResult.stats.minScore, 5);
    expect(series[series.length - 1]?.score).toBeCloseTo(scoreResult.stats.endScore, 4);
  });

  it('shows a drop and recovery around a speeding episode while respecting the point cap', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 100000, type: EventType.DrivingEvent, family: 'speeding', severity: 'moderate', speed: 70 }),
      makeEvent({ id: 3, timestamp: 110000, type: EventType.DrivingEvent, family: 'speeding', severity: 'moderate', speed: 72 }),
      makeEvent({ id: 4, timestamp: 120000, type: EventType.DrivingEvent, family: 'speeding', severity: 'moderate', speed: 74 }),
      makeEvent({ id: 5, timestamp: 300000, type: EventType.JourneyEnd }),
    ];

    const series = buildScoreTimelineSeries(events, { maxPoints: 24 });
    const beforeSpeeding = series.find((point) => point.elapsedMs >= 90000);
    const duringOrAfterSpeeding = series.find((point) => point.elapsedMs >= 120000);
    const finalPoint = series[series.length - 1];

    expect(series.length).toBeLessThanOrEqual(24);
    expect(beforeSpeeding).toBeDefined();
    expect(duringOrAfterSpeeding).toBeDefined();
    expect(finalPoint).toBeDefined();
    expect(duringOrAfterSpeeding?.score ?? 100).toBeLessThan(beforeSpeeding?.score ?? 100);
    expect(finalPoint?.score ?? 0).toBeGreaterThan(duringOrAfterSpeeding?.score ?? 0);
  });
});
