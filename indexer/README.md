# Leaderboard Rewards Event Indexer

Simple event indexer service for Leaderboard Rewards that listens to and stores `XpSyncedEvent` emissions from the Solana program.

## Purpose

With the opt-in model, the oracle emits events for **all** GitHub contributors (registered or not). This indexer:

1. Listens for `XpSyncedEvent` events in real-time
2. Stores historical XP data for all contributors
3. Enables retroactive reward claims (90-day window)
4. Provides data for frontend queries

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your RPC_URL and PROGRAM_ID

# Build
pnpm build
```

## Usage

### Start Real-Time Indexing

```bash
pnpm start
```

This will:
- Connect to the Solana program
- Subscribe to `XpSyncedEvent` events
- Store events to `data/indexed-events.json`
- Print real-time updates as events arrive

### Backfill Historical Events

```bash
pnpm start backfill [startSlot]
```

Fetches historical transactions and extracts events.

## Data Structure

Events are stored in `data/indexed-events.json`:

```json
{
  "events": [
    {
      "wallet": "ABC123...",
      "githubUsername": "contributor1",
      "epoch": 1,
      "totalXp": 5000,
      "roleXp": [{ "name": "developer", "amount": 3000 }],
      "domainXp": [{ "name": "core", "amount": 2500 }],
      "skillXp": [{ "name": "rust", "amount": 2000 }],
      "sbtEarned": 500000,
      "timestamp": 1704067200,
      "isRegistered": false
    }
  ],
  "lastProcessedSlot": 123456789,
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

## API Endpoints (Future)

For production, expose a REST API:

```typescript
GET /events/:wallet              // Get all events for a wallet
GET /unclaimed/:wallet           // Get unclaimed epochs (90-day window)
GET /contributor/:github         // Get contributor by GitHub username
GET /epoch/:number               // Get all events for an epoch
```

## Production Deployment

For production, use:
- **Helius** or **Triton** RPC with webhook support (free tier available)
- **PostgreSQL** or **MongoDB** instead of JSON files
- **Redis** for caching
- Load balancer for multiple indexer instances

### Using Helius Webhooks (Recommended)

```typescript
// Helius automatically parses events and sends webhooks
// See: https://docs.helius.dev/webhooks-and-websockets/webhooks
```

## Cost

- **RPC calls**: Free tier (Helius/Triton) handles 100k+ events
- **Storage**: ~1KB per event, ~100MB for 100k events
- **Compute**: Minimal (Node.js process)

**Estimated cost**: $0-20/month depending on scale

