const fs = require('fs');
const file = 'src/screens/AirdropScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace("import { useGameStore } from '../game/store/GameStore';", "import { useGameStore, getTelegramUserId } from '../game/store/GameStore';");

const targetHandle = `  const handleQuestAction = async () => {
    if (!canInteract || isVerifying) return;
    
    if (quest.id === 'subscribe_telegram_channel') {
      if (!isComplete) {
        openQuestLink();
        setIsVerifying(true);
        // Simulate calling a backend API like getChatMember
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setIsVerifying(false);
        verifyChannelSubscription();
      } else {
        onClaim();
      }
    } else {
      openQuestLink();
      onClaim();
    }
  };`;

const replacementHandle = `  const [hasSubscribed, setHasSubscribed] = useState(false);
  const handleQuestAction = async () => {
    if (!canInteract || isVerifying) return;
    
    if (quest.id === 'subscribe_telegram_channel') {
      if (!isComplete) {
        if (!hasSubscribed) {
          openQuestLink();
          setHasSubscribed(true);
        } else {
          setIsVerifying(true);
          try {
            const myId = getTelegramUserId();
            const res = await fetch('/api/verify-channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: myId })
            });
            const data = await res.json();
            if (data.verified) {
                verifyChannelSubscription();
            } else {
                alert("Subscription not found. Make sure you joined the channel.");
                // Reset so they can try subscribing again if they want
                setHasSubscribed(false); 
            }
          } catch(err) {
             console.error(err);
             alert("Error verifying subscription.");
          }
          setIsVerifying(false);
        }
      } else {
        onClaim();
      }
    } else {
      openQuestLink();
      onClaim();
    }
  };`;

src = src.replace(targetHandle, replacementHandle);

const targetButtonLabel = `        ) : hasActionLink && !isComplete ? (
          <>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
            Verify
          </>
        ) : (`;

const replacementButtonLabel = `        ) : hasActionLink && !isComplete ? (
          <>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
            {quest.id === 'subscribe_telegram_channel' ? (hasSubscribed ? 'Verify' : 'Subscribe') : 'Verify'}
          </>
        ) : (`;

src = src.replace(targetButtonLabel, replacementButtonLabel);
fs.writeFileSync(file, src);
