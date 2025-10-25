import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface XpSyncedEvent {
  wallet: string;
  githubUsername: string;
  epoch: number;
  totalXp: number;
  roleXp: Array<{ name: string; amount: number }>;
  domainXp: Array<{ name: string; amount: number }>;
  skillXp: Array<{ name: string; amount: number }>;
  sbtEarned: number;
  timestamp: number;
  isRegistered: boolean;
}

interface IndexedData {
  events: XpSyncedEvent[];
  lastProcessedSlot: number;
  lastUpdated: string;
}

class LeaderboardIndexer {
  private connection: Connection;
  private program: Program;
  private dataFile: string;
  private data: IndexedData;

  constructor() {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    const programId = new PublicKey(process.env.PROGRAM_ID!);
    const idlPath = path.join(__dirname, '../../target/idl/leaderboard_rewards.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    const wallet = Wallet.local();
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed',
    });
    
    this.program = new Program(idl, provider);
    this.dataFile = path.join(__dirname, '../data/indexed-events.json');
    this.data = this.loadData();
    
    console.log('✅ Indexer initialized');
    console.log(`   Program: ${programId.toString()}`);
    console.log(`   RPC: ${rpcUrl}`);
    console.log(`   Events indexed: ${this.data.events.length}`);
  }

  private loadData(): IndexedData {
    try {
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.log('No existing data found, starting fresh');
    }
    
    return {
      events: [],
      lastProcessedSlot: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveData() {
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
  }

  async startIndexing() {
    console.log('🔄 Starting event indexing...');
    
    const eventName = 'XpSyncedEvent';
    let eventSubscriptionId: number;
    
    try {
      eventSubscriptionId = this.program.addEventListener(
        eventName,
        (event: any, slot: number) => {
          this.handleEvent(event, slot);
        }
      );
      
      console.log(`✅ Subscribed to ${eventName} events`);
      console.log('   Listening for new XP syncs...\n');
      
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down indexer...');
        await this.program.removeEventListener(eventSubscriptionId);
        this.saveData();
        process.exit(0);
      });
      
      await new Promise(() => {});
      
    } catch (error) {
      console.error('❌ Indexing error:', error);
      throw error;
    }
  }

  private handleEvent(event: any, slot: number) {
    try {
      const xpEvent: XpSyncedEvent = {
        wallet: event.wallet.toString(),
        githubUsername: event.githubUsername,
        epoch: event.epoch.toNumber(),
        totalXp: event.totalXp.toNumber(),
        roleXp: event.roleXp.map((cat: any) => ({
          name: cat.name,
          amount: cat.amount.toNumber(),
        })),
        domainXp: event.domainXp.map((cat: any) => ({
          name: cat.name,
          amount: cat.amount.toNumber(),
        })),
        skillXp: event.skillXp.map((cat: any) => ({
          name: cat.name,
          amount: cat.amount.toNumber(),
        })),
        sbtEarned: event.sbtEarned.toNumber(),
        timestamp: event.timestamp.toNumber(),
        isRegistered: event.isRegistered,
      };

      this.data.events.push(xpEvent);
      
      if (slot > this.data.lastProcessedSlot) {
        this.data.lastProcessedSlot = slot;
      }

      const status = xpEvent.isRegistered ? '✅ REGISTERED' : '⏳ UNREGISTERED';
      console.log(`${status} | ${xpEvent.githubUsername} | ${xpEvent.totalXp} XP | +${xpEvent.sbtEarned} SBT | Epoch ${xpEvent.epoch}`);
      
      if (this.data.events.length % 10 === 0) {
        this.saveData();
        console.log(`💾 Saved ${this.data.events.length} events to disk\n`);
      }
      
    } catch (error) {
      console.error('❌ Error handling event:', error);
    }
  }

  async backfillHistory(startSlot?: number) {
    console.log('🔄 Backfilling historical events...');
    
    const signatures = await this.connection.getSignaturesForAddress(
      this.program.programId,
      { limit: 1000 },
      'confirmed'
    );
    
    console.log(`Found ${signatures.length} transactions to process`);
    
    for (const sigInfo of signatures.reverse()) {
      if (startSlot && sigInfo.slot < startSlot) continue;
      if (sigInfo.slot <= this.data.lastProcessedSlot) continue;
      
      try {
        const tx = await this.connection.getTransaction(sigInfo.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        
        if (tx && tx.meta && tx.meta.logMessages) {
          const events = this.parseEventsFromLogs(tx.meta.logMessages);
          for (const event of events) {
            this.handleEvent(event, sigInfo.slot);
          }
        }
      } catch (error) {
        console.error(`Failed to process tx ${sigInfo.signature}:`, error);
      }
    }
    
    this.saveData();
    console.log('✅ Backfill complete\n');
  }

  private parseEventsFromLogs(logs: string[]): any[] {
    return [];
  }

  getEventsForWallet(wallet: string): XpSyncedEvent[] {
    return this.data.events.filter(e => e.wallet === wallet);
  }

  getUnclaimedEpochs(wallet: string, registrationTime: number): number[] {
    const ninetyDaysAgo = registrationTime - (90 * 24 * 60 * 60);
    
    const eligibleEvents = this.data.events.filter(
      e => e.wallet === wallet && e.timestamp >= ninetyDaysAgo
    );
    
    const epochs = new Set(eligibleEvents.map(e => e.epoch));
    return Array.from(epochs).sort((a, b) => a - b);
  }
}

async function main() {
  const indexer = new LeaderboardIndexer();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'backfill') {
    const startSlot = args[1] ? parseInt(args[1]) : undefined;
    await indexer.backfillHistory(startSlot);
  } else {
    await indexer.startIndexing();
  }
}

main().catch(console.error);

