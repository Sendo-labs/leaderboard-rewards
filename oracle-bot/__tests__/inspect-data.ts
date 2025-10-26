// Script to inspect the actual data structure from endpoints
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

async function inspectEndpoint(name: string, url: string) {
  console.log(`\n📋 Inspecting ${name} Endpoint`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ❌ HTTP Error: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log(`   ✅ Successfully fetched`);
    console.log(`   Data type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    
    if (Array.isArray(data)) {
      console.log(`   Array length: ${data.length}`);
      if (data.length > 0) {
        console.log(`   First item keys:`, Object.keys(data[0]));
        console.log(`   First item sample:`, JSON.stringify(data[0], null, 2));
      }
    } else if (typeof data === 'object') {
      console.log(`   Object keys:`, Object.keys(data));
      if (data.contributors) {
        console.log(`   Contributors length: ${Array.isArray(data.contributors) ? data.contributors.length : 'not an array'}`);
        if (Array.isArray(data.contributors) && data.contributors.length > 0) {
          console.log(`   First contributor keys:`, Object.keys(data.contributors[0]));
          console.log(`   First contributor sample:`, JSON.stringify(data.contributors[0], null, 2));
        }
      }
      console.log(`   Full structure sample:`, JSON.stringify(data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error);
  }
}

async function main() {
  console.log('🔍 Inspecting Leaderboard Endpoints\n');
  console.log('═'.repeat(60));
  
  for (const endpoint of endpoints) {
    await inspectEndpoint(endpoint.name, endpoint.url);
  }
  
  console.log('\n' + '═'.repeat(60));
}

main();

