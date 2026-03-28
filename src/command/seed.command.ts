// external imports
import { Command, CommandRunner } from 'nest-commander';
// internal imports
import appConfig from '../config/app.config';
import { StringHelper } from '../common/helper/string.helper';
import { UserRepository } from '../common/repository/user/user.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';

@Command({ name: 'seed', description: 'prisma db seed' })
export class SeedCommand extends CommandRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async run(passedParam: string[]): Promise<void> {
    await this.seed(passedParam);
  }

  async seed(param: string[]) {
    try {
      console.log(`Prisma Env: ${process.env.PRISMA_ENV}`);
      console.log('Seeding started...');

      // begin transaaction
      await this.prisma.$transaction(async ($tx) => {
        await this.roleSeed();
        await this.permissionSeed();
        await this.userSeed();
        await this.permissionRoleSeed();
        await this.subscriptionPlansSeed();
      });

      console.log('Seeding done.');
    } catch (error) {
      throw error;
    }
  }

  //---- user section ----
  async userSeed() {
    // system admin, create once then reuse on later seed runs
    const systemEmail = appConfig().defaultUser.system.email;
    let systemUser = await this.prisma.user.findFirst({
      where: { email: systemEmail },
      select: { id: true },
    });

    if (!systemUser) {
      systemUser = await UserRepository.createSuAdminUser({
        username: appConfig().defaultUser.system.username,
        email: systemEmail,
        password: appConfig().defaultUser.system.password,
      });
    }

    const existingRoleUser = await this.prisma.roleUser.findFirst({
      where: {
        user_id: systemUser.id,
        role_id: '1',
      },
      select: { role_id: true },
    });

    if (!existingRoleUser) {
      await this.prisma.roleUser.create({
        data: {
          user_id: systemUser.id,
          role_id: '1',
        },
      });
    }
  }

  async permissionSeed() {
    let i = 0;
    const permissions = [];
    const permissionGroups = [
      // (system level )super admin level permission
      { title: 'system_tenant_management', subject: 'SystemTenant' },
      // end (system level )super admin level permission
      { title: 'user_management', subject: 'User' },
      { title: 'role_management', subject: 'Role' },
      // Project
      { title: 'Project', subject: 'Project' },
      // Task
      {
        title: 'Task',
        subject: 'Task',
        scope: ['read', 'create', 'update', 'show', 'delete', 'assign'],
      },
      // Comment
      { title: 'Comment', subject: 'Comment' },
    ];

    for (const permissionGroup of permissionGroups) {
      if (permissionGroup['scope']) {
        for (const permission of permissionGroup['scope']) {
          permissions.push({
            id: String(++i),
            title: permissionGroup.title + '_' + permission,
            action: StringHelper.cfirst(permission),
            subject: permissionGroup.subject,
          });
        }
      } else {
        for (const permission of [
          'read',
          'create',
          'update',
          'show',
          'delete',
        ]) {
          permissions.push({
            id: String(++i),
            title: permissionGroup.title + '_' + permission,
            action: StringHelper.cfirst(permission),
            subject: permissionGroup.subject,
          });
        }
      }
    }

    await this.prisma.permission.createMany({
      data: permissions,
      skipDuplicates: true,
    });
  }

  async permissionRoleSeed() {
    const all_permissions = await this.prisma.permission.findMany();
    const su_admin_permissions = all_permissions.filter(function (permission) {
      return permission.title.substring(0, 25) == 'system_tenant_management_';
    });
    // const su_admin_permissions = all_permissions;

    // -----su admin permission---
    const adminPermissionRoleArray = [];
    for (const su_admin_permission of su_admin_permissions) {
      adminPermissionRoleArray.push({
        role_id: '1',
        permission_id: su_admin_permission.id,
      });
    }
    await this.prisma.permissionRole.createMany({
      data: adminPermissionRoleArray,
      skipDuplicates: true,
    });
    // -----------

    // ---admin---
    const project_admin_permissions = all_permissions.filter(
      function (permission) {
        return permission.title.substring(0, 25) != 'system_tenant_management_';
      },
    );

    const projectAdminPermissionRoleArray = [];
    for (const admin_permission of project_admin_permissions) {
      projectAdminPermissionRoleArray.push({
        role_id: '2',
        permission_id: admin_permission.id,
      });
    }
    await this.prisma.permissionRole.createMany({
      data: projectAdminPermissionRoleArray,
      skipDuplicates: true,
    });
    // -----------

    // ---project manager---
    const project_manager_permissions = all_permissions.filter(
      function (permission) {
        return (
          permission.title == 'project_read' ||
          permission.title == 'project_show' ||
          permission.title == 'project_update' ||
          permission.title.substring(0, 4) == 'Task' ||
          permission.title.substring(0, 7) == 'Comment'
        );
      },
    );

    const projectManagerPermissionRoleArray = [];
    for (const project_manager_permission of project_manager_permissions) {
      projectManagerPermissionRoleArray.push({
        role_id: '3',
        permission_id: project_manager_permission.id,
      });
    }
    await this.prisma.permissionRole.createMany({
      data: projectManagerPermissionRoleArray,
      skipDuplicates: true,
    });
    // -----------

    // ---member---
    const member_permissions = all_permissions.filter(function (permission) {
      return (
        permission.title == 'project_read' ||
        permission.title == 'project_show' ||
        permission.title == 'task_read' ||
        permission.title == 'task_show' ||
        permission.title == 'task_update' ||
        permission.title.substring(0, 7) == 'comment'
      );
    });

    const memberPermissionRoleArray = [];
    for (const project_manager_permission of member_permissions) {
      memberPermissionRoleArray.push({
        role_id: '4',
        permission_id: project_manager_permission.id,
      });
    }
    await this.prisma.permissionRole.createMany({
      data: memberPermissionRoleArray,
      skipDuplicates: true,
    });
    // -----------

    // ---viewer---
    const viewer_permissions = all_permissions.filter(function (permission) {
      return (
        permission.title == 'project_read' ||
        permission.title == 'project_show' ||
        permission.title == 'task_read' ||
        permission.title == 'comment_read'
      );
    });

    const viewerPermissionRoleArray = [];
    for (const viewer_permission of viewer_permissions) {
      viewerPermissionRoleArray.push({
        role_id: '5',
        permission_id: viewer_permission.id,
      });
    }
    await this.prisma.permissionRole.createMany({
      data: viewerPermissionRoleArray,
      skipDuplicates: true,
    });
    // -----------
  }

  async roleSeed() {
    await this.prisma.role.createMany({
      data: [
        // system role
        {
          id: '1',
          title: 'Super Admin', // system admin, do not assign to a tenant/user
          name: 'su_admin',
        },
        // organization role
        {
          id: '2',
          title: 'Admin',
          name: 'admin',
        },
        {
          id: '3',
          title: 'Project Manager',
          name: 'project_manager',
        },
        {
          id: '4',
          title: 'Member',
          name: 'member',
        },
        {
          id: '5',
          title: 'Viewer',
          name: 'viewer',
        },
      ],
      skipDuplicates: true,
    });
  }

  async subscriptionPlansSeed() {
    await this.trialPlanSeed();
    await this.monthlyPlanSeed();
    await this.yearlyPlanSeed();
  }

  async trialPlanSeed() {
    const trialDays = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || process.env.TRIAL_DAYS || 14);
    const normalizedTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 14;
    const currency = process.env.SEED_PLAN_CURRENCY || 'USD';

    await this.prisma.subsPlan.upsert({
      where: { slug: 'free_trial' },
      update: {
        name: 'Free Trial',
        description: `${normalizedTrialDays}-day free trial access`,
        price_description: `Free for ${normalizedTrialDays} days`,
        displayOrder: 1,
        isActive: true,
        isFree: true,
        price: 0,
        currency,
        interval: 'MONTH' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.TRIALING,
        appleProductId: null,
        googleProductId: null,
        googleBasePlanId: null,
        googleOfferId: null,
      },
      create: {
        name: 'Free Trial',
        slug: 'free_trial',
        description: `${normalizedTrialDays}-day free trial access`,
        price_description: `Free for ${normalizedTrialDays} days`,
        displayOrder: 1,
        isActive: true,
        isFree: true,
        price: 0,
        currency,
        interval: 'MONTH' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.TRIALING,
        appleProductId: null,
        googleProductId: null,
        googleBasePlanId: null,
        googleOfferId: null,
      },
    });
  }

  async monthlyPlanSeed() {
    const trialDays = Number(process.env.SEED_MONTHLY_TRIAL_DAYS || 0);
    const normalizedTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 0;
    const price = Number(process.env.SEED_MONTHLY_PRICE || 9.99);
    const normalizedPrice = Number.isFinite(price) && price >= 0 ? price : 9.99;
    const currency = process.env.SEED_PLAN_CURRENCY || 'USD';

    await this.prisma.subsPlan.upsert({
      where: { slug: 'premium_monthly' },
      update: {
        name: 'Premium Monthly',
        description: 'Full access to all premium features (Monthly)',
        price_description: `${normalizedPrice.toFixed(2)} ${currency} / month`,
        displayOrder: 10,
        isActive: true,
        isFree: false,
        price: normalizedPrice,
        currency,
        interval: 'MONTH' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.PREMIUM,
        appleProductId: this.normalizedOptional(process.env.SEED_APPLE_MONTHLY_PRODUCT_ID),
        googleProductId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_PRODUCT_ID),
        googleBasePlanId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_BASE_PLAN_ID),
        googleOfferId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_OFFER_ID),
      },
      create: {
        name: 'Premium Monthly',
        slug: 'premium_monthly',
        description: 'Full access to all premium features (Monthly)',
        price_description: `${normalizedPrice.toFixed(2)} ${currency} / month`,
        displayOrder: 10,
        isActive: true,
        isFree: false,
        price: normalizedPrice,
        currency,
        interval: 'MONTH' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.PREMIUM,
        appleProductId: this.normalizedOptional(process.env.SEED_APPLE_MONTHLY_PRODUCT_ID),
        googleProductId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_PRODUCT_ID),
        googleBasePlanId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_BASE_PLAN_ID),
        googleOfferId: this.normalizedOptional(process.env.SEED_GOOGLE_MONTHLY_OFFER_ID),
      },
    });
  }

  async yearlyPlanSeed() {
    const trialDays = Number(process.env.SEED_YEARLY_TRIAL_DAYS || 0);
    const normalizedTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 0;
    const price = Number(process.env.SEED_YEARLY_PRICE || 59.99);
    const normalizedPrice = Number.isFinite(price) && price >= 0 ? price : 59.99;
    const currency = process.env.SEED_PLAN_CURRENCY || 'USD';

    await this.prisma.subsPlan.upsert({
      where: { slug: 'premium_yearly' },
      update: {
        name: 'Premium Yearly',
        description: 'Full access to all premium features (Yearly)',
        price_description: `${normalizedPrice.toFixed(2)} ${currency} / year`,
        displayOrder: 20,
        isActive: true,
        isFree: false,
        price: normalizedPrice,
        currency,
        interval: 'YEAR' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.PREMIUM,
        appleProductId: this.normalizedOptional(process.env.SEED_APPLE_YEARLY_PRODUCT_ID),
        googleProductId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_PRODUCT_ID),
        googleBasePlanId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_BASE_PLAN_ID),
        googleOfferId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_OFFER_ID),
      },
      create: {
        name: 'Premium Yearly',
        slug: 'premium_yearly',
        description: 'Full access to all premium features (Yearly)',
        price_description: `${normalizedPrice.toFixed(2)} ${currency} / year`,
        displayOrder: 20,
        isActive: true,
        isFree: false,
        price: normalizedPrice,
        currency,
        interval: 'YEAR' as any,
        intervalCount: 1,
        trialDays: normalizedTrialDays,
        type: SubscriptionPlan.PREMIUM,
        appleProductId: this.normalizedOptional(process.env.SEED_APPLE_YEARLY_PRODUCT_ID),
        googleProductId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_PRODUCT_ID),
        googleBasePlanId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_BASE_PLAN_ID),
        googleOfferId: this.normalizedOptional(process.env.SEED_GOOGLE_YEARLY_OFFER_ID),
      },
    });
  }

  private normalizedOptional(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
