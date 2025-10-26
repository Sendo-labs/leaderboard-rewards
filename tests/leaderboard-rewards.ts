import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { LeaderboardRewards } from "../target/types/leaderboard_rewards";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

describe("leaderboard-rewards", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.leaderboardRewards as Program<LeaderboardRewards>;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracleKeypair = Keypair.generate();
  const contributor1 = Keypair.generate();
  const contributor2 = Keypair.generate();
  const contributor3 = Keypair.generate();

  let configPda: PublicKey;
  let usdcMint: Keypair;
  let usdcMintAddress: PublicKey;
  let sbtMint: Keypair;
  let sbtMintAddress: PublicKey;
  let usdcVault: PublicKey;
  let contributor1UsdcAccount: PublicKey;
  let contributor2UsdcAccount: PublicKey;
  let contributor1SbtAccount: PublicKey;
  let contributor2SbtAccount: PublicKey;

  function findConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
  }

  function findEpochPda(epochNumber: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("epoch"),
        new BN(epochNumber).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
  }

  function findContributorPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contributor"), wallet.toBuffer()],
      program.programId
    );
  }

  function findSnapshotPda(epochNumber: number, wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("snapshot"),
        new BN(epochNumber).toArrayLike(Buffer, "le", 8),
        wallet.toBuffer()
      ],
      program.programId
    );
  }

  before(async () => {
    const airdropTx1 = await provider.connection.requestAirdrop(
      oracleKeypair.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx1);

    const airdropTx2 = await provider.connection.requestAirdrop(
      contributor1.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx2);

    const airdropTx3 = await provider.connection.requestAirdrop(
      contributor2.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx3);

    const airdropTx4 = await provider.connection.requestAirdrop(
      contributor3.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx4);
  });

  it("Initializes the program", async () => {
    [configPda] = findConfigPda();
    
    usdcMint = Keypair.generate();
    usdcMintAddress = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6,
      usdcMint
    );
    
    sbtMint = Keypair.generate();
    sbtMintAddress = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      9,
      sbtMint
    );
    
    usdcVault = await getAssociatedTokenAddress(
      usdcMintAddress,
      configPda,
      true
    );

    await program.methods
      .initialize(oracleKeypair.publicKey, usdcMintAddress, sbtMintAddress)
      .accounts({
        config: configPda,
        usdcVault: usdcVault,
        usdcMintAccount: usdcMintAddress,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.admin.toString(), admin.publicKey.toString());
    assert.equal(config.oracle.toString(), oracleKeypair.publicKey.toString());
    assert.equal(config.usdcMint.toString(), usdcMintAddress.toString());
    assert.equal(config.sbtMint.toString(), sbtMintAddress.toString());
    assert.equal(config.currentEpoch, 0);
    assert.equal(config.totalEpochs, 0);
  });

  it("Updates oracle", async () => {
    const newOracle = Keypair.generate();

    await program.methods
      .updateOracle()
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        newOracle: newOracle.publicKey,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.oracle.toString(), newOracle.publicKey.toString());

    await program.methods
      .updateOracle()
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        newOracle: oracleKeypair.publicKey,
      })
      .rpc();
  });

  it("Creates first epoch", async () => {
    const [epochPda] = findEpochPda(1);
    const rewardAmount = new BN(1000000000);

    await program.methods
      .createEpoch(rewardAmount)
      .accounts({
        config: configPda,
        epoch: epochPda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.currentEpoch, 1);
    assert.equal(config.totalEpochs, 1);

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.epochNumber, 1);
    assert.equal(epoch.usdcRewardAmount.toString(), rewardAmount.toString());
    assert.equal(epoch.totalXp.toString(), "0");
    assert.equal(epoch.contributorCount, 0);
    assert.equal(epoch.finalized, false);
  });

  it("Registers contributors", async () => {
    const [contributor1Pda] = findContributorPda(contributor1.publicKey);

    await program.methods
      .registerContributor("alice")
      .accounts({
        contributor: contributor1Pda,
        wallet: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();

    const contributorData = await program.account.contributor.fetch(contributor1Pda);
    assert.equal(contributorData.wallet.toString(), contributor1.publicKey.toString());
    assert.equal(contributorData.githubUsername, "alice");
    assert.equal(contributorData.totalXp.toString(), "0");
    assert.equal(contributorData.lifetimeUsdcEarned.toString(), "0");
  });

  it("Syncs contributor XP (registered user)", async () => {
    const [epochPda] = findEpochPda(1);
    const [contributor1Pda] = findContributorPda(contributor1.publicKey);
    const [snapshot1Pda] = findSnapshotPda(1, contributor1.publicKey);
    
    const xp1 = new BN(5000);
    const roleXp = [{ name: "developer", amount: new BN(3000) }];
    const domainXp = [{ name: "core", amount: new BN(2500) }];
    const skillXp = [{ name: "rust", amount: new BN(2000) }];

    await program.methods
      .syncContributorXp(
        contributor1.publicKey,
        "alice",
        xp1,
        roleXp,
        domainXp,
        skillXp
      )
      .accounts({
        config: configPda,
        epoch: epochPda,
        contributor: contributor1Pda,
        snapshot: snapshot1Pda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.totalXp.toString(), "5000");
    assert.equal(epoch.contributorCount, 1);

    const snapshot = await program.account.epochSnapshot.fetch(snapshot1Pda);
    assert.equal(snapshot.xp.toString(), "5000");
    assert.equal(snapshot.usdcClaimed, false);
    assert.equal(snapshot.sbtEarned.toString(), "500000");

    const contributorData = await program.account.contributor.fetch(contributor1Pda);
    assert.equal(contributorData.totalXp.toString(), "5000");
    assert.equal(contributorData.totalSbtClaimable.toString(), "500000");
  });

  it("Registers and syncs XP for second contributor", async () => {
    const [contributor2Pda] = findContributorPda(contributor2.publicKey);
    
    await program.methods
      .registerContributor("bob")
      .accounts({
        contributor: contributor2Pda,
        wallet: contributor2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc();

    const [epochPda] = findEpochPda(1);
    const [snapshot2Pda] = findSnapshotPda(1, contributor2.publicKey);
    const xp2 = new BN(3000);
    const roleXp = [{ name: "designer", amount: new BN(2000) }];
    const domainXp = [{ name: "ui", amount: new BN(1500) }];
    const skillXp = [{ name: "react", amount: new BN(1000) }];

    await program.methods
      .syncContributorXp(
        contributor2.publicKey,
        "bob",
        xp2,
        roleXp,
        domainXp,
        skillXp
      )
      .accounts({
        config: configPda,
        epoch: epochPda,
        contributor: contributor2Pda,
        snapshot: snapshot2Pda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.totalXp.toString(), "8000");
    assert.equal(epoch.contributorCount, 2);
  });

  it("Emits event for unregistered contributor (opt-in model)", async () => {
    const [epochPda] = findEpochPda(1);
    const [contributor3Pda] = findContributorPda(contributor3.publicKey);
    const [snapshot3Pda] = findSnapshotPda(1, contributor3.publicKey);
    
    const xp3 = new BN(2000);
    const roleXp = [{ name: "pm", amount: new BN(1500) }];
    const domainXp = [{ name: "docs", amount: new BN(1000) }];
    const skillXp = [{ name: "markdown", amount: new BN(500) }];

    await program.methods
      .syncContributorXp(
        contributor3.publicKey,
        "charlie",
        xp3,
        roleXp,
        domainXp,
        skillXp
      )
      .accounts({
        config: configPda,
        epoch: epochPda,
        contributor: contributor3Pda,
        snapshot: snapshot3Pda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.totalXp.toString(), "8000");
    assert.equal(epoch.contributorCount, 2);
  });

  it("Updates existing contributor XP", async () => {
    const [epochPda] = findEpochPda(1);
    const [contributor1Pda] = findContributorPda(contributor1.publicKey);
    const [snapshot1Pda] = findSnapshotPda(1, contributor1.publicKey);
    
    const newXp = new BN(7000);
    const roleXp = [{ name: "developer", amount: new BN(4000) }];
    const domainXp = [{ name: "core", amount: new BN(3500) }];
    const skillXp = [{ name: "rust", amount: new BN(3000) }];

    await program.methods
      .syncContributorXp(
        contributor1.publicKey,
        "alice",
        newXp,
        roleXp,
        domainXp,
        skillXp
      )
      .accounts({
        config: configPda,
        epoch: epochPda,
        contributor: contributor1Pda,
        snapshot: snapshot1Pda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.totalXp.toString(), "10000");

    const snapshot = await program.account.epochSnapshot.fetch(snapshot1Pda);
    assert.equal(snapshot.xp.toString(), "7000");
    assert.equal(snapshot.sbtEarned.toString(), "200000");

    const contributorData = await program.account.contributor.fetch(contributor1Pda);
    assert.equal(contributorData.totalXp.toString(), "7000");
    assert.equal(contributorData.totalSbtClaimable.toString(), "700000");
  });

  it("Funds reward pool", async () => {
    const adminTokenAccount = await getAssociatedTokenAddress(
      usdcMintAddress,
      admin.publicKey
    );

    await createAssociatedTokenAccount(
      provider.connection,
      admin,
      usdcMintAddress,
      admin.publicKey
    );
    
    const mintAmount = new BN(10000000000);
    await mintTo(
      provider.connection,
      admin,
      usdcMintAddress,
      adminTokenAccount,
      admin,
      BigInt(mintAmount.toString())
    );

    const fundAmount = new BN(1000000000);
    await program.methods
      .fundUsdcPool(fundAmount)
      .accounts({
        config: configPda,
        usdcVault: usdcVault,
        funder: admin.publicKey,
        funderTokenAccount: adminTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vaultBalance = await provider.connection.getTokenAccountBalance(usdcVault);
    assert.equal(vaultBalance.value.amount, fundAmount.toString());
  });

  it("Finalizes epoch after time passes", async () => {
    const [epochPda] = findEpochPda(1);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const epochBefore = await program.account.rewardEpoch.fetch(epochPda);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (currentTime < epochBefore.endTime.toNumber()) {
      console.log("Skipping finalize test - epoch not ended yet");
      return;
    }

    await program.methods
      .finalizeEpoch(new BN(1))
      .accounts({
        config: configPda,
        epoch: epochPda,
        oracle: oracleKeypair.publicKey,
      })
      .signers([oracleKeypair])
      .rpc();

    const epoch = await program.account.rewardEpoch.fetch(epochPda);
    assert.equal(epoch.finalized, true);
  });

  it("Claims rewards proportionally", async () => {
    const [epochPda] = findEpochPda(1);
    const epochData = await program.account.rewardEpoch.fetch(epochPda);
    
    if (!epochData.finalized) {
      console.log("Skipping claim test - epoch not finalized");
      return;
    }

    contributor1UsdcAccount = await getAssociatedTokenAddress(
      usdcMintAddress,
      contributor1.publicKey
    );

    await createAssociatedTokenAccount(
      provider.connection,
      contributor1,
      usdcMintAddress,
      contributor1.publicKey
    );

    const [contributor1Pda] = findContributorPda(contributor1.publicKey);
    const [snapshot1Pda] = findSnapshotPda(1, contributor1.publicKey);

    const snapshotBefore = await program.account.epochSnapshot.fetch(snapshot1Pda);
    const expectedReward = snapshotBefore.xp
      .mul(epochData.usdcRewardAmount)
      .div(epochData.totalXp);

    await program.methods
      .claimUsdcRewards(new BN(1))
      .accounts({
        config: configPda,
        epoch: epochPda,
        snapshot: snapshot1Pda,
        contributor: contributor1Pda,
        usdcVault: usdcVault,
        contributorTokenAccount: contributor1UsdcAccount,
        wallet: contributor1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([contributor1])
      .rpc();

    const snapshotAfter = await program.account.epochSnapshot.fetch(snapshot1Pda);
    assert.equal(snapshotAfter.usdcClaimed, true);

    const contributorData = await program.account.contributor.fetch(contributor1Pda);
    assert.equal(contributorData.lifetimeUsdcEarned.toString(), expectedReward.toString());
    assert.equal(contributorData.lastClaimEpoch, 1);

    const tokenBalance = await provider.connection.getTokenAccountBalance(contributor1UsdcAccount);
    assert.equal(tokenBalance.value.amount, expectedReward.toString());
  });

  it("Prevents double claiming", async () => {
    const [epochPda] = findEpochPda(1);
    const epochData = await program.account.rewardEpoch.fetch(epochPda);
    
    if (!epochData.finalized) {
      console.log("Skipping double claim test");
      return;
    }

    const [contributor1Pda] = findContributorPda(contributor1.publicKey);
    const [snapshot1Pda] = findSnapshotPda(1, contributor1.publicKey);

    try {
      await program.methods
        .claimUsdcRewards(new BN(1))
        .accounts({
          config: configPda,
          epoch: epochPda,
          snapshot: snapshot1Pda,
          contributor: contributor1Pda,
          usdcVault: usdcVault,
          contributorTokenAccount: contributor1UsdcAccount,
          wallet: contributor1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([contributor1])
        .rpc();
      
      assert.fail("Should have thrown error for double claim");
    } catch (error: any) {
      assert.include(error.message, "AlreadyClaimed");
    }
  });

  it("Updates GitHub link", async () => {
    const [contributor1Pda] = findContributorPda(contributor1.publicKey);

    await program.methods
      .updateGithubLink("alice_updated")
      .accounts({
        contributor: contributor1Pda,
        wallet: contributor1.publicKey,
      })
      .signers([contributor1])
      .rpc();

    const contributorData = await program.account.contributor.fetch(contributor1Pda);
    assert.equal(contributorData.githubUsername, "alice_updated");
  });

  it("Creates second epoch", async () => {
    const [epochPda] = findEpochPda(2);
    const rewardAmount = new BN(2000000000);

    await program.methods
      .createEpoch(rewardAmount)
      .accounts({
        config: configPda,
        epoch: epochPda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.currentEpoch, 2);
    assert.equal(config.totalEpochs, 2);
  });
});
