import { useState } from 'react';
import { UserCircle } from 'lucide-react';

interface ProfileAvatarButtonProps {
  /** Telegram's own `photo_url` — per their docs, only ever populated for Mini Apps launched
   * from the attachment menu, so this is null far more often than not. Falls back to a
   * generic icon whenever it's missing or fails to load. */
  photoUrl: string | null;
  onClick: () => void;
}

export function ProfileAvatarButton({ photoUrl, onClick }: ProfileAvatarButtonProps) {
  const [failedToLoad, setFailedToLoad] = useState(false);
  const showPhoto = photoUrl !== null && !failedToLoad;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Player Profile"
      className="panel-cut-sm absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center overflow-hidden border border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedToLoad(true)}
        />
      ) : (
        <UserCircle className="h-5 w-5" strokeWidth={1.75} />
      )}
    </button>
  );
}
