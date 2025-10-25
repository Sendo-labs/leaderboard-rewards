import { describe, test, expect } from 'bun:test';
import { LeaderboardFetcher } from '../src/leaderboard';
import { Logger } from '../src/logger';

describe('Leaderboard Endpoint Integration', () => {
  const logger = new Logger('info');
  
  const endpoints = [
    {
      name: 'Weekly',
      url: 'https://sendo-labs.github.io/leaderboard/data/api/leaderboard-weekly.json'
    },
    {
      name: 'Monthly',
      url: 'https://sendo-labs.github.io/leaderboard/data/api/leaderboard-monthly.json'
    },
    {
      name: 'Lifetime',
      url: 'https://sendo-labs.github.io/leaderboard/data/api/leaderboard-lifetime.json'
    }
  ];

  for (const endpoint of endpoints) {
    describe(`${endpoint.name} Endpoint`, () => {
      test('should fetch and parse data successfully', async () => {
        const fetcher = new LeaderboardFetcher(endpoint.url, undefined, logger);
        
        const contributors = await fetcher.fetchLeaderboard();
        
        // Basic validation
        expect(contributors).toBeDefined();
        expect(Array.isArray(contributors)).toBe(true);
        
        console.log(`\n📊 ${endpoint.name} Endpoint Results:`);
        console.log(`   Total contributors: ${contributors.length}`);
        
        if (contributors.length > 0) {
          const totalXp = contributors.reduce((sum, c) => sum + c.totalXp, 0);
          const avgXp = totalXp / contributors.length;
          const topContributor = contributors.reduce((max, c) => c.totalXp > max.totalXp ? c : max);
          
          console.log(`   Total XP: ${totalXp.toLocaleString()}`);
          console.log(`   Average XP: ${Math.round(avgXp).toLocaleString()}`);
          console.log(`   Top contributor: ${topContributor.githubUsername} (${topContributor.totalXp.toLocaleString()} XP)`);
          
          // Validate structure of contributors
          for (const contributor of contributors) {
            expect(contributor.githubUsername).toBeDefined();
            expect(contributor.wallet).toBeDefined();
            expect(contributor.totalXp).toBeGreaterThan(0);
            expect(Array.isArray(contributor.roleXp)).toBe(true);
            expect(Array.isArray(contributor.domainXp)).toBe(true);
            expect(Array.isArray(contributor.skillXp)).toBe(true);
          }
        }
      }, 30000); // 30 second timeout for network requests

      test('should have valid wallet addresses', async () => {
        const fetcher = new LeaderboardFetcher(endpoint.url, undefined, logger);
        
        const contributors = await fetcher.fetchLeaderboard();
        
        for (const contributor of contributors) {
          expect(contributor.wallet.toString()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
        }
      }, 30000);

      test('should have XP breakdown in at least one category', async () => {
        const fetcher = new LeaderboardFetcher(endpoint.url, undefined, logger);
        
        const contributors = await fetcher.fetchLeaderboard();
        
        for (const contributor of contributors) {
          const hasXpBreakdown = 
            contributor.roleXp.length > 0 || 
            contributor.domainXp.length > 0 || 
            contributor.skillXp.length > 0;
          
          expect(hasXpBreakdown).toBe(true);
        }
      }, 30000);
    });
  }

  test('should compare data between endpoints', async () => {
    console.log('\n🔄 Comparing endpoint data...');
    
    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const fetcher = new LeaderboardFetcher(endpoint.url, undefined, logger);
        const contributors = await fetcher.fetchLeaderboard();
        return {
          name: endpoint.name,
          count: contributors.length,
          contributors
        };
      })
    );

    console.log('\n📈 Comparison:');
    for (const result of results) {
      console.log(`   ${result.name}: ${result.count} contributors`);
    }

    // Lifetime should have >= monthly >= weekly
    const weekly = results.find(r => r.name === 'Weekly')!;
    const monthly = results.find(r => r.name === 'Monthly')!;
    const lifetime = results.find(r => r.name === 'Lifetime')!;

    console.log('\n✅ Validation:');
    console.log(`   Weekly ≤ Monthly: ${weekly.count <= monthly.count} (${weekly.count} ≤ ${monthly.count})`);
    console.log(`   Monthly ≤ Lifetime: ${monthly.count <= lifetime.count} (${monthly.count} ≤ ${lifetime.count})`);

    expect(weekly.count).toBeLessThanOrEqual(monthly.count);
    expect(monthly.count).toBeLessThanOrEqual(lifetime.count);
  }, 60000);
});

