import React, { useState } from 'react';

interface TermsOfServiceScreenProps {
  onNext: () => void;
}

export const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({ onNext }) => {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-8 backdrop-blur-lg shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">📋</span>
            <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
          </div>

          <p className="mb-6 text-sm text-slate-400">
            Please read and agree to our terms before continuing.
          </p>

          <div className="mb-6 max-h-80 overflow-y-auto rounded-lg bg-slate-900/50 p-4">
            <div className="space-y-4 text-sm leading-relaxed text-slate-300">
              <section>
                <h2 className="mb-2 font-semibold text-white">1. Acceptance of Terms</h2>
                <p>
                  By using Zyphora, you agree to these terms of service. If you do not agree, you may not use our service.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">2. User Responsibilities</h2>
                <p>
                  You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us of any unauthorized access immediately.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">3. Privacy & Data Protection</h2>
                <p>
                  Zyphora is designed with privacy first. Your browsing data, history, and settings are stored securely. We do not sell or share your personal data with third parties. Learn more in our Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">4. Prohibited Activities</h2>
                <p>
                  You may not use Zyphora for illegal activities, harassment, malware distribution, or any purpose that violates local or international law.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">5. Modifications to Service</h2>
                <p>
                  We reserve the right to modify, suspend, or discontinue Zyphora at any time. We will provide notice of significant changes when possible.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">6. Limitation of Liability</h2>
                <p>
                  Zyphora is provided "as is" without warranties of any kind. We are not liable for indirect, incidental, or consequential damages arising from your use of the service.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">7. Governing Law</h2>
                <p>
                  These terms are governed by applicable laws. Any disputes will be resolved in accordance with the laws of your jurisdiction.
                </p>
              </section>

              <section>
                <h2 className="mb-2 font-semibold text-white">8. Contact</h2>
                <p>
                  For questions about these terms, please contact us at support@zyphora.dev
                </p>
              </section>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded border-slate-600 bg-slate-900/50 text-violet-600 focus:ring-2 focus:ring-violet-400"
            />
            <label htmlFor="agree" className="text-sm text-slate-300">
              I have read and agree to the Terms of Service
            </label>
          </div>

          <button
            onClick={onNext}
            disabled={!agreed}
            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 font-semibold text-white transition hover:from-violet-500 hover:to-cyan-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            I Agree & Continue
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Read our full <a href="#" className="text-cyan-400 hover:underline">Privacy Policy</a> for more information.
          </p>
        </div>
      </div>
    </div>
  );
};
