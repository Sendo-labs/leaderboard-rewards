use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
    token_2022::{mint_to, MintTo, Token2022},
};

declare_id!("GQ36eQ5oN6A47q7SpZFYGAA3HndkELmjdgsncbN1yQ9d");

const MAX_GITHUB_USERNAME_LEN: usize = 39;
const SECONDS_PER_WEEK: i64 = 7 * 24 * 60 * 60;
const CLAIM_WINDOW_DAYS: i64 = 30 * 24 * 60 * 60;
const MAX_XP_INCREASE: u64 = 1_000_000;
const XP_TO_SBT_RATIO: u64 = 100;
const SBT_MAX_SUPPLY: u64 = 1_000_000_000;
const MAX_ROLE_CATEGORIES: usize = 10;
const MAX_DOMAIN_CATEGORIES: usize = 15;
const MAX_SKILL_CATEGORIES: usize = 20;

#[program]
pub mod leaderboard_rewards {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        oracle: Pubkey,
        usdc_mint: Pubkey,
        sbt_mint: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.oracle = oracle;
        config.usdc_mint = usdc_mint;
        config.sbt_mint = sbt_mint;
        config.usdc_vault = ctx.accounts.usdc_vault.key();
        config.current_epoch = 0;
        config.total_epochs = 0;
        config.xp_to_sbt_ratio = XP_TO_SBT_RATIO;
        config.sbt_total_supply = SBT_MAX_SUPPLY;
        config.sbt_minted = 0;
        config.bump = ctx.bumps.config;

