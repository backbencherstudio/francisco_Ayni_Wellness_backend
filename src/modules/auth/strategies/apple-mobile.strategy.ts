import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import appConfig from '../../../config/app.config';
import { AuthService } from '../auth.service';

const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);

@Injectable()
export class AppleMobileStrategy extends PassportStrategy(
  CustomStrategy,
  'apple-mobile',
) {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const body: any = req?.body ?? {};
    const identityToken: string | undefined =
      body.identityToken ?? body.identity_token ?? body.idToken;

    if (!identityToken || typeof identityToken !== 'string') {
      throw new UnauthorizedException('identityToken is required');
    }

    const latitudeRaw = body.latitude ?? req.headers['x-latitude'];
    const longitudeRaw = body.longitude ?? req.headers['x-longitude'];
    const latitude =
      latitudeRaw === undefined ? undefined : Number.parseFloat(String(latitudeRaw));
    const longitude =
      longitudeRaw === undefined ? undefined : Number.parseFloat(String(longitudeRaw));

    const audiences = [
      appConfig().auth.apple.client_id,
      process.env.APPLE_MOBILE_CLIENT_IDS,
    ]
      .filter(Boolean)
      .flatMap((v) => String(v).split(',').map((s) => s.trim()))
      .filter(Boolean);

    if (audiences.length === 0) {
      throw new UnauthorizedException('Apple client id (audience) is not configured');
    }

    // Verify Apple JWT signature + standard claims
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience: audiences,
    });

    const appleId = payload.sub;
    if (!appleId || typeof appleId !== 'string') {
      throw new UnauthorizedException('Invalid Apple token');
    }

    // Apple only returns email on first authorization; allow request body as fallback
    const emailFromToken =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
    const emailFromBody =
      typeof body.email === 'string' ? body.email.toLowerCase() : undefined;

    return this.authService.handleAppleProfile({
      appleId,
      email: emailFromToken ?? emailFromBody,
      firstName: typeof body.firstName === 'string' ? body.firstName : undefined,
      lastName: typeof body.lastName === 'string' ? body.lastName : undefined,
      latitude,
      longitude,
    });
  }
}
