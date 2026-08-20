/**
 * Build script for bundling Vercel Analytics
 * This script uses esbuild to bundle the @vercel/analytics package
 * into a standalone JavaScript file that can be included in HTML pages
 */
const esbuild = require('esbuild');
const path = require('path');

async function build() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'public', 'js', 'analytics.js')],
      bundle: true,
      minify: true,
      format: 'iife',
      outfile: path.join(__dirname, 'public', 'js', 'analytics.bundle.js'),
      platform: 'browser',
      target: ['es2015'],
      logLevel: 'info'
    });
    console.log('✓ Analytics bundle created successfully');
  } catch (error) {
    console.error('✗ Build failed:', error);
    process.exit(1);
  }
}

build();
