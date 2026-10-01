import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembersService } from './members.service.js';
import { DirectoryAccessGuard } from './directory-access.guard.js';

@Controller('members')
@UseGuards(DirectoryAccessGuard)
export class MembersController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: Record<string, unknown>) {
    return this.members.list(query);
  }

  @Get('filters')
  @Header('Cache-Control', 'no-store')
  filters() {
    return this.members.filters();
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.members.detail(id);
  }
}
