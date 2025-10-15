import { PrismaClient } from '@prisma/client';
import { SoftdeleteMiddleware } from './middleware/softdelete.middleware';

// Reusable singleton Prisma client for legacy static repositories to avoid spawning multiple connections.
const prisma = new PrismaClient({
  log: [],
});

if (process.env.PRISMA_ENV !== '1') {
  prisma.$use(SoftdeleteMiddleware);
}

export default prisma;
