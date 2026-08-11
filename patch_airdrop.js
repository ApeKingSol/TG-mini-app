const fs = require('fs');
let content = fs.readFileSync('src/screens/AirdropScreen.tsx', 'utf8');

// Change completedCount to only count claimed quests
content = content.replace(
  'const completedCount = QUESTS.filter((quest) => isQuestComplete(quest.id, progress)).length;',
  'const completedCount = claimedQuests.length;'
);

// Update QuestCard component logic
content = content.replace(
  'const canClaim = isComplete && !isClaimed;',
  'const canClaim = isComplete && !isClaimed;\n  const canInteract = canClaim || (!isComplete && hasActionLink);'
);

content = content.replace(
  'if (!canClaim || isVerifying) return;',
  'if (!canInteract || isVerifying) return;'
);

content = content.replace(
  '        if (quest.id === \'subscribe_telegram_channel\') {\n      if (!hasJoinedChannel) {\n        openQuestLink();\n        setIsVerifying(true);\n        // Simulate calling a backend API like getChatMember\n        await new Promise((resolve) => setTimeout(resolve, 3000));\n        setIsVerifying(false);\n        verifyChannelSubscription();\n      } else {\n        onClaim();\n      }',
  `        if (quest.id === 'subscribe_telegram_channel') {
      if (!isComplete) {
        openQuestLink();
        setIsVerifying(true);
        // Simulate calling a backend API like getChatMember
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setIsVerifying(false);
        // This simulates a successful verification, but we need the global method.
        // Wait, 'verifyChannelSubscription' is not in QuestCard props, it's in AirdropScreen!
        // We'll need to pass it or get it via store.`
);
fs.writeFileSync('src/screens/AirdropScreen.tsx', content);
