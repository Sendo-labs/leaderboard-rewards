import { describe, test, expect, beforeEach } from 'bun:test';
import { LeaderboardFetcher } from '../src/leaderboard';
import { OracleOperations } from '../src/oracle';
import { ProgramClient } from '../src/client';
import { Logger } from '../src/logger';
import { getMockLeaderboardExportV2, mockConfigAccount, mockEpochAccount } from './fixtures';

describe('Integration Tests', () => {
  describe('Full Sync Flow', () => {
    test('fetches leaderboard data and formats for oracle', async () => {
      const logger = new Logger('info');
      
      global.fetch = async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => getMockLeaderboardExportV2(),
      }) as any;

      const fetcher = new LeaderboardFetcher(
        'https://example.com/leaderboard.json',
        undefined,
        logger
      );

      const contributors = await fetcher.fetchLeaderboard();

      expect(contributors).toHaveLength(3);
      expect(contributors[0].githubUsername).toBeDefined();
      expect(contributors[0].wallet).toBeDefined();
      expect(contributors[0].totalXp).toBeGreaterThan(0);
      expect(contributors[0].roleXp).toBeInstanceOf(Array);
      expect(contributors[0].domainXp).toBeInstanceOf(Array);
      expect(contributors[0].skillXp).toBeInstanceOf(Array);
      
      contributors.forEach(contributor => {
        expect(contributor.roleXp.length + contributor.domainXp.length + contributor.skillXp.length).toBeGreaterThan(0);
      });
    });

    test('validates XP categories against on-chain limits', () => {
      const logger = new Logger('info');
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      
      const mockData = {
        contributors: [{
          githubUsername: 'test',
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          totalXp: 1000,
          roleXp: Array(15).fill({ name: 'role', amount: 100 }),
          domainXp: Array(20).fill({ name: 'domain', amount: 100 }),
          skillXp: Array(25).fill({ name: 'skill', amount: 100 }),
        }],
      };

      const contributors = (fetcher as any).parseLeaderboardData(mockData);

      expect(contributors).toHaveLength(1);
      expect(contributors[0].roleXp.length).toBeLessThanOrEqual(10);
      expect(contributors[0].domainXp.length).toBeLessThanOrEqual(15);
      expect(contributors[0].skillXp.length).toBeLessThanOrEqual(20);
    });

    test('end-to-end data flow maintains data integrity', async () => {
      const logger = new Logger('info');
      
      global.fetch = async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => getMockLeaderboardExportV2(),
      }) as any;

      const fetcher = new LeaderboardFetcher(
        'https://example.com/leaderboard.json',
        undefined,
        logger
      );

      const contributors = await fetcher.fetchLeaderboard();

      const totalXpFromLeaderboard = getMockLeaderboardExportV2().contributors
        .reduce((sum, c) => sum + c.score, 0);
      
      const totalXpFromFetcher = contributors
        .reduce((sum, c) => sum + c.totalXp, 0);

      expect(totalXpFromFetcher).toBe(totalXpFromLeaderboard);

      contributors.forEach((c, i) => {
        const original = getMockLeaderboardExportV2().contributors[i];
        expect(c.githubUsername).toBe(original.username);
        expect(c.totalXp).toBe(original.score);
      });
    });
  });
});

