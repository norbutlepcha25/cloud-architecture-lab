import React, { useState } from 'react';
import { getAwsSvgIconUrl } from './awsIconRegistry.ts';

interface IconProps {
  className?: string;
  size?: number;
}

export const AwsServiceIcon: React.FC<{ serviceId?: string; category?: string; size?: number; className?: string }> = ({
  serviceId = '',
  category,
  size = 48,
  className = ''
}) => {
  const [hasError, setHasError] = useState(false);
  const svgUrl = (!hasError && serviceId) ? getAwsSvgIconUrl(serviceId) : undefined;

  if (!serviceId) {
    return (
      <div
        className={`rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 select-none ${className}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      </div>
    );
  }

  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={serviceId}
        width={size}
        height={size}
        onError={() => setHasError(true)}
        className={`rounded-md object-contain select-none pointer-events-none ${className}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
        draggable={false}
      />
    );
  }

  switch (serviceId) {
    // --- Compute & Containers ---
    case 'lambda':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#ED7100" />
          <path d="M13 36L19.5 24.5L16 12H21.5L23.5 20.5L30 36H24.5L22 28L18 36H13Z" fill="white" />
          <path d="M26.5 12H35L29 23L35 36H29.5L25.5 27L28.5 21.5L25 14.5L26.5 12Z" fill="white" opacity="0.9" />
        </svg>
      );

    case 'ecs':
    case 'fargate':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#ED7100" />
          <path d="M24 10L36 17V31L24 38L12 31V17L24 10Z" fill="white" opacity="0.2" />
          <path d="M24 10L36 17L24 24L12 17L24 10Z" fill="white" opacity="0.9" />
          <path d="M12 17L24 24V38L12 31V17Z" fill="white" opacity="0.7" />
          <path d="M36 17L24 24V38L36 31V17Z" fill="white" opacity="0.8" />
          <rect x="21" y="34" width="6" height="6" rx="1" fill="#FDE047" />
          <rect x="15" y="30" width="5" height="5" rx="1" fill="#FDE047" />
          <rect x="28" y="30" width="5" height="5" rx="1" fill="#FDE047" />
        </svg>
      );

    case 'ec2':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#ED7100" />
          <rect x="11" y="13" width="26" height="9" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="11" y="26" width="26" height="9" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <circle cx="16" cy="17.5" r="1.5" fill="#4ADE80" />
          <circle cx="21" cy="17.5" r="1.5" fill="#FACC15" />
          <circle cx="16" cy="30.5" r="1.5" fill="#4ADE80" />
          <circle cx="21" cy="30.5" r="1.5" fill="#FACC15" />
          <line x1="26" y1="17.5" x2="33" y2="17.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="26" y1="30.5" x2="33" y2="30.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'eks':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#ED7100" />
          <circle cx="24" cy="24" r="11" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="24" cy="24" r="3" fill="#FACC15" />
          <path d="M24 13V17M24 31V35M13 24H17M31 24H35M16 16L19 19M29 29L32 32M16 32L19 29M29 19L32 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'ecr':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#ED7100" />
          <path d="M24 10L36 17V31L24 38L12 31V17L24 10Z" stroke="white" strokeWidth="2" fill="none" />
          <path d="M24 17L31 21V29L24 33L17 29V21L24 17Z" fill="white" opacity="0.9" />
        </svg>
      );

    // --- Databases ---
    case 'dynamodb':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#C925D1" />
          <path d="M12 16C12 13.5 17.5 12 24 12C30.5 12 36 13.5 36 16C36 18.5 30.5 20 24 20C17.5 20 12 18.5 12 16Z" fill="white" opacity="0.95" />
          <path d="M12 16V22C12 24.5 17.5 26 24 26C30.5 26 36 24.5 36 22V16C36 18 30.5 20 24 20C17.5 20 12 18 12 16Z" fill="white" opacity="0.8" />
          <path d="M12 22V28C12 30.5 17.5 32 24 32C30.5 32 36 30.5 36 28V22C36 24 30.5 26 24 26C17.5 26 12 24 12 22Z" fill="white" opacity="0.65" />
          <path d="M12 28V34C12 36.5 17.5 38 24 38C30.5 38 36 36.5 36 34V28C36 30 30.5 32 24 32C17.5 32 12 30 12 28Z" fill="white" opacity="0.5" />
          <path d="M26 14L19 25H25L22 35L31 23H24L26 14Z" fill="#FDE047" stroke="#9333EA" strokeWidth="1" />
        </svg>
      );

    case 'rds':
    case 'aurora':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#3B48CC" />
          <path d="M12 16C12 13 17.5 11 24 11C30.5 11 36 13 36 16C36 19 30.5 21 24 21C17.5 21 12 19 12 16Z" fill="white" opacity="0.95" />
          <path d="M12 16V24C12 27 17.5 29 24 29C30.5 29 36 27 36 24V16C36 19 30.5 21 24 21C17.5 21 12 19 12 16Z" fill="white" opacity="0.75" />
          <path d="M12 24V32C12 35 17.5 37 24 37C30.5 37 36 35 36 32V24C36 27 30.5 29 24 29C17.5 29 12 27 12 24Z" fill="white" opacity="0.55" />
        </svg>
      );

    case 'elasticache':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#C925D1" />
          <path d="M24 11C18 11 13 15 13 20C13 25 18 29 24 29C30 29 35 25 35 20C35 15 30 11 24 11Z" stroke="white" strokeWidth="2" fill="none" />
          <path d="M21 20C21 18.5 22.5 16 24 15C25.5 16 27 18.5 27 20C27 21.5 25.5 23 24 23C22.5 23 21 21.5 21 20Z" fill="#FDE047" />
          <path d="M13 24V30C13 35 18 38 24 38C30 38 35 35 35 30V24" stroke="white" strokeWidth="2" fill="none" />
        </svg>
      );

    // --- Storage ---
    case 's3':
    case 's3_glacier':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <path d="M12 15C12 13 17 11 24 11C31 11 36 13 36 15L34 35C34 37 29.5 38.5 24 38.5C18.5 38.5 14 37 14 35L12 15Z" fill="#7AA116" stroke="#4D6B0C" strokeWidth="2" />
          <ellipse cx="24" cy="15" rx="11" ry="3.5" fill="#A0D030" />
          <path d="M11 16C9 17 9 21 12 23C13 23.5 13.5 23 13 22C11 20 11 18 12 16Z" fill="#4D6B0C" />
          <path d="M37 16C39 17 39 21 36 23C35 23.5 34.5 23 35 22C37 20 37 18 36 16Z" fill="#4D6B0C" />
        </svg>
      );

    // --- Networking & Content Delivery ---
    case 'cloudfront':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#8C4FFF" />
          <circle cx="24" cy="24" r="14" stroke="white" strokeWidth="2" fill="none" opacity="0.9" />
          <ellipse cx="24" cy="24" rx="7" ry="14" stroke="white" strokeWidth="1.5" fill="none" opacity="0.8" />
          <line x1="10" y1="24" x2="38" y2="24" stroke="white" strokeWidth="1.5" opacity="0.8" />
          <circle cx="24" cy="10" r="2.5" fill="#FACC15" />
          <circle cx="24" cy="38" r="2.5" fill="#FACC15" />
          <circle cx="10" cy="24" r="2.5" fill="#FACC15" />
          <circle cx="38" cy="24" r="2.5" fill="#FACC15" />
        </svg>
      );

    case 'alb':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#8C4FFF" />
          <path d="M24 10V22M14 26H34M14 26V36M34 26V36" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="24" cy="11" r="3" fill="#FACC15" />
          <path d="M11 33L14 37L17 33" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 33L34 37L37 33" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'route53':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#8C4FFF" />
          <circle cx="24" cy="24" r="13" stroke="white" strokeWidth="2" fill="none" />
          <path d="M15 28C17 21 21 16 31 16" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M28 13L32 16L28 19" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15" cy="28" r="3" fill="#FDE047" />
        </svg>
      );

    case 'internet_gateway':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <circle cx="24" cy="24" r="22" stroke="#8C4FFF" strokeWidth="2.5" fill="white" />
          <path d="M16 34V20C16 15.5 19.5 12 24 12C28.5 12 32 15.5 32 20V34" stroke="#8C4FFF" strokeWidth="3" strokeLinecap="round" />
          <line x1="20" y1="34" x2="20" y2="22" stroke="#8C4FFF" strokeWidth="2" />
          <line x1="28" y1="34" x2="28" y2="22" stroke="#8C4FFF" strokeWidth="2" />
          <circle cx="24" cy="18" r="2.5" fill="#8C4FFF" />
        </svg>
      );

    case 's3_gateway_endpoint':
    case 's3_endpoint':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <circle cx="24" cy="24" r="22" stroke="#8C4FFF" strokeWidth="2.5" fill="white" />
          <path d="M24 12L32 16V24C32 29 28.5 33 24 35C19.5 33 16 29 16 24V16L24 12Z" stroke="#8C4FFF" strokeWidth="2" fill="none" />
          <path d="M27 24H19M19 24L22 21M19 24L22 27" stroke="#8C4FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'api_gateway':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#8C4FFF" />
          <rect x="12" y="12" width="24" height="24" rx="4" stroke="white" strokeWidth="2" fill="none" />
          <path d="M18 24H30M24 18V30" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="24" r="5" fill="#FACC15" />
        </svg>
      );

    case 'appsync':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#E7157B" />
          <circle cx="24" cy="14" r="3" fill="white" />
          <circle cx="15" cy="30" r="3" fill="white" />
          <circle cx="33" cy="30" r="3" fill="white" />
          <path d="M24 14L15 30M24 14L33 30M15 30H33" stroke="white" strokeWidth="2" />
          <path d="M22 23C24 21 26 21 28 23" stroke="#FDE047" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    // --- AI & Machine Learning ---
    case 'bedrock':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#059669" />
          <path d="M14 20L24 13L34 20L24 27L14 20Z" stroke="white" strokeWidth="2" fill="#34D399" opacity="0.8" />
          <path d="M14 28L24 21L34 28L24 35L14 28Z" stroke="white" strokeWidth="2" fill="#10B981" />
          <circle cx="24" cy="24" r="2.5" fill="#FACC15" />
        </svg>
      );

    case 'sagemaker':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#059669" />
          <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="24" cy="18" r="3" fill="white" />
          <circle cx="18" cy="28" r="3" fill="white" />
          <circle cx="30" cy="28" r="3" fill="white" />
          <line x1="24" y1="18" x2="18" y2="28" stroke="white" strokeWidth="1.5" />
          <line x1="24" y1="18" x2="30" y2="28" stroke="white" strokeWidth="1.5" />
          <line x1="18" y1="28" x2="30" y2="28" stroke="white" strokeWidth="1.5" />
        </svg>
      );

    // --- Security, Identity & Compliance ---
    case 'iam':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#DD344C" />
          <circle cx="24" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" />
          <path d="M14 34C14 28 18 26 24 26C30 26 34 28 34 34" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="32" cy="22" r="3" fill="#FACC15" />
        </svg>
      );

    case 'cognito':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#DD344C" />
          <rect x="11" y="13" width="26" height="22" rx="3" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="19" cy="21" r="3" fill="white" />
          <path d="M14 30C14 27 16.5 25 19 25C21.5 25 24 27 24 30" stroke="white" strokeWidth="1.5" />
          <line x1="26" y1="19" x2="33" y2="19" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="26" y1="24" x2="32" y2="24" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="33" cy="29" r="4" fill="#22C55E" />
          <path d="M31.5 29L32.5 30L34.5 28" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'kms':
    case 'secrets_manager':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#DD344C" />
          <circle cx="20" cy="22" r="6" stroke="white" strokeWidth="2.5" fill="none" />
          <path d="M25 22H36V26M31 22V26" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="20" cy="22" r="2" fill="#FACC15" />
        </svg>
      );

    case 'waf':
    case 'shield':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#DD344C" />
          <path d="M24 10L35 15V24C35 31 29 37 24 39C19 37 13 31 13 24V15L24 10Z" fill="white" opacity="0.9" />
          <path d="M17 19H31M15 25H33M17 31H31M21 19V25M27 19V25M19 25V31M25 25V31" stroke="#DD344C" strokeWidth="1.5" />
        </svg>
      );

    // --- Integration & Messaging ---
    case 'sqs':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#FF4F8B" />
          <rect x="11" y="13" width="26" height="7" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="11" y="22" width="26" height="7" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="11" y="31" width="26" height="7" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M16 16.5H24M16 25.5H28M16 34.5H32" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'sns':
    case 'eventbridge':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#FF4F8B" />
          <circle cx="24" cy="24" r="4" fill="white" />
          <path d="M16 16C20 12 28 12 32 16M12 12C18 6 30 6 36 12M16 32C20 36 28 36 32 32M12 36C18 42 30 42 36 36" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 'step_functions':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#FF4F8B" />
          <rect x="11" y="20" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="29" y="12" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="29" y="28" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M19 24H24V16H29M24 24V32H29" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
      );

    // --- Management & Governance ---
    case 'cloudwatch':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#E7157B" />
          <rect x="11" y="11" width="26" height="26" rx="4" stroke="white" strokeWidth="2" fill="none" />
          <path d="M16 30L21 23L26 27L32 18" stroke="#FACC15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'cloudformation':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#E7157B" />
          <rect x="13" y="28" width="22" height="6" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="15" y="21" width="18" height="5" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="18" y="15" width="12" height="4" rx="1" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
      );

    // --- Analytics ---
    case 'athena':
    case 'glue':
    case 'emr':
    case 'redshift':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill="#2E27AD" />
          <circle cx="20" cy="20" r="7" stroke="white" strokeWidth="2" fill="none" />
          <path d="M25 25L34 34" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 20H24M20 16V24" stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    // --- Client / Actor Icons ---
    case 'user':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <circle cx="24" cy="16" r="7" stroke="#232F3E" strokeWidth="2.5" fill="none" />
          <path d="M10 38C10 29 16 26 24 26C32 26 38 29 38 38" stroke="#232F3E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 'developer':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect x="9" y="11" width="30" height="19" rx="2" stroke="#475569" strokeWidth="2.5" fill="#F8FAFC" />
          <path d="M5 36H43" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M19 17L15 20.5L19 24M29 17L33 20.5L29 24" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'on_premises':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <path d="M8 40V14L24 8L40 14V40Z" stroke="#475569" strokeWidth="2.5" strokeLinejoin="round" fill="#F8FAFC" />
          <path d="M15 20H33M15 27H33M15 34H33" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'client_ui':
    case 'data_transfer_ui':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect x="8" y="10" width="32" height="22" rx="3" stroke="#232F3E" strokeWidth="2" fill="#F8FAFC" />
          <line x1="8" y1="16" x2="40" y2="16" stroke="#232F3E" strokeWidth="1.5" />
          <circle cx="12" cy="13" r="1" fill="#EF4444" />
          <circle cx="15" cy="13" r="1" fill="#F59E0B" />
          <circle cx="18" cy="13" r="1" fill="#10B981" />
          <line x1="12" y1="21" x2="26" y2="21" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="25" x2="34" y2="25" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M20 32L18 38H30L28 32" stroke="#232F3E" strokeWidth="2" fill="none" strokeLinejoin="round" />
        </svg>
      );

    case 'openid':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <path d="M26 14C33 16 36 22 34 29C32 36 24 38 18 36L20 31C24 32 28 31 30 27C31 23 29 19 25 18L26 14Z" fill="#F59E0B" />
          <path d="M14 26C12 21 14 16 19 13L21 17C18 19 16 22 18 26L14 26Z" fill="#94A3B8" />
          <path d="M22 10L27 15L22 20V10Z" fill="#F59E0B" />
        </svg>
      );

    // --- Official Category Badge SVG Fallback for All 300+ Services ---
    default: {
      const catColorMap: Record<string, { bg: string; accent: string; label: string }> = {
        'Compute': { bg: '#ED7100', accent: '#FDE047', label: 'CP' },
        'Storage': { bg: '#7AA116', accent: '#A0D030', label: 'ST' },
        'Databases': { bg: '#C925D1', accent: '#F472B6', label: 'DB' },
        'Networking & Content Delivery': { bg: '#8C4FFF', accent: '#C084FC', label: 'NT' },
        'Security, Identity & Compliance': { bg: '#DD344C', accent: '#F87171', label: 'SEC' },
        'Integration & Messaging': { bg: '#FF4F8B', accent: '#F472B6', label: 'MSG' },
        'Analytics': { bg: '#2E27AD', accent: '#60A5FA', label: 'AN' },
        'Machine Learning & AI': { bg: '#059669', accent: '#34D399', label: 'AI' },
        'Management & Governance': { bg: '#E7157B', accent: '#F472B6', label: 'MG' },
        'Developer Tools': { bg: '#2563EB', accent: '#93C5FD', label: 'DEV' },
        'Containers': { bg: '#ED7100', accent: '#FDE047', label: 'CTR' },
        'Frontend Web & Mobile': { bg: '#D97706', accent: '#FDE047', label: 'WEB' },
        'Migration & Transfer': { bg: '#0891B2', accent: '#67E8F9', label: 'MIG' },
        'Media Services': { bg: '#B91C1C', accent: '#FCA5A5', label: 'MED' },
        'Business Applications': { bg: '#0284C7', accent: '#38BDF8', label: 'BIZ' },
        'End User Computing': { bg: '#7C3AED', accent: '#C4B5FD', label: 'EUC' },
        'Internet of Things (IoT)': { bg: '#65A30D', accent: '#BEF264', label: 'IoT' },
        'Cloud Financial Management': { bg: '#15803D', accent: '#86EFAC', label: 'FIN' },
        'Blockchain & Quantum': { bg: '#4338CA', accent: '#A5B4FC', label: 'BC' },
        'Robotics & Satellite': { bg: '#0F766E', accent: '#5EEAD4', label: 'ROB' }
      };

      const matched = catColorMap[category || 'Compute'] || { bg: '#545B64', accent: '#CBD5E1', label: 'AWS' };

      return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="6" fill={matched.bg} />
          {/* Hexagon / Architecture outline */}
          <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" stroke="white" strokeWidth="1.5" fill="none" opacity="0.6" />
          <circle cx="24" cy="24" r="4.5" fill={matched.accent} />
          <text
            x="24"
            y="43"
            textAnchor="middle"
            fill="white"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
            letterSpacing="0.5"
          >
            {matched.label}
          </text>
        </svg>
      );
    }
  }
};
