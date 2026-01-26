import { EventType } from '@types';
import { EVENT_PENALTIES, getPenaltyForEvent } from '@constants/penalties';

describe('Penalties Configuration', () => {
  describe('EVENT_PENALTIES', () => {
    it('should define penalties for all event types', () => {
      const allEventTypes = Object.values(EventType);

      allEventTypes.forEach((eventType) => {
        expect(EVENT_PENALTIES).toHaveProperty(eventType);
      });
    });

    it('should have zero penalties for journey lifecycle events', () => {
      expect(EVENT_PENALTIES[EventType.JourneyStart]).toBe(0);
      expect(EVENT_PENALTIES[EventType.JourneyEnd]).toBe(0);
      expect(EVENT_PENALTIES[EventType.LocationUpdate]).toBe(0);
    });

    it('should have non-zero penalties for driving events', () => {
      expect(EVENT_PENALTIES[EventType.HarshBraking]).toBeGreaterThan(0);
      expect(EVENT_PENALTIES[EventType.HarshAcceleration]).toBeGreaterThan(0);
      expect(EVENT_PENALTIES[EventType.SharpTurn]).toBeGreaterThan(0);
      expect(EVENT_PENALTIES[EventType.ModerateSpeeding]).toBeGreaterThan(0);
      expect(EVENT_PENALTIES[EventType.HarshSpeeding]).toBeGreaterThan(0);
    });

    it('should have all penalty values as numbers', () => {
      Object.values(EVENT_PENALTIES).forEach((penalty) => {
        expect(typeof penalty).toBe('number');
        expect(penalty).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getPenaltyForEvent', () => {
    it('should return correct penalty for valid event types', () => {
      expect(getPenaltyForEvent(EventType.HarshBraking)).toBe(EVENT_PENALTIES[EventType.HarshBraking]);
      expect(getPenaltyForEvent(EventType.HarshAcceleration)).toBe(EVENT_PENALTIES[EventType.HarshAcceleration]);
      expect(getPenaltyForEvent(EventType.SharpTurn)).toBe(EVENT_PENALTIES[EventType.SharpTurn]);
      expect(getPenaltyForEvent(EventType.ModerateSpeeding)).toBe(EVENT_PENALTIES[EventType.ModerateSpeeding]);
      expect(getPenaltyForEvent(EventType.HarshSpeeding)).toBe(EVENT_PENALTIES[EventType.HarshSpeeding]);
    });

    it('should return 0 for journey lifecycle events', () => {
      expect(getPenaltyForEvent(EventType.JourneyStart)).toBe(0);
      expect(getPenaltyForEvent(EventType.JourneyEnd)).toBe(0);
      expect(getPenaltyForEvent(EventType.LocationUpdate)).toBe(0);
    });

    it('should return 0 for undefined event type', () => {
      // @ts-expect-error Testing invalid input
      expect(getPenaltyForEvent('invalid_event')).toBe(0);
    });
  });
});
