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
    it('parses the generated Yummy Recs friend invite URL', () => {
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/add?friendCode=ABCD1234')).toBe('ABCD1234');
    });

    it('normalizes a lowercase friend code from the generated invite URL', () => {
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/add?friendCode=abcd1234')).toBe('ABCD1234');
    });

    it('round-trips generated Yummy Recs friend invite URLs', () => {
      const payload = createFriendQrPayload('abcd1234');

      expect(extractFriendCodeFromQrPayload(payload)).toBe('ABCD1234');
    });

    it('rejects legacy raw-code and fallback URL payloads', () => {
      expect(extractFriendCodeFromQrPayload('ABCD1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('abcd1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('https://example.com/friends/add?code=ABCD1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('https://example.com/friends/add/ABCD1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/add?code=ABCD1234')).toBeNull();
    });

    it('returns null for wrong Yummy Recs routes, invalid codes, and empty payloads', () => {
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/request?friendCode=ABCD1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('yummyrecs://profile/add?friendCode=ABCD1234')).toBeNull();
      expect(extractFriendCodeFromQrPayload('not-a-yummy-recs-invite')).toBeNull();
      expect(extractFriendCodeFromQrPayload('yummyrecs://friends/add?friendCode=ABC123')).toBeNull();
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
