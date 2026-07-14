import { describe, it, expect } from 'vitest';
import { encodeShareParams, decodeShareParams, buildShareUrl, readShareParamsFromLocation } from './shareLink';
import type { EngineConfig } from '../types';

const PARAMS: EngineConfig = { magnitudeThreshold: 5.5 };

describe('encodeShareParams / decodeShareParams', () => {
  it('round-trips a valid config', () => {
    const encoded = encodeShareParams(PARAMS);
    expect(decodeShareParams(encoded)).toEqual(PARAMS);
  });

  it('rejects malformed base64/JSON without throwing', () => {
    expect(decodeShareParams('not-valid-base64!!')).toBeNull();
  });

  it('rejects a decoded object missing required fields', () => {
    const tampered = encodeURIComponent(btoa(JSON.stringify({ somethingElse: 1 })));
    expect(decodeShareParams(tampered)).toBeNull();
  });

  it('rejects a magnitude threshold outside the valid 2.5..7.5 range', () => {
    const outOfRange = encodeURIComponent(btoa(JSON.stringify({ magnitudeThreshold: 20 })));
    expect(decodeShareParams(outOfRange)).toBeNull();
  });
});

describe('buildShareUrl / readShareParamsFromLocation', () => {
  it('encodes the config into a `tension` query param and strips everything else', () => {
    window.history.replaceState({}, '', '/?foo=bar');
    const url = buildShareUrl(PARAMS);
    expect(url).toContain('tension=');
    expect(url).not.toContain('foo=bar');
  });

  it('reads back a valid share link from the current location', () => {
    const encoded = encodeShareParams(PARAMS);
    window.history.replaceState({}, '', `/?tension=${encoded}`);
    expect(readShareParamsFromLocation()).toEqual(PARAMS);
  });

  it('returns null when there is no share param in the URL', () => {
    window.history.replaceState({}, '', '/');
    expect(readShareParamsFromLocation()).toBeNull();
  });
});
