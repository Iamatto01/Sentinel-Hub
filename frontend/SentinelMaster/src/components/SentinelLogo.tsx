import React from 'react';

/**
 * Official Sentinel Master Brand Logo
 * Geometric wireframe delta / spire emblem authentically matching the master reference.
 */

const BASE_OUTER = 'M 256.0,56.0 L 106.6,273.2 L 43.1,314.0 L 43.1,400.0 L 110.9,425.8 L 256.0,372.0 L 401.1,425.8 L 468.9,400.0 L 468.9,314.0 L 405.4,273.2 Z';

const BASE_HOLES = [
  'M 246.3,111.9 L 248.5,193.6 L 199.0,225.8 Z',
  'M 265.7,111.9 L 313.0,225.8 L 263.5,193.6 Z',
  'M 231.3,111.9 L 177.5,180.7 L 184.0,228.0 Z',
  'M 280.7,111.9 L 328.0,228.0 L 334.5,180.7 Z',
  'M 164.6,204.3 L 134.5,262.4 L 168.9,243.0 Z',
  'M 347.4,204.3 L 343.1,243.0 L 377.5,262.4 Z',
  'M 235.6,225.8 L 186.1,251.6 L 186.1,307.6 Z',
  'M 276.4,225.8 L 325.9,307.6 L 325.9,251.6 Z',
  'M 166.8,264.6 L 128.1,281.8 L 168.9,305.4 Z',
  'M 345.2,264.6 L 343.1,305.4 L 383.9,281.8 Z',
  'M 246.3,225.8 L 248.5,281.8 L 186.1,382.8 L 184.0,329.0 Z',
  'M 265.7,225.8 L 328.0,329.0 L 325.9,382.8 L 263.5,281.8 Z',
  'M 117.3,294.6 L 162.5,322.6 L 117.3,350.6 Z',
  'M 394.7,294.6 L 394.7,350.6 L 349.5,322.6 Z',
  'M 104.4,299.0 L 59.3,322.6 L 59.3,385.0 L 104.4,357.0 Z',
  'M 407.6,299.0 L 407.6,357.0 L 452.7,385.0 L 452.7,322.6 Z',
  'M 166.8,331.2 L 121.6,359.2 L 166.8,387.1 Z',
  'M 345.2,331.2 L 345.2,387.1 L 390.4,359.2 Z',
  'M 113.0,365.6 L 63.6,393.6 L 110.9,425.8 L 162.5,395.7 Z',
  'M 399.0,365.6 L 349.5,395.7 L 401.1,425.8 L 448.4,393.6 Z'
].join(' ');

const FULL_BASE_PATH = `${BASE_OUTER} ${BASE_HOLES}`;

export default function SentinelLogo({
  size = 32,
  className = '',
  style = {},
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={{ flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`hubBg-${id}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1c1c1f" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>
        <linearGradient id={`hubEmblem-${id}`} x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#e4e4e7" />
          <stop offset="100%" stopColor="#a1a1aa" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#hubBg-${id})`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1.5" />
      <g transform="translate(7, 8) scale(0.098)">
        <path d={FULL_BASE_PATH} fill={`url(#hubEmblem-${id})`} fillRule="evenodd" />
      </g>
    </svg>
  );
}
