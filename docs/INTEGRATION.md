# Leaderboard Integration Guide

This document explains how the leaderboard-rewards system integrates with the Sendo contributor leaderboard to fetch contributor data (GitHub username, Solana wallet address, and XP).

## Architecture Overview

```
┌─────────────────────────────────┐
│   Sendo Leaderboard Project    │
│  (GitHub Contribution Tracking) │
└────────────┬────────────────────┘
             │
             │ Daily Pipeline (23:00 UTC)
             │ Exports JSON to _data branch
             ▼
┌─────────────────────────────────┐
│  leaderboard-export.json        │
│  (Static JSON on GitHub)        │
└────────────┬────────────────────┘
             │
             │ HTTP Fetch
             │ (Daily at midnight)
             ▼
┌─────────────────────────────────┐
│     Oracle Bot                  │
│  (TypeScript/Node.js)           │
└────────────┬────────────────────┘
             │
             │ Solana Transactions
             │ (record_contributor_xp)
             ▼
┌─────────────────────────────────┐
│  Leaderboard Rewards Program        │
│  (Solana Anchor Program)        │
└─────────────────────────────────┘
```

## Data Flow

### 1. Leaderboard Project (Data Source)

**Location:** `../leaderboard/`

**Pipeline:** Daily at 23:00 UTC via GitHub Actions

**Export Step:** `src/lib/pipelines/export/exportRpgLeaderboard.ts`

**What it does:**
- Queries the SQLite database for all contributors
- Filters for users with:
  - Primary Solana wallet address linked
  - Active wallet status
  - Not marked as bot
  - Positive total XP
- Generates `leaderboard-export.json` in the `data/` directory
- Commits to `_data` branch

**Data Format:**
```json
{
  "lastUpdated": "2025-10-19T12:00:00Z",
  "contributors": [
    {
      "githubUsername": "contributor1",
      "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "xp": 12500
    }
  ]
}
```

**Data Source:** 
```
https://raw.githubusercontent.com/Sendo-labs/leaderboard/_data/leaderboard-export.json
```

### 2. Oracle Bot (Data Consumer)

**Location:** `./oracle-bot/`

**Schedule:** 
- Daily: Every day at 00:00 UTC (records XP)
- Weekly: Every Sunday at 00:00 UTC (manages epochs)

**Configuration:** `.env` file

**What it does:**
1. Fetches leaderboard data from GitHub raw URL
2. Parses contributor data (username, wallet, XP)
3. For each contributor:
   - Checks if registered on-chain
   - Records/updates XP via `record_contributor_xp` instruction
4. On Sundays:
   - Finalizes completed epoch
   - Creates new epoch for the week

### 3. On-Chain Program (Data Storage)

**Location:** `./programs/leaderboard-rewards/`

**Accounts:**
- `Contributor`: Links GitHub username to wallet address
- `EpochSnapshot`: Records XP for each contributor per epoch
- `RewardEpoch`: Manages weekly reward distribution periods

## Setup Instructions

### Prerequisites

1. Contributors must link their Solana wallet:
   - Via the leaderboard webapp profile edit page
   - Wallet is written to GitHub profile README as hidden comment
   - Must set one wallet as "primary"

2. Deploy the Solana program:
   ```bash
   anchor build
   anchor deploy
   ```

3. Initialize the program:
   ```bash
   anchor run initialize
   ```

### Configure Oracle Bot

1. **Install dependencies:**
   ```bash
   cd oracle-bot
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp env.example .env
   ```

3. **Configure `.env`:**
   ```env
   RPC_URL=https://api.devnet.solana.com
   PROGRAM_ID=<your_deployed_program_id>
   ORACLE_PRIVATE_KEY=<base58_encoded_oracle_private_key>
   LEADERBOARD_API_URL=https://raw.githubusercontent.com/Sendo-labs/leaderboard/_data/leaderboard-export.json
   ```

4. **Generate oracle keypair:**
   ```bash
   solana-keygen new -o oracle-keypair.json
   solana-keygen pubkey oracle-keypair.json
   ```

5. **Fund oracle wallet:**
   ```bash
   solana airdrop 2 <oracle_pubkey> --url devnet
   ```

### Run Oracle Bot

**Start scheduled bot (production):**
```bash
cd oracle-bot
pnpm start
```

**Manual updates (testing):**
```bash
# Daily XP update
pnpm run update-daily

# Weekly epoch management
pnpm run update-weekly
```

## Data Requirements

### Contributor Wallet Linking

