import { MembersService } from './members.service.js';
import { officialCadres } from './official-cadres.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { PhotoStorageService } from './photo-storage.service.js';

it('offers all 26 official cadres, including those without members', async () => {
  const cadres = officialCadres.map((name, index) => ({
    id: String(index),
    name,
  }));
  const memberFindMany = vi
    .fn()
    .mockResolvedValueOnce([{ section: 'A' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  const cadreFindMany = vi.fn().mockResolvedValue(cadres);
  const prisma = {
    member: { findMany: memberFindMany },
    cadre: { findMany: cadreFindMany },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService;
  const service = new MembersService(prisma, {} as PhotoStorageService);

  const result = await service.filters();

  expect(officialCadres).toHaveLength(26);
  expect(new Set(officialCadres).size).toBe(26);
  expect(result.cadres).toEqual(cadres);
  expect(result.sections).toEqual(['A']);
  expect(cadreFindMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { name: { in: [...officialCadres] } } }),
  );
});
