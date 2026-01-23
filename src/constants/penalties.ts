import { EventType } from '../types';

export const EVENT_PENALTIES: Record<EventType, number> = {
  [EventType.JourneyStart]: 0,
  [EventType.JourneyEnd]: 0,
  [EventType.LocationUpdate]: 0,
  [EventType.HarshBraking]: 1,
  [EventType.HarshAcceleration]: 1,
  [EventType.SharpTurn]: 1,
  [EventType.ModerateSpeeding]: 1,
  [EventType.HarshSpeeding]: 1,
};

export const getPenaltyForEvent = (eventType: EventType): number => {
  return EVENT_PENALTIES[eventType] ?? 0;
};
