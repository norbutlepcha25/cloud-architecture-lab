import { useEffect, useRef } from 'react';
import { useArchitecture } from '../context/ArchitectureContext.tsx';
import { STUDENT_CHALLENGES } from '../data/studentChallenges.ts';
import { changeAnalyticsContext, track } from './analytics.ts';

export function AnalyticsObserver({ page }: { page: 'home' | 'lab' }) {
  const { appMode, activeChallenge } = useArchitecture();
  const previous = useRef('');
  useEffect(() => {
    const key = `${page}:${appMode}:${activeChallenge?.id ?? ''}`;
    if (previous.current === key) return;
    const last = previous.current.split(':');
    previous.current = key;
    const challenge_id = STUDENT_CHALLENGES.some(challenge => challenge.id === activeChallenge?.id) ? activeChallenge!.id : undefined;
    changeAnalyticsContext({ page, mode: page === 'lab' ? appMode : undefined, challenge_id: page === 'lab' ? challenge_id : undefined });
    if (last[0] !== page) track('screen_view');
    if (page === 'lab' && (last[0] !== page || last[1] !== appMode)) track('mode_opened');
    if (page === 'lab' && challenge_id && last[2] !== challenge_id) track('challenge_opened');
  }, [page, appMode, activeChallenge]);
  return null;
}
