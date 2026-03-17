import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

import type { DrivingEventFamily, EventMetadata, EventSeverity, ScoringStats, EventType } from '@types';

export const journeys = sqliteTable('journeys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  date: text('date').notNull(),
  startTime: integer('startTime').notNull(),
  endTime: integer('endTime'),
  score: integer('score'),
  distanceKm: real('distanceKm'),
  stats: text('stats', { mode: 'json' }).$type<ScoringStats>(),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  journeyId: integer('journeyId')
    .references(() => journeys.id, { onDelete: 'cascade' })
    .notNull(),
  timestamp: integer('timestamp').notNull(),
  type: text('type').notNull().$type<EventType>(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  speed: real('speed').notNull(),
  family: text('family').$type<DrivingEventFamily | null>(),
  severity: text('severity').$type<EventSeverity | null>(),
  metadata: text('metadata', { mode: 'json' }).$type<EventMetadata | null>(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
