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

export const roadSpeedLimitCache = sqliteTable('road_speed_limit_cache', {
  key: text('key').primaryKey(),
  kind: text('kind').$type<'hit' | 'miss'>().notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  speedLimitKmh: real('speedLimitKmh'),
  source: text('source').$type<'overpass' | null>(),
  wayId: integer('wayId'),
  rawMaxspeed: text('rawMaxspeed'),
  expiresAtMs: integer('expiresAtMs').notNull(),
  updatedAtMs: integer('updatedAtMs').notNull(),
});
