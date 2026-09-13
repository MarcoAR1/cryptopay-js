import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.ts',
  output: [
    { file: 'dist/checkout.cjs', format: 'cjs', sourcemap: true },
    {
      file: 'dist/checkout.js',
      format: 'iife',
      name: 'CryptoPay',
      sourcemap: true,
    },
    {
      file: 'dist/checkout.mjs',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    postcss({
      inject: true,
      minimize: production,
    }),
    resolve({ browser: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', declaration: true }),
    production && terser(),
  ],
};
