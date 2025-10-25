import { Connection } from '@solana/web3.js';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { ProgramClient } from './client.js';
import { LeaderboardFetcher } from './leaderboard.js';
import { OracleOperations } from './oracle.js';

async function dailyUpdate(
  oracle: OracleOperations,
  fetcher: LeaderboardFetcher,
  logger: Logger
) {
  try {
    logger.info('=== Starting daily XP sync ===');

    const contributors = await fetcher.fetchLeaderboard();
    logger.info(`Fetched ${contributors.length} contributors from leaderboard`);

    if (contributors.length === 0) {
      logger.warn('No contributors found, skipping update');
      return;
    }

    const result = await oracle.syncMultipleContributors(contributors);

    logger.info('=== Daily sync complete ===');
    logger.info(`Successful: ${result.successful}`);
    logger.info(`Failed: ${result.failed}`);
    logger.info(`Total XP synced: ${result.totalXpSynced}`);
    logger.info(`SBT tokens earned: ${result.totalSbtEarned}`);

    if (result.failed > 0) {
      logger.warn(`${result.failed} contributors failed to sync`);
    }
  } catch (error) {
    logger.error('Daily sync failed:', error);
  }
}

async function weeklyUpdate(
  oracle: OracleOperations,
  config: any,
  logger: Logger
) {
  try {
    logger.info('=== Starting weekly epoch management ===');

    const finalized = await oracle.checkAndFinalizeCurrentEpoch();

    if (finalized) {
      logger.info('Current epoch finalized successfully');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const tx = await oracle.createEpoch(config.epochRewardAmount);
      logger.info('New epoch created:', tx);
    } else {
      logger.info('No epoch to finalize, creating new epoch');
      const tx = await oracle.createEpoch(config.epochRewardAmount);
      logger.info('New epoch created:', tx);
    }

    logger.info('=== Weekly update complete ===');
  } catch (error) {
    logger.error('Weekly update failed:', error);
  }
}

async function runScheduler() {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFile);
  
  logger.info('=== Leaderboard Rewards Oracle Bot Started ===');
  logger.info(`Cluster: ${config.cluster}`);
  logger.info(`RPC: ${config.rpcUrl}`);
  logger.info(`Program: ${config.programId.toString()}`);
  logger.info(`Oracle: ${config.oracleKeypair.publicKey.toString()}`);

  const connection = new Connection(config.rpcUrl, 'confirmed');
  const client = new ProgramClient(config, connection);
  const fetcher = new LeaderboardFetcher(
    config.leaderboardApiUrl,
    config.leaderboardDataFile,
    logger
  );
  const oracle = new OracleOperations(client, config, logger);

  logger.info(`Daily schedule: ${config.dailyCronSchedule}`);
  logger.info(`Weekly schedule: ${config.weeklyCronSchedule}`);

  cron.schedule(config.dailyCronSchedule, async () => {
    await dailyUpdate(oracle, fetcher, logger);
  });

  cron.schedule(config.weeklyCronSchedule, async () => {
    await weeklyUpdate(oracle, config, logger);
  });

  logger.info('Scheduler started, waiting for scheduled tasks...');
  logger.info('Press Ctrl+C to stop');
}

async function runOnce(mode: 'daily' | 'weekly') {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFile);
  
  logger.info('=== Running one-time update ===');

  const connection = new Connection(config.rpcUrl, 'confirmed');
  const client = new ProgramClient(config, connection);
  const fetcher = new LeaderboardFetcher(
    config.leaderboardApiUrl,
    config.leaderboardDataFile,
    logger
  );
  const oracle = new OracleOperations(client, config, logger);

  if (mode === 'daily') {
    await dailyUpdate(oracle, fetcher, logger);
  } else {
    await weeklyUpdate(oracle, config, logger);
  }

  logger.info('=== Update complete ===');
  process.exit(0);
}

const args = process.argv.slice(2);

if (args.includes('--daily')) {
  runOnce('daily').catch(console.error);
} else if (args.includes('--weekly')) {
  runOnce('weekly').catch(console.error);
} else if (args.includes('--help')) {
  console.log(`
Leaderboard Rewards Oracle Bot

Usage:
  npm start              - Start scheduled bot (daily + weekly)
  npm run update-daily   - Run daily update once
  npm run update-weekly  - Run weekly update once
  npm run dev            - Run in development mode with watch
  `);
  process.exit(0);
} else {
  runScheduler().catch(console.error);
}

