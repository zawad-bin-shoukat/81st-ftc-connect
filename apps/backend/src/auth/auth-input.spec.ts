import { loginPhone, rosterPhone } from './auth-input.js';

describe('roster phone matching', () => {
  it('matches Bangladesh display formats without changing the original', () => {
    const raw = '০১৭১২-৩৪৫৬৭৮';
    expect(rosterPhone(raw)).toBe('+8801712345678');
    expect(raw).toBe('০১৭১২-৩৪৫৬৭৮');
    expect(loginPhone('8801712345678')).toBe('+8801712345678');
    expect(loginPhone('+1 (202) 555-0100')).toBe('+12025550100');
  });
  it('does not invent missing digits or interpret multiple numbers', () => {
    for (const raw of [
      '1712345678',
      '01712345678 / 01812345678',
      '01712345678 ext 2',
      'N/A',
      '+880123',
    ]) {
      expect(rosterPhone(raw)).toBeNull();
      expect(() => loginPhone(raw)).toThrow();
    }
  });
});
