# Leaderboard Rewards Oracle Bot

Oracle bot for the Leaderboard Rewards reward distribution system. This bot automatically updates contributor XP data on-chain and manages weekly reward epochs.

## Features

- **Daily Updates**: Fetches leaderboard data and records XP for all contributors
- **Weekly Epochs**: Automatically finalizes completed epochs and creates new ones
- **Scheduled Execution**: Runs on cron schedules with configurable timing
- **Error Handling**: Automatic retries and comprehensive logging
- **Flexible Data Sources**: Supports both API endpoints and local JSON files

## Installation

```bash
cd oracle-bot
pnpm install
```

## Configuration

1. Copy the environment template:
```bash
cp env.example .env
```

2. Configure your `.env` file:

```env
# Solana Network
RPC_URL=https://api.devnet.solana.com
CLUSTER=devnet

# Program
PROGRAM_ID=your_deployed_program_id

# Oracle Keypair
ORACLE_PRIVATE_KEY=your_base58_oracle_private_key

# Leaderboard Data Source
# Production: Fetch from Sendo leaderboard API (choose one time period)
# Weekly leaderboard (last 7 days)
LEADERBOARD_API_URL=https://sendo-labs.github.io/leaderboard/data/api/leaderboard-weekly.json
# Monthly leaderboard (last 30 days)
# LEADERBOARD_API_URL=https://sendo-labs.github.io/leaderboard/data/api/leaderboard-monthly.json
# Lifetime leaderboard (all time)
# LEADERBOARD_API_URL=https://sendo-labs.github.io/leaderboard/data/api/leaderboard-lifetime.json
# Development: Use local file for testing
# LEADERBOARD_DATA_FILE=../data/leaderboard-export.json

# Epoch Configuration
EPOCH_REWARD_AMOUNT=100000000000000
EPOCH_DURATION_DAYS=7

# Scheduler
DAILY_CRON_SCHEDULE=0 0 * * *
WEEKLY_CRON_SCHEDULE=0 0 * * 0
```

### Sendo Leaderboard Integration

The oracle bot is integrated with the Sendo contributor leaderboard, which:
- Tracks GitHub contributions across multiple repositories
- Calculates XP based on PRs, issues, reviews, and comments
- Links GitHub usernames to Solana wallet addresses
- Provides data via GitHub Pages API with multiple time periods:
  - **Weekly**: Last 7 days of contributions
  - **Monthly**: Last 30 days of contributions  
  - **Lifetime**: All-time contribution totals

The leaderboard export format:
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

**Data Requirements:**
- Contributors must have linked their primary Solana wallet in their GitHub profile
- Only non-bot users with positive XP are included
- XP represents contribution score for the selected time period
- Data updates automatically and is served via GitHub Pages API
- Choose the appropriate endpoint based on your reward distribution strategy:
  - Use **weekly** for short-term reward cycles
  - Use **monthly** for medium-term reward cycles
  - Use **lifetime** for cumulative achievement tracking

### Generating Oracle Keypair

```bash
# Generate new keypair
solana-keygen new -o oracle-keypair.json

# Get base58 private key
solana-keygen pubkey oracle-keypair.json
cat oracle-keypair.json | jq -r 'map(tostring) | join(",")' | base58
```

## Usage

### Start Scheduled Bot

Runs both daily and weekly tasks on their configured schedules:

```bash
pnpm start
```

### Run Manual Updates

Execute daily XP update once:
```bash
pnpm run update-daily
```

Execute weekly epoch management once:
```bash
pnpm run update-weekly
```

### Development Mode

Run with auto-reload on file changes:
```bash
pnpm run dev
```

### Build

Compile TypeScript to JavaScript:
```bash
pnpm run build
```

## Leaderboard Data Format

The bot expects leaderboard data in one of these formats:

### Format 1: Array
```json
[
  {
    "github_username": "contributor1",
    "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "xp": 5000
  }
]
```

### Format 2: Object with contributors
```json
{
  "contributors": [
    {
      "githubUsername": "contributor1",
      "wallet_address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "score": 5000
    }
  ]
}
```

Supported field names:
- **GitHub**: `github_username`, `githubUsername`, `username`, `github`
- **Wallet**: `wallet`, `wallet_address`, `walletAddress`, `address`
- **XP**: `xp`, `score`, `points`

## Scheduling

Default cron schedules:

- **Daily** (`0 0 * * *`): Every day at midnight UTC
- **Weekly** (`0 0 * * 0`): Every Sunday at midnight UTC

Customize schedules in `.env` using standard cron syntax.

## Logging

Logs are written to:
- Console (stdout/stderr)
- Log file (configurable via `LOG_FILE` env var)

Log levels: `debug`, `info`, `warn`, `error`

## Architecture

```
src/
├── index.ts       # Entry point & scheduler
├── config.ts      # Configuration loader
├── client.ts      # Anchor program client
├── oracle.ts      # Oracle operations
├── leaderboard.ts # Leaderboard data fetcher
└── logger.ts      # Logging utility
```

## Error Handling

- **Automatic Retries**: Failed transactions retry up to 3 times
- **Graceful Degradation**: Continues processing other contributors if one fails
- **Detailed Logging**: All errors logged with context
- **Status Reports**: Summary of successful/failed operations

## Monitoring

Check logs for:
- Daily update success/failure counts
- Weekly epoch transitions
- XP recording errors
- Network issues

Example log output:
```
[2024-01-15T00:00:00.000Z] [INFO] === Starting daily XP update ===
[2024-01-15T00:00:05.123Z] [INFO] Fetched 150 contributors from leaderboard
[2024-01-15T00:02:30.456Z] [INFO] XP recording complete: 148 successful, 2 failed
[2024-01-15T00:02:30.457Z] [INFO] === Daily update complete ===
```

## Troubleshooting

### "Missing required environment variable"
Ensure all required variables are set in `.env`

### "Failed to load oracle keypair"
Check that `ORACLE_PRIVATE_KEY` is valid base58 encoded

### "Invalid wallet address"
Verify wallet addresses in leaderboard data are valid Solana public keys

### "Epoch is already finalized"
Normal behavior - epoch was already finalized on a previous run

### Transaction failures
- Check oracle wallet has sufficient SOL for transaction fees
- Verify RPC endpoint is accessible and responsive
- Ensure program is deployed to the correct cluster

## Security

- Keep `.env` file secure and never commit to git
- Oracle private key should only have permission to update XP data
- Use separate admin key for program upgrades and critical operations
- Monitor oracle wallet balance regularly

## Development

Run with debug logging:
```bash
LOG_LEVEL=debug pnpm run dev
```

Test with mock data:
```typescript
// In leaderboard.ts
const contributors = fetcher.createMockData(10);
```

## License

MIT

