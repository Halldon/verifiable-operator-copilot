const crypto = require('crypto');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
  return `{${parts.join(',')}}`;
}

function sha256Hex(input) {
  if (Buffer.isBuffer(input)) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
  if (typeof input === 'string') {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }
  return crypto.createHash('sha256').update(canonicalize(input), 'utf8').digest('hex');
}

function bytes32FromHex(hex) {
  const normalized = String(hex || '').replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Expected 32-byte hex digest');
  }
  return `0x${normalized}`;
}

module.exports = {
  canonicalize,
  sha256Hex,
  bytes32FromHex
};
