import type { Event } from '@types';
import { EventType } from '@types';

export interface JourneyBounds {
  startTimestamp: number;
  endTimestamp: number;
}

interface JourneyEventOptions {
  eventsAreSorted?: boolean;
}

export const sortJourneyEventsByTimestamp = (events: Event[]): Event[] => {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
};

export const getJourneyBounds = (events: Event[], options: JourneyEventOptions = {}): JourneyBounds | null => {
  if (events.length === 0) {
    return null;
  }

  const sorted = options.eventsAreSorted ? events : sortJourneyEventsByTimestamp(events);

  const startEvent = sorted.find((event) => event.type === EventType.JourneyStart);

  let endEvent: Event | null = null;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const event = sorted[index];
    if (event.type === EventType.JourneyEnd) {
      endEvent = event;
      break;
    }
  }

  const earliestTimestamp = sorted[0].timestamp;
  const latestTimestamp = sorted[sorted.length - 1].timestamp;
  const startTimestamp = startEvent ? Math.min(startEvent.timestamp, earliestTimestamp) : earliestTimestamp;
  const endTimestamp = endEvent?.timestamp ?? latestTimestamp;

  return { startTimestamp, endTimestamp };
};
