import React, { useState } from 'react';
import { DeviceNameScreen } from './DeviceNameScreen';
import { TermsOfServiceScreen } from './TermsOfServiceScreen';
import { AuthPortal } from './AuthPortal';
import { BookmarkImportScreen } from './BookmarkImportScreen';
import { DefaultBrowserScreen } from './DefaultBrowserScreen';
import { useSettingsStore } from '../stores/settingsStore';

// Step order:
//  1. device-name   – give this device a name
//  2. terms         – accept terms of service
//  3. auth          – sign in / sign up (skippable → guest mode)
//  4. default-browser – offer to set Zyphora as the OS default browser
//  5. bookmark-import – import bookmarks from another browser (skippable)
type OnboardingStep =
  | 'device-name'
  | 'terms'
  | 'auth'
  | 'default-browser'
  | 'bookmark-import';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('device-name');
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const agreeToTerms       = useSettingsStore((s) => s.agreeToTerms);
  const setDeviceName      = useSettingsStore((s) => s.setDeviceName);
  const markAuthPromptShown = useSettingsStore((s) => s.markAuthPromptShown);
  const chooseGuest        = useSettingsStore((s) => s.chooseGuest);

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleDeviceNameNext = (name: string) => {
    setDeviceName(name);
    setCurrentStep('terms');
  };

  const handleTermsNext = () => {
    agreeToTerms();
    setCurrentStep('auth');
  };

  const handleAuthClose = () => {
    // Closing the auth portal without signing in: treat as deliberate skip,
    // continue as guest and record that the prompt has been shown so the
    // 90-day re-prompt interval starts now.
    if (!useSettingsStore.getState().account) {
      markAuthPromptShown();
      chooseGuest();
    }
    setCurrentStep('default-browser');
  };

  const handleDefaultBrowserNext = () => {
    setCurrentStep('bookmark-import');
  };

  const handleBookmarkImportNext = () => {
    completeOnboarding();
    onComplete();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {currentStep === 'device-name' && (
        <DeviceNameScreen onNext={handleDeviceNameNext} />
      )}

      {currentStep === 'terms' && (
        <TermsOfServiceScreen onNext={handleTermsNext} />
      )}

      {currentStep === 'auth' && (
        <div className="min-h-screen w-full bg-[var(--bg)]">
          <AuthPortal mode="signup" onClose={handleAuthClose} />
        </div>
      )}

      {currentStep === 'default-browser' && (
        <DefaultBrowserScreen onNext={handleDefaultBrowserNext} />
      )}

      {currentStep === 'bookmark-import' && (
        <BookmarkImportScreen onNext={handleBookmarkImportNext} />
      )}
    </div>
  );
};
