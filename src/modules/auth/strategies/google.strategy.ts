import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import appConfig from '../../../config/app.config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {
    super({
      clientID: appConfig().auth.google.app_id,
      clientSecret: appConfig().auth.google.app_secret,
      callbackURL: appConfig().auth.google.callback,
      scope: ['email', 'profile', 'openid'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    // Normalize incoming fields
    const email: string | undefined = emails?.[0]?.value?.toLowerCase?.();
    const firstName: string | undefined = name?.givenName;
    const lastName: string | undefined = name?.familyName;
    const avatarUrl: string | undefined = photos?.[0]?.value;

    // Helper to derive a candidate username from profile
    const makeUsername = (): string | null => {
      const baseFromEmail = email?.split('@')?.[0];
      const base = (baseFromEmail || [firstName, lastName].filter(Boolean).join('')).toLowerCase();
      const sanitized = base.replace(/[^a-z0-9_\.\-]/g, '');
      return sanitized || null;
    };

    // 1) Try by google_id first
    let user = await this.prisma.user.findUnique({
      where: { google_id: id },
    });

    // 2) If not found, try by email and link google_id
    if (!user && email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (byEmail) {
        const enrichData: any = {
          // Only set google_id if not already linked
          google_id: byEmail.google_id ?? id,
          // Best-effort profile enrichment without overwriting existing values
          first_name: byEmail.first_name ?? firstName,
          last_name: byEmail.last_name ?? lastName,
          name:
            byEmail.name ??
            (([firstName, lastName].filter(Boolean).join(' ').trim()) || null),
          avatar: byEmail.avatar ?? avatarUrl,
        };

        // Propose a username only if user doesn't have one
        if (!byEmail.username) {
          const candidate = makeUsername();
          if (candidate) {
            enrichData.username = candidate;
          }
        }

        try {
          user = await this.prisma.user.update({
            where: { id: byEmail.id },
            data: enrichData,
          });
        } catch (e: any) {
          // If username is taken, retry without setting username
          if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('username')) {
            delete enrichData.username;
            user = await this.prisma.user.update({
              where: { id: byEmail.id },
              data: enrichData,
            });
          } else {
            throw e;
          }
        }
      }
    }

    // 3) If still not found, create a new user
    if (!user) {
      const baseData: any = {
        google_id: id,
        email: email,
        first_name: firstName,
        last_name: lastName,
        name: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
        avatar: avatarUrl,
      };

      const candidate = makeUsername();
      if (candidate) {
        baseData.username = candidate;
      }

      try {
        user = await this.prisma.user.create({ data: baseData });
      } catch (e: any) {
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('username')) {
          // Retry creation without username to avoid collision
          delete baseData.username;
          user = await this.prisma.user.create({ data: baseData });
        } else {
          throw e;
        }
      }
    }

    const loginResponse = await this.authService.googleLogin({
      email: user.email,
      userId: user.id,
    });

    done(null, { user, loginResponse });
  }
}
