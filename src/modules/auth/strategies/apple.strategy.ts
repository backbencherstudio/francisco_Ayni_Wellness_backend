import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
// import { AppleStrategy } from 'passport-apple';
import { Strategy, VerifyCallback } from 'passport-apple';
import { AuthService } from '../auth.service';
const AppleStrategy = require('passport-apple');
import { PrismaService } from 'src/prisma/prisma.service';
import appConfig from '../../../config/app.config';

@Injectable()
export class AppleLoginStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {
    super({
      clientID: appConfig().auth.apple.client_id,
      teamID: appConfig().auth.apple.team_id,
      keyID: appConfig().auth.apple.key_id,
      privateKey: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      callbackURL: appConfig().auth.apple.callback,
      passReqToCallback: false,
      scope: ['name', 'email'],
      session: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    idToken: any,
    profile: any,
    done: Function,
  ) {
    console.log('--- Apple OAuth Validate Triggered ---');
    console.log('accessToken:', accessToken);
    console.log('refreshToken:', refreshToken);
    console.log('idToken:', idToken);
    console.log('profile:', profile);
    // Apple এর user info structure
    const { sub, email: rawEmail, aud } = idToken; // idToken থেকে মূল data
    const email = rawEmail?.toLowerCase?.();
    const firstName = profile?.name?.firstName || '';
    const lastName = profile?.name?.lastName || '';

    // 1) Try by apple_id first
    let user = await this.prisma.user.findUnique({
      where: { apple_id: sub },
    });

    // 2) If not found, try by email and link apple_id
    if (!user && email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        const enrichData: any = {
          apple_id: byEmail.apple_id ?? sub,
          first_name: byEmail.first_name ?? firstName,
          last_name: byEmail.last_name ?? lastName,
          name: byEmail.name ?? (([firstName, lastName].filter(Boolean).join(' ').trim()) || null),
          avatar: byEmail.avatar ?? '',
          // auto-verify email for social login
          email_verified_at: byEmail.email_verified_at ?? new Date(),
        };

        try {
          user = await this.prisma.user.update({ where: { id: byEmail.id }, data: enrichData });
        } catch (e: any) {
          // If username/email unique conflicts occur, retry without username/avatar
          if (e?.code === 'P2002') {
            delete enrichData.username;
            delete enrichData.avatar;
            user = await this.prisma.user.update({ where: { id: byEmail.id }, data: enrichData });
          } else {
            throw e;
          }
        }
      }
    }

    // 3) If still not found, create a new user
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          apple_id: sub,
          username: (firstName + lastName) || email,
          name: (firstName + ' ' + lastName).trim() || null,
          email: email,
          first_name: firstName || null,
          last_name: lastName || null,
          avatar: '', // Apple profile has no picture
          // auto-verify email for social login
          email_verified_at: new Date(),
        },
      });
    }

    const loginResponse = await this.authService.appleLogin({
      email,
      userId: user.id,
      aud, // Apple এর extra info
    });

    done(null, { user, loginResponse });
  }
}
