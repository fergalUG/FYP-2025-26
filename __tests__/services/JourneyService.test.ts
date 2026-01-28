import { JourneyService } from '@services/JourneyService';
import { EventType } from '@types';
import { db, resetDatabase } from '@/db/client';
import { journeys, events } from '@/db/schema';

jest.mock('@/db/client', () => ({
  db: {
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  },
  resetDatabase: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  LogModule: { JourneyService: 'JourneyService' },
}));

const mockQuery = (resolveValue: any = undefined) => {
  const chain: any = {};

  const methods = ['from', 'where', 'orderBy', 'limit', 'values', 'returning', 'set', 'catch'];

  methods.forEach((method) => {
    chain[method] = jest.fn().mockReturnThis();
  });

  chain.then = (onFulfilled: any) => Promise.resolve(resolveValue).then(onFulfilled);

  chain.catch = (onRejected: any) => Promise.resolve(resolveValue).catch(onRejected);

  return chain;
};

describe('JourneyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (db.select as jest.Mock).mockReturnValue(mockQuery([]));
    (db.insert as jest.Mock).mockReturnValue(mockQuery([]));
    (db.update as jest.Mock).mockReturnValue(mockQuery());
    (db.delete as jest.Mock).mockReturnValue(mockQuery());
  });

  describe('initDatabase', () => {
    it('should reset database if tables are not found', async () => {
      const chain = mockQuery(null);
      (db.select as jest.Mock).mockReturnValue(chain);

      await JourneyService.initDatabase();

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalledWith(journeys);
      expect(chain.limit).toHaveBeenCalledWith(1);

      expect(resetDatabase).toHaveBeenCalled();
    });

    it('should NOT reset database if tables exist', async () => {
      const chain = mockQuery([{ id: 1 }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      await JourneyService.initDatabase();

      expect(resetDatabase).not.toHaveBeenCalled();
    });
  });

  describe('startJourney', () => {
    it('should insert a new journey and store the ID', async () => {
      const newJourneyId = 101;
      const chain = mockQuery([{ id: newJourneyId }]);
      (db.insert as jest.Mock).mockReturnValue(chain);

      await JourneyService.startJourney();

      expect(db.insert).toHaveBeenCalledWith(journeys);
      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Journey on'),
          date: expect.any(String),
          startTime: expect.any(Number),
        })
      );
      expect(chain.returning).toHaveBeenCalledWith({ id: journeys.id });

      expect(JourneyService.getCurrentJourneyId()).toBe(newJourneyId);
    });
  });

  describe('endJourney', () => {
    beforeEach(async () => {
      const chain = mockQuery([{ id: 50 }]);
      (db.insert as jest.Mock).mockReturnValue(chain);
      await JourneyService.startJourney();
      jest.clearAllMocks();
    });

    it('should update the journey with final stats', async () => {
      const chain = mockQuery();
      (db.update as jest.Mock).mockReturnValue(chain);

      const score = 88;
      const distance = 12.5;
      const stats = { durationMs: 5000, score: 88 } as any;

      await JourneyService.endJourney(score, distance, stats);

      expect(db.update).toHaveBeenCalledWith(journeys);
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          endTime: expect.any(Number),
          score,
          distanceKm: distance,
          stats,
        })
      );

      expect(JourneyService.getCurrentJourneyId()).toBeNull();
    });

    it('should do nothing if no journey is active', async () => {
      await JourneyService.endJourney(0, 0);
      jest.clearAllMocks();

      await JourneyService.endJourney(100, 10);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('logEvent', () => {
    beforeEach(async () => {
      const chain = mockQuery([{ id: 50 }]);
      (db.insert as jest.Mock).mockReturnValue(chain);
      await JourneyService.startJourney();
      jest.clearAllMocks();
    });

    it('should insert a new event linked to the journey', async () => {
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      const type = EventType.HarshBraking;
      const lat = 53.0;
      const lng = -6.0;
      const speed = 45;

      await JourneyService.logEvent(type, lat, lng, speed);

      expect(db.insert).toHaveBeenCalledWith(events);
      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          journeyId: 50,
          type,
          latitude: lat,
          longitude: lng,
          speed,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should not log event if no journey is active', async () => {
      await JourneyService.endJourney(0, 0);
      jest.clearAllMocks();

      await JourneyService.logEvent(EventType.HarshBraking, 0, 0, 0);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('getAllJourneys', () => {
    it('should select all journeys ordered by date/time', async () => {
      const mockData = [
        { id: 1, title: 'J1' },
        { id: 2, title: 'J2' },
      ];
      const chain = mockQuery(mockData);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await JourneyService.getAllJourneys();

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalledWith(journeys);
      expect(chain.orderBy).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });
  });

  describe('getJourneyById', () => {
    it('should select journey by ID', async () => {
      const mockJourney = { id: 1, title: 'Target' };
      const chain = mockQuery([mockJourney]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await JourneyService.getJourneyById(1);

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalledWith(journeys);
      expect(chain.where).toHaveBeenCalled();
      expect(result).toEqual(mockJourney);
    });

    it('should return null if not found', async () => {
      const chain = mockQuery([]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await JourneyService.getJourneyById(99);

      expect(result).toBeNull();
    });
  });

  describe('getEventsByJourneyId', () => {
    it('should select events filtered by journeyId', async () => {
      const mockEvents = [{ id: 1, type: EventType.JourneyStart }];
      const chain = mockQuery(mockEvents);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await JourneyService.getEventsByJourneyId(10);

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalledWith(events);
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(result).toEqual(mockEvents);
    });
  });

  describe('deleteJourney', () => {
    it('should delete journey by ID', async () => {
      const chain = mockQuery();
      (db.delete as jest.Mock).mockReturnValue(chain);

      const success = await JourneyService.deleteJourney(5);

      expect(db.delete).toHaveBeenCalledWith(journeys);
      expect(chain.where).toHaveBeenCalled();
      expect(success).toBe(true);
    });
  });
});
