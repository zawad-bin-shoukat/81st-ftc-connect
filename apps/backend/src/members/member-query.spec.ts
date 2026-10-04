import { nameWordPattern, parseMemberQuery } from './member-query.js';

describe('member query validation', () => {
  it('always restricts active members and bounds pagination', () => {
    const query = parseMemberQuery({
      page: '2',
      pageSize: '20',
      section: 'B',
      bcsBatch: 'unknown',
    });
    expect(query.where).toEqual({
      isActive: true,
      section: 'B',
      bcsBatch: null,
    });
    expect(query.skip).toBe(20);
    for (const raw of [
      { page: '-1' },
      { pageSize: '101' },
      { page: '1.1' },
      { bcsBatch: '0' },
      { cadreId: 'broken' },
      { q: ['one', 'two'] },
      { isActive: 'false' },
      { q: '' },
      { homeDistrict: 'Manik' },
    ])
      expect(() => parseMemberQuery(raw)).toThrow();
  });

  it('searches names as whole words and preserves exact blood-group filters', () => {
    const query = parseMemberQuery({ q: '50%_', bloodGroup: ' A ' });
    expect(query.q).toBe('50%_');
    expect(query.where.OR).toBeUndefined();
    expect(query.where.bloodGroup).toBe(' A ');
    expect(nameWordPattern('anik')).toBe(
      '(^|[^[:alnum:]])anik([^[:alnum:]]|$)',
    );
    expect(nameWordPattern('a.b')).toContain('a\\.b');
  });
});
