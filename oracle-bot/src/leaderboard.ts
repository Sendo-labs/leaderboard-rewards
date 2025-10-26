import * as fs from 'fs';
import { PublicKey } from '@solana/web3.js';
import { Logger } from './logger.js';

export interface XpCategory {
  name: string;
  amount: number;
}

export interface ContributorData {
  githubUsername: string;
  wallet: PublicKey;
  totalXp: number;
  roleXp: XpCategory[];
  domainXp: XpCategory[];
  skillXp: XpCategory[];
}

export class LeaderboardFetcher {
  constructor(
    private apiUrl?: string,
    private dataFile?: string,
    private logger?: Logger
  ) {}

  async fetchLeaderboard(): Promise<ContributorData[]> {
    if (this.apiUrl) {
      return await this.fetchFromApi();
    } else if (this.dataFile) {
      return await this.fetchFromFile();
    } else {
      throw new Error('No leaderboard data source configured');
    }
  }

  private async fetchFromApi(): Promise<ContributorData[]> {
    try {
      this.logger?.info('Fetching leaderboard from API:', this.apiUrl);
      
      const response = await fetch(this.apiUrl!);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseLeaderboardData(data);
    } catch (error) {
      this.logger?.error('Failed to fetch leaderboard from API:', error);
      throw error;
    }
  }

  private async fetchFromFile(): Promise<ContributorData[]> {
    try {
      this.logger?.info('Reading leaderboard from file:', this.dataFile);
      
      const fileContent = fs.readFileSync(this.dataFile!, 'utf-8');
      const data = JSON.parse(fileContent);
      return this.parseLeaderboardData(data);
    } catch (error) {
      this.logger?.error('Failed to read leaderboard from file:', error);
      throw error;
    }
  }

  private parseLeaderboardData(data: any): ContributorData[] {
    const contributors: ContributorData[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        const contributor = this.parseContributor(item);
        if (contributor) {
          contributors.push(contributor);
        }
      }
    } else if (data.leaderboard && Array.isArray(data.leaderboard)) {
      for (const item of data.leaderboard) {
        const contributor = this.parseContributor(item);
        if (contributor) {
          contributors.push(contributor);
        }
      }
    } else if (data.contributors && Array.isArray(data.contributors)) {
      for (const item of data.contributors) {
        const contributor = this.parseContributor(item);
        if (contributor) {
          contributors.push(contributor);
        }
      }
    }

    this.logger?.info(`Parsed ${contributors.length} contributors from leaderboard`);
    return contributors;
  }

  private parseContributor(item: any): ContributorData | null {
    try {
      const githubUsername = item.github_username || item.githubUsername || item.username || item.github;
      
      // Handle wallets object or direct wallet string
      let walletStr: string | undefined;
      if (item.wallets && typeof item.wallets === 'object') {
        // Find first valid wallet from wallets object (prioritize sol, then any available)
        walletStr = item.wallets.sol || item.wallets.solana || Object.values(item.wallets).find((w: any) => typeof w === 'string' && w.length > 0) as string;
      } else {
        walletStr = item.wallet || item.wallet_address || item.walletAddress || item.address;
      }
      
      const totalXp = Math.round(parseFloat(item.score || item.xp || item.totalXp || item.total_xp || item.points || '0'));

      if (!githubUsername || !walletStr || totalXp <= 0) {
        this.logger?.warn('Invalid contributor data:', item);
        return null;
      }

      let wallet: PublicKey;
      try {
        wallet = new PublicKey(walletStr);
      } catch {
        this.logger?.warn('Invalid wallet address:', walletStr);
        return null;
      }

      const roleXp = this.parseXpCategories(
        item.role_xp || item.roleXp || item.roles || {}
      );
      const domainXp = this.parseXpCategories(
        item.domain_xp || item.domainXp || item.domains || {}
      );
      const skillXp = this.parseXpCategories(
        item.skill_xp || item.skillXp || item.skills || {}
      );

      // If no XP breakdown found, try score breakdown fields
      if (roleXp.length === 0 && domainXp.length === 0 && skillXp.length === 0) {
        if (item.prScore || item.issueScore || item.reviewScore || item.commentScore) {
          const scoreBreakdown: any = {};
          if (item.prScore > 0) scoreBreakdown.pr = Math.round(item.prScore);
          if (item.issueScore > 0) scoreBreakdown.issue = Math.round(item.issueScore);
          if (item.reviewScore > 0) scoreBreakdown.review = Math.round(item.reviewScore);
          if (item.commentScore > 0) scoreBreakdown.comment = Math.round(item.commentScore);
          
          roleXp.push(...this.parseXpCategories(scoreBreakdown));
        } else {
          this.logger?.warn('No XP breakdown found, generating default categories for:', githubUsername);
          roleXp.push({ name: 'contributor', amount: totalXp });
        }
      }

      return {
        githubUsername,
        wallet,
        totalXp,
        roleXp,
        domainXp,
        skillXp,
      };
    } catch (error) {
      this.logger?.warn('Failed to parse contributor:', error);
      return null;
    }
  }

  private parseXpCategories(data: any): XpCategory[] {
    const categories: XpCategory[] = [];

    if (typeof data === 'object' && data !== null) {
      for (const [name, value] of Object.entries(data)) {
        const amount = parseInt(String(value || '0'));
        if (amount > 0) {
          categories.push({ name, amount });
        }
      }
    }

    return categories;
  }

  createMockData(count: number = 10): ContributorData[] {
    const contributors: ContributorData[] = [];
    
    const roles = ['developer', 'designer', 'pm', 'architect', 'reviewer'];
    const domains = ['core', 'ui', 'docs', 'infrastructure', 'api'];
    const skills = ['typescript', 'rust', 'react', 'solana', 'anchor', 'nodejs'];

    for (let i = 0; i < count; i++) {
      const totalXp = Math.floor(Math.random() * 10000) + 100;
      
      const roleXp: XpCategory[] = roles
        .slice(0, Math.ceil(Math.random() * 3) + 1)
        .map(name => ({
          name,
          amount: Math.floor(Math.random() * (totalXp / 2))
        }));

      const domainXp: XpCategory[] = domains
        .slice(0, Math.ceil(Math.random() * 3) + 1)
        .map(name => ({
          name,
          amount: Math.floor(Math.random() * (totalXp / 2))
        }));

      const skillXp: XpCategory[] = skills
        .slice(0, Math.ceil(Math.random() * 4) + 1)
        .map(name => ({
          name,
          amount: Math.floor(Math.random() * (totalXp / 2))
        }));

      contributors.push({
        githubUsername: `contributor${i + 1}`,
        wallet: PublicKey.unique(),
        totalXp,
        roleXp,
        domainXp,
        skillXp,
      });
    }

    return contributors;
  }
}
