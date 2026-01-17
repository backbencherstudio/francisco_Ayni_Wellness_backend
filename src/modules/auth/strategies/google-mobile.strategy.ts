import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleMobileStrategy extends PassportStrategy(
  CustomStrategy,
  'google-mobile',
) {
  private readonly client = new OAuth2Client();

  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const body: any = req?.body ?? {};
    const idToken: string | undefined =
      body.idToken ?? body.id_token ?? body.token ?? body.credential;

    if (!idToken || typeof idToken !== 'string') {
      throw new UnauthorizedException('idToken is required');
    }

    const audiences = [
      process.env.GOOGLE_ANDROID_APP_ID,
      process.env.GOOGLE_IOS_APP_ID,
      process.env.GOOGLE_MOBILE_APP_IDS,
    ]
      .filter(Boolean)
      .flatMap((v) =>
        String(v)
          .split(',')
          .map((s) => s.trim()),
      )
      .filter(Boolean);

    if (audiences.length === 0) {
      throw new UnauthorizedException(
        'Google client id (audience) is not configured',
      );
    }

    // GoogleMobileStrategy.validate()
    console.log('Google audiences:', audiences);
    console.log('Received idToken length:', idToken?.length);

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: audiences,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    console.log('Google payload:', {
      sub: payload.sub,
      email: payload.email,
      aud: payload.aud,
    });

    return this.authService.handleGoogleProfile({
      googleId: payload.sub,
      email: payload.email,
      firstName: (payload as any).given_name,
      lastName: (payload as any).family_name,
      avatar: (payload as any).picture,
    });
  }
}