        msg!("Program initialized with admin: {}", config.admin);
        msg!("Oracle: {}", config.oracle);
        msg!("USDC mint: {}", config.usdc_mint);
        msg!("SBT mint: {}", config.sbt_mint);
        msg!("XP to SBT ratio: {} (1 XP = {} SBT)", config.xp_to_sbt_ratio, config.xp_to_sbt_ratio);
        msg!("SBT max supply: {}", config.sbt_total_supply);
        Ok(())
    }

    pub fn update_oracle(ctx: Context<UpdateOracle>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.oracle = ctx.accounts.new_oracle.key();
        msg!("Oracle updated to: {}", config.oracle);
        Ok(())
    }

    pub fn fund_usdc_pool(ctx: Context<FundUsdcPool>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder_token_account.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
        )?;
        msg!("Funded USDC pool with {} tokens", amount);
        Ok(())
    }

    pub fn create_epoch(ctx: Context<CreateEpoch>, usdc_reward_amount: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let epoch = &mut ctx.accounts.epoch;
        
        let clock = Clock::get()?;
        let epoch_number = config.current_epoch + 1;
        
        epoch.epoch_number = epoch_number;
        epoch.start_time = clock.unix_timestamp;
        epoch.end_time = clock.unix_timestamp + SECONDS_PER_WEEK;
        epoch.total_xp = 0;
        epoch.usdc_reward_amount = usdc_reward_amount;
        epoch.contributor_count = 0;
        epoch.finalized = false;
        epoch.bump = ctx.bumps.epoch;
        
        config.current_epoch = epoch_number;
        config.total_epochs += 1;
        
        msg!("Created epoch {} with {} USDC rewards", epoch_number, usdc_reward_amount);
        Ok(())
    }

    pub fn sync_contributor_xp(
        ctx: Context<SyncContributorXp>,
        wallet: Pubkey,
        github_username: String,
        total_xp: u64,
        role_xp_data: Vec<XpCategory>,
        domain_xp_data: Vec<XpCategory>,
        skill_xp_data: Vec<XpCategory>,
    ) -> Result<()> {
        require!(
            github_username.len() > 0 && github_username.len() <= MAX_GITHUB_USERNAME_LEN,
            ErrorCode::InvalidGithubUsername
        );
        require!(role_xp_data.len() <= MAX_ROLE_CATEGORIES, ErrorCode::TooManyCategories);
        require!(domain_xp_data.len() <= MAX_DOMAIN_CATEGORIES, ErrorCode::TooManyCategories);
        require!(skill_xp_data.len() <= MAX_SKILL_CATEGORIES, ErrorCode::TooManyCategories);
        
        let config = &ctx.accounts.config;
        let epoch = &mut ctx.accounts.epoch;
        let clock = Clock::get()?;
        
        require!(!epoch.finalized, ErrorCode::EpochFinalized);
        
        let is_registered = ctx.accounts.contributor.wallet == wallet;
        let mut sbt_earned = 0u64;
        
        if is_registered {
            let contributor = &mut ctx.accounts.contributor;
            let snapshot = &mut ctx.accounts.snapshot;
            
            let old_xp = contributor.total_xp;
            let xp_delta = total_xp.saturating_sub(old_xp);
            
            require!(
                xp_delta <= MAX_XP_INCREASE,
                ErrorCode::XpTooHigh
            );
            
            let is_new_snapshot = snapshot.xp == 0;
            let snapshot_old_xp = snapshot.xp;
            
            sbt_earned = xp_delta.checked_mul(config.xp_to_sbt_ratio).unwrap_or(0);
            
            contributor.total_xp = total_xp;
            contributor.total_sbt_claimable = contributor
                .total_sbt_claimable
                .checked_add(sbt_earned)
                .ok_or(ErrorCode::MathOverflow)?;
            
            snapshot.contributor = wallet;
            snapshot.epoch = epoch.epoch_number;
            snapshot.xp = total_xp;
            snapshot.usdc_claimed = false;
            snapshot.sbt_earned = sbt_earned;
            snapshot.bump = ctx.bumps.snapshot;
            
            if is_new_snapshot {
                epoch.contributor_count += 1;
                epoch.total_xp = epoch.total_xp
                    .checked_add(total_xp)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                epoch.total_xp = epoch.total_xp
                    .checked_sub(snapshot_old_xp)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_add(total_xp)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
            
            msg!("Synced XP {} for {} in epoch {} (+{} SBT)", 
                total_xp, wallet, epoch.epoch_number, sbt_earned);
        } else {
            msg!("Emitting XP event for unregistered user: {}", wallet);
        }
        
        emit!(XpSyncedEvent {
            wallet,
            github_username,
            epoch: epoch.epoch_number,
            total_xp,
            role_xp: role_xp_data,
            domain_xp: domain_xp_data,
            skill_xp: skill_xp_data,
            sbt_earned,
            timestamp: clock.unix_timestamp,
            is_registered,
        });
        
        Ok(())
    }

    pub fn finalize_epoch(ctx: Context<FinalizeEpoch>, epoch_number: u64) -> Result<()> {
        let epoch = &mut ctx.accounts.epoch;
        let clock = Clock::get()?;
        
        require!(!epoch.finalized, ErrorCode::EpochAlreadyFinalized);
        require!(clock.unix_timestamp >= epoch.end_time, ErrorCode::EpochNotEnded);
        
        epoch.finalized = true;
        
        msg!(
            "Epoch {} finalized with {} contributors and {} total XP",
            epoch_number,
            epoch.contributor_count,
            epoch.total_xp
        );
        Ok(())
    }

    pub fn register_contributor(ctx: Context<RegisterContributor>, github_username: String) -> Result<()> {
        require!(
            github_username.len() > 0 && github_username.len() <= MAX_GITHUB_USERNAME_LEN,
            ErrorCode::InvalidGithubUsername
        );
        
        let contributor = &mut ctx.accounts.contributor;
        let clock = Clock::get()?;
        
        contributor.wallet = ctx.accounts.wallet.key();
        contributor.github_username = github_username.clone();
        contributor.total_xp = 0;
        contributor.total_sbt_claimable = 0;
        contributor.total_sbt_claimed = 0;
        contributor.lifetime_usdc_earned = 0;
        contributor.last_claim_epoch = 0;
        contributor.registered_at = clock.unix_timestamp;
        contributor.bump = ctx.bumps.contributor;
        
        msg!("Registered contributor {} with GitHub: {} at {}", 
            contributor.wallet, github_username, contributor.registered_at);
        Ok(())
    }

    pub fn update_github_link(ctx: Context<UpdateGithubLink>, new_github_username: String) -> Result<()> {
        require!(
            new_github_username.len() > 0 && new_github_username.len() <= MAX_GITHUB_USERNAME_LEN,
            ErrorCode::InvalidGithubUsername
        );
        
        let contributor = &mut ctx.accounts.contributor;
        contributor.github_username = new_github_username.clone();
        
        msg!("Updated GitHub username to: {}", new_github_username);
        Ok(())
    }

    pub fn claim_usdc_rewards(ctx: Context<ClaimUsdcRewards>, epoch_number: u64) -> Result<()> {
        let epoch = &ctx.accounts.epoch;
        let snapshot = &mut ctx.accounts.snapshot;
        let contributor = &mut ctx.accounts.contributor;
        let clock = Clock::get()?;
        
        require!(epoch.finalized, ErrorCode::EpochNotFinalized);
        require!(!snapshot.usdc_claimed, ErrorCode::AlreadyClaimed);
        require!(
            clock.unix_timestamp <= epoch.end_time + CLAIM_WINDOW_DAYS,
            ErrorCode::ClaimWindowExpired
        );
        require!(epoch.total_xp > 0, ErrorCode::NoXpInEpoch);
        
        let registration_time = contributor.registered_at;
        let ninety_days_before_registration = registration_time - (90 * 24 * 60 * 60);
        
        require!(
            epoch.end_time >= ninety_days_before_registration,
            ErrorCode::EpochTooOld
        );
        
        let reward_amount = (snapshot.xp as u128)
            .checked_mul(epoch.usdc_reward_amount as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(epoch.total_xp as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        require!(reward_amount > 0, ErrorCode::NoRewardToClaim);
        
        let seeds = &[b"config".as_ref(), &[ctx.accounts.config.bump]];
        let signer = &[&seeds[..]];
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.contributor_token_account.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer,
            ),
            reward_amount,
        )?;
        
        snapshot.usdc_claimed = true;
        contributor.lifetime_usdc_earned = contributor
            .lifetime_usdc_earned
            .checked_add(reward_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        contributor.last_claim_epoch = epoch_number;
        
        msg!(
            "Claimed {} USDC for epoch {} (XP: {}/{}, within 90-day window)",
            reward_amount,
            epoch_number,
            snapshot.xp,
            epoch.total_xp
        );
        Ok(())
    }

    pub fn claim_sbt_tokens(ctx: Context<ClaimSbtTokens>) -> Result<()> {
        let claimable = ctx.accounts.contributor.total_sbt_claimable
            .checked_sub(ctx.accounts.contributor.total_sbt_claimed)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(claimable > 0, ErrorCode::NoSbtToClaim);
        
        let remaining_supply = ctx.accounts.config.sbt_total_supply
            .checked_sub(ctx.accounts.config.sbt_minted)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let actual_mint = claimable.min(remaining_supply);
        require!(actual_mint > 0, ErrorCode::SbtSupplyExhausted);
        
        let bump = ctx.accounts.config.bump;
        let seeds = &[b"config".as_ref(), &[bump]];
        let signer = &[&seeds[..]];
        
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.sbt_mint.to_account_info(),
                    to: ctx.accounts.contributor_sbt_account.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer,
            ),
            actual_mint,
        )?;
        
        ctx.accounts.contributor.total_sbt_claimed = ctx.accounts.contributor
            .total_sbt_claimed
            .checked_add(actual_mint)
            .ok_or(ErrorCode::MathOverflow)?;
        
        ctx.accounts.config.sbt_minted = ctx.accounts.config
            .sbt_minted
            .checked_add(actual_mint)
            .ok_or(ErrorCode::MathOverflow)?;
        
        msg!(
            "Claimed {} SBT tokens (claimable: {}, remaining supply: {})",
            actual_mint,
            claimable,
            remaining_supply
        );
        
        if actual_mint < claimable {
            msg!("Warning: {} SBT could not be claimed due to supply cap", claimable - actual_mint);
        }
        
        Ok(())
    }

    // TODO: Implement batch_claim_rewards using Anchor's AccountLoader or multiple instruction calls
    // For now, users can call claim_usdc_rewards multiple times for retroactive epochs
}

