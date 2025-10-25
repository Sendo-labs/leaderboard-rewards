import * as fs from 'fs';
import * as path from 'path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function loadKeypairFromFile(filepath: string): Keypair {
  const fullPath = path.resolve(filepath);
  const secretKeyString = fs.readFileSync(fullPath, 'utf8');
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

export function saveKeypairToFile(keypair: Keypair, filepath: string): void {
  const fullPath = path.resolve(filepath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(
    fullPath,
    JSON.stringify(Array.from(keypair.secretKey)),
    'utf8'
  );
  console.log(`Saved keypair to ${fullPath}`);
}

export function keypairToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

export function loadOrGenerateKeypair(filepath: string, generate: boolean = false): Keypair {
  const fullPath = path.resolve(filepath);
  
  if (fs.existsSync(fullPath) && !generate) {
    console.log(`Loading existing keypair from ${fullPath}`);
    return loadKeypairFromFile(fullPath);
  }
  
  console.log(`Generating new keypair and saving to ${fullPath}`);
  const keypair = Keypair.generate();
  saveKeypairToFile(keypair, fullPath);
  return keypair;
}

export function displayKeypairInfo(label: string, keypair: Keypair): void {
  console.log(`\n${label}:`);
  console.log(`  Public Key: ${keypair.publicKey.toString()}`);
  console.log(`  Base58 Secret: ${keypairToBase58(keypair)}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

