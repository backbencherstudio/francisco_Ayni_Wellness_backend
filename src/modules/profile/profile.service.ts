import { Injectable } from '@nestjs/common';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(user_id: any) {
    try {
      if (!user_id) {
        return { message: 'User not found', status: false };
      }

      const profile = await this.prisma.user.findUnique({
        where: { id: user_id },
        select: {
          id: true,
          email: true,
          name: true,
          created_at: true,
          updated_at: true,
          avatar: true,
        },
      });

      if (!profile) {
        return { message: 'Profile not found', status: false };
      }

      return {
        message: 'Profile fetched successfully',
        status: true,
        data: profile,
      };
    } catch (error) {
      return { message: 'Error fetching profile', status: false, error };
    }
  }

  create(createProfileDto: CreateProfileDto) {
    return 'This action adds a new profile';
  }

  findAll() {
    return `This action returns all profile`;
  }

  findOne(id: number) {
    return `This action returns a #${id} profile`;
  }

  update(id: number, updateProfileDto: UpdateProfileDto) {
    return `This action updates a #${id} profile`;
  }

  remove(id: number) {
    return `This action removes a #${id} profile`;
  }
}
