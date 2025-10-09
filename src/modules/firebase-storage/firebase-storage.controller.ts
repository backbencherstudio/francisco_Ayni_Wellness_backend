import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FirebaseStorageService } from './firebase-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Firebase Storage')
@UseGuards(JwtAuthGuard)
@Controller('firebase')
export class FirebaseStorageController {
  constructor(private readonly storageService: FirebaseStorageService) {}

  @ApiOperation({ summary: 'List top-level folders in the Firebase bucket' })
  @Get('folders')
  async listFolders() {
    const folders = await this.storageService.listTopLevelFolders();
    return { success: true, folders };
  }

  @ApiOperation({ summary: 'List files under a given prefix (folder)' })
  @ApiQuery({ name: 'prefix', required: true })
  @Get('files')
  async listFiles(@Query('prefix') prefix: string) {
    if (!prefix) return { success: false, message: 'prefix query param required' };
    const files = await this.storageService.listPrefix(prefix);
    return { success: true, files };
  }

  @ApiOperation({ summary: 'Get a signed download URL for a file path' })
  @ApiQuery({ name: 'path', required: true })
  @ApiQuery({ name: 'expires', required: false, description: 'Expiry in seconds (default 3600)' })
  @Get('signed-url')
  async getSignedUrl(@Query('path') path: string, @Query('expires') expires?: string) {
    if (!path) return { success: false, message: 'path query param required' };
    const seconds = expires ? Math.min(Math.max(parseInt(expires, 10), 60), 60 * 60 * 24) : 3600;
    const url = await this.storageService.getFileSignedUrl(path, seconds);
    if (!url) return { success: false, message: 'File not found' };
    return { success: true, ...url };
  }
}
