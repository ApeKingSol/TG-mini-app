const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('className="fixed inset-0 z-[1005] fixed inset-0 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"', 'className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"');

fs.writeFileSync(file, src);
