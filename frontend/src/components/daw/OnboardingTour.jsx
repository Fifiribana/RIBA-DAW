// RIBA · 30-second Onboarding Tour (Sprint v3.13)
//
// Shown on first-ever load (gated by localStorage 'riba-onboarding-done').
// 4 lightweight steps anchored to UI elements via data-testid lookup. Each
// step has translated copy in 5 languages. Skippable at any time.

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'riba-onboarding-done';

const STEPS = [
  {
    id: 'welcome',
    anchor: null, // centered modal
    titleKey: 'onboarding.welcomeTitle',
    bodyKey:  'onboarding.welcomeBody',
  },
  {
    id: 'bantu_grid',
    anchor: '[data-testid="bantu-markers-toggle"]',
    titleKey: 'onboarding.bantuTitle',
    bodyKey:  'onboarding.bantuBody',
  },
  {
    id: 'storytelling',
    anchor: 'text=Tools',
    titleKey: 'onboarding.storyTitle',
    bodyKey:  'onboarding.storyBody',
  },
  {
    id: 'studio_live',
    anchor: 'text=Window',
    titleKey: 'onboarding.liveTitle',
    bodyKey:  'onboarding.liveBody',
  },
];

function findAnchor(selector) {
  if (!selector) return null;
  if (selector.startsWith('text=')) {
    const txt = selector.slice(5).toLowerCase();
    const els = Array.from(document.querySelectorAll('button, span, a, div'))
      .filter((el) => (el.textContent || '').trim().toLowerCase() === txt);
    return els[0] || null;
  }
  return document.querySelector(selector);
}

export function OnboardingTour({ forceOpen = false, onClose }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [anchorRect, setAnchorRect] = useState(null);

  // Show on first visit unless dismissed previously.
  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY) === '1';
      if (!done || forceOpen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [forceOpen]);

  // Recompute anchor rect on step change + on window resize.
  const step = STEPS[stepIdx];
  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const el = findAnchor(step?.anchor);
      setAnchorRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener('resize', update);
    const t = setTimeout(update, 200);
    return () => { window.removeEventListener('resize', update); clearTimeout(t); };
  }, [open, step]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* */ }
    setOpen(false);
    onClose && onClose();
  };

  const next = () => {
    if (stepIdx >= STEPS.length - 1) {
      dismiss();
      return;
    }
    setStepIdx(stepIdx + 1);
  };

  const back = () => setStepIdx(Math.max(0, stepIdx - 1));

  if (!open) return null;

  const isCentered = !anchorRect;
  // Position the bubble next to the anchor (clamped within viewport).
  const bubbleStyle = isCentered
    ? {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    : (() => {
        const padding = 12;
        const bubbleW = 320;
        const bubbleH = 180;
        let top = anchorRect.bottom + padding;
        let left = anchorRect.left + anchorRect.width / 2 - bubbleW / 2;
        // Keep within viewport
        if (top + bubbleH > window.innerHeight - 16) {
          top = Math.max(16, anchorRect.top - bubbleH - padding);
        }
        if (left + bubbleW > window.innerWidth - 16) left = window.innerWidth - bubbleW - 16;
        if (left < 16) left = 16;
        return { position: 'fixed', top, left };
      })();

  return (
    <>
      {/* Backdrop with anchor cut-out */}
      <div
        data-testid="onboarding-backdrop"
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Spotlight ring around the anchored target */}
      {anchorRect && (
        <div
          data-testid="onboarding-spotlight"
          style={{
            position: 'fixed', zIndex: 9001,
            top: anchorRect.top - 6, left: anchorRect.left - 6,
            width: anchorRect.width + 12, height: anchorRect.height + 12,
            border: '2px solid #D946EF',
            borderRadius: 8,
            boxShadow: '0 0 22px rgba(217,70,239,0.85), 0 0 0 9999px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            transition: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* Bubble */}
      <div
        data-testid={`onboarding-step-${step.id}`}
        style={{
          ...bubbleStyle, zIndex: 9002,
          width: 320, maxWidth: '92vw',
          background: '#18181B',
          border: '1px solid rgba(217,70,239,0.5)',
          borderRadius: 12,
          padding: 18,
          boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
          color: '#FAFAFA',
        }}
      >
        <div
          className="font-mono-r"
          style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.16em', marginBottom: 4 }}
        >
          {t('onboarding.stepIndicator', { current: stepIdx + 1, total: STEPS.length })}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {t(step.titleKey)}
        </div>
        <div style={{ fontSize: 12, color: '#D4D4D8', lineHeight: 1.5 }}>
          {t(step.bodyKey)}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 14, gap: 8,
        }}>
          <button
            data-testid="onboarding-skip"
            onClick={dismiss}
            className="riba-btn"
            style={{ fontSize: 11, padding: '6px 10px', background: 'transparent', color: '#A1A1AA' }}
          >
            {t('onboarding.skip')}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {stepIdx > 0 && (
              <button
                data-testid="onboarding-back"
                onClick={back}
                className="riba-btn"
                style={{ fontSize: 11, padding: '6px 12px' }}
              >
                ← {t('onboarding.back')}
              </button>
            )}
            <button
              data-testid="onboarding-next"
              onClick={next}
              className="riba-btn"
              style={{
                fontSize: 11, padding: '6px 14px', fontWeight: 700,
                background: 'linear-gradient(135deg, #D946EF, #F59E0B)',
                color: '#fff',
              }}
            >
              {stepIdx >= STEPS.length - 1 ? `🚀 ${t('onboarding.finish')}` : `${t('onboarding.next')} →`}
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              data-testid={`onboarding-dot-${i}`}
              data-active={i === stepIdx ? 'true' : undefined}
              style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: i === stepIdx ? '#D946EF' : '#3F3F46',
                transition: 'background 220ms ease-out',
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
