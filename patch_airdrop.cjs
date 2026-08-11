const fs = require('fs');
let content = fs.readFileSync('src/screens/AirdropScreen.tsx', 'utf8');

// Change completedCount to only count claimed quests
content = content.replace(
  'const completedCount = QUESTS.filter((quest) => isQuestComplete(quest.id, progress)).length;',
  'const completedCount = claimedQuests.length;'
);

fs.writeFileSync('src/screens/AirdropScreen.tsx', content);
