# Leaderboard-Rewards Reward Distribution System

## Technical Specifications v1.0

### Overview
A Solana Anchor program that distributes custom SPL token rewards to GitHub contributors based on their XP from the leaderboard, updated daily and distributed weekly.

---

## Architecture

### Account Structure

#### 1. Config (PDA: ["config"])
Global program configuration account.

```rust
pub struct Config {
    pub admin: Pubkey,              // Multisig for critical operations
    pub oracle: Pubkey,             // Hot wallet bot for daily updates
    pub reward_mint: Pubkey,        // Custom SPL token mint
    pub reward_vault: Pubkey,       // Token account holding rewards
    pub current_epoch: u64,         // Current epoch number
    pub total_epochs: u64,          // Total epochs created
    pub bump: u8,
}
```

**Size**: 1 + 32 + 32 + 32 + 32 + 8 + 8 + 1 = 146 bytes
**Space**: 8 (discriminator) + 146 = 154 bytes

#### 2. RewardEpoch (PDA: ["epoch", epoch_number.to_le_bytes()])
Weekly reward distribution period.

```rust
pub struct RewardEpoch {
    pub epoch_number: u64,          // Sequential epoch ID
    pub start_time: i64,            // Unix timestamp
    pub end_time: i64,              // Unix timestamp
    pub total_xp: u64,              // Sum of all contributor XP
    pub reward_amount: u64,         // Tokens allocated this epoch
    pub contributor_count: u16,     // Number of contributors
    pub finalized: bool,            // Locked for claims
    pub bump: u8,
}
```

**Size**: 8 + 8 + 8 + 8 + 8 + 2 + 1 + 1 = 44 bytes
**Space**: 8 + 44 = 52 bytes

#### 3. Contributor (PDA: ["contributor", wallet.key()])
Individual contributor registration.

```rust
pub struct Contributor {
    pub wallet: Pubkey,             // User's wallet address
    pub github_username: String,    // Max 39 chars + 4 bytes length
    pub total_xp: u64,              // Lifetime XP
    pub lifetime_rewards: u64,      // Total tokens claimed
    pub last_claim_epoch: u64,      // Last epoch claimed
    pub registered_at: i64,         // Unix timestamp
    pub bump: u8,
}
```

**Size**: 32 + (4 + 39) + 8 + 8 + 8 + 8 + 1 = 108 bytes
**Space**: 8 + 108 = 116 bytes

#### 4. EpochSnapshot (PDA: ["snapshot", epoch_number.to_le_bytes(), wallet.key()])
XP snapshot per contributor per epoch.

```rust
pub struct EpochSnapshot {
    pub contributor: Pubkey,        // Contributor wallet
    pub epoch: u64,                 // Epoch number
    pub xp: u64,                    // XP for this epoch
    pub claimed: bool,              // Has claimed rewards
    pub bump: u8,
}
```

**Size**: 32 + 8 + 8 + 1 + 1 = 50 bytes
**Space**: 8 + 50 = 58 bytes

---

## Instructions

### Admin Instructions

#### `initialize`
Initialize the program with admin, oracle, and reward token.

**Accounts:**
- `config` (init, pda, seeds=["config"])
- `reward_mint` (init, mint authority = config)
- `reward_vault` (init, token account)
- `admin` (signer, mut)
- `oracle` (unchecked)
- `token_program`
- `system_program`
- `rent`

**Args:**
- `oracle: Pubkey` - Oracle bot pubkey

**Validation:**
- Admin must sign
- Config must not exist

**Logic:**
- Create config with admin and oracle
- Create SPL token mint (0 decimals for simplicity)
- Create token vault owned by config PDA
- Set current_epoch = 0

---

#### `update_oracle`
Change oracle authority.

**Accounts:**
- `config` (mut)
- `admin` (signer)
- `new_oracle` (unchecked)

**Args:**
- None (new_oracle from accounts)

**Validation:**
- Admin must sign
- Admin must match config.admin

**Logic:**
- Update config.oracle

---

#### `mint_tokens`
Mint new reward tokens to a destination account (admin only).

**Accounts:**
- `config`
- `reward_mint` (mut)
- `destination` (mut, token account)
- `admin` (signer)
- `token_program`

**Args:**
- `amount: u64`

**Validation:**
- Admin must sign
- Mint must match config.reward_mint

**Logic:**
- Use config PDA to sign mint operation
- Mint tokens to destination account

---

#### `fund_reward_pool`
Deposit tokens into reward vault.

**Accounts:**
- `config`
- `reward_vault` (mut)
- `funder` (signer, mut)
- `funder_token_account` (mut)
- `token_program`

