const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = { console, setTimeout, clearTimeout, setInterval, clearInterval, fetch: async () => { throw new Error('Unexpected network'); } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../dist/checkout.js'), 'utf8'), context);
const sdk = context.CryptoPay;
test('wallet requests the expected chain and ERC20 transfer in atomic units', async () => {
  const calls = [];
  const provider = { request: async req => { calls.push(req); if (req.method === 'eth_chainId') return calls.some(c => c.method === 'wallet_switchEthereumChain') ? '0xaa36a7' : '0x1'; if (req.method === 'eth_requestAccounts') return ['0x' + 'a'.repeat(40)]; if (req.method === 'eth_sendTransaction') return '0xhash'; }, on() {}, removeListener() {} };
  const token = '0x' + '1'.repeat(40), to = '0x' + '2'.repeat(40);
  assert.equal(await sdk.executeTransaction(provider, to, '12340000', token, 11155111), '0xhash');
  assert.ok(calls.some(c => c.method === 'wallet_switchEthereumChain'));
  const sent = calls.find(c => c.method === 'eth_sendTransaction').params[0];
  assert.equal(sent.to, token); assert.equal(sent.value, undefined);
  assert.equal(sent.data, '0xa9059cbb' + '2'.repeat(40).padStart(64, '0') + BigInt(12340000).toString(16).padStart(64, '0'));
});
test('never sends a transfer after user rejects chain switching', async () => {
  let sent = false;
  const provider = { request: async req => { if (req.method === 'eth_chainId') return '0x1'; if (req.method === 'wallet_switchEthereumChain') throw new Error('rejected'); if (req.method === 'eth_sendTransaction') sent = true; return []; } };
  await assert.rejects(sdk.executeTransaction(provider, '0x' + '2'.repeat(40), '1', '0x' + '1'.repeat(40), 11155111));
  assert.equal(sent, false);
});
test('browser API has no payment creation method / merchant key', () => {
  assert.equal(sdk.CryptoPayAPI.prototype.createPayment, undefined);
});
