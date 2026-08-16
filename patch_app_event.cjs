const fs = require('fs');
const file = 'src/App.tsx';
let src = fs.readFileSync(file, 'utf8');

const effect = `useEffect(() => {
    trackAppOpened();
  }, []);`;

const newEffect = `useEffect(() => {
    trackAppOpened();
    
    const handleOpenLeaderboard = () => setActiveOverlay('leaderboard');
    window.addEventListener('openLeaderboard', handleOpenLeaderboard);
    return () => window.removeEventListener('openLeaderboard', handleOpenLeaderboard);
  }, []);`;

src = src.replace(effect, newEffect);
fs.writeFileSync(file, src);
