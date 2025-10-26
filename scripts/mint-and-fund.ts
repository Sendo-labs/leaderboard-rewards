import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { 
  Connection, 
  PublicKey,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { loadOrGenerateKeypair } from './utils';

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function mintAndFund() {
  const args = process.argv.slice(2);
  const amountArg = args[0] || '1000000000000';
  const amount = new BN(amountArg);
  
  console.log(`\n=== Minting and Funding Reward Pool ===\n`);
  console.log(`Amount: ${amount.toString()} tokens`);

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
  
  const rewardMint = config.rewardMint;
  const rewardVault = config.rewardVault;
  
  console.log(`Reward Mint: ${rewardMint.toString()}`);
  console.log(`Reward Vault: ${rewardVault.toString()}`);
  
  console.log('\nCreating admin token account...');
  const adminTokenAccount = await getAssociatedTokenAddress(
    rewardMint,
    adminKeypair.publicKey
  );
  
  try {
    await createAssociatedTokenAccount(
      connection,
      adminKeypair,
      rewardMint,
      adminKeypair.publicKey
    );
    console.log(`Created admin token account: ${adminTokenAccount.toString()}`);
  } catch (error) {
    console.log('Admin token account already exists');
  }
  
  console.log('\nMinting tokens to admin...');
  await mintTo(
    connection,
    adminKeypair,
    rewardMint,
    adminTokenAccount,
    configPda,
    BigInt(amount.toString())
  );
  console.log(`Minted ${amount.toString()} tokens to admin`);
  
  console.log('\nFunding reward vault...');
  const tx = await program.methods
    .fundRewardPool(amount)
    .accounts({
      config: configPda,
      rewardVault: rewardVault,
      funder: adminKeypair.publicKey,
      funderTokenAccount: adminTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  
  console.log(`✅ Funded reward vault with ${amount.toString()} tokens`);
  console.log(`Transaction: ${tx}`);
  
  const vaultBalance = await connection.getTokenAccountBalance(rewardVault);
  console.log(`\nReward Vault Balance: ${vaultBalance.value.amount} tokens`);
  
  console.log('\n=== Funding Complete ===\n');
}

mintAndFund().catch(console.error);

