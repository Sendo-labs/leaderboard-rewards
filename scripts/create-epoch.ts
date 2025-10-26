import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { 
  Connection, 
  PublicKey,
  SystemProgram
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { loadOrGenerateKeypair } from './utils';

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function createEpoch() {
  const args = process.argv.slice(2);
  const rewardAmountArg = args[0] || '100000000000000';
  const rewardAmount = new BN(rewardAmountArg);
  
  console.log(`\n=== Creating New Epoch ===\n`);
  console.log(`Reward Amount: ${rewardAmount.toString()} tokens`);

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  const oracleKeypair = loadOrGenerateKeypair(
    path.join(__dirname, '../keys/oracle.json')
  );
  console.log(`Oracle: ${oracleKeypair.publicKey.toString()}`);
  
  const wallet = new anchor.Wallet(oracleKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);
  
  const idlPath = path.join(__dirname, '../target/idl/leaderboard_rewards.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  const programKeypair = loadOrGenerateKeypair(
    path.join(__dirname, '../target/deploy/leaderboard_rewards-keypair.json')
  );
  const programId = programKeypair.publicKey;
  
  const program = new Program(idl, provider);
  
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    programId
  );
  
  console.log('\nFetching current config...');
  const config = await program.account.config.fetch(configPda);
  const nextEpoch = config.currentEpoch + 1;
  
  console.log(`Current Epoch: ${config.currentEpoch}`);
  console.log(`Creating Epoch: ${nextEpoch}`);
  
  const [epochPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('epoch'),
      new BN(nextEpoch).toArrayLike(Buffer, 'le', 8)
    ],
    programId
  );
  console.log(`Epoch PDA: ${epochPda.toString()}`);
  
  console.log('\nCreating epoch...');
  const tx = await program.methods
    .createEpoch(rewardAmount)
    .accounts({
      config: configPda,
      epoch: epochPda,
      oracle: oracleKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log(`✅ Epoch ${nextEpoch} created successfully!`);
  console.log(`Transaction: ${tx}`);
  
  const epoch = await program.account.rewardEpoch.fetch(epochPda);
  console.log('\nEpoch Details:');
  console.log(`  Epoch Number: ${epoch.epochNumber}`);
  console.log(`  Start Time: ${new Date(epoch.startTime.toNumber() * 1000).toISOString()}`);
  console.log(`  End Time: ${new Date(epoch.endTime.toNumber() * 1000).toISOString()}`);
  console.log(`  Reward Amount: ${epoch.rewardAmount.toString()}`);
  console.log(`  Total XP: ${epoch.totalXp.toString()}`);
  console.log(`  Contributors: ${epoch.contributorCount}`);
  console.log(`  Finalized: ${epoch.finalized}`);
  
  console.log('\n=== Epoch Creation Complete ===\n');
}

createEpoch().catch(console.error);

