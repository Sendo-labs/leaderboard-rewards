import { config } from 'dotenv';
import { PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

config();

export interface OracleConfig {
  rpcUrl: string;
  cluster: string;
  programId: PublicKey;
  oracleKeypair: Keypair;
  leaderboardApiUrl?: string;
  leaderboardDataFile?: string;
  epochRewardAmount: number;
  epochDurationDays: number;
  dailyCronSchedule: string;
  weeklyCronSchedule: string;
  logLevel: string;
  logFile: string;
}

function loadKeypair(privateKey: string): Keypair {
  try {
    let decoded: Uint8Array;
    
    if (privateKey.length === 88) {
      decoded = Buffer.from(privateKey, 'base64');
    } else {
      decoded = bs58.decode(privateKey);
    }
    
    return Keypair.fromSecretKey(decoded);
  } catch (error) {
    console.error('Failed to load oracle keypair:', error);
    throw new Error('Invalid ORACLE_PRIVATE_KEY format. Must be base58 or base64 encoded.');
  }
}

export function loadConfig(): OracleConfig {
  const requiredVars = {
    RPC_URL: process.env.RPC_URL,
    PROGRAM_ID: process.env.PROGRAM_ID,
    ORACLE_PRIVATE_KEY: process.env.ORACLE_PRIVATE_KEY,
  };

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    rpcUrl: process.env.RPC_URL!,
    cluster: process.env.CLUSTER || 'devnet',
    programId: new PublicKey(process.env.PROGRAM_ID!),
    oracleKeypair: loadKeypair(process.env.ORACLE_PRIVATE_KEY!),
    leaderboardApiUrl: process.env.LEADERBOARD_API_URL,
    leaderboardDataFile: process.env.LEADERBOARD_DATA_FILE,
    epochRewardAmount: parseInt(process.env.EPOCH_REWARD_AMOUNT || '100000000000000'),
    epochDurationDays: parseInt(process.env.EPOCH_DURATION_DAYS || '7'),
    dailyCronSchedule: process.env.DAILY_CRON_SCHEDULE || '0 0 * * *',
    weeklyCronSchedule: process.env.WEEKLY_CRON_SCHEDULE || '0 0 * * 0',
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || 'oracle-bot.log',
  };
}

