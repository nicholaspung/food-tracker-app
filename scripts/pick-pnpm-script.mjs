#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import readline from 'node:readline';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = Object.entries(packageJson.scripts ?? {}).filter(([name]) => name !== 'pick');

if (process.argv.includes('--list')) {
  for (const [name, command] of scripts) {
    console.log(`${name}\t${command}`);
  }
  process.exit(0);
}

if (scripts.length === 0) {
  console.error('No package scripts found.');
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Interactive script picker requires a TTY.');
  process.exit(1);
}

let selectedIndex = 0;
const visibleRows = 16;

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();

render();

process.stdin.on('keypress', (_chunk, key) => {
  if (key.ctrl && key.name === 'c') {
    exitPicker(130);
    return;
  }

  switch (key.name) {
    case 'up':
    case 'k':
      selectedIndex = (selectedIndex - 1 + scripts.length) % scripts.length;
      render();
      break;
    case 'down':
    case 'j':
      selectedIndex = (selectedIndex + 1) % scripts.length;
      render();
      break;
    case 'return':
      runSelectedScript();
      break;
    case 'escape':
    case 'q':
      exitPicker(0);
      break;
  }
});

function render() {
  const halfWindow = Math.floor(visibleRows / 2);
  let start = Math.max(0, selectedIndex - halfWindow);
  const end = Math.min(scripts.length, start + visibleRows);
  start = Math.max(0, end - visibleRows);

  process.stdout.write('\x1B[2J\x1B[H');
  console.log('Pick a pnpm script');
  console.log('Use up/down arrows, Enter to run, q to quit.\n');

  if (start > 0) {
    console.log('  ...');
  }

  for (let index = start; index < end; index += 1) {
    const [name] = scripts[index];
    const marker = index === selectedIndex ? '>' : ' ';
    console.log(`${marker} ${name}`);
  }

  if (end < scripts.length) {
    console.log('  ...');
  }

  const [selectedName, selectedCommand] = scripts[selectedIndex];
  console.log(`\nSelected: pnpm run ${selectedName}`);
  console.log(selectedCommand);
}

function runSelectedScript() {
  const [selectedName] = scripts[selectedIndex];
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write('\x1B[2J\x1B[H');
  console.log(`Running: pnpm run ${selectedName}\n`);

  const child = spawn('pnpm', ['run', selectedName], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

function exitPicker(code) {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write('\n');
  process.exit(code);
}
