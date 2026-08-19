const fs = require('fs');
const file = 'src/screens/JunkyardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

if (!src.includes("import { formatAbbreviated }")) {
  src = src.replace("import { motion, AnimatePresence } from 'framer-motion';", "import { motion, AnimatePresence } from 'framer-motion';\nimport { formatAbbreviated } from '../lib/format';");
}

src = src.replace(
  'return Math.round(value).toLocaleString();',
  'return formatAbbreviated(Math.round(value));'
);

src = src.replace(
  '{Math.round(upgrade.cost).toLocaleString()}',
  '{formatAbbreviated(Math.round(upgrade.cost))}'
);

fs.writeFileSync(file, src);
