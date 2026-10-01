import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { profileInput } from './profile-input.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { parseMemberQuery } from './member-query.js';

const summarySelect = {
  id: true,
  ftcId: true,
  name: true,
  section: true,
  cadre: { select: { id: true, name: true } },
  bcsBatch: true,
  homeDistrict: true,
} satisfies Prisma.MemberSelect;

@Injectable()
export class MembersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async updateOwn(memberId: string, body: unknown) {
    const data = profileInput(body);
    try {
      await this.prisma.member.update({
        where: { id: memberId, isActive: true },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'That WhatsApp contact is already used by another profile.',
          );
        if (error.code === 'P2025')
          throw new NotFoundException('Member not found.');
        if (error.code === 'P2004')
          throw new BadRequestException(
            'The profile does not meet the data rules.',
          );
      }
      throw error;
    }
    return this.detail(memberId);
  }

  async list(query: Record<string, unknown>) {
    const { where, page, pageSize, skip } = parseMemberQuery(query);
    const [total, items] = await this.prisma.$transaction(
      [
        this.prisma.member.count({ where }),
        this.prisma.member.findMany({
          where,
          select: summarySelect,
          orderBy: { ftcId: 'asc' },
          skip,
          take: pageSize,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async detail(id: string) {
    const member = await this.prisma.member.findFirst({
      where: { id, isActive: true },
      select: {
        ...summarySelect,
        education: true,
        university: true,
        phone: true,
        email: true,
        bloodGroup: true,
        aboutMe: true,
        favouriteQuotation: true,
      },
    });
    if (!member) throw new NotFoundException('Member not found.');
    // Storage keys, verification status, and internal timestamps stay private.
    return member;
  }

  async filters() {
    const [sections, cadres, batches, bloodGroups, districts] =
      await this.prisma.$transaction(
        [
          this.prisma.member.findMany({
            where: { isActive: true },
            select: { section: true },
            distinct: ['section'],
            orderBy: { section: 'asc' },
          }),
          this.prisma.cadre.findMany({
            where: { members: { some: { isActive: true } } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
          this.prisma.member.findMany({
            where: { isActive: true },
            select: { bcsBatch: true },
            distinct: ['bcsBatch'],
            orderBy: { bcsBatch: { sort: 'asc', nulls: 'last' } },
          }),
          this.prisma.member.findMany({
            where: { isActive: true },
            select: { bloodGroup: true },
            distinct: ['bloodGroup'],
            orderBy: { bloodGroup: 'asc' },
          }),
          this.prisma.member.findMany({
            where: { isActive: true },
            select: { homeDistrict: true },
            distinct: ['homeDistrict'],
            orderBy: { homeDistrict: 'asc' },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    return {
      sections: sections.map((item) => item.section),
      cadres,
      bcsBatches: batches.map((item) => item.bcsBatch),
      bloodGroups: bloodGroups.map((item) => item.bloodGroup),
      homeDistricts: districts.map((item) => item.homeDistrict),
    };
  }
}
