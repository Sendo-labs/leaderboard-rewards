import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { LeaderboardFetcher } from '../src/leaderboard';
import { Logger } from '../src/logger';
import { mockLeaderboardExportV2, mockLeaderboardExportV1, mockContributors } from './fixtures';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

describe('LeaderboardFetcher', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('info');
  });

  describe('fetchFromApi', () => {
    test('fetches and parses v2.0 format from API', async () => {
      const mockFetch = mock(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => mockLeaderboardExportV2,
      }));
      global.fetch = mockFetch as any;

      const fetcher = new LeaderboardFetcher(
        'https://example.com/leaderboard.json',
        undefined,
        logger
      );

      const contributors = await fetcher.fetchLeaderboard();

      expect(contributors).toHaveLength(3);
      expect(contributors[0].githubUsername).toBe('alice');
      expect(contributors[0].totalXp).toBe(12500);
      expect(contributors[0].roleXp.length).toBeGreaterThan(0);
      expect(contributors[0].wallet).toBeInstanceOf(PublicKey);
      
      const aliceRoleXp = contributors[0].roleXp.reduce((sum, cat) => sum + cat.amount, 0);
      expect(aliceRoleXp).toBeGreaterThan(0);
    });

    test('handles v1.0 format (backward compatibility)', async () => {
      const mockFetch = mock(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => mockLeaderboardExportV1,
      }));
      global.fetch = mockFetch as any;

      const fetcher = new LeaderboardFetcher(
        'https://example.com/leaderboard.json',
        undefined,
        logger
      );

      const contributors = await fetcher.fetchLeaderboard();

      expect(contributors).toHaveLength(2);
      expect(contributors[0].githubUsername).toBe('alice');
      expect(contributors[0].totalXp).toBe(12500);
      expect(contributors[0].roleXp).toHaveLength(1);
      expect(contributors[0].roleXp[0].name).toBe('contributor');
      expect(contributors[0].roleXp[0].amount).toBe(12500);
    });

    test('throws error on API failure', async () => {
      const mockFetch = mock(async (url: string) => ({
        ok: false,
        status: 404,
      }));
      global.fetch = mockFetch as any;

      const fetcher = new LeaderboardFetcher(
        'https://example.com/leaderboard.json',
        undefined,
        logger
      );

      expect(fetcher.fetchLeaderboard()).rejects.toThrow();
    });
  });

  describe('parseLeaderboardData', () => {
    test('parses contributor with all XP categories', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const data = {
        contributors: [{
          githubUsername: 'alice',
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          totalXp: 1000,
          roleXp: { developer: 800, reviewer: 200 },
          domainXp: { core: 600, ui: 400 },
          skillXp: { typescript: 700, react: 300 },
        }],
      };

      const contributors = (fetcher as any).parseLeaderboardData(data);

      expect(contributors).toHaveLength(1);
      expect(contributors[0].roleXp).toEqual([
        { name: 'developer', amount: 800 },
        { name: 'reviewer', amount: 200 },
      ]);
      expect(contributors[0].domainXp).toEqual([
        { name: 'core', amount: 600 },
        { name: 'ui', amount: 400 },
      ]);
      expect(contributors[0].skillXp).toEqual([
        { name: 'typescript', amount: 700 },
        { name: 'react', amount: 300 },
      ]);
    });

    test('handles missing XP categories by creating default', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const data = {
        contributors: [{
          githubUsername: 'alice',
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          totalXp: 1000,
        }],
      };

      const contributors = (fetcher as any).parseLeaderboardData(data);

      expect(contributors).toHaveLength(1);
      expect(contributors[0].roleXp).toHaveLength(1);
      expect(contributors[0].roleXp[0].name).toBe('contributor');
      expect(contributors[0].roleXp[0].amount).toBe(1000);
    });

    test('filters out invalid wallet addresses', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const data = {
        contributors: [
          {
            githubUsername: 'alice',
            wallet: 'invalid_wallet',
            totalXp: 1000,
          },
          {
            githubUsername: 'bob',
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            totalXp: 500,
          },
        ],
      };

      const contributors = (fetcher as any).parseLeaderboardData(data);

      expect(contributors).toHaveLength(1);
      expect(contributors[0].githubUsername).toBe('bob');
    });

    test('filters out contributors with zero or negative XP', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const data = {
        contributors: [
          {
            githubUsername: 'alice',
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAs',
            totalXp: 0,
          },
          {
            githubUsername: 'bob',
            wallet: '8yMXts3DW88e97TYJTEqcD6jCjifeTrB94UTZVnktBs',
            totalXp: -100,
          },
          {
            githubUsername: 'charlie',
            wallet: '9zMYtu4EX89f98UZKTFrdE7kDjkgfUsBsC95VWoNuCt',
            totalXp: 100,
          },
        ],
      };

      const contributors = (fetcher as any).parseLeaderboardData(data);

      expect(contributors).toHaveLength(1);
      expect(contributors[0].githubUsername).toBe('charlie');
    });

    test('handles various field name formats', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const data = {
        contributors: [
          {
            github_username: 'alice',
            wallet_address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            total_xp: 1000,
          },
          {
            username: 'bob',
            address: '8yLXts3DW88e97TYJTEqcD6jCjifeTrB94UTZVnktBsV',
            xp: 500,
          },
        ],
      };

      const contributors = (fetcher as any).parseLeaderboardData(data);

      expect(contributors).toHaveLength(2);
      expect(contributors.map((c: any) => c.githubUsername)).toEqual(['alice', 'bob']);
    });
  });

  describe('parseXpCategories', () => {
    test('converts object to XpCategory array', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const xpData = {
        typescript: 500,
        rust: 300,
        javascript: 200,
      };

      const categories = (fetcher as any).parseXpCategories(xpData);

      expect(categories).toHaveLength(3);
      expect(categories).toContainEqual({ name: 'typescript', amount: 500 });
      expect(categories).toContainEqual({ name: 'rust', amount: 300 });
      expect(categories).toContainEqual({ name: 'javascript', amount: 200 });
    });

    test('filters out zero and negative values', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const xpData = {
        typescript: 500,
        rust: 0,
        javascript: -100,
        python: 200,
      };

      const categories = (fetcher as any).parseXpCategories(xpData);

      expect(categories).toHaveLength(2);
      expect(categories.map((c: any) => c.name)).toEqual(['typescript', 'python']);
    });

    test('handles empty object', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const categories = (fetcher as any).parseXpCategories({});

      expect(categories).toHaveLength(0);
    });
  });

  describe('createMockData', () => {
    test('generates correct number of contributors', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const contributors = fetcher.createMockData(5);

      expect(contributors).toHaveLength(5);
    });

    test('generates valid contributor data', () => {
      const fetcher = new LeaderboardFetcher(undefined, undefined, logger);
      const contributors = fetcher.createMockData(1);

      expect(contributors[0].githubUsername).toMatch(/^contributor\d+$/);
      expect(contributors[0].totalXp).toBeGreaterThan(0);
      expect(contributors[0].roleXp.length).toBeGreaterThan(0);
      expect(contributors[0].domainXp.length).toBeGreaterThan(0);
      expect(contributors[0].skillXp.length).toBeGreaterThan(0);
      expect(contributors[0].wallet).toBeInstanceOf(PublicKey);
    });
  });
});

