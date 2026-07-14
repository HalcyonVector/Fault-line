interface OnboardingHintProps {
  onDismiss: () => void;
}

/** A one-time callout for first-time visitors, since the tray alone doesn't explain itself. */
export function OnboardingHint({ onDismiss }: OnboardingHintProps) {
  return (
    <div className="onboarding-hint" role="note">
      <p>
        This is live global earthquake activity from the USGS. A background drone tracks recent seismic
        "unrest," and any quake at or above your magnitude threshold fires an audible P/S onset.{' '}
        <strong>⚙</strong> opens the Monitor panel for more controls.
      </p>
      <button className="ghost" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
