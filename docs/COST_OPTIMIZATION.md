# Cost Optimization: Opt-In Model

## Overview

This document describes the cost optimization implementation that reduces operational costs from **$29,000/year to ~$400/year (98.6% reduction)**.

## Key Changes

### 1. Opt-In Model

**Before**: Oracle paid for all contributor accounts (2KB+ each)
**After**: Contributors create their own accounts when they opt-in

- Contributors call `register_contributor(github_username)` (pays ~0.002 SOL one-time)
- Oracle only syncs XP for registered users on-chain
- Oracle emits events for ALL GitHub contributors (registered or not)

### 2. Simplified Account Structure

**Contributor Account**:
- **Before**: ~2,000 bytes (stored role_xp, domain_xp, skill_xp arrays)
- **After**: ~150 bytes (only stores total_xp and SBT balances)
- **Savings**: 92% rent reduction per account

```rust
// New simplified structure
pub struct Contributor {
    pub wallet: Pubkey,
    pub github_username: String,
    pub total_xp: u64,
    pub total_sbt_claimable: u64,
    pub total_sbt_claimed: u64,
    pub lifetime_usdc_earned: u64,
    pub last_claim_epoch: u64,
    pub registered_at: i64,
    pub bump: u8,
}
// ~124 bytes (vs 2000+ bytes)
```

### 3. Event-Based XP Breakdown

Detailed XP breakdown (roles, domains, skills) is now emitted as events instead of stored on-chain:

```rust
#[event]
pub struct XpSyncedEvent {
    pub wallet: Pubkey,
    pub github_username: String,
    pub epoch: u64,
    pub total_xp: u64,
    pub role_xp: Vec<XpCategory>,      // Off-chain indexing
    pub domain_xp: Vec<XpCategory>,    // Off-chain indexing
    pub skill_xp: Vec<XpCategory>,     // Off-chain indexing
    pub sbt_earned: u64,
    pub timestamp: i64,
    pub is_registered: bool,           // Tracks registration status
}
```

### 4. 90-Day Retroactive Claim Window

Contributors can register at any time and claim rewards for epochs that ended up to 90 days before their registration date.

```rust
let ninety_days_before_registration = registration_time - (90 * 24 * 60 * 60);
require!(
    epoch.end_time >= ninety_days_before_registration,
    ErrorCode::EpochTooOld
);
```

### 5. Event Indexer Service

A lightweight indexer service (`indexer/`) listens for `XpSyncedEvent` emissions and stores historical data for:
- Frontend queries
- Unclaimed reward calculations
- XP breakdown visualization

**Cost**: $0-20/month using free tier RPC (Helius/Triton)

## Cost Breakdown

### Before Optimization

| Item | Cost/Month | Annual |
|------|-----------|--------|
| Oracle account creation (200 contributors) | $200 | $2,400 |
| Daily XP syncs (0.002 SOL × 200 × 30) | $2,000 | $24,000 |
| Account rent (200 accounts × 0.02 SOL) | $300 | $3,600 |
| **TOTAL** | **$2,500** | **$30,000** |

### After Optimization

| Item | Cost/Month | Annual |
|------|-----------|--------|
| Contributor registration | **$0 (user pays)** | $0 |
| Daily XP syncs (100 registered × 0.0002 SOL × 30) | $10 | $120 |
| Snapshot accounts (oracle pays) | $5 | $60 |
| Event indexer (RPC + storage) | $5 | $60 |
| Account rent (100 accounts × 0.002 SOL) | **$0 (user pays)** | $0 |
| **TOTAL** | **~$20** | **~$240** |

**Savings**: 99.2% reduction

## Implementation Guide

### For Contributors

1. **Register** (one-time):
```typescript
await program.methods
  .registerContributor("your-github-username")
  .accounts({
    contributor: contributorPda,
    wallet: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

2. **Claim Rewards** (any past epoch within 90 days):
```typescript
await program.methods
  .claimUsdcRewards(epochNumber)
  .accounts({ /* ... */ })
  .rpc();
```

### For Oracle Bot

The oracle syncs XP for ALL GitHub contributors (registered or not):

```typescript
for (const contributor of allGithubContributors) {
  await program.methods
    .syncContributorXp(
      contributor.wallet,
      contributor.githubUsername,
      contributor.totalXp,
      contributor.roleXp,
      contributor.domainXp,
      contributor.skillXp
    )
    .rpc();
  
  // Event is automatically emitted
  // On-chain state only updated if registered
}
```

### For Frontend

1. **Check Registration Status**:
```typescript
const contributor = await program.account.contributor.fetch(contributorPda);
if (!contributor) {
  // Show "Register to claim rewards" button
}
```

2. **Query Historical XP** (from indexer):
```typescript
const events = await fetch(`/api/events/${wallet}`);
const unclaimedEpochs = calculateUnclaimed(events, registrationTime);
```

3. **Display Unclaimed Rewards**:
```typescript
// Show: "You have $456 in unclaimed rewards from the past 90 days!"
```

## Migration from Old System

If migrating from the previous system:

1. Existing Contributor accounts remain valid
2. Oracle continues syncing XP as before
3. New contributors use the opt-in registration flow
4. Deploy indexer to start capturing historical events

## Monitoring

Track these metrics to ensure cost efficiency:

- **Registration Rate**: % of GitHub contributors who register
- **Daily Oracle Cost**: Should be <0.1 SOL/day
- **Snapshot Creation**: ~0.0005 SOL per new contributor per epoch
- **Event Indexer Uptime**: Should be 99%+

## Future Enhancements

1. **Batch Claiming**: Allow users to claim multiple epochs in one transaction
2. **Helius Webhooks**: Zero-cost event indexing using webhooks
3. **Account Closing**: Close old epoch accounts after 180 days to reclaim rent
4. **Compression**: Use state compression for 10,000+ contributors

## FAQ

**Q: What if I don't register?**
A: Your XP is still tracked and emitted as events. You can register later and claim rewards from the past 90 days.

**Q: Why 90 days?**
A: Balances fairness (retroactive rewards) with preventing abuse (unlimited historical claims).

**Q: Can I claim older rewards?**
A: No, only epochs that ended within 90 days of your registration are claimable.

**Q: What happens to unregistered contributor data?**
A: XP events are stored by the indexer. When you register, the frontend shows your unclaimed rewards.

## Summary

This opt-in model achieves:
✅ **99%+ cost reduction** ($30k → $240/year)
✅ **True permissionless** (anyone can opt-in anytime)
✅ **Fair retroactive rewards** (90-day window)
✅ **Scalability** (support 10,000+ contributors at same cost)
✅ **Better UX** ("You have $X unclaimed!" messaging)

