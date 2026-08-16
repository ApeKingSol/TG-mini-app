const fs = require('fs');
const file = 'src/game/types/index.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('export interface PlayerState {', 'export interface PlayerState {\n  telegramFirstName?: string | null;\n  telegramUsername?: string | null;\n');
fs.writeFileSync(file, src);
