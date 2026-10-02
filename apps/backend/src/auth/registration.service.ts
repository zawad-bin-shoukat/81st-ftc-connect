import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
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

  async list(query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['status', 'page'].includes(key)))
      throw new BadRequestException('Check request filters.');
    const status = query.status ?? 'pending';
    const page = Number(query.page ?? 1);
    if (
      !['pending', 'approved', 'rejected'].includes(status as string) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000
    )
      throw new BadRequestException('Check request filters.');
    const where = { status: status as string };
    const [total, items] = await this.db.$transaction([
      this.db.registrationRequest.count({ where }),
      this.db.registrationRequest.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 20,
        skip: (page - 1) * 20,
      }),
    ]);
    return { items, total, page, totalPages: Math.ceil(total / 20) };
  }

  async detail(id: string) {
    const request = await this.db.registrationRequest.findUnique({
      where: { id },
      include: {
        reviewedBy: { select: { name: true, ftcId: true } },
        reviewedByTestAccount: { select: { testId: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found.');
    const cadres = await this.db.cadre.findMany({ orderBy: { name: 'asc' } });
    return { request, cadres };
  }

  async reject(
    id: string,
    review?: { memberId?: string; testAccountId?: string; note: string },
  ) {
    const result = await this.db.registrationRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedByMemberId: review?.memberId,
        reviewedByTestAccountId: review?.testAccountId,
        reviewNote: review?.note ?? 'Reviewed using local administrator CLI.',
      },
    });
    if (!result.count) throw new ConflictException('Request is not pending.');
    return { message: 'Request rejected. No member was added.' };
  }

  async approve(
    id: string,
    body: unknown,
    review?: { memberId?: string; testAccountId?: string; note: string },
  ) {
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
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cadreId,
      )
    )
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
    if (!(await this.db.cadre.findUnique({ where: { id: cadreId } })))
      throw new BadRequestException('Choose an existing cadre.');
    try {
      return await this.db.$transaction(
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
            data: {
              status: 'approved',
              reviewedAt: new Date(),
              reviewedByMemberId: review?.memberId,
              reviewedByTestAccountId: review?.testAccountId,
              reviewNote:
                review?.note ?? 'Reviewed using local administrator CLI.',
            },
          });
          return {
            ftcId: member.ftcId,
            message:
              'Member approved. They can now sign in with their submitted phone and OTP.',
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (['P2002', 'P2034'].includes(error.code) ||
          (error.code === 'P2010' &&
            ['40001', '40P01'].includes(
              String(
                error.meta?.code ??
                  (
                    error.meta?.driverAdapterError as
                      { cause?: { originalCode?: string } } | undefined
                  )?.cause?.originalCode,
              ),
            )))
      )
        throw new ConflictException(
          'Request or ID/phone changed during review. Refresh and check before retrying.',
        );
      throw error;
    }
  }
}
