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
    const { sub, email, aud } = idToken; // idToken থেকে মূল data
    const firstName = profile?.name?.firstName || '';
    const lastName = profile?.name?.lastName || '';

    let user = await this.prisma.user.findUnique({
      where: { apple_id: sub },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          apple_id: sub, // database এ apple_id ফিল্ড
          username: firstName + lastName || email,
          name: firstName + lastName,
          email: email,
          first_name: firstName,
          last_name: lastName,
          avatar: '', // Apple profile এ picture নেই
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
