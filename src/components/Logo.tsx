/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textSize?: string;
  glowing?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 40,
  showText = true,
  textSize = 'text-xl',
  glowing = true,
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Interconnected Hexagonal Node Symbol */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`transition-all duration-300 ${glowing ? 'drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]' : ''}`}
      >
        {/* Glow Filters */}
        <defs>
          <filter id="neon-glow-logo" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#neon-glow-logo)">
          {/* Hexagon Top */}
          <polygon
            points="50,12 62,19 62,33 50,40 38,33 38,19"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            fill="rgba(0, 240, 255, 0.05)"
            strokeLinejoin="round"
          />

          {/* Hexagon Bottom Left */}
          <polygon
            points="24,57 36,64 36,78 24,85 12,78 12,64"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            fill="rgba(0, 240, 255, 0.05)"
            strokeLinejoin="round"
          />

          {/* Hexagon Bottom Right */}
          <polygon
            points="76,57 88,64 88,78 76,85 64,78 64,64"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            fill="rgba(0, 240, 255, 0.05)"
            strokeLinejoin="round"
          />

          {/* Center Connection Hub */}
          <circle
            cx="50"
            cy="53"
            r="7"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            fill="var(--bg-card, #121824)"
          />

          {/* Connection Lines */}
          {/* Central hub to Top Hexagon */}
          <line
            x1="50"
            y1="46"
            x2="50"
            y2="33"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Central hub to Bottom Left Hexagon */}
          <line
            x1="44"
            y1="56"
            x2="31"
            y2="64"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Central hub to Bottom Right Hexagon */}
          <line
            x1="56"
            y1="56"
            x2="69"
            y2="64"
            stroke="var(--color-primary, #00f0ff)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Subtle Outer Radar Lines */}
          <circle
            cx="50"
            cy="53"
            r="38"
            stroke="var(--text-muted, #849495)"
            strokeWidth="1"
            strokeDasharray="4 6"
            opacity="0.35"
          />
        </g>
      </svg>

      {/* Brand Text */}
      {showText && (
        <span
          className={`font-display font-bold tracking-wide select-none ${textSize} transition-all duration-300`}
          style={{
            color: 'var(--text-main)',
            textShadow: glowing ? '0 0 10px rgba(0, 240, 255, 0.4)' : 'none',
          }}
        >
          Vital<span style={{ color: 'var(--color-primary)' }}>Mesh</span>
        </span>
      )}
    </div>
  );
};
