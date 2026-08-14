const fs = require('fs');
let content = fs.readFileSync('netlify/functions/night-siege.mts', 'utf8');
content = content.replace(
`  console.log("verifyMembership DEBUG:", { userId: user.id, syndicateId, mySyndicateId, isEqual: String(mySyndicateId) === String(syndicateId) });`,
``
);
fs.writeFileSync('netlify/functions/night-siege.mts', content);
