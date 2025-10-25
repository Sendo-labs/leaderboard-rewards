import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { OracleConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';

export interface LeaderboardRewardsProgram {
  config: PublicKey;
  rewardMint: PublicKey;
  rewardVault: PublicKey;
  currentEpoch: number;
}

export class ProgramClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(
    private config: OracleConfig,
    private connection: Connection
  ) {
    const wallet = new anchor.Wallet(config.oracleKeypair);
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    
    const idlPath = path.join(process.cwd(), '../target/idl/leaderboard_rewards.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
    
    this.program = new Program(idl, this.provider);
  }

  getProgram(): Program {
    return this.program;
  }

  getProvider(): AnchorProvider {
    return this.provider;
  }

  findConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.config.programId
    );
  }

  findEpochPda(epochNumber: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('epoch'),
        Buffer.from(new anchor.BN(epochNumber).toArray('le', 8))
      ],
      this.config.programId
    );
  }

  findContributorPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('contributor'), wallet.toBuffer()],
      this.config.programId
    );
  }

  findSnapshotPda(epochNumber: number, wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('snapshot'),
        Buffer.from(new anchor.BN(epochNumber).toArray('le', 8)),
        wallet.toBuffer()
      ],
      this.config.programId
    );
  }

  async getConfig(): Promise<any> {
    const [configPda] = this.findConfigPda();
    return await this.program.account.config.fetch(configPda);
  }

  async getEpoch(epochNumber: number): Promise<any> {
    const [epochPda] = this.findEpochPda(epochNumber);
    return await this.program.account.rewardEpoch.fetch(epochPda);
  }

  async getContributor(wallet: PublicKey): Promise<any | null> {
    try {
      const [contributorPda] = this.findContributorPda(wallet);
      return await this.program.account.contributor.fetch(contributorPda);
    } catch {
      return null;
    }
  }

  async getSnapshot(epochNumber: number, wallet: PublicKey): Promise<any | null> {
    try {
      const [snapshotPda] = this.findSnapshotPda(epochNumber, wallet);
      return await this.program.account.epochSnapshot.fetch(snapshotPda);
    } catch {
      return null;
    }
  }
}

