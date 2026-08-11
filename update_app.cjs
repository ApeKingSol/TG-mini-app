const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  '  return (\n    <div className="flex min-h-screen flex-col bg-cyber-grid">',
  '  return (\n    <>\n      <div className="flex min-h-screen flex-col bg-cyber-grid">'
);

code = code.replace(
  '      {(!hasCompletedTutorial || forceTutorialOpen) && <OnboardingModal onComplete={handleTutorialComplete} />}\n    </div>\n  );',
  '      </div>\n      {(!hasCompletedTutorial || forceTutorialOpen) && <OnboardingModal onComplete={handleTutorialComplete} />}\n    </>\n  );'
);

fs.writeFileSync('src/App.tsx', code);
