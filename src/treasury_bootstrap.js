#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { Wallet } = require('ethers');

const root = path.resolve(__dirname, '..');
const treasuryDir = path.join(root, 'treasury');
const keystorePath = path.join(treasuryDir, 'agent-treasury-keystore.json');
const metaPath = path.join(treasuryDir, 'agent-treasury-meta.json');

(async()=>{
  fs.mkdirSync(treasuryDir, { recursive: true });
  const wallet = Wallet.createRandom();
  const passphrase = crypto.randomBytes(24).toString('hex');
  const encryptedJson = await wallet.encrypt(passphrase);
  fs.writeFileSync(keystorePath, encryptedJson, { mode: 0o600 });

  const service = 'openclaw.verifiable-operator-copilot.treasury';
  const account = 'agent-treasury-passphrase';

  try {
    execSync(`security add-generic-password -U -a ${account} -s ${service} -w '${passphrase.replace(/'/g, "'\\''")}'`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Failed to store passphrase in macOS keychain');
    process.exit(1);
  }

  const meta = {
    createdAt: new Date().toISOString(),
    address: wallet.address,
    chainId: 8453,
    keystorePath,
    keychainRef: { service, account },
    custodyNote: 'Private key is encrypted at rest. Passphrase stored in macOS Keychain.'
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(JSON.stringify({ ok:true, address: wallet.address, metaPath, keystorePath }, null, 2));
})();