Contributors must link their Solana wallet through the leaderboard webapp:

1. Visit profile edit page
2. Authenticate with GitHub
3. Add Solana wallet address
4. Mark as primary
5. Save changes

The webapp updates the contributor's GitHub profile README with:
```html
<!-- wallet:solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:primary -->
```

### XP Calculation

XP (experience points) is calculated based on:
- **Pull Requests**: 4-20 points (base + merged + complexity)
- **Code Reviews**: 4-6 points (base + quality)
- **Issues**: 2-4 points (base + closed bonus)
- **Comments**: 0.2-1 point (base + length)
- **Code Changes**: Based on lines added/deleted
- **Tag Multipliers**: Core (2.5x), UI (1.8x), Tests (2.0x), etc.

See `../leaderboard/config/pipeline.config.ts` for full scoring rules.

## Monitoring & Maintenance

### Check Leaderboard Export

```bash
curl https://raw.githubusercontent.com/Sendo-labs/leaderboard/_data/leaderboard-export.json | jq
```

### Check Oracle Bot Logs

```bash
cd oracle-bot
tail -f oracle-bot.log
```

### Verify On-Chain Data

```bash
# Check contributor account
anchor run check-contributor -- <github_username>

# Check epoch status
anchor run check-epoch -- <epoch_number>
```

### Common Issues

**Issue:** Contributor not appearing in export

**Solutions:**
- Verify they've linked a primary Solana wallet
- Check they have positive XP
- Confirm they're not marked as bot
- Run leaderboard pipeline manually: `cd ../leaderboard && bun run pipeline`

**Issue:** Oracle bot can't fetch data

**Solutions:**
- Check GitHub is accessible
- Verify `_data` branch exists
- Confirm `leaderboard-export.json` is present
- Test URL manually: `curl <leaderboard_api_url>`

**Issue:** On-chain XP not updating

**Solutions:**
- Verify oracle wallet has SOL for transaction fees
- Check oracle keypair matches on-chain oracle authority
- Review oracle bot logs for errors
- Ensure epoch is not finalized (can't update finalized epochs)

## Development Workflow

### Local Testing

1. **Sync leaderboard data locally:**
   ```bash
   cd ../leaderboard
   bun run data:sync
   bun run pipeline export
   ```

2. **Test with local file:**
   ```bash
   cd ../leaderboard-rewards/oracle-bot
   # Set in .env:
   # LEADERBOARD_DATA_FILE=../../leaderboard/data/leaderboard-export.json
   pnpm run update-daily
   ```

3. **Verify on devnet:**
   ```bash
   anchor run check-contributor -- <username>
   ```

### Production Deployment

1. **Deploy Solana program to mainnet:**
   ```bash
   anchor build
   solana program deploy target/deploy/leaderboard_rewards.so --url mainnet-beta
   ```

2. **Update oracle bot config:**
   ```env
   RPC_URL=https://api.mainnet-beta.solana.com
   CLUSTER=mainnet-beta
   PROGRAM_ID=<mainnet_program_id>
   ```

3. **Run oracle bot on server:**
   ```bash
   # Using PM2
   pm2 start pnpm --name oracle-bot -- start
   pm2 save
   pm2 startup
   ```

## Timeline

- **Daily (23:00 UTC)**: Leaderboard pipeline exports contributor data
- **Daily (00:00 UTC)**: Oracle bot fetches data and records XP on-chain
- **Sunday (00:00 UTC)**: Oracle bot finalizes epoch and creates new one
- **Anytime**: Contributors claim rewards for finalized epochs

## Security Considerations

1. **Wallet Linking**: GitHub profile README is public, wallet addresses are visible
2. **Oracle Authority**: Can only record XP, cannot move funds or modify config
3. **Admin Separation**: Admin key separate from oracle key for critical operations
4. **Rate Limiting**: Oracle bot respects Solana RPC rate limits
5. **Data Validation**: Invalid wallets and negative XP filtered before export

## Future Enhancements

1. **Real-time Updates**: Move to API instead of static JSON export
2. **Multi-chain Support**: Track contributions across multiple chains
3. **NFT Badges**: Award NFTs for milestone achievements
4. **Governance**: Allow contributors to vote on reward distribution
5. **Merkle Trees**: Compress data for scaling to 1000+ contributors

## Support

- **Leaderboard Issues**: https://github.com/Sendo-labs/leaderboard/issues
- **Rewards Program Issues**: https://github.com/Sendo-labs/leaderboard-rewards/issues
- **Documentation**: See README.md files in respective directories