**Args:**
- `amount: u64`

**Validation:**
- Funder must have sufficient balance

**Logic:**
- Transfer tokens from funder to vault

---

### Oracle Instructions

#### `create_epoch`
Start a new weekly reward epoch.

**Accounts:**
- `config` (mut)
- `epoch` (init, pda, seeds=["epoch", epoch_number])
- `oracle` (signer, mut)
- `system_program`

**Args:**
- `reward_amount: u64` - Tokens to distribute this epoch

**Validation:**
- Oracle must sign
- Oracle must match config.oracle
- Previous epoch must be finalized (if exists)

**Logic:**
- Increment config.current_epoch
- Create epoch with start_time = now, end_time = now + 7 days
- Set reward_amount
- Initialize total_xp = 0, contributor_count = 0

---

#### `record_contributor_xp`
Record or update contributor XP for current epoch.

**Accounts:**
- `config`
- `epoch` (mut)
- `contributor` (optional, init_if_needed)
- `snapshot` (init_if_needed, pda)
- `oracle` (signer, mut)
- `system_program`

**Args:**
- `wallet: Pubkey` - Contributor wallet
- `xp: u64` - XP amount
- `github_username: String` - GitHub username (optional if contributor exists)

**Validation:**
- Oracle must sign
- Epoch must not be finalized
- XP must be > 0
- XP must be reasonable (< 1_000_000 per day increase)

**Logic:**
- If contributor doesn't exist, create it
- Update or create snapshot for current epoch
- Update epoch.total_xp (add delta if updating)
- Update epoch.contributor_count (if new contributor this epoch)

---

#### `finalize_epoch`
Lock epoch and enable claims.

**Accounts:**
- `config`
- `epoch` (mut)
- `oracle` (signer)

**Args:**
- `epoch_number: u64`

**Validation:**
- Oracle must sign
- Epoch end_time must have passed
- Epoch must not already be finalized

**Logic:**
- Set epoch.finalized = true
- Emit event with epoch stats

---

### User Instructions

#### `register_contributor`
Link GitHub username to wallet (one-time).

**Accounts:**
- `contributor` (init, pda, seeds=["contributor", wallet])
- `wallet` (signer, mut)
- `system_program`

**Args:**
- `github_username: String` (max 39 chars)

**Validation:**
- Wallet must sign
- GitHub username must be valid (alphanumeric, hyphens, max 39 chars)

**Logic:**
- Create contributor account
- Set registered_at = now

---

#### `update_github_link`
Update GitHub username.

**Accounts:**
- `contributor` (mut)
- `wallet` (signer)

**Args:**
- `new_github_username: String`

**Validation:**
- Wallet must sign
- Wallet must match contributor.wallet

**Logic:**
- Update contributor.github_username

---

#### `claim_rewards`
Claim proportional rewards for a finalized epoch.

**Accounts:**
- `config`
- `epoch`
- `snapshot` (mut)
- `contributor` (mut)
- `reward_vault` (mut)
- `contributor_token_account` (mut)
- `wallet` (signer)
- `token_program`

**Args:**
- `epoch_number: u64`

**Validation:**
- Wallet must sign
- Epoch must be finalized
- Snapshot must not be claimed
- Epoch must be within 30 days of end_time

**Logic:**
- Calculate reward: (snapshot.xp * epoch.reward_amount) / epoch.total_xp
- Transfer tokens from vault to contributor
- Set snapshot.claimed = true
- Update contributor.lifetime_rewards
- Update contributor.last_claim_epoch

---

## Reward Distribution Formula

```
User Reward = (User XP / Total Epoch XP) × Epoch Reward Pool

Example:
- Epoch reward pool: 100,000 tokens
- Total XP in epoch: 1,000,000
- Alice XP: 50,000
- Alice reward: (50,000 / 1,000,000) × 100,000 = 5,000 tokens
```

---

## Security Measures

### Rate Limiting
- Max 1 snapshot update per contributor per day (check timestamp)

### XP Validation
- Max XP increase: 100,000 per update (prevent oracle from going rogue)
- Min XP: 1 (must be positive)

### Claim Windows
- 30-day claim window after epoch ends
- After 30 days, tokens remain in vault for future epochs

### Authority Separation
- **Admin**: Can update oracle, emergency operations
- **Oracle**: Can only write XP data, cannot move funds
- **Users**: Can only claim their own rewards

### Emergency Controls
- Admin can update oracle if compromised
- No emergency pause initially (can add if needed)

---

## Oracle Bot Specifications