#[derive(Accounts)]
#[instruction(oracle: Pubkey, usdc_mint: Pubkey, sbt_mint: Pubkey)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint_account,
        associated_token::authority = config,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    /// CHECK: USDC mint verified by ATA
    pub usdc_mint_account: AccountInfo<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, Config>,
    
    pub admin: Signer<'info>,
    
    /// CHECK: New oracle address
    pub new_oracle: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct FundUsdcPool<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        constraint = usdc_vault.key() == config.usdc_vault
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub funder: Signer<'info>,
    
    #[account(mut)]
    pub funder_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreateEpoch<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = oracle
    )]
    pub config: Account<'info, Config>,
    
    #[account(
        init,
        payer = oracle,
        space = 8 + 8 + 8 + 8 + 8 + 8 + 2 + 1 + 1,
        seeds = [b"epoch", (config.current_epoch + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub epoch: Account<'info, RewardEpoch>,
    
    #[account(mut)]
    pub oracle: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey, github_username: String, total_xp: u64, role_xp_data: Vec<XpCategory>, domain_xp_data: Vec<XpCategory>, skill_xp_data: Vec<XpCategory>)]
pub struct SyncContributorXp<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle)]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        seeds = [b"epoch", config.current_epoch.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, RewardEpoch>,
    
    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + 32 + 4 + MAX_GITHUB_USERNAME_LEN + 8 + 8 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"contributor", wallet.as_ref()],
        bump
    )]
    pub contributor: Account<'info, Contributor>,
    
    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + 32 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"snapshot", config.current_epoch.to_le_bytes().as_ref(), wallet.as_ref()],
        bump
    )]
    pub snapshot: Account<'info, EpochSnapshot>,
    
    #[account(mut)]
    pub oracle: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_number: u64)]
