import React, { useState } from 'react';

interface TermsOfServiceScreenProps {
  onNext: () => void;
}

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. Acceptance of terms',
    body: 'By using Zyphora, you agree to these terms of service. If you do not agree, you may not use the application.',
  },
  {
    heading: '2. User responsibilities',
    body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us of any unauthorised access immediately.',
  },
  {
    heading: '3. Privacy and data protection',
    body: 'Zyphora is designed to keep your data local. Browsing history, settings, and saved passwords are stored on your device and are encrypted where your operating system supports it. We do not sell or share your personal data.',
  },
  {
    heading: '4. Prohibited activities',
    body: 'You may not use Zyphora for illegal activity, harassment, malware distribution, or any purpose that violates applicable law.',
  },
  {
    heading: '5. Modifications to the service',
    body: 'We may modify, suspend, or discontinue Zyphora at any time. Where possible we will give notice of significant changes.',
  },
  {
    heading: '6. Limitation of liability',
    body: 'Zyphora is provided as is, without warranties of any kind. We are not liable for indirect, incidental, or consequential damages arising from your use of it.',
  },
  {
    heading: '7. Governing law',
    body: 'These terms are governed by applicable law, and disputes will be resolved in accordance with the laws of your jurisdiction.',
  },
  {
    heading: '8. Contact',
    body: 'For questions about these terms, contact support@zyphora.dev.',
  },
];

export const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({ onNext }) => {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6 py-10">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
          Terms of service
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Please read these terms before continuing.
        </p>

        <div className="mt-6 max-h-[22rem] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="space-y-5">
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <h2 className="text-sm font-semibold text-[var(--text)]">{section.heading}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          />
          I have read and agree to the terms of service
        </label>

        <button
          onClick={onNext}
          disabled={!agreed}
          className="mt-5 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Agree and continue
        </button>
      </div>
    </div>
  );
};
