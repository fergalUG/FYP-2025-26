import { useState, useEffect, useCallback } from 'react';
import { Journey, Event } from '../types/db';
import * as JourneyService from '../services/JourneyService';
import { executeWithLoading } from '../utils/async';

export const useJourney = (id: number) => {
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

  return {
    journey,
    loading,
    error,
    refetch: fetchJourney,
  };
};

export const useJourneyWithEvents = (id: number) => {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJourneyWithEvents = useCallback(async () => {
    if (!id) {
      setJourney(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [journeyResult, eventsResult] = await Promise.all([JourneyService.getJourneyById(id), JourneyService.getEventsByJourneyId(id)]);

      setJourney(journeyResult || null);
      setEvents(eventsResult || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchJourneyWithEvents();
  }, [fetchJourneyWithEvents]);

  return {
    journey,
    events,
    loading,
    error,
    refetch: fetchJourneyWithEvents,
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

  return {
    journeys,
    loading,
    error,
    refetch,
  };
};