pub struct FinalizeEpoch<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle)]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        seeds = [b"epoch", epoch_number.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, RewardEpoch>,
    
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterContributor<'info> {
    #[account(
        init,
        payer = wallet,
        space = 8 + 32 + 4 + MAX_GITHUB_USERNAME_LEN + 8 + 8 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"contributor", wallet.key().as_ref()],
        bump
    )]
    pub contributor: Account<'info, Contributor>,
    
    #[account(mut)]
    pub wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateGithubLink<'info> {
    #[account(
        mut,
        seeds = [b"contributor", wallet.key().as_ref()],
        bump = contributor.bump,
        has_one = wallet
    )]
    pub contributor: Account<'info, Contributor>,
    
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_number: u64)]
pub struct ClaimUsdcRewards<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    
    #[account(
        seeds = [b"epoch", epoch_number.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, RewardEpoch>,
    
    #[account(
        mut,
        seeds = [b"snapshot", epoch_number.to_le_bytes().as_ref(), wallet.key().as_ref()],
        bump = snapshot.bump,
        has_one = contributor
    )]
    pub snapshot: Account<'info, EpochSnapshot>,
    
    #[account(
        mut,
        seeds = [b"contributor", wallet.key().as_ref()],
        bump = contributor.bump,
        has_one = wallet
    )]
    pub contributor: Account<'info, Contributor>,
    
    #[account(
        mut,
        constraint = usdc_vault.key() == config.usdc_vault
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub contributor_token_account: Account<'info, TokenAccount>,
    
    pub wallet: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimSbtTokens<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        seeds = [b"contributor", wallet.key().as_ref()],
        bump = contributor.bump,
        has_one = wallet
    )]
    pub contributor: Account<'info, Contributor>,
    
    #[account(
        mut,
        constraint = sbt_mint.key() == config.sbt_mint
    )]
    pub sbt_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub contributor_sbt_account: Account<'info, TokenAccount>,
    
    pub wallet: Signer<'info>,
    
    pub token_2022_program: Program<'info, Token2022>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub usdc_mint: Pubkey,
    pub sbt_mint: Pubkey,
    pub usdc_vault: Pubkey,
    pub current_epoch: u64,
    pub total_epochs: u64,
    pub xp_to_sbt_ratio: u64,
    pub sbt_total_supply: u64,
    pub sbt_minted: u64,
    pub bump: u8,
}

#[account]
pub struct RewardEpoch {
    pub epoch_number: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub total_xp: u64,
    pub usdc_reward_amount: u64,
    pub contributor_count: u16,
    pub finalized: bool,
    pub bump: u8,
}

#[account]
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

#[account]
pub struct EpochSnapshot {
    pub contributor: Pubkey,
    pub epoch: u64,
    pub xp: u64,
    pub usdc_claimed: bool,
    pub sbt_earned: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct XpCategory {
    pub name: String,
    pub amount: u64,
}

#[event]
pub struct XpSyncedEvent {
    pub wallet: Pubkey,
    pub github_username: String,
    pub epoch: u64,
    pub total_xp: u64,
    pub role_xp: Vec<XpCategory>,
    pub domain_xp: Vec<XpCategory>,
    pub skill_xp: Vec<XpCategory>,
    pub sbt_earned: u64,
    pub timestamp: i64,
    pub is_registered: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("XP increase too high")]
    XpTooHigh,
    #[msg("Epoch is already finalized")]
    EpochFinalized,
    #[msg("Epoch is already finalized")]
    EpochAlreadyFinalized,
    #[msg("Epoch has not ended yet")]
    EpochNotEnded,
    #[msg("GitHub username must be 1-39 characters")]
    InvalidGithubUsername,
    #[msg("Epoch is not finalized yet")]
    EpochNotFinalized,
    #[msg("Rewards already claimed for this epoch")]
    AlreadyClaimed,
    #[msg("Claim window has expired (30 days after epoch end)")]
    ClaimWindowExpired,
    #[msg("No XP recorded in this epoch")]
    NoXpInEpoch,
    #[msg("No reward to claim")]
    NoRewardToClaim,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Too many XP categories")]
    TooManyCategories,
    #[msg("No SBT tokens to claim")]
    NoSbtToClaim,
    #[msg("SBT supply exhausted")]
    SbtSupplyExhausted,
    #[msg("Contributor not registered. Register first to claim rewards.")]
    ContributorNotRegistered,
    #[msg("Epoch ended before your 90-day retroactive claim window.")]
    EpochTooOld,
}
