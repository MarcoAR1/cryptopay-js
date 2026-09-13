# Development & Toolchain Guide — `@cryptopayjs/sdk` (`cryptopay-js`)

This repository is the autonomous single source of truth for the `@cryptopayjs/sdk` JavaScript/TypeScript SDK and Widget distribution.

## Directory Structure

```
cryptopay-js/
├── .github/workflows/        # Automated CI/CD workflows
│   └── publish.yml           # Automatic build, test, and release to npm with provenance
├── dist/                     # Generated build bundles (CJS, ESM, UMD, and styles)
├── examples/                 # Third-party integration demos (HTML, React, Next.js, Node backend)
├── scripts/
│   ├── update-provenance.cjs # Post-build script to compute and stamp SHA-256 integrity hashes
│   └── verify-package.cjs   # Pre-release script ensuring distribution matches provenance.json
├── src/                      # TypeScript SDK source files
├── tests/                    # Autonomous unit and integration test suites
├── package.json              # Autonomous npm package configuration with build/test scripts
├── provenance.json           # SHA-256 hashes and release provenance metadata
├── RELEASE.md                # Release protocol, OIDC trusted publishing & authentication setup
├── rollup.config.mjs         # Rollup bundler configuration
└── tsconfig.json             # TypeScript compiler configuration
```

## Available Scripts

- `npm run build`: Compiles TypeScript and CSS into `dist/` (CJS, ESM, UMD) and updates `provenance.json` with generated SHA-256 hashes.
- `npm run typecheck`: Runs strict TypeScript type checking (`tsc --noEmit`).
- `npm test`: Runs `verify-package.cjs` and the full Node.js test suite across all modules.
- `npm run verify`: Audits integrity hashes in `provenance.json` against compiled artifacts in `dist/`.

For automated npm publishing and credentials configuration, refer to [RELEASE.md](RELEASE.md).

