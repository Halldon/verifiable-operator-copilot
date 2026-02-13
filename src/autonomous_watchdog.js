#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'governance', 'autonomy-state.json');
const maxAgeSec = Number(process.argv[2] || 5400); // 90 min default

function ageSec(ts){ return (Date.now() - new Date(ts).getTime())/1000; }

let needsRecovery = false;
if (!fs.existsSync(statePath)) needsRecovery = true;
else {
  const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!s.ok) needsRecovery = true;
  else if (ageSec(s.finishedAt) > maxAgeSec) needsRecovery = true;
}

if (!needsRecovery) {
  console.log(JSON.stringify({ ok:true, action:'noop', reason:'healthy' }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({ ok:false, action:'recover', reason:'state missing/stale/failed' }, null, 2));
execSync('node src/autonomous_once.js', { cwd: root, stdio: 'inherit' });
