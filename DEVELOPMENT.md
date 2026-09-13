# Development & Toolchain Guide - @crypto-pay/sdk (`cryptopay-js`)

This repository is the autonomous single source of truth for the CryptoPay JavaScript/TypeScript SDK and Widget distribution.

## Directory Structure

```
cryptopay-js/
├── dist/                     # Generated build bundles (CJS, ESM, UMD, and styles)
├── scripts/
│   ├── update-provenance.cjs # Post-build script to compute and stamp SHA-256 integrity hashes
│   └── verify-package.cjs   # Pre-release script ensuring distribution matches provenance.json
├── src/                      # TypeScript SDK source files
│   ├── index.ts              # Main SDK entrypoint
│   ├── api.ts                # API client (checkout sessions, payment lookup)
│   ├── checkout.ts           # Checkout flow and modal/redirect handling
│   ├── wallet.ts             # EIP-1193 / window.ethereum wallet interaction
│   └── styles/
│       └── widget.css        # Modal widget UI styling
├── tests/                    # Autonomous unit and integration test suites
│   ├── checkout.test.cjs     # Checkout component and DOM tests
│   └── wallet.test.cjs       # Wallet detection and transaction initiation tests
├── package.json              # Autonomous npm package configuration with build/test scripts
├── provenance.json           # SHA-256 hashes and release provenance metadata
├── rollup.config.mjs         # Rollup bundler configuration
└── tsconfig.json             # TypeScript compiler configuration
```

## Available Scripts

- `npm run build`: Compiles TypeScript and CSS into `dist/` (CJS, ESM, UMD) and updates `provenance.json` with generated SHA-256 hashes.
- `npm run typecheck`: Runs strict TypeScript type checking (`tsc --noEmit`).
- `npm test`: Runs `verify-package.cjs` and the full Node.js test suite across all modules.
