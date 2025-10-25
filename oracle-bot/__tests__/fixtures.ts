import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import type { ContributorData, XpCategory } from '../src/leaderboard';

export function getMockContributors(): ContributorData[] {
  return [
    {
      githubUsername: 'alice',
      wallet: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAs'),
      totalXp: 12500,
      roleXp: [
        { name: 'developer', amount: 8000 },
        { name: 'reviewer', amount: 2500 },
        { name: 'designer', amount: 2000 },
      ],
      domainXp: [
        { name: 'core', amount: 5000 },
        { name: 'ui', amount: 4000 },
        { name: 'docs', amount: 3500 },
      ],
      skillXp: [
        { name: 'typescript', amount: 6000 },
        { name: 'react', amount: 4500 },
        { name: 'rust', amount: 2000 },
      ],
    },
    {
      githubUsername: 'bob',
      wallet: new PublicKey('8yMXts3DW88e97TYJTEqcD6jCjifeTrB94UTZVnktBs'),
      totalXp: 8000,
      roleXp: [
        { name: 'developer', amount: 6000 },
        { name: 'documentation', amount: 2000 },
      ],
      domainXp: [
        { name: 'api', amount: 4000 },
        { name: 'tests', amount: 4000 },
      ],
      skillXp: [
        { name: 'typescript', amount: 5000 },
        { name: 'nodejs', amount: 3000 },
      ],
    },
    {
      githubUsername: 'charlie',
      wallet: new PublicKey('9zMYtu4EX89f98UZKTFrdE7kDjkgfUsBsC95VWoNuCt'),
      totalXp: 5000,
      roleXp: [
        { name: 'designer', amount: 5000 },
      ],
      domainXp: [
        { name: 'ui', amount: 5000 },
      ],
      skillXp: [
        { name: 'figma', amount: 3000 },
        { name: 'css', amount: 2000 },
      ],
    },
  ];
}

export const mockContributors = getMockContributors();

export function getMockLeaderboardExportV2() {
  return {
    lastUpdated: '2025-10-19T23:00:00Z',
    exportVersion: '2.0',
    contributors: [
      {
        username: 'alice',
        wallets: { sol: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAs' },
        score: 12500,
        prScore: 8000,
        issueScore: 2500,
        reviewScore: 2000,
        commentScore: 0,
      },
      {
        username: 'bob',
        wallets: { sol: '8yMXts3DW88e97TYJTEqcD6jCjifeTrB94UTZVnktBs' },
        score: 8000,
        prScore: 6000,
        issueScore: 2000,
        reviewScore: 0,
        commentScore: 0,
      },
      {
        username: 'charlie',
        wallets: { sol: '9zMYtu4EX89f98UZKTFrdE7kDjkgfUsBsC95VWoNuCt' },
        score: 5000,
        prScore: 0,
        issueScore: 0,
        reviewScore: 5000,
        commentScore: 0,
      },
    ],
  };
}

export const mockLeaderboardExportV2 = getMockLeaderboardExportV2();

export const mockLeaderboardExportV1 = {
  contributors: [
    {
      githubUsername: 'alice',
      wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAs',
      xp: 12500,
    },
    {
      githubUsername: 'bob',
      wallet: '8yMXts3DW88e97TYJTEqcD6jCjifeTrB94UTZVnktBs',
      xp: 8000,
    },
  ],
};

export function getMockConfigAccount() {
  return {
    admin: new PublicKey('11111111111111111111111111111112'),
    oracle: new PublicKey('HxP7BQTXTdvSHXeQzXnJWGN4Y3Fhhu9pM4bUwvJBKd6f'),
    usdcMint: new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
    sbtMint: new PublicKey('6r3c7DQMRvBP7c5N4Z6VZ2XBgWB4VYWxTEfKKBjjjDEQ'),
    usdcVault: new PublicKey('5h4HqXWYQvKHgzQQqX7bWb6ZD4K5TZRsFVypZzL1X8Ub'),
    currentEpoch: 1,
    totalEpochs: 1,
    xpToSbtRatio: 100,
    sbtTotalSupply: 1_000_000_000,
    sbtMinted: 0,
    bump: 255,
  };
}

export function getMockEpochAccount() {
  return {
    epochNumber: 1,
    startTime: { toNumber: () => Math.floor(Date.now() / 1000) - 3600 },
    endTime: { toNumber: () => Math.floor(Date.now() / 1000) + 86400 },
    totalXp: { toString: () => '0' },
    usdcRewardAmount: { toString: () => '100000000' },
    contributorCount: 0,
    finalized: false,
    bump: 255,
  };
}

export function getMockContributorAccount() {
  return {
    wallet: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAs'),
    githubUsername: 'alice',
    totalXp: new anchor.BN(10000),
    roleXp: [],
    domainXp: [],
    skillXp: [],
    lifetimeUsdcEarned: new anchor.BN(0),
    lastClaimEpoch: 0,
    totalSbtClaimable: new anchor.BN(100000),
    totalSbtClaimed: new anchor.BN(50000),
    registeredAt: { toNumber: () => Math.floor(Date.now() / 1000) - 86400 },
    bump: 255,
  };
}

export const mockConfigAccount = getMockConfigAccount();
export const mockEpochAccount = getMockEpochAccount();
export const mockContributorAccount = getMockContributorAccount();

