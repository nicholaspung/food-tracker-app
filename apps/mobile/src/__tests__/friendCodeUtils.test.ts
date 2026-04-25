import {
  createFriendQrPayload,
  extractFriendCodeFromQrPayload,
  resolveOwnFriendCode,
  sanitizeFriendCode,
} from '../features/store/friendCodeUtils';

describe('friendCodeUtils', () => {
  describe('sanitizeFriendCode', () => {
    it('keeps only the first 8 alphanumeric uppercase characters', () => {
      expect(sanitizeFriendCode('ab-cd 1234 zz')).toBe('ABCD1234');
    });
  });

  describe('extractFriendCodeFromQrPayload', () => {
    it('parses a raw 8-character friend code', () => {
      expect(extractFriendCodeFromQrPayload('ABCD1234')).toBe('ABCD1234');
    });

    it('normalizes a lowercase raw friend code', () => {
      expect(extractFriendCodeFromQrPayload('abcd1234')).toBe('ABCD1234');
    });

    it('parses the generated Yummy Recs friend invite URL', () => {
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/add?friendCode=ABCD1234')).toBe('ABCD1234');
    });

    it('parses a code query param URL', () => {
      expect(extractFriendCodeFromQrPayload('https://example.com/friends/add?code=ABCD1234')).toBe('ABCD1234');
    });

    it('parses a path-style payload ending with the friend code', () => {
      expect(extractFriendCodeFromQrPayload('https://example.com/friends/add/ABCD1234')).toBe('ABCD1234');
    });

    it('returns null for invalid, short, and empty payloads', () => {
      expect(extractFriendCodeFromQrPayload('not-a-yummy-recs-invite')).toBeNull();
      expect(extractFriendCodeFromQrPayload('ABC123')).toBeNull();
      expect(extractFriendCodeFromQrPayload('   ')).toBeNull();
    });
  });

  describe('resolveOwnFriendCode', () => {
    it('prefers a valid persisted friend code over a derived user id', () => {
      expect(resolveOwnFriendCode('user-12345678', 'abcd1234')).toBe('ABCD1234');
    });

    it('falls back to a derived user id when persisted code is invalid', () => {
      expect(resolveOwnFriendCode('user-12345678', 'ABC')).toBe('USER1234');
    });

    it('uses the local fallback without a user id', () => {
      expect(resolveOwnFriendCode()).toBe('LOCAL000');
    });
  });

  describe('createFriendQrPayload', () => {
    it('creates a canonical friend invite URL', () => {
      expect(createFriendQrPayload('abcd1234')).toBe('yummyrecs://friends/add?friendCode=ABCD1234');
    });
  });
});
