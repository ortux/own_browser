import React, { useEffect, useState } from 'react';

export const SplashScreen: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none z-50 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a1128 0%, #1a1f3a 50%, #0d0e1a 100%)',
        animation: 'fadeOutSplash 0.6s cubic-bezier(0.4, 0, 0.2, 1) 3.6s forwards',
      }}
    >
      <style>{`
        @keyframes fadeOutSplash {
          to { opacity: 0; transform: scale(1.02); }
        }

        @keyframes floatUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(201, 243, 107, 0.3); }
          50% { box-shadow: 0 0 40px rgba(201, 243, 107, 0.6); }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @keyframes slideInLeft {
          0% { opacity: 0; transform: translateX(-30px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInRight {
          0% { opacity: 0; transform: translateX(30px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes fillBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }

        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        .splash-grid {
          position: absolute;
          width: 100%;
          height: 100%;
          opacity: 0.03;
          background-image: 
            linear-gradient(0deg, transparent 24%, rgba(201, 243, 107, 0.1) 25%, rgba(201, 243, 107, 0.1) 26%, transparent 27%, transparent 74%, rgba(201, 243, 107, 0.1) 75%, rgba(201, 243, 107, 0.1) 76%, transparent 77%, transparent),
            linear-gradient(90deg, transparent 24%, rgba(201, 243, 107, 0.1) 25%, rgba(201, 243, 107, 0.1) 26%, transparent 27%, transparent 74%, rgba(201, 243, 107, 0.1) 75%, rgba(201, 243, 107, 0.1) 76%, transparent 77%, transparent);
          background-size: 60px 60px;
        }

        .splash-logo {
          animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s backwards;
        }

        .splash-title {
          animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s backwards;
        }

        .splash-tagline {
          animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.6s backwards;
        }

        .progress-container {
          animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s backwards;
        }

        .progress-bar-fill {
          animation: fillBar 2.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.8s forwards;
          background: linear-gradient(90deg, #c9f36b 0%, #5fc9d6 50%, #8c7fdb 100%);
          background-size: 200% 100%;
          animation: fillBar 2.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.8s forwards, shimmer 3s linear 1.2s infinite;
        }

        .accent-line {
          animation: slideInLeft 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s backwards;
        }

        .accent-line-right {
          animation: slideInRight 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s backwards;
        }

        .logo-ring {
          animation: glow 3s ease-in-out 0.3s infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>

      {/* Grid background */}
      <div className="splash-grid" />

      {/* Top accent lines */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-24 h-px accent-line" style={{ background: 'linear-gradient(90deg, transparent, #c9f36b, transparent)' }} />

      {/* Logo/Icon */}
      <div className="splash-logo relative z-10 mb-8 flex items-center justify-center">
        <div 
          className="logo-ring absolute w-24 h-24 rounded-full"
          style={{ 
            border: '2px solid rgba(201, 243, 107, 0.4)',
            boxShadow: '0 0 30px rgba(95, 201, 214, 0.2)',
          }}
        />
        <div className="relative w-16 h-16 flex items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #c9f36b 0%, #5fc9d6 100%)', boxShadow: '0 8px 24px rgba(201, 243, 107, 0.2)' }}>
          <span className="text-2xl font-bold text-[#0a1128]">Z</span>
        </div>
      </div>

      {/* Title */}
      <h1 className="splash-title relative z-10 text-6xl sm:text-7xl font-bold tracking-tight" style={{ color: '#f5f8fa', fontFamily: "'Space Grotesk', 'Inter', ui-sans-serif, sans-serif" }}>
        Zyphora
      </h1>

      {/* Tagline */}
      <p className="splash-tagline relative z-10 mt-4 text-sm tracking-widest uppercase" style={{ color: '#8ca0b3', letterSpacing: '0.15em' }}>
        Your web, in sync.
      </p>

      {/* Bottom accent line */}
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-32 h-px accent-line-right" style={{ background: 'linear-gradient(90deg, transparent, #5fc9d6, transparent)' }} />

      {/* Progress bar */}
      <div className="progress-container relative z-10 mt-20 w-64">
        <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(201, 243, 107, 0.1)', backdropFilter: 'blur(10px)' }}>
          <div className="progress-bar-fill h-full rounded-full" />
        </div>
        <p className="text-xs mt-3 text-center" style={{ color: '#6b7f94', letterSpacing: '0.05em' }}>
          Loading experience...
        </p>
      </div>
    </div>
  );
};
