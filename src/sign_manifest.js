#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {Wallet, verifyMessage} = require('ethers');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'artifacts', 'run_manifest.json');
const sigPath = path.join(root, 'artifacts', 'run_manifest.sig.json');

async function loadSigner() {
  const metaPath = path.join(root, 'treasury', 'agent-treasury-meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const passphrase = execSync(`security find-generic-password -a ${meta.keychainRef.account} -s ${meta.keychainRef.service} -w`).toString().trim();
    const enc = fs.readFileSync(meta.keystorePath, 'utf8');
    const wallet = await Wallet.fromEncryptedJson(enc, passphrase);
    return { wallet, signerSource: 'treasury-keystore' };
  }

  const walletDir = '/Users/j/.openclaw/secrets';
  const walletFile = fs.readdirSync(walletDir).filter(f=>f.startsWith('agent-wallet-')).sort().slice(-1)[0];
  if (!walletFile) throw new Error('No signer wallet available');
  const walletJson = JSON.parse(fs.readFileSync(path.join(walletDir, walletFile), 'utf8'));
  return { wallet: new Wallet(walletJson.privateKeyHex), signerSource: `fallback:${walletFile}` };
}

(async()=>{
  const { wallet, signerSource } = await loadSigner();
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const digest = crypto.createHash('sha256').update(manifestRaw).digest('hex');
  const message = `Eigen-style verifiable agent run\nmanifest_sha256:${digest}`;
  const signature = await wallet.signMessage(message);
  const recovered = verifyMessage(message, signature);
  const payload = {
    signedAt: new Date().toISOString(),
    signerAddress: wallet.address,
    recoveredAddress: recovered,
    message,
    signature,
    signerSource
  };
  fs.writeFileSync(sigPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ok:true,sigPath,signer:wallet.address,recovered,signerSource},null,2));
})();
