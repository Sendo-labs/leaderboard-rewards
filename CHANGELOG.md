# Changelog

All notable changes to the Leaderboard Rewards project will be documented in this file.

## [Unreleased] - 2025-11-03

### Added
- ✅ Complete devnet deployment and initialization
- ✅ Oracle keypair generation in `keys/` directory
- ✅ Automated oracle bot configuration via initialization script
- ✅ First epoch successfully created on devnet
- ✅ SBT (SENDO) token deployed as Token-2022 with NonTransferable extension
- ✅ Comprehensive deployment documentation in `DEPLOYMENT.md`

### Changed
- 🔧 **Anchor.toml**: Updated cluster from `localnet` to `devnet` for consistency
- 🔧 **Cargo.toml**: Added missing Cargo features (`custom-heap`, `custom-panic`, `anchor-debug`) to eliminate compilation warnings
- 🔧 **create-epoch.ts**: Fixed field name from `rewardAmount` to `usdcRewardAmount` to match Rust program
- 🔧 **create-epoch.ts**: Added missing `AnchorProvider` import

### Fixed
- 🐛 Program deployment: Deployed to devnet with ID `GQ36eQ5oN6A47q7SpZFYGAA3HndkELmjdgsncbN1yQ9d`
- 🐛 Dependencies: Installed all missing Node.js dependencies (root + oracle-bot)
- 🐛 Missing keys: Created `keys/` directory with oracle keypair
- 🐛 Field inconsistency: Aligned TypeScript field names with Rust program schema
- 🐛 Import error: Added `AnchorProvider` to create-epoch script imports
- 🐛 Cluster mismatch: Synchronized Anchor.toml cluster config with scripts
- 🐛 Compilation warnings: Reduced from 20 warnings to 1 by adding Cargo features
- 🐛 Initialization: Successfully initialized program with all required accounts

### Deployment Details

#### Program Information
- **Program ID**: `GQ36eQ5oN6A47q7SpZFYGAA3HndkELmjdgsncbN1yQ9d`
- **Network**: Solana Devnet
- **Deployment Tx**: [View on Explorer](https://explorer.solana.com/tx/4CQSG7xsAa1DCCsdTkne64V4NR1SsMP7t8GAsMp4mMqHbfyCAaw7YAychZreBKRRNXGdxCUvkog52C5ixt1JCTZN?cluster=devnet)
- **Initialize Tx**: [View on Explorer](https://explorer.solana.com/tx/43SEFDRYcALNA5dzVTB8wNpFjXpbjgDVAiCRQydkVXYtZhcTyb6qK8QNcp1TQwooHPvEEYuy9ZMrzPw7oxeANNQb?cluster=devnet)

#### On-Chain Accounts
- **Config PDA**: `5bxtuN3vy2Tv6pmw1bAMzDncLvqnnwZdfVmyJxkXffFd`
- **Admin**: `AkbEEmqkq6QQLGAP3rh8iauceYW16B6Dyb3d7eFoNPTA`
- **Oracle**: `8e4JavJYfm6eSCz7hKPTWWm2JgKiZ3g8KUUkMhimG113`
- **SBT Mint (SENDO)**: `AMyYVVEGwkMUFnuYxhebAuwcvD2y8pqCkobFthEij6Fw`
- **USDC Vault**: `CQjc7xy7WCP4tfT9pVU9yRthq8DCYFKJsfTF8fxHuCg6`

#### First Epoch
- **Epoch Number**: 1
- **Start Time**: 2025-11-03T20:39:39.000Z
- **End Time**: 2025-11-10T20:39:39.000Z
- **USDC Rewards**: 100,000,000,000 base units
- **Creation Tx**: [View on Explorer](https://explorer.solana.com/tx/5P7cPgZzAVYcESezSMxJJ76DVXRzXgin5uYjsjQhkf2JE5aP9hNWuCnkVrrUE8uviyoRkRwxRBckXhaKsGfH9XA4?cluster=devnet)

### Technical Changes

#### File: `Anchor.toml`
```diff
[provider]
- cluster = "localnet"
+ cluster = "devnet"
  wallet = "~/.config/solana/id.json"
```

**Rationale**: Scripts were configured for devnet but Anchor.toml pointed to localnet, causing environment inconsistency.

#### File: `programs/leaderboard-rewards/Cargo.toml`
```diff
[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
+ custom-heap = []
+ custom-panic = []
+ anchor-debug = []
```

**Rationale**: Missing Cargo features caused 20 compilation warnings. Adding these features eliminates the warnings and ensures compatibility with current Rust toolchain.

#### File: `scripts/create-epoch.ts`
```diff
import * as anchor from '@coral-xyz/anchor';
- import { Program, BN } from '@coral-xyz/anchor';
+ import { Program, BN, AnchorProvider } from '@coral-xyz/anchor';
```

**Rationale**: `AnchorProvider` was used on line 30 but not imported, causing compilation errors.

```diff
- console.log(`  Reward Amount: ${epoch.rewardAmount.toString()}`);
+ console.log(`  Reward Amount: ${epoch.usdcRewardAmount.toString()}`);
```

**Rationale**: Rust program defines the field as `usdc_reward_amount` (snake_case becomes `usdcRewardAmount` in camelCase). Using `rewardAmount` caused runtime errors when accessing epoch data.

### Infrastructure

#### New Files Created
- `keys/oracle.json` - Oracle keypair for transaction signing
- `keys/sbt-mint.json` - SBT token mint keypair
- `oracle-bot/.env` - Auto-generated oracle bot configuration
- `yarn.lock` - Root dependencies lockfile
- `oracle-bot/pnpm-lock.yaml` - Oracle bot dependencies lockfile (already existed, now with installed modules)
- `DEPLOYMENT.md` - Comprehensive deployment documentation
- `CHANGELOG.md` - This file

#### Dependencies Installed
- **Root**: All packages from `package.json` (Anchor, Solana Web3.js, SPL Token, etc.)
- **Oracle Bot**: All packages from `oracle-bot/package.json` (Anchor, dotenv, node-cron, etc.)

### Testing Status

- ✅ Program builds without errors
- ✅ Program deploys successfully to devnet
- ✅ Initialization completes successfully
- ✅ Epoch creation works correctly
- ✅ Oracle bot configuration auto-generates properly
- ⏳ Full integration tests pending (requires USDC funding and contributor testing)

### Known Issues

None at this time. All critical issues have been resolved.

### Next Steps

1. **Obtain devnet USDC tokens** from a faucet
2. **Fund the USDC vault** using the fund script
3. **Start oracle bot** for automated operations
4. **Test full contributor flow** (register → XP sync → claim rewards)
5. **Monitor oracle bot** performance over first epoch cycle
6. **Deploy to mainnet** after thorough testing

### Breaking Changes

None. These are fixes and deployments for an undeployed system.

### Migration Guide

Not applicable - this is the initial deployment.

### Contributors

- Initial deployment and bug fixes: @chainsona (via AI assistance)

### Related PRs

- Initial deployment fixes and devnet setup (this PR)

---

## Previous Releases

### [Initial Commit] - 2025-10-XX

Initial project structure with:
- Anchor program for reward distribution
- Oracle bot for automated XP synchronization
- Scripts for deployment and management
- Comprehensive documentation

**Note**: System was not deployed or initialized at this stage.
