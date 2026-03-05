import { FormDataInterceptorConfig } from '../interfaces/FormDataInterceptorConfig';
import { MemoryStoredFile } from '../classes/storage/MemoryStoredFile';

export const DEFAULT_CONFIG: FormDataInterceptorConfig = {
  storage: MemoryStoredFile,
  cleanupAfterSuccessHandle: true,
  cleanupAfterFailedHandle: true,
  awaitCleanup: true,
  fileSystemStoragePath: '/tmp/nestjs-tmp-storage',
};