### Technology
- Node.js/TypeScript
- @coral-xyz/anchor for program interaction
- cron/scheduler for daily execution

### Data Source
- GitHub Actions pipeline (leaderboard data)
- REST API or JSON export from leaderboard site

### Daily Operations
1. Fetch leaderboard data (all contributors with XP)
2. Connect to Solana (devnet/mainnet)
3. For each contributor:
   - Call `record_contributor_xp(wallet, xp, github_username)`
4. Log results and errors
5. Send notifications if failures

### Weekly Operations
1. Check if current epoch should end
2. Call `finalize_epoch(epoch_number)`
3. Call `create_epoch(new_reward_amount)`
4. Fund reward pool if needed

### Configuration
```typescript
{
  rpcUrl: string,              // Solana RPC endpoint
  programId: string,           // Deployed program address
  oracleKeypair: string,       // Base58 private key
  leaderboardDataUrl: string,  // API endpoint for leaderboard
  epochRewardAmount: number,   // Tokens per epoch
  cronSchedule: string,        // "0 0 * * *" (daily at midnight)
}
```

### Error Handling
- Retry failed transactions (max 3 attempts)
- Log all errors to file
- Send alerts via webhook/email on critical failures
- Skip contributors with invalid data

---

## Token Specifications

### Custom Reward Token
- **Name**: LRPG (Leaderboard Rewards)
- **Symbol**: LRPG
- **Decimals**: 9 (standard for Solana)
- **Initial Supply**: 0 (mint as needed)
- **Mint Authority**: Config PDA (allows controlled minting)
- **Freeze Authority**: None (liquid token)

---

## Deployment Steps

### 1. Build Program
```bash
cd leaderboard-rewards
anchor build
anchor keys sync
```

### 2. Deploy to Devnet
```bash
anchor deploy --provider.cluster devnet
```

### 3. Initialize Program
```bash
anchor run initialize-devnet
```

### 4. Setup Oracle Bot
```bash
cd oracle-bot
pnpm install
cp .env.example .env
# Configure .env with keys
pnpm start
```

### 5. Test End-to-End
```bash
anchor test
```

---

## Testing Strategy

### Unit Tests
- Each instruction with valid inputs
- Account validation
- Math calculations (reward distribution)

### Integration Tests
- Full epoch lifecycle
- Multiple contributors claiming
- Oracle updates and epoch finalization
- Edge cases (zero XP, late claims, etc.)

### Load Tests
- 200 contributors recording XP
- Gas cost analysis
- Transaction throughput

---

## Gas Cost Estimates (Devnet)

- `initialize`: ~0.005 SOL
- `create_epoch`: ~0.002 SOL
- `record_contributor_xp`: ~0.002 SOL per contributor
- `finalize_epoch`: ~0.001 SOL
- `register_contributor`: ~0.002 SOL (user pays)
- `claim_rewards`: ~0.001 SOL (user pays)

**Daily Oracle Cost**: ~0.4 SOL (200 contributors)
**Weekly Oracle Cost**: ~2.8 SOL + epoch management

---

## Future Enhancements

### Phase 2
- Multiple reward tiers (gold/silver/bronze)
- Referral bonuses
- Streak multipliers
- NFT badges for top contributors

### Phase 3
- DAO governance for admin operations
- On-chain voting for reward amounts
- Merkle tree compression for 1000+ contributors
- Cross-program composability

### Phase 4
- Multi-token rewards (SOL, USDC, custom)
- Vesting schedules
- Staking mechanics
- DeFi integrations

---

## Monitoring & Maintenance

### Metrics to Track
- Daily XP updates success rate
- Weekly epoch finalizations
- Total rewards distributed
- Claim success rate
- Oracle uptime

### Alerts
- Oracle bot failures
- Unusual XP spikes
- Low reward vault balance
- Unclaimed rewards accumulation

### Maintenance Schedule
- Weekly: Review oracle logs
- Monthly: Security review
- Quarterly: Performance optimization

---

## Documentation

### For Developers
- API documentation (generated by Anchor)
- Integration guide for webapp
- Oracle bot setup guide

### For Users
- How to register
- How to claim rewards
- FAQ

---

## Changelog

### v1.0 (Initial Spec)
- Basic reward distribution system
- Proportional XP-based rewards
- Daily updates, weekly distributions
- Custom SPL token
- Dual authority model (admin + oracle)

---

## Contact & Support

- GitHub: github.com/Sendo-labs/leaderboard-rewards
- Issues: github.com/Sendo-labs/leaderboard-rewards/issues

---

*Specifications subject to change during implementation based on testing and feedback.*

