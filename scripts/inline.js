#!/usr/bin/env node
/**
 * Post-build: inline dist/ui.css and dist/ui.js into dist/ui.html
 * so Figma receives a single self-contained file.
 */

const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const htmlPath = path.join(dist, 'ui.html');
const cssPath  = path.join(dist, 'ui.css');
const jsPath   = path.join(dist, 'ui.js');

let html = fs.readFileSync(htmlPath, 'utf8');

// Inline CSS
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  html = html.replace(/<link[^>]+ui\.css[^>]*>/, `<style>${css}</style>`);
  fs.unlinkSync(cssPath);
}

// Inline JS
if (fs.existsSync(jsPath)) {
  const js = fs.readFileSync(jsPath, 'utf8');
  html = html.replace(/<script[^>]+ui\.js[^>]*><\/script>/, `<script>${js}</script>`);
  fs.unlinkSync(jsPath);
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`✓ Inlined CSS + JS into ui.html (${(html.length / 1024).toFixed(1)} KB)`);
