import { useState, useEffect, useCallback } from 'react';
import type { Journey, Event } from '@types';
import { JourneyService } from '@services/JourneyService';
import { executeWithLoading } from '@utils/async';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.Hooks);

const useJourney = (id: number) => {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJourney = useCallback(async () => {
    if (!id) {
      setJourney(null);
      setLoading(false);
      return;
    }

    const result = await executeWithLoading(() => JourneyService.getJourneyById(id), setLoading, setError);

    setJourney(result || null);
  }, [id]);

  useEffect(() => {
    fetchJourney();
  }, [fetchJourney]);

  const updateJourney = async (updates: Partial<Journey>) => {
    try {
      const updatedJourney = await JourneyService.updateJourney(id, updates);
      if (!updatedJourney) {
        logger.warn('useJourney', `No journey found with id ${id} to update`);
        return null;
      }
      setJourney(updatedJourney);
      return updatedJourney;
    } catch (err) {
      logger.error('useJourney', 'Failed to update journey', err);
      return null;
    }
  };

  return {
    journey,
    loading,
    error,
    refetch: fetchJourney,
    updateJourney: updateJourney,
  };
};

const useJourneyEvents = (journeyId: number) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!journeyId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const result = await executeWithLoading(() => JourneyService.getEventsByJourneyId(journeyId), setLoading, setError);

    setEvents(result || []);
  }, [journeyId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
  };
};

export const useJourneyWithEvents = (id: number) => {
  const { journey, loading: journeyLoading, error: journeyError, refetch: refetchJourney, updateJourney } = useJourney(id);
  const { events, loading: eventsLoading, error: eventsError, refetch: refetchEvents } = useJourneyEvents(id);

  return {
    journey,
    events,
    journeyLoading,
    eventsLoading,
    journeyError,
    eventsError,
    refetchJourney,
    refetchEvents,
    updateJourney,
  };
};

export const useJourneys = () => {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJourneys = useCallback(async () => {
    const result = await executeWithLoading(() => JourneyService.getAllJourneys(), setLoading, setError);

    setJourneys(result || []);
  }, []);

  const refetch = useCallback(async () => {
    await fetchJourneys();
  }, [fetchJourneys]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  useEffect(() => {
    const unsubscribe = JourneyService.addJourneyListener(() => {
      fetchJourneys();
    });

    return unsubscribe;
  }, [fetchJourneys]);

  const deleteJourney = useCallback(async (journeyId: number) => {
    const success = await JourneyService.deleteJourney(journeyId);
    if (success) {
      setJourneys((prev) => prev.filter((journey) => journey.id !== journeyId));
    }
    return success;
  }, []);

  return {
    journeys,
    loading,
    error,
    refetch,
    deleteJourney,
  };
};
