import React, { useState } from 'react';
import { DeviceNameScreen } from './DeviceNameScreen';
import { TermsOfServiceScreen } from './TermsOfServiceScreen';
import { AuthPortal } from './AuthPortal';
import { useSettingsStore } from '../stores/settingsStore';

type OnboardingStep = 'device-name' | 'terms' | 'auth';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('device-name');
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const agreeToTerms = useSettingsStore((s) => s.agreeToTerms);
  const setDeviceName = useSettingsStore((s) => s.setDeviceName);
  const markAuthPromptShown = useSettingsStore((s) => s.markAuthPromptShown);
  const chooseGuest = useSettingsStore((s) => s.chooseGuest);

  const handleDeviceNameNext = (name: string) => {
    // The name used to be discarded, so the user was asked for it a second
    // time in DeviceNameModal right after signing in. Persist it here and the
    // post-auth modal is skipped entirely.
    setDeviceName(name);
    setCurrentStep('terms');
  };

  const handleTermsNext = () => {
    agreeToTerms();
    setCurrentStep('auth');
  };

  const handleAuthClose = () => {
    // Closing the auth portal without signing in previously dropped the user
    // straight into AccountWelcome, which asked the same question again.
    // Treat "close" as a deliberate skip: continue as a guest and record that
    // the prompt has been shown.
    if (!useSettingsStore.getState().account) {
      markAuthPromptShown();
      chooseGuest();
    }
    completeOnboarding();
    onComplete();
  };

  return (
    <div>
      {currentStep === 'device-name' && <DeviceNameScreen onNext={handleDeviceNameNext} />}

      {currentStep === 'terms' && <TermsOfServiceScreen onNext={handleTermsNext} />}

      {currentStep === 'auth' && (
        <div className="min-h-screen w-full bg-[var(--bg)]">
          <AuthPortal mode="signup" onClose={handleAuthClose} />
        </div>
      )}
    </div>
  );
};
