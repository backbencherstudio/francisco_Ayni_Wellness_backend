import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AppleAuthGuard extends AuthGuard('apple') {
     async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log('[AppleAuthGuard] Guard triggered'); // এখানে log দেখাবে
    const result = (await super.canActivate(context)) as boolean;
    console.log('[AppleAuthGuard] canActivate result:', result);
    return result;
  }
}
    