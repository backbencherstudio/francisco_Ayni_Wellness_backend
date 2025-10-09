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

  // update profile
  @ApiOperation({ summary: 'Update my profile' })
  @Patch('me')
  async updateMe(
    @GetUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    try {
      const user_id = user.userId;

      const response = await this.profileService.updateMe(
        user_id,
        updateProfileDto,
      );
      return response;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update user details',
      };
    }
  }
  

  @ApiOperation({ summary: 'Profile overview metrics' })
  @Get('overview/me')
  async overview(@GetUser() user: any) {
    return this.profileService.overview(user.userId);
  }

  @ApiOperation({ summary: 'Unlocked achievements for the current user' })
  @Get('achievements/me')
  async achievements(@GetUser() user: any) {
    return this.profileService.achievedAchievements(user.userId);
  }
}
