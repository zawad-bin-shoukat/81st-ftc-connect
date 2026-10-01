import { parseMemberQuery } from './member-query.js';

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
    ])
      expect(() => parseMemberQuery(raw)).toThrow();
  });

  it('searches literal text and preserves exact blood-group filters', () => {
    const query = parseMemberQuery({ q: '50%_', bloodGroup: ' A ' });
    expect(query.where.OR?.[0]).toEqual({
      name: { contains: '50\\%\\_', mode: 'insensitive' },
    });
    expect(query.where.bloodGroup).toBe(' A ');
    expect(parseMemberQuery({ q: '238' }).where.OR).toContainEqual({
      ftcId: 238,
    });
  });
});
