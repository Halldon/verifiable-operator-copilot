#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { verifyReceiptBundle } = require('./receipt_common');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const receiptPathArg = get('--receipt');
if (!receiptPathArg) throw new Error('Usage: --receipt <path> [--input path --code path --output path]');
const receiptPath = path.resolve(root, receiptPathArg);
const bundle = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

const inputOverride = get('--input', '');
const codeOverride = get('--code', '');
const outputOverride = get('--output', '');

const pathOverrides = (inputOverride || codeOverride || outputOverride)
  ? {
      inputPath: path.resolve(root, inputOverride || bundle.references?.inputPath || ''),
      codePath: path.resolve(root, codeOverride || bundle.references?.codePath || ''),
      outputPath: path.resolve(root, outputOverride || bundle.references?.outputPath || '')
    }
  : {
      inputPath: path.resolve(root, bundle.references?.inputPath || ''),
      codePath: path.resolve(root, bundle.references?.codePath || ''),
      outputPath: path.resolve(root, bundle.references?.outputPath || '')
    };

const result = verifyReceiptBundle(bundle, { paths: pathOverrides });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
