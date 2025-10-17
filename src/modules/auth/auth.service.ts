// external imports
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

//internal imports
import appConfig from '../../config/app.config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from '../../common/repository/user/user.repository';
import { MailService } from '../../mail/mail.service';
import { UcodeRepository } from '../../common/repository/ucode/ucode.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { SazedStorage } from '../../common/lib/Disk/SazedStorage';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import { StringHelper } from '../../common/helper/string.helper';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async me(userId: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          address: true,
          phone_number: true,
          type: true,
          gender: true,
          date_of_birth: true,
          created_at: true,
          email_verified_at: true,
          updated_at: true,
          billing_id: true,
          IsSubscriptionActive: true,
          role_users: true,
          subscriptions: { select: { id: true, status: true, end_date: true } },
        },
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      if (user.avatar) {
        user['avatar_url'] = SazedStorage.url(
          appConfig().storageUrl.avatar + user.avatar,
        );
      }

      if (user) {
        return {
          success: true,
          data: user,
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    image?: Express.Multer.File,
  ) {
    try {
      const data: any = {};

      console.log('hit in the update user service');

      // Update user data fields if provided
      if (updateUserDto.name) {
        data.name = updateUserDto.name;
      }

      if (image) {
        const fileName = `${StringHelper.randomString()}${image.originalname}`;
        try {
          // Attempt upload first to avoid deleting old before success
          await SazedStorage.put(
            appConfig().storageUrl.avatar + fileName,
            image.buffer,
          );

          const mediaUrl =
            process.env.AWS_S3_ENDPOINT +
            '/' +
            process.env.AWS_S3_BUCKET +
            appConfig().storageUrl.avatar +
            `/${fileName}`;

          // delete old image from storage only after successful upload
          const oldImage = await this.prisma.user.findFirst({
            where: { id: userId },
            select: { avatar: true },
          });

          if (oldImage?.avatar) {
            try {
              await SazedStorage.delete(
                appConfig().storageUrl.avatar + oldImage.avatar,
              );
            } catch (e) {
              console.warn('Failed to delete old avatar:', e?.message || e);
            }
          }

          data.avatar = mediaUrl;
          console.log('Avatar uploaded to:', mediaUrl);
        } catch (e) {
          console.warn('Avatar upload failed:', e?.message || e);
        }
      }
      const user = await UserRepository.getUserDetails(userId);
      if (user) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...data,
          },
        });

        return {
          success: true,
          message: 'User updated successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async validateUser(
    email: string,
    pass: string,
    token?: string,
  ): Promise<any> {
    const _password = pass;
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });

    if (user) {
      const _isValidPassword = await UserRepository.validatePassword({
        email: email,
        password: _password,
      });
      if (_isValidPassword) {
        const { password, ...result } = user;
        if (user.is_two_factor_enabled) {
          if (token) {
            const isValid = await UserRepository.verify2FA(user.id, token);
            if (!isValid) {
              throw new UnauthorizedException('Invalid token');
              // return {
              //   success: false,
              //   message: 'Invalid token',
              // };
            }
          } else {
            throw new UnauthorizedException('Token is required');
            // return {
            //   success: false,
            //   message: 'Token is required',
            // };
          }
        }
        return result;
      } else {
        throw new UnauthorizedException('Password not matched');
        // return {
        //   success: false,
        //   message: 'Password not matched',
        // };
      }
    } else {
      throw new UnauthorizedException('Email not found');
      // return {
      //   success: false,
      //   message: 'Email not found',
      // };
    }
  }

  async login({ email, userId }) {
    try {
      const payload = { email: email, sub: userId };

      const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      const user = await UserRepository.getUserDetails(userId);

      // store refreshToken
      await this.redis.set(
        `refresh_token:${user.id}`,
        refreshToken,
        'EX',
        60 * 60 * 24 * 7, // 7 days in seconds
      );

      // Check active subscription
      const [activeSubscription, activeTrial, anyTrial] = await Promise.all([
        this.prisma.subscription.findFirst({
          where: {
            user_id: user.id,
            status: 'active',
            OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
            NOT: { plan_name: 'trial' },
          },
        }),
        this.prisma.subscription.findFirst({
          where: {
            user_id: user.id,
            status: 'active',
            plan_name: 'trial',
            end_date: { gt: new Date() },
          },
        }),
        this.prisma.subscription.findFirst({
          where: { user_id: user.id, plan_name: 'trial' },
          select: { id: true },
        }),
      ]);

      const trial_active = !!activeTrial;
      const trial_ends_at = activeTrial?.end_date?.toISOString();
      const trial_days_remaining = trial_active
        ? Math.ceil(
            (activeTrial!.end_date!.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;
      const trial_available = !trial_active && !activeSubscription && !anyTrial;

      return {
        success: true,
        message: 'Logged in successfully',
        authorization: {
          type: 'bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
        },
        type: user.type,
        subscription_active: !!activeSubscription,
        subscription_required: !activeSubscription && !trial_active,
        redirect:
          !activeSubscription && !trial_active ? '/subscription' : undefined,
        trial_active,
        trial_days_remaining,
        trial_ends_at,
        trial_available,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // google log in using passport.js
  async googleLogin({ email, userId }: { email: string; userId: string }) {
    try {
      const payload = { email: email, sub: userId };

      const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      const user = await UserRepository.getUserDetails(userId);

      await this.redis.set(
        `refresh_token:${user.id}`,
        refreshToken,
        'EX',
        60 * 60 * 24 * 7,
      );

      // create stripe customer account id
      try {
        const stripeCustomer = await StripePayment.createCustomer({
          user_id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        });

        if (stripeCustomer) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { billing_id: stripeCustomer.id },
          });
        }
      } catch (error) {
        return {
          success: false,
          message: 'User created but failed to create billing account',
        };
      }

      return {
        message: 'Logged in successfully',
        authorization: {
          type: 'bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
        },
        type: user.type,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // apple log in using passport.js
  async appleLogin({
    email,
    userId,
    aud,
  }: {
    email: string;
    userId: string;
    aud: string;
  }) {
    try {
      const payload = { email, sub: userId, aud };

      const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      const user = await UserRepository.getUserDetails(userId);

      await this.redis.set(
        `refresh_token:${user.id}`,
        refreshToken,
        'EX',
        60 * 60 * 24 * 7,
      );

      // create stripe customer account id
      try {
        const stripeCustomer = await StripePayment.createCustomer({
          user_id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        });

        if (stripeCustomer) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { billing_id: stripeCustomer.id },
          });
        }
      } catch (error) {
        return {
          success: false,
          message: 'User created but failed to create billing account',
        };
      }

      return {
        message: 'Logged in successfully',
        authorization: {
          type: 'bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
        },
        type: user.type,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async refreshToken(user_id: string, refreshToken: string) {
    try {
      const storedToken = await this.redis.get(`refresh_token:${user_id}`);

      if (!storedToken || storedToken != refreshToken) {
        return {
          success: false,
          message: 'Refresh token is required',
        };
      }

      if (!user_id) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      const userDetails = await UserRepository.getUserDetails(user_id);
      if (!userDetails) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      const payload = { email: userDetails.email, sub: userDetails.id };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });

      return {
        success: true,
        authorization: {
          type: 'bearer',
          access_token: accessToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async revokeRefreshToken(user_id: string) {
    try {
      const storedToken = await this.redis.get(`refresh_token:${user_id}`);
      if (!storedToken) {
        return {
          success: false,
          message: 'Refresh token not found',
        };
      }

      await this.redis.del(`refresh_token:${user_id}`);

      return {
        success: true,
        message: 'Refresh token revoked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async register({
    name,
    email,
    password,
    type,
  }: {
    name: string;
    email: string;
    password: string;
    type?: string;
    agree_to_terms?: boolean;
  }) {
    try {
      // Check if email already exist
      const userEmailExist = await UserRepository.exist({
        field: 'email',
        value: String(email),
      });

      if (userEmailExist) {
        return {
          statusCode: 401,
          message: 'Email already exist',
        };
      }

      const user = await UserRepository.createUser({
        name: name,
        email: email,
        password: password,
        type: type,
      });

      if (!user || user.success === false) {
        return {
          success: false,
          message: 'Failed to create account',
        };
      }

      // create stripe customer account
      const stripeCustomer = await StripePayment.createCustomer({
        user_id: user.data.id,
        email: email,
        name: name,
      });

      if (stripeCustomer) {
        await this.prisma.user.update({
          where: {
            id: user.data.id,
          },
          data: {
            billing_id: stripeCustomer.id,
          },
        });
      }

      // Generate verification token
      const token = await UcodeRepository.createVerificationToken({
        userId: user.data.id,
        email: email,
      });

      // Send verification email with token
      await this.mailService.sendVerificationLink({
        email,
        name: email,
        token: token.token,
        type: type,
      });

      // New users will not have subscription yet; signal requirement
      return {
        success: true,
        message: 'We have sent a verification link to your email',
        subscription_active: false,
        subscription_required: true,
        redirect: '/subscription',
        trial_active: false,
        trial_days_remaining: 0,
        trial_ends_at: null,
        trial_available: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async forgotPassword(email) {
    try {
      const user = await UserRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        const token = await UcodeRepository.createToken({
          userId: user.id,
          isOtp: true,
        });

        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent an OTP code to your email',
        };
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // verify otp
  async verifyOtp({ email, otp }) {
    try {
      const user = await UserRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        const existToken = await UcodeRepository.validateToken({
          email: email,
          token: otp,
        });

        if (existToken) {
          return {
            success: true,
            message: 'OTP verified successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid OTP',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async resetPassword({ email, token, password }) {
    try {
      const user = await UserRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        const existToken = await UcodeRepository.validateToken({
          email: email,
          token: token,
        });

        if (existToken) {
          await UserRepository.changePassword({
            email: email,
            password: password,
          });

          // delete otp code
          await UcodeRepository.deleteToken({
            email: email,
            token: token,
          });

          return {
            success: true,
            message: 'Password updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async verifyEmail({ email, token }) {
    try {
      const user = await UserRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        const existToken = await UcodeRepository.validateToken({
          email: email,
          token: token,
        });

        if (existToken) {
          await this.prisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              email_verified_at: new Date(Date.now()),
            },
          });

          // delete otp code
          // await UcodeRepository.deleteToken({
          //   email: email,
          //   token: token,
          // });

          return {
            success: true,
            message: 'Email verified successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async resendVerificationEmail(email: string) {
    try {
      const user = await UserRepository.getUserByEmail(email);

      if (user) {
        // create otp code
        const token = await UcodeRepository.createToken({
          userId: user.id,
          isOtp: true,
        });

        // send otp code to email
        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent a verification code to your email',
        };
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async changePassword({ user_id, oldPassword, newPassword }) {
    try {
      const user = await UserRepository.getUserDetails(user_id);

      // console.log("param", user_id, oldPassword, newPassword)
      // console.log("user", user)

      if (user) {
        const _isValidPassword = await UserRepository.validatePassword({
          email: user.email,
          password: oldPassword,
        });

        if (_isValidPassword) {
          await UserRepository.changePassword({
            email: user.email,
            password: newPassword,
          });

          return {
            success: true,
            message: 'Password updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid password',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async requestEmailChange(user_id: string, email: string) {
    try {
      const user = await UserRepository.getUserDetails(user_id);

      if (user) {
        const token = await UcodeRepository.createToken({
          userId: user.id,
          isOtp: true,
          email: email,
        });

        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: email,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent an OTP code to your email',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async changeEmail({
    user_id,
    new_email,
    token,
  }: {
    user_id: string;
    new_email: string;
    token: string;
  }) {
    try {
      const user = await UserRepository.getUserDetails(user_id);

      console.log('params', user_id, new_email, token);

      if (user) {
        const existToken = await UcodeRepository.validateToken({
          email: user.email,
          token: token,
          forEmailChange: true,
        });
        // console.log("existToken", existToken);

        if (existToken) {
          await UserRepository.changeEmail({
            user_id: user.id,
            new_email: new_email,
          });

          // delete otp code
          await UcodeRepository.deleteToken({
            email: new_email,
            token: token,
          });

          return {
            success: true,
            message: 'Email updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // --------- 2FA ---------
  async generate2FASecret(user_id: string) {
    try {
      return await UserRepository.generate2FASecret(user_id);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async verify2FA(user_id: string, token: string) {
    try {
      const isValid = await UserRepository.verify2FA(user_id, token);
      if (!isValid) {
        return {
          success: false,
          message: 'Invalid token',
        };
      }
      return {
        success: true,
        message: '2FA verified successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async enable2FA(user_id: string) {
    try {
      const user = await UserRepository.getUserDetails(user_id);
      if (user) {
        await UserRepository.enable2FA(user_id);
        return {
          success: true,
          message: '2FA enabled successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async disable2FA(user_id: string) {
    try {
      const user = await UserRepository.getUserDetails(user_id);
      if (user) {
        await UserRepository.disable2FA(user_id);
        return {
          success: true,
          message: '2FA disabled successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  // --------- end 2FA ---------
}
