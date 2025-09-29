import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({ summary: 'Get my profile' })
  @Get('me')
  async getMe(@GetUser() user: any) {
    try {
      console.log('hitted and user is:', user);
      const user_id = user.userId;

      const response = await this.profileService.getMe(user_id);

      return response;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user details',
      };
    }
  }

  @Post()
  create(@Body() createProfileDto: CreateProfileDto) {
    return this.profileService.create(createProfileDto);
  }

  @Get()
  findAll() {
    return this.profileService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.profileService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProfileDto: UpdateProfileDto) {
    return this.profileService.update(+id, updateProfileDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.profileService.remove(+id);
  }
}
