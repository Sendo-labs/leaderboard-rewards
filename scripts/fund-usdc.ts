import * as anchor from '@coral-xyz/anchor';
import { Program, BN, AnchorProvider } from '@coral-xyz/anchor';
import { 
  Connection, 
  PublicKey,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { loadOrGenerateKeypair } from './utils';

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function fundUsdc() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('\nUsage: yarn fund <amount>');
    console.log('Example: yarn fund 100000000000 (100,000 USDC with 6 decimals)\n');
    process.exit(1);
  }
  
  const amountArg = args[0];
  const amount = new BN(amountArg);
  
  console.log(`\n=== Funding USDC Pool ===\n`);
  console.log(`Amount: ${amount.toString()} USDC (smallest units)`);

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  const adminKeypair = loadOrGenerateKeypair(
    path.join(process.env.HOME!, '.config/solana/id.json')
  );
  console.log(`Admin: ${adminKeypair.publicKey.toString()}`);
  
  const wallet = new anchor.Wallet(adminKeypair);
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
  
  console.log('\nFetching config...');
  const config = await program.account.config.fetch(configPda);
  
  const usdcMint = config.usdcMint;
  const usdcVault = config.usdcVault;
  
  console.log(`USDC Mint: ${usdcMint.toString()}`);
  console.log(`USDC Vault: ${usdcVault.toString()}`);
  
  console.log('\nGetting admin USDC account...');
  const adminUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    usdcMint,
    adminKeypair.publicKey
  );
  
  console.log(`Admin USDC Account: ${adminUsdcAccount.address.toString()}`);
  
  const adminBalance = await connection.getTokenAccountBalance(adminUsdcAccount.address);
  console.log(`Admin USDC Balance: ${adminBalance.value.uiAmountString} USDC`);
  
  if (BigInt(adminBalance.value.amount) < BigInt(amount.toString())) {
    console.error(`\n❌ Insufficient USDC balance!`);
    console.error(`Required: ${amount.toString()}`);
    console.error(`Available: ${adminBalance.value.amount}`);
    console.error(`\nNote: On devnet, you may need to request USDC from a faucet.`);
    process.exit(1);
  }
  
  console.log('\nFunding USDC vault...');
  const tx = await program.methods
    .fundUsdcPool(amount)
    .accounts({
      config: configPda,
      usdcVault: usdcVault,
      funder: adminKeypair.publicKey,
      funderTokenAccount: adminUsdcAccount.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  
  console.log(`\n✅ Funded USDC vault with ${amount.toString()} tokens`);
  console.log(`Transaction: ${tx}`);
  
  const vaultBalance = await connection.getTokenAccountBalance(usdcVault);
  console.log(`\nUSDC Vault Balance: ${vaultBalance.value.uiAmountString} USDC`);
  
  console.log('\n=== Funding Complete ===\n');
  console.log('📋 Next Steps:');
  console.log('   1. Create first epoch: yarn create-epoch <amount>');
  console.log('   2. Start oracle bot to sync contributor XP');
}

fundUsdc().catch(console.error);

