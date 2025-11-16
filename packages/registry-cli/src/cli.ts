#!/usr/bin/env node

/**
 * OpenBot Registry CLI
 * 
 * Manage agents and keys from the command line.
 * Migrated from openbotregistry/cli with shared modules.
 */

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { listCommand } from './commands/list.js';
import { updateKeyCommand } from './commands/update-key.js';
import { jwksCommand } from './commands/jwks.js';

const program = new Command();

program
  .name('openbot')
  .description('OpenBot Registry CLI - Manage your authentication agents')
  .version('0.1.0');

// Register commands
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(updateKeyCommand);
program.addCommand(jwksCommand);

// Parse arguments
program.parse();

