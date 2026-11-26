import { setLang, useLang } from '@/i18n/lang';

/** English / اردو — for the launch screens (sign-up paths, status, demo). */
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useLang();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex rounded-md border border-border-light bg-surface p-xxs ${className}`}
    >
      {(['en', 'ur'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-sm px-sm py-xxs text-label-sm ${
            lang === l ? 'bg-primary text-text-inverse' : 'text-text-secondary'
          }`}
        >
          {l === 'en' ? 'English' : 'اردو'}
        </button>
      ))}
    </div>
  );
}

export default LangToggle;
