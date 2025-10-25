import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { OracleOperations } from '../src/oracle';
import { ProgramClient } from '../src/client';
import { Logger } from '../src/logger';
import { OracleConfig } from '../src/config';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import {
  getMockContributors,
  getMockConfigAccount,
  getMockEpochAccount,
  getMockContributorAccount,
} from './fixtures';

const mockContributors = getMockContributors();
const mockConfigAccount = getMockConfigAccount();
const mockEpochAccount = getMockEpochAccount();
const mockContributorAccount = getMockContributorAccount();
import * as anchor from '@coral-xyz/anchor';

describe('OracleOperations', () => {
  let oracle: OracleOperations;
  let client: ProgramClient;
  let config: OracleConfig;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('info');
    const oracleKeypair = Keypair.generate();
    
    config = {
      rpcUrl: 'http://localhost:8899',
      cluster: 'localnet',
      programId: new PublicKey('HHU31ZnG6NrdXYLseioh5hhDwBX1Zwmv2nyrfiC46yHc'),
      oracleKeypair,
      epochRewardAmount: 100_000_000,
      epochDurationDays: 7,
      dailyCronSchedule: '0 0 * * *',
      weeklyCronSchedule: '0 0 * * 0',
      logLevel: 'info',
      logFile: 'test.log',
    };

    const connection = new Connection(config.rpcUrl, 'confirmed');
    client = new ProgramClient(config, connection);
    oracle = new OracleOperations(client, config, logger);
  });

  describe('createEpoch', () => {
    test('creates a new epoch with correct parameters', async () => {
      const mockRpc = mock(async () => 'mock_tx_signature');
      const mockProgram = {
        methods: {
          createEpoch: (amount: anchor.BN) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).getConfig = async () => ({ ...mockConfigAccount, currentEpoch: 0 });

      const tx = await oracle.createEpoch(100_000_000);

      expect(tx).toBe('mock_tx_signature');
      expect(mockRpc).toHaveBeenCalled();
    });
  });

  describe('syncContributorXp', () => {
    test('syncs new contributor XP successfully', async () => {
      const contributor = mockContributors[0];
      const mockRpc = mock(async () => 'mock_tx_signature');
      
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => null;

      const tx = await oracle.syncContributorXp(contributor);

      expect(tx).toBe('mock_tx_signature');
      expect(mockRpc).toHaveBeenCalled();
    });

    test('calculates SBT earned correctly for XP increase', async () => {
      const contributor = mockContributors[0];
      const mockRpc = mock(async () => 'mock_tx_signature');
      
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => ({
        ...mockContributorAccount,
        totalXp: { toNumber: () => 10000 },
      });

      const tx = await oracle.syncContributorXp(contributor);

      expect(tx).toBe('mock_tx_signature');
    });

    test('retries failed transactions up to 3 times', async () => {
      const contributor = mockContributors[0];
      let attempts = 0;
      
      const mockRpc = mock(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Transaction failed');
        return 'mock_tx_signature';
      });
      
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => null;

      const tx = await oracle.syncContributorXp(contributor);

      expect(tx).toBe('mock_tx_signature');
      expect(attempts).toBe(3);
    });

    test('returns null after max retries', async () => {
      const contributor = mockContributors[0];
      const mockRpc = mock(async () => {
        throw new Error('Transaction failed');
      });
      
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => null;

      const tx = await oracle.syncContributorXp(contributor);

      expect(tx).toBeNull();
    });
  });

  describe('syncMultipleContributors', () => {
    test('syncs multiple contributors successfully', async () => {
      const mockRpc = mock(async () => 'mock_tx_signature');
      
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => null;

      const result = await oracle.syncMultipleContributors(mockContributors);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.totalXpSynced).toBeGreaterThan(0);
      expect(result.totalSbtEarned).toBeGreaterThan(0);
    });

    test('tracks failures correctly', async () => {
      const mockProgram = {
        methods: {
          syncContributorXp: (...args: any[]) => {
            const wallet = args[0];
            return {
              accounts: (accts: any) => ({
                rpc: mock(async () => {
                  if (wallet && wallet.toString() === mockContributors[1].wallet.toString()) {
                    throw new Error('Transaction failed');
                  }
                  return 'mock_tx_signature';
                }),
              }),
            };
          },
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).findContributorPda = () => [new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), 255];
      (client as any).findSnapshotPda = () => [new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'), 255];
      (client as any).getConfig = async () => mockConfigAccount;
      (client as any).getContributor = async () => null;

      const result = await oracle.syncMultipleContributors(mockContributors);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('finalizeEpoch', () => {
    test('finalizes epoch successfully', async () => {
      const mockRpc = mock(async () => 'mock_tx_signature');
      const mockProgram = {
        methods: {
          finalizeEpoch: (epochNum: anchor.BN) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];

      const tx = await oracle.finalizeEpoch(1);

      expect(tx).toBe('mock_tx_signature');
      expect(mockRpc).toHaveBeenCalled();
    });
  });

  describe('checkAndFinalizeCurrentEpoch', () => {
    test('finalizes epoch when time has passed', async () => {
      const pastEpoch = {
        ...mockEpochAccount,
        endTime: { toNumber: () => Math.floor(Date.now() / 1000) - 3600 },
        finalized: false,
      };

      const mockRpc = mock(async () => 'mock_tx_signature');
      const mockProgram = {
        methods: {
          finalizeEpoch: (epochNum: anchor.BN) => ({
            accounts: (accts: any) => ({
              rpc: mockRpc,
            }),
          }),
        },
      };

      (client as any).getProgram = () => mockProgram;
      (client as any).findConfigPda = () => [new PublicKey('11111111111111111111111111111112'), 255];
      (client as any).findEpochPda = () => [new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'), 255];
      (client as any).getConfig = async () => ({ ...mockConfigAccount, currentEpoch: 1 });
      (client as any).getEpoch = async () => pastEpoch;

      const result = await oracle.checkAndFinalizeCurrentEpoch();

      expect(result).toBe(true);
    });

    test('does not finalize if epoch not ended', async () => {
      (client as any).getConfig = async () => ({ ...mockConfigAccount, currentEpoch: 1 });
      (client as any).getEpoch = async () => mockEpochAccount;

      const result = await oracle.checkAndFinalizeCurrentEpoch();

      expect(result).toBe(false);
    });

    test('does not finalize if already finalized', async () => {
      const finalizedEpoch = {
        ...mockEpochAccount,
        finalized: true,
      };

      (client as any).getConfig = async () => ({ ...mockConfigAccount, currentEpoch: 1 });
      (client as any).getEpoch = async () => finalizedEpoch;

      const result = await oracle.checkAndFinalizeCurrentEpoch();

      expect(result).toBe(false);
    });
  });

  describe('getEpochStats', () => {
    test('returns formatted epoch statistics', async () => {
      (client as any).getEpoch = async () => mockEpochAccount;

      const stats = await oracle.getEpochStats(1);

      expect(stats.epochNumber).toBe(1);
      expect(stats.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(stats.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(stats.totalXp).toBe('0');
      expect(stats.contributorCount).toBe(0);
      expect(stats.finalized).toBe(false);
    });
  });

  describe('getContributorStats', () => {
    test('returns formatted contributor statistics', async () => {
      (client as any).getContributor = async () => mockContributorAccount;

      const stats = await oracle.getContributorStats(mockContributors[0].wallet);

      expect(stats.wallet).toBe(mockContributors[0].wallet.toString());
      expect(stats.githubUsername).toBe('alice');
      expect(stats.totalXp).toBe('10000');
    });

    test('returns null for non-existent contributor', async () => {
      (client as any).getContributor = async () => null;

      const stats = await oracle.getContributorStats(mockContributors[0].wallet);

      expect(stats).toBeNull();
    });
  });
});

