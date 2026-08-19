const fs = require('fs');
const file = 'src/screens/GarageScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

if (!src.includes("import { formatAbbreviated } from '../lib/format';")) {
  src = src.replace("import { motion, AnimatePresence } from 'framer-motion';", "import { motion, AnimatePresence } from 'framer-motion';\nimport { formatAbbreviated } from '../lib/format';");
}

src = src.replace(
  'Buy Part ({partCost.toLocaleString()})',
  'Buy Part ({formatAbbreviated(partCost)})'
);

fs.writeFileSync(file, src);
