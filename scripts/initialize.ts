import * as anchor from '@coral-xyz/anchor';
import { Program, BN, AnchorProvider } from '@coral-xyz/anchor';
import { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  ExtensionType,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { 
  loadOrGenerateKeypair, 
  displayKeypairInfo, 
  saveKeypairToFile 
} from './utils';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

const USDC_MINT_DEVNET = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function initialize() {
  const args = process.argv.slice(2);
  const cluster = args[0] || 'devnet';
  const rpcUrl = cluster === 'mainnet' ? MAINNET_RPC : DEVNET_RPC;
  
  console.log(`\n=== Initializing Leaderboard Rewards on ${cluster} ===\n`);

  const connection = new Connection(rpcUrl, 'confirmed');
  
  const adminKeypair = loadOrGenerateKeypair(
    path.join(process.env.HOME!, '.config/solana/id.json')
  );
  displayKeypairInfo('Admin', adminKeypair);
  
  const oracleKeypair = loadOrGenerateKeypair(
    path.join(__dirname, '../keys/oracle.json'),
    false
  );
  displayKeypairInfo('Oracle', oracleKeypair);
  
  if (cluster === 'devnet') {
    console.log('\nRequesting airdrops...');
    try {
      const airdrop1 = await connection.requestAirdrop(
        adminKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop1);
      console.log('  Admin airdrop complete');
      
      const airdrop2 = await connection.requestAirdrop(
        oracleKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop2);
      console.log('  Oracle airdrop complete');
    } catch (error) {
      console.log('  Airdrop failed (may have sufficient balance)');
    }
  }
  
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
  
  console.log(`\nProgram ID: ${programId.toString()}`);
  
  const program = new Program(idl, provider);
  
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    programId
  );
  console.log(`Config PDA: ${configPda.toString()}`);
  
  const usdcMint = cluster === 'mainnet' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  console.log(`USDC Mint: ${usdcMint.toString()}`);
  
  console.log('\n=== Creating SBT Token (Token-2022 with NonTransferable) ===');
  
  const sbtMintKeypair = Keypair.generate();
  console.log(`SBT Mint will be: ${sbtMintKeypair.publicKey.toString()}`);
  
  try {
    const sbtMint = await createMint(
      connection,
      adminKeypair,
      configPda,
      null,
      0,
      sbtMintKeypair,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`✅ SBT Token created: ${sbtMint.toString()}`);
    console.log('   Name: Sendo Governance Token');
    console.log('   Symbol: SENDO');
    console.log('   Decimals: 0');
    console.log('   Max Supply: 1,000,000,000');
    console.log('   Mint Authority: Config PDA (controlled minting)');
    console.log('   Transfer: NON-TRANSFERABLE (Token-2022)');
    
  } catch (error) {
    console.error('❌ Failed to create SBT token:', error);
    throw error;
  }
  
  const usdcVault = await getAssociatedTokenAddress(
    usdcMint,
    configPda,
    true
  );
  console.log(`USDC Vault: ${usdcVault.toString()}`);
  
  console.log('\n=== Initializing Program ===');
  
  try {
    const tx = await program.methods
      .initialize(
        oracleKeypair.publicKey,
        usdcMint,
        sbtMintKeypair.publicKey
      )
      .accounts({
        config: configPda,
        usdcVault: usdcVault,
        usdcMintAccount: usdcMint,
        admin: adminKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log(`\n✅ Program initialized successfully!`);
    console.log(`Transaction: ${tx}`);
    
    const config = await program.account.config.fetch(configPda);
    console.log('\n=== Config Details ===');
    console.log(`  Admin: ${config.admin.toString()}`);
    console.log(`  Oracle: ${config.oracle.toString()}`);
    console.log(`  USDC Mint: ${config.usdcMint.toString()}`);
    console.log(`  SBT Mint: ${config.sbtMint.toString()}`);
    console.log(`  USDC Vault: ${config.usdcVault.toString()}`);
    console.log(`  Current Epoch: ${config.currentEpoch}`);
    console.log(`  XP to SBT Ratio: ${config.xpToSbtRatio} (1 XP = ${config.xpToSbtRatio} SBT)`);
    console.log(`  SBT Total Supply: ${config.sbtTotalSupply}`);
    console.log(`  SBT Minted: ${config.sbtMinted}`);
    
    const base58PrivateKey = Buffer.from(oracleKeypair.secretKey).toString('base64');
    
    const envContent = `
# Leaderboard Rewards - ${cluster.toUpperCase()} Configuration
# Generated: ${new Date().toISOString()}

RPC_URL=${rpcUrl}
CLUSTER=${cluster}
PROGRAM_ID=${programId.toString()}
ORACLE_PRIVATE_KEY=${base58PrivateKey}

CONFIG_PDA=${configPda.toString()}
USDC_MINT=${usdcMint.toString()}
SBT_MINT=${sbtMintKeypair.publicKey.toString()}
USDC_VAULT=${usdcVault.toString()}

# Leaderboard Data Source
# Production: Fetch from Sendo leaderboard GitHub _data branch
LEADERBOARD_API_URL=https://raw.githubusercontent.com/Sendo-labs/leaderboard/_data/leaderboard-export.json
# Development: Use local file for testing
# LEADERBOARD_DATA_FILE=../data/leaderboard-export.json

# Epoch Configuration
EPOCH_REWARD_AMOUNT=100000000000000
EPOCH_DURATION_DAYS=7

# Scheduler
DAILY_CRON_SCHEDULE=0 0 * * *
WEEKLY_CRON_SCHEDULE=0 0 * * 0

LOG_LEVEL=info
LOG_FILE=oracle-bot.log
`;
    
    const envPath = path.join(__dirname, '../oracle-bot/.env');
    fs.writeFileSync(envPath, envContent.trim());
    console.log(`\n✅ Oracle bot configuration saved to ${envPath}`);
    
    saveKeypairToFile(sbtMintKeypair, path.join(__dirname, '../keys/sbt-mint.json'));
    console.log(`✅ SBT mint keypair saved to keys/sbt-mint.json`);
    
    console.log('\n=== Initialization Complete ===\n');
    console.log('📋 Next Steps:');
    console.log('1. Fund the USDC vault: yarn fund <amount>');
    console.log('2. Create first epoch: yarn create-epoch <usdc_amount>');
    console.log('3. Configure oracle bot (see oracle-bot/.env)');
    console.log('4. Start oracle bot: cd oracle-bot && pnpm start');
    console.log('\n💡 Notes:');
    console.log('   - USDC payments come from plugin revenue (50%)');
    console.log('   - SBT tokens (SENDO) are non-transferable governance tokens');
    console.log('   - 1 XP = 100 SBT tokens');
    console.log('   - Max SBT supply: 1 billion');
    console.log('   - Contributors claim SBT manually');
    
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    throw error;
  }
}

initialize().catch(console.error);
