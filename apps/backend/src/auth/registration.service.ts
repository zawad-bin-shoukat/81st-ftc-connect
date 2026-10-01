import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  loginPhone,
  objectBody,
  rosterPhone,
  stringField,
} from './auth-input.js';
import { profileInput } from '../members/profile-input.js';

@Injectable()
export class RegistrationService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async submit(body: unknown) {
    const input = objectBody(body, ['name', 'ftcId', 'phone', 'evidence']);
    const name = stringField(input.name, 'name', 150);
    const evidence = stringField(input.evidence, 'membership details', 2000);
    const phone = loginPhone(input.phone);
    const ftcId = input.ftcId;
    if (
      typeof ftcId !== 'number' ||
      !Number.isInteger(ftcId) ||
      ftcId < 1 ||
      ftcId > 2147483647
    )
      throw new BadRequestException('Check FTC ID.');
    // Same response for existing members and duplicate pending requests.
    if (!(await this.db.member.findUnique({ where: { ftcId } }))) {
      try {
        await this.db.registrationRequest.create({
          data: { name, evidence, phone, ftcId },
        });
      } catch (error) {
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ))
          throw error;
      }
    }
    return {
      message:
        'Request received. An administrator must verify your 81st FTC membership before you can sign in. If you are already listed, use your roster phone number or ask the administrator for help.',
    };
  }

  // Called only by the local administrator CLI, never by a public HTTP route.
  async approve(id: string, body: unknown) {
    const input = objectBody(body, [
      'section',
      'cadreId',
      'education',
      'university',
      'email',
      'bloodGroup',
      'homeDistrict',
      'bcsBatch',
      'aboutMe',
      'favouriteQuotation',
    ]);
    const section = stringField(input.section, 'section', 2);
    const cadreId = stringField(input.cadreId, 'cadre ID', 36);
    if (!/^[0-9a-f-]{36}$/i.test(cadreId))
      throw new BadRequestException('Check cadre ID.');
    const { section: _section, cadreId: _cadre, ...details } = input;
    for (const key of [
      'education',
      'university',
      'email',
      'bloodGroup',
      'homeDistrict',
    ])
      if (!(key in details))
        throw new BadRequestException('Missing ' + key + '.');
    const profile = profileInput(details);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM registration_requests WHERE id=$1::uuid FOR UPDATE',
          id,
        );
        const request = await tx.registrationRequest.findUnique({
          where: { id },
        });
        if (!request || request.status !== 'pending')
          throw new ConflictException('Request is not pending.');
        const members = await tx.member.findMany({
          select: { phone: true, ftcId: true },
        });
        if (
          members.some(
            (m) =>
              m.ftcId === request.ftcId ||
              rosterPhone(m.phone) === request.phone,
          ) ||
          (await tx.account.findUnique({
            where: { loginPhone: request.phone },
          }))
        )
          throw new ConflictException(
            'A roster record or login already uses this ID/phone. Review manually.',
          );
        const member = await tx.member.create({
          data: {
            ...profile,
            section,
            cadreId,
            name: request.name,
            ftcId: request.ftcId,
            phone: request.phone,
          } as Prisma.MemberUncheckedCreateInput,
        });
        await tx.registrationRequest.update({
          where: { id },
          data: { status: 'approved', reviewedAt: new Date() },
        });
        return { ftcId: member.ftcId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
