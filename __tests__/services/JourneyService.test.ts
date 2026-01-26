import * as SQL from 'expo-sqlite';
import * as JourneyService from '@services/JourneyService';
import { EventType } from '@types';

const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

describe('JourneyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initDatabase', () => {
    it('should initialize the database with correct schema', async () => {
      await JourneyService.initDatabase();

      expect(SQL.openDatabaseAsync).toHaveBeenCalledWith('journeys.db');
      expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS journeys'));
      expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS events'));
    });

    it('should create journeys table with correct columns', async () => {
      await JourneyService.initDatabase();

      const createTableQuery = mockDb.execAsync.mock.calls[0][0];
      expect(createTableQuery).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(createTableQuery).toContain('title TEXT');
      expect(createTableQuery).toContain('date TEXT');
      expect(createTableQuery).toContain('startTime INTEGER');
      expect(createTableQuery).toContain('endTime INTEGER');
      expect(createTableQuery).toContain('score INTEGER');
      expect(createTableQuery).toContain('distanceKm REAL');
    });

    it('should create events table with correct columns', async () => {
      await JourneyService.initDatabase();

      const createTableQuery = mockDb.execAsync.mock.calls[0][0];
      expect(createTableQuery).toContain('journeyId INTEGER');
      expect(createTableQuery).toContain('timestamp INTEGER');
      expect(createTableQuery).toContain('type TEXT');
      expect(createTableQuery).toContain('latitude REAL');
      expect(createTableQuery).toContain('longitude REAL');
      expect(createTableQuery).toContain('speed REAL');
      expect(createTableQuery).toContain('penalty INTEGER');
      expect(createTableQuery).toContain('FOREIGN KEY (journeyId) REFERENCES journeys (id)');
    });
  });

  describe('startJourney', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1 });
    });

    it('should create a new journey with correct data', async () => {
      const beforeTime = Date.now();
      await JourneyService.startJourney();
      const afterTime = Date.now();

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO journeys'),
        expect.arrayContaining([
          expect.any(String), // title
          expect.any(String), // date
          expect.any(Number), // startTime
        ])
      );

      const args = mockDb.runAsync.mock.calls[0][1];
      const startTime = args[2];
      expect(startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should return the journey ID', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42 });
      await JourneyService.startJourney();

      expect(JourneyService.getCurrentJourneyId()).toBe(42);
    });
  });

  describe('endJourney', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1 });
      await JourneyService.startJourney();
    });

    it('should update journey with end time, score, and distance', async () => {
      const score = 85;
      const distance = 15.5;

      await JourneyService.endJourney(score, distance);

      expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE journeys'), [
        expect.any(Number), // endTime
        score,
        distance,
        1, // journeyId
      ]);
    });

    it('should clear current journey ID after ending', async () => {
      await JourneyService.endJourney(90, 10);

      expect(JourneyService.getCurrentJourneyId()).toBeNull();
    });

    it('should not throw if no active journey', async () => {
      await JourneyService.endJourney(90, 10);
      await expect(JourneyService.endJourney(90, 10)).resolves.not.toThrow();
    });
  });

  describe('logEvent', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1 });
      await JourneyService.startJourney();
    });

    it('should log event with correct data', async () => {
      const eventType = EventType.HarshBraking;
      const latitude = 53.3498;
      const longitude = -6.2603;
      const speed = 60;

      await JourneyService.logEvent(eventType, latitude, longitude, speed);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events'),
        expect.arrayContaining([
          1, // journeyId
          expect.any(Number), // timestamp
          eventType,
          latitude,
          longitude,
          speed,
          expect.any(Number), // penalty
        ])
      );
    });

    it('should auto-calculate penalty from event type', async () => {
      await JourneyService.logEvent(EventType.HarshBraking, 53.3498, -6.2603, 60);

      // Index 1 because 0 is startJourney, 1 is logEvent
      const args = mockDb.runAsync.mock.calls[1][1];
      const penalty = args[6];
      expect(penalty).toBeGreaterThanOrEqual(0);
    });

    it('should not log event if no active journey', async () => {
      await JourneyService.endJourney(90, 10);
      mockDb.runAsync.mockClear();

      await JourneyService.logEvent(EventType.HarshBraking, 53.3498, -6.2603, 60);

      expect(mockDb.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO events'), expect.anything());
    });
  });

  describe('getAllJourneys', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
    });

    it('should retrieve all journeys ordered by start time', async () => {
      const mockJourneys = [
        { id: 2, title: 'Journey 2', startTime: 2000 },
        { id: 1, title: 'Journey 1', startTime: 1000 },
      ];
      mockDb.getAllAsync.mockResolvedValue(mockJourneys);

      const journeys = await JourneyService.getAllJourneys();

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM journeys ORDER BY date DESC, startTime DESC'));
      expect(journeys).toEqual(mockJourneys);
    });

    it('should return empty array if no journeys exist', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const journeys = await JourneyService.getAllJourneys();

      expect(journeys).toEqual([]);
    });
  });

  describe('getJourneyById', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
    });

    it('should retrieve specific journey by ID', async () => {
      const mockJourney = { id: 1, title: 'Test Journey', score: 85 };
      mockDb.getFirstAsync.mockResolvedValue(mockJourney);

      const journey = await JourneyService.getJourneyById(1);

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM journeys WHERE id = ?'), [1]);
      expect(journey).toEqual(mockJourney);
    });

    it('should return null if journey not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const journey = await JourneyService.getJourneyById(999);

      expect(journey).toBeNull();
    });
  });

  describe('getEventsByJourneyId', () => {
    beforeEach(async () => {
      await JourneyService.initDatabase();
    });

    it('should retrieve events for specific journey', async () => {
      const mockEvents = [
        { id: 1, journeyId: 1, type: EventType.HarshBraking, penalty: 1 },
        { id: 2, journeyId: 1, type: EventType.SharpTurn, penalty: 1 },
      ];
      mockDb.getAllAsync.mockResolvedValue(mockEvents);

      const events = await JourneyService.getEventsByJourneyId(1);

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM events WHERE journeyId = ?'), [1]);
      expect(events).toEqual(mockEvents);
    });

    it('should return empty array if no events found', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const events = await JourneyService.getEventsByJourneyId(999);

      expect(events).toEqual([]);
    });
  });
});
