import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { 
  Connection, 
  PublicKey,
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { loadOrGenerateKeypair } from './utils';

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function claimSbt() {
  const args = process.argv.slice(2);
  const walletPath = args[0] || path.join(process.env.HOME!, '.config/solana/id.json');
  
  console.log(`\n=== Claiming SBT Tokens ===\n`);

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  const contributorKeypair = loadOrGenerateKeypair(walletPath);
  console.log(`Contributor: ${contributorKeypair.publicKey.toString()}`);
  
  const wallet = new anchor.Wallet(contributorKeypair);
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
  
  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), contributorKeypair.publicKey.toBuffer()],
    programId
  );
  
  console.log('\nFetching config...');
  const config = await program.account.config.fetch(configPda);
  const sbtMint = config.sbtMint;
  
  console.log(`SBT Mint: ${sbtMint.toString()}`);
  console.log(`SBT Minted So Far: ${config.sbtMinted}`);
  console.log(`SBT Remaining Supply: ${config.sbtTotalSupply.toNumber() - config.sbtMinted.toNumber()}`);
  
  console.log('\nFetching contributor data...');
  try {
    const contributor = await program.account.contributor.fetch(contributorPda);
    
    console.log('\n=== Contributor Stats ===');
    console.log(`  GitHub: ${contributor.githubUsername}`);
    console.log(`  Total XP: ${contributor.totalXp}`);
    console.log(`  SBT Claimable: ${contributor.totalSbtClaimable}`);
    console.log(`  SBT Claimed: ${contributor.totalSbtClaimed}`);
    console.log(`  SBT Unclaimed: ${contributor.totalSbtClaimable.toNumber() - contributor.totalSbtClaimed.toNumber()}`);
    console.log(`  Lifetime USDC Earned: ${contributor.lifetimeUsdcEarned}`);
    
    const unclaimed = contributor.totalSbtClaimable.toNumber() - contributor.totalSbtClaimed.toNumber();
    
    if (unclaimed === 0) {
      console.log('\n⚠️  No SBT tokens to claim!');
      console.log('   Earn more XP by contributing to get SBT tokens.');
      return;
    }
    
    console.log('\nGetting contributor SBT account...');
    const contributorSbtAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      contributorKeypair,
      sbtMint,
      contributorKeypair.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`Contributor SBT Account: ${contributorSbtAccount.address.toString()}`);
    
    console.log('\nClaiming SBT tokens...');
    const tx = await program.methods
      .claimSbtTokens()
      .accounts({
        config: configPda,
        contributor: contributorPda,
        sbtMint: sbtMint,
        contributorSbtAccount: contributorSbtAccount.address,
        wallet: contributorKeypair.publicKey,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    console.log(`\n✅ Successfully claimed SBT tokens!`);
    console.log(`Transaction: ${tx}`);
    
    const updatedContributor = await program.account.contributor.fetch(contributorPda);
    console.log(`\nUpdated SBT Claimed: ${updatedContributor.totalSbtClaimed}`);
    
    const sbtBalance = await connection.getTokenAccountBalance(contributorSbtAccount.address);
    console.log(`SBT Balance: ${sbtBalance.value.amount} SENDO`);
    
    console.log('\n💡 Remember: SENDO tokens are non-transferable governance tokens!');
    console.log('   Use them for voting on proposals and governance decisions.');
    
  } catch (error) {
    if (error.message && error.message.includes('Account does not exist')) {
      console.error('\n❌ Contributor not registered!');
      console.error('   Register first: yarn register <github_username>');
    } else {
      throw error;
    }
  }
  
  console.log('\n=== Claim Complete ===\n');
}

claimSbt().catch(console.error);

