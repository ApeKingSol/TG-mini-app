import fs from 'fs';
let content = fs.readFileSync('netlify/functions/night-siege.mts', 'utf8');
content = content.replace(
`<<<<<<< HEAD
=======
      await membership.set(String(user.id), syndicateId);
>>>>>>> 932df1d (fix: night siege membership fallback and active syndicate sync)`,
`      await membership.set(String(user.id), syndicateId);`
);
content = content.replace(
`<<<<<<< HEAD
  memberIds?: (string | number)[];
=======
  memberIds?: string[];
>>>>>>> 932df1d (fix: night siege membership fallback and active syndicate sync)`,
`  memberIds?: (string | number)[];`
);
fs.writeFileSync('netlify/functions/night-siege.mts', content);
