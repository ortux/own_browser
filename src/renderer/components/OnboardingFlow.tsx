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
  const { completeOnboarding, agreeToTerms } = useSettingsStore();

  const handleDeviceNameNext = (_name: string) => {
    setCurrentStep('terms');
  };

  const handleTermsNext = () => {
    agreeToTerms();
    setCurrentStep('auth');
  };

  const handleAuthClose = () => {
    completeOnboarding();
    onComplete();
  };

  return (
    <div>
      {currentStep === 'device-name' && (
        <DeviceNameScreen onNext={handleDeviceNameNext} />
      )}

      {currentStep === 'terms' && (
        <TermsOfServiceScreen onNext={handleTermsNext} />
      )}

      {currentStep === 'auth' && (
        <div className="min-h-screen w-full bg-[#090a0b]">
          <AuthPortal mode="signup" onClose={handleAuthClose} />
        </div>
      )}
    </div>
  );
};
