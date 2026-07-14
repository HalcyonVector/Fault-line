interface OnboardingHintProps {
  onDismiss: () => void;
}

/** A one-time callout for first-time visitors, since the console alone doesn't explain itself. */
export function OnboardingHint({ onDismiss }: OnboardingHintProps) {
  return (
    <div className="onboarding-hint" role="note">
      <p>
        This is live global earthquake activity from the USGS. The scrolling trace above is the engine's real
        output — a background drone tracks recent seismic "unrest," and any quake at or above your magnitude
        threshold fires an audible P/S onset you'll see spike the trace. The console below is always on
        screen: Source, Threshold, Mixer, and Presets.
      </p>
      <button className="ghost" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
