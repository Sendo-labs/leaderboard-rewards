import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { ProgramClient } from './client.js';
import { ContributorData, XpCategory } from './leaderboard.js';
import { Logger } from './logger.js';
import { OracleConfig } from './config.js';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const RETRY_BACKOFF_MULTIPLIER = 2;
const XP_TO_SBT_RATIO = 100;
const BATCH_SIZE = 20;
const BATCH_DELAY = 100;

function calculateBackoffDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
  const jitter = Math.random() * 200;
  return Math.min(delay + jitter, MAX_RETRY_DELAY);
}

export class OracleOperations {
  constructor(
    private client: ProgramClient,
    private config: OracleConfig,
    private logger: Logger
  ) {}

  async createEpoch(usdcRewardAmount: number): Promise<string> {
    try {
      const program = this.client.getProgram();
      const [configPda] = this.client.findConfigPda();
      const configData = await this.client.getConfig();
      const nextEpochNumber = configData.currentEpoch + 1;
      const [epochPda] = this.client.findEpochPda(nextEpochNumber);

      this.logger.info(`Creating epoch ${nextEpochNumber} with ${usdcRewardAmount} USDC rewards`);

      const tx = await program.methods
        .createEpoch(new anchor.BN(usdcRewardAmount))
        .accounts({
          config: configPda,
          epoch: epochPda,
          oracle: this.config.oracleKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.logger.info(`Epoch ${nextEpochNumber} created. Tx: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to create epoch:', error);
      throw error;
    }
  }

  async syncContributorXp(contributorData: ContributorData): Promise<string | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const program = this.client.getProgram();
        const [configPda] = this.client.findConfigPda();
        const configData = await this.client.getConfig();
        const currentEpoch = configData.currentEpoch;
        
        const [epochPda] = this.client.findEpochPda(currentEpoch);
        const [contributorPda] = this.client.findContributorPda(contributorData.wallet);
        const [snapshotPda] = this.client.findSnapshotPda(currentEpoch, contributorData.wallet);

        const existingContributor = await this.client.getContributor(contributorData.wallet);
        const oldXp = existingContributor?.totalXp?.toNumber() || 0;
        const xpDelta = contributorData.totalXp - oldXp;
        const sbtEarned = Math.floor(xpDelta * XP_TO_SBT_RATIO);

        const totalXpBN = new anchor.BN(contributorData.totalXp);
        
        const roleXpData = contributorData.roleXp.map(cat => ({
          name: cat.name,
          amount: new anchor.BN(cat.amount)
        }));
        
        const domainXpData = contributorData.domainXp.map(cat => ({
          name: cat.name,
          amount: new anchor.BN(cat.amount)
        }));
        
        const skillXpData = contributorData.skillXp.map(cat => ({
          name: cat.name,
          amount: new anchor.BN(cat.amount)
        }));

        const tx = await program.methods
          .syncContributorXp(
            contributorData.wallet,
            contributorData.githubUsername,
            totalXpBN,
            roleXpData,
            domainXpData,
            skillXpData
          )
          .accounts({
            config: configPda,
            epoch: epochPda,
            contributor: contributorPda,
            snapshot: snapshotPda,
            oracle: this.config.oracleKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        this.logger.debug(
          `Synced ${contributorData.githubUsername}: ${contributorData.totalXp} XP ` +
          `(+${xpDelta} XP, ${sbtEarned} SBT earned). Tx: ${tx}`
        );
        
        if (roleXpData.length > 0) {
          const roleBreakdown = roleXpData.map(r => `${r.name}:${r.amount}`).join(', ');
          this.logger.debug(`  Roles: ${roleBreakdown}`);
        }
        
        return tx;
      } catch (error: any) {
        if (attempt < MAX_RETRIES) {
          const delay = calculateBackoffDelay(attempt);
          this.logger.warn(
            `Attempt ${attempt} failed for ${contributorData.githubUsername}, retrying in ${delay}ms...`,
            error.message
          );
          await this.sleep(delay);
        } else {
          this.logger.error(
            `Failed to sync XP for ${contributorData.githubUsername} after ${MAX_RETRIES} attempts:`,
            error
          );
          return null;
        }
      }
    }
    return null;
  }

  async syncMultipleContributors(contributors: ContributorData[]): Promise<{
    successful: number;
    failed: number;
    totalXpSynced: number;
    totalSbtEarned: number;
    errors: Array<{ contributor: string; error: string }>;
  }> {
    this.logger.info(`Syncing XP for ${contributors.length} contributors in batches of ${BATCH_SIZE}`);

    let successful = 0;
    let failed = 0;
    let totalXpSynced = 0;
    let totalSbtEarned = 0;
    const errors: Array<{ contributor: string; error: string }> = [];

    for (let i = 0; i < contributors.length; i += BATCH_SIZE) {
      const batch = contributors.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(contributors.length / BATCH_SIZE);
      
      this.logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} contributors)`);

      const results = await Promise.allSettled(
        batch.map(async (contributor) => {
          const existingContributor = await this.client.getContributor(contributor.wallet);
          const oldXp = existingContributor?.totalXp?.toNumber() || 0;
          const xpDelta = contributor.totalXp - oldXp;

          const tx = await this.syncContributorXp(contributor);

          return {
            contributor: contributor.githubUsername,
            tx,
            xpDelta,
            sbtEarned: Math.floor(xpDelta * XP_TO_SBT_RATIO),
          };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { contributor, tx, xpDelta, sbtEarned } = result.value;
          if (tx) {
            successful++;
            totalXpSynced += xpDelta;
            totalSbtEarned += sbtEarned;
          } else {
            failed++;
            errors.push({
              contributor,
              error: 'Transaction failed after retries',
            });
          }
        } else {
          failed++;
          const contributorName = batch[results.indexOf(result)]?.githubUsername || 'unknown';
          errors.push({
            contributor: contributorName,
            error: result.reason?.message || 'Unknown error',
          });
        }
      }

      if (i + BATCH_SIZE < contributors.length) {
        await this.sleep(BATCH_DELAY);
      }
    }

    this.logger.info(
      `XP sync complete: ${successful} successful, ${failed} failed, ` +
      `${totalXpSynced} total XP, ${totalSbtEarned} SBT tokens earned`
    );
    
    if (errors.length > 0) {
      this.logger.warn('Errors:', errors);
    }

    return { successful, failed, totalXpSynced, totalSbtEarned, errors };
  }

  async finalizeEpoch(epochNumber: number): Promise<string> {
    try {
      const program = this.client.getProgram();
      const [configPda] = this.client.findConfigPda();
      const [epochPda] = this.client.findEpochPda(epochNumber);

      this.logger.info(`Finalizing epoch ${epochNumber}`);

      const tx = await program.methods
        .finalizeEpoch(new anchor.BN(epochNumber))
        .accounts({
          config: configPda,
          epoch: epochPda,
          oracle: this.config.oracleKeypair.publicKey,
        })
        .rpc();

      this.logger.info(`Epoch ${epochNumber} finalized. Tx: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to finalize epoch:', error);
      throw error;
    }
  }

  async checkAndFinalizeCurrentEpoch(): Promise<boolean> {
    try {
      const configData = await this.client.getConfig();
      const currentEpoch = configData.currentEpoch;

      if (currentEpoch === 0) {
        this.logger.info('No epochs to finalize');
        return false;
      }

      const epochData = await this.client.getEpoch(currentEpoch);

      if (epochData.finalized) {
        this.logger.info(`Epoch ${currentEpoch} is already finalized`);
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      const endTime = epochData.endTime.toNumber();

      if (now >= endTime) {
        await this.finalizeEpoch(currentEpoch);
        return true;
      } else {
        const hoursRemaining = Math.floor((endTime - now) / 3600);
        this.logger.info(
          `Epoch ${currentEpoch} not yet ended (${hoursRemaining}h remaining)`
        );
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to check and finalize epoch:', error);
      return false;
    }
  }

  async getEpochStats(epochNumber: number): Promise<any> {
    try {
      const epochData = await this.client.getEpoch(epochNumber);
      return {
        epochNumber,
        startTime: new Date(epochData.startTime.toNumber() * 1000).toISOString(),
        endTime: new Date(epochData.endTime.toNumber() * 1000).toISOString(),
        totalXp: epochData.totalXp.toString(),
        usdcRewardAmount: epochData.usdcRewardAmount?.toString() || epochData.rewardAmount?.toString(),
        contributorCount: epochData.contributorCount,
        finalized: epochData.finalized,
      };
    } catch (error) {
      this.logger.error('Failed to get epoch stats:', error);
      throw error;
    }
  }

  async getContributorStats(wallet: PublicKey): Promise<any> {
    try {
      const contributor = await this.client.getContributor(wallet);
      
      if (!contributor) {
        return null;
      }

      return {
        wallet: wallet.toString(),
        githubUsername: contributor.githubUsername,
        totalXp: contributor.totalXp.toString(),
        roleXp: contributor.roleXp,
        domainXp: contributor.domainXp,
        skillXp: contributor.skillXp,
        lifetimeUsdcEarned: contributor.lifetimeUsdcEarned?.toString(),
        totalSbtClaimable: contributor.totalSbtClaimable?.toString(),
        totalSbtClaimed: contributor.totalSbtClaimed?.toString(),
        sbtUnclaimed: contributor.totalSbtClaimable
          ?.sub(contributor.totalSbtClaimed)
          .toString(),
      };
    } catch (error) {
      this.logger.error('Failed to get contributor stats:', error);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
