[![npm version](https://badge.fury.io/js/nestjs-form-data.svg)](https://badge.fury.io/js/nestjs-form-data)
[![CI](https://github.com/dmitriy-nz/nestjs-form-data/actions/workflows/ci.yml/badge.svg)](https://github.com/dmitriy-nz/nestjs-form-data/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://img.shields.io/badge/License-MIT-green.svg)

# nestjs-form-data

An **object-oriented** approach to handling `multipart/form-data` in [NestJS](https://github.com/nestjs/nest). Uploaded files become typed class instances with built-in validation, automatic cleanup, and pluggable storage — no manual stream wiring required.

## Why nestjs-form-data?

NestJS ships with Multer-based file upload, but it works outside the DTO validation flow — you handle files through `@UploadedFile()` separately from `@Body()`, losing the single-source-of-truth that DTOs provide.

**nestjs-form-data** takes a different approach: files are **first-class properties on your DTO**. They arrive as typed objects (`MemoryStoredFile`, `FileSystemStoredFile`, or your own custom class), validated with the same decorators you already use for strings and numbers:

```ts
export class CreatePostDto {
  @IsString()
  title: string;

  @IsFile()
  @MaxFileSize(5e6)
  @HasMimeType(['image/jpeg', 'image/png'])
  cover: MemoryStoredFile;
}
```

No `@UploadedFile()`, no separate pipes, no manual cleanup. Just a DTO.

### Key features

- **Files as typed objects** — each uploaded file is an instance of a `StoredFile` class with properties like `size`, `mimeType`, `extension`, `originalName`, and a reliable `buffer` or `path`
- **Declarative validation** — validate file size, MIME type, and extension with decorators, including support for arrays (`{ each: true }`)
- **Reliable MIME detection** — uses [file-type](https://www.npmjs.com/package/file-type) to read the file's [magic number](https://en.wikipedia.org/wiki/Magic_number_(programming)#Magic_numbers_in_files), falling back to the content-type header only when needed
- **Nested objects** — fields with bracket notation (`photos[0][name]`) are parsed into proper nested structures
- **Pluggable storage** — choose `MemoryStoredFile` for speed, `FileSystemStoredFile` for large files, or extend `StoredFile` to write your own (S3, GCS, etc.)
- **Automatic cleanup** — temporary files are deleted after the request completes (configurable per success/failure)
- **Express and Fastify** support
- **NestJS 7 – 11** compatible

## Installation

```sh
npm install nestjs-form-data
```

This module requires `class-validator` and `class-transformer` as peer dependencies:

```sh
npm install class-validator class-transformer
```

Register a global validation pipe in `main.ts`:

```ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    transform: true, // recommended to avoid issues with file array transformations
  }),
);
```

Add the module to your application:

```ts
import { NestjsFormDataModule } from 'nestjs-form-data';

@Module({
  imports: [NestjsFormDataModule],
})
export class AppModule {}
```

## Quick start

Apply `@FormDataRequest()` to your controller method and define a DTO:

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { FormDataRequest, MemoryStoredFile, IsFile, MaxFileSize, HasMimeType } from 'nestjs-form-data';

class UploadAvatarDto {
  @IsFile()
  @MaxFileSize(1e6)
  @HasMimeType(['image/jpeg', 'image/png'])
  avatar: MemoryStoredFile;
}

@Controller('users')
export class UsersController {
  @Post('avatar')
  @FormDataRequest()
  uploadAvatar(@Body() dto: UploadAvatarDto) {
    // dto.avatar is a MemoryStoredFile instance
    console.log(dto.avatar.originalName); // "photo.jpg"
    console.log(dto.avatar.size);         // 94521
    console.log(dto.avatar.mimeType);     // "image/jpeg"
    console.log(dto.avatar.buffer);       // <Buffer ff d8 ff ...>
  }
}
```

That's it. The file is parsed, validated, and available as a typed object on your DTO.

## Fastify

Install [@fastify/multipart](https://www.npmjs.com/package/@fastify/multipart) and register it:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.register(multipart);
  await app.listen(3000);
}
```

Everything else works the same — DTOs, decorators, and storage types are platform-agnostic.

## File storage types

### Memory storage

```ts
avatar: MemoryStoredFile;
```

The file is loaded entirely into RAM as a `Buffer`. Fast, but not suitable for large files.

### File system storage

```ts
avatar: FileSystemStoredFile;
```

The file is written to a temporary directory on disk and available via `file.path` during request processing. Automatically deleted when the request completes.

### Custom storage

Extend the `StoredFile` abstract class to implement your own storage (e.g., stream directly to S3):

```ts
import { StoredFile } from 'nestjs-form-data';

export class S3StoredFile extends StoredFile {
  s3Key: string;
  size: number;

  static async create(meta, stream, config): Promise<S3StoredFile> {
    // upload stream to S3, return instance
  }

  async delete(): Promise<void> {
    // delete from S3
  }
}
```

Then use it: `@FormDataRequest({ storage: S3StoredFile })`

## Configuration

### Static

```ts
@Module({
  imports: [
    NestjsFormDataModule.config({
      storage: MemoryStoredFile,
      isGlobal: true,
      limits: {
        fileSize: 5e6, // 5 MB
        files: 10,
      },
    }),
  ],
})
export class AppModule {}
```

### Async

```ts
NestjsFormDataModule.configAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    storage: MemoryStoredFile,
    limits: {
      files: configService.get<number>('MAX_FILES'),
    },
  }),
  inject: [ConfigService],
});
```

You can also use `useClass` or `useExisting` patterns — see [NestJS async providers](https://docs.nestjs.com/fundamentals/async-providers) for details:

```ts
// useClass — creates a new instance
NestjsFormDataModule.configAsync({
  useClass: MyFormDataConfigService,
});

// useExisting — reuses an imported provider
NestjsFormDataModule.configAsync({
  imports: [MyConfigModule],
  useExisting: MyFormDataConfigService,
});
```

Where the config service implements:

```ts
export class MyFormDataConfigService implements NestjsFormDataConfigFactory {
  configAsync(): FormDataInterceptorConfig {
    return {
      storage: FileSystemStoredFile,
      fileSystemStoragePath: '/tmp/nestjs-fd',
    };
  }
}
```

### Method-level override

Override global config for a specific endpoint:

```ts
@Post('upload')
@FormDataRequest({ storage: FileSystemStoredFile })
upload(@Body() dto: UploadDto) {}
```

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage` | `Type<StoredFile>` | `MemoryStoredFile` | Storage class for uploaded files |
| `isGlobal` | `boolean` | `false` | Make the module available to all submodules |
| `fileSystemStoragePath` | `string` | `/tmp/nestjs-tmp-storage` | Temp directory for `FileSystemStoredFile` |
| `cleanupAfterSuccessHandle` | `boolean` | `true` | Delete files after successful request |
| `cleanupAfterFailedHandle` | `boolean` | `true` | Delete files after failed request |
| `awaitCleanup` | `boolean` | `true` | Wait for file cleanup before sending response. Set to `false` for faster responses (cleanup runs in the background) |
| `limits` | `object` | `{}` | [Busboy limits](https://www.npmjs.com/package/busboy#busboy-methods): `fileSize`, `files`, `fields`, `parts`, `headerPairs` |

## Validation decorators

All validators work with `{ each: true }` for arrays of files.

### @IsFile / @IsFiles

Checks if the value is an uploaded file (instance of `StoredFile`).

```ts
@IsFile()
avatar: MemoryStoredFile;

@IsFiles()
photos: MemoryStoredFile[];
```

### @MaxFileSize / @MinFileSize

File size constraints in bytes.

```ts
@MaxFileSize(5e6)          // max 5 MB
@MinFileSize(1024)         // min 1 KB
avatar: MemoryStoredFile;
```

### @HasMimeType

Validate MIME type. Supports exact strings, wildcard patterns, and regular expressions.

```ts
// exact match
@HasMimeType(['image/jpeg', 'image/png'])

// wildcard — matches any image type
@HasMimeType('image/*')

// regex
@HasMimeType([/image\/.*/])
```

MIME type detection priority:
1. **Magic number** (via [file-type](https://www.npmjs.com/package/file-type)) — reads binary data, reliable
2. **Content-Type header** (via [busboy](https://www.npmjs.com/package/busboy)) — client-provided, can be spoofed

To enforce that the MIME type comes from a specific source:

```ts
import { MetaSource } from 'nestjs-form-data';

@HasMimeType(['image/jpeg'], MetaSource.bufferMagicNumber)  // only trust magic number
```

Access the source at runtime via `file.mimeTypeWithSource`.

### @HasExtension

Validate file extension. Same source priority and strict mode as `@HasMimeType`.

```ts
@HasExtension(['jpg', 'png'])

// strict — only trust extension from magic number detection
@HasExtension(['jpg'], MetaSource.bufferMagicNumber)
```

Access the source at runtime via `file.extensionWithSource`.

## Examples

### Single file with FileSystemStoredFile

Controller:

```ts
import { FileSystemStoredFile, FormDataRequest } from 'nestjs-form-data';

@Controller()
export class NestjsFormDataController {
  @Post('load')
  @FormDataRequest({ storage: FileSystemStoredFile })
  getHello(@Body() testDto: FormDataTestDto): void {
    console.log(testDto);
  }
}
```

DTO:

```ts
import { FileSystemStoredFile, HasMimeType, IsFile, MaxFileSize } from 'nestjs-form-data';

export class FormDataTestDto {
  @IsFile()
  @MaxFileSize(1e6)
  @HasMimeType(['image/jpeg', 'image/png'])
  avatar: FileSystemStoredFile;
}
```

Send request (via Insomnia):

![image](https://user-images.githubusercontent.com/51157176/139556439-6b709fe8-8d62-41a2-9997-f9b7a2ff3d30.png)

### Array of files

DTO:

```ts
import { FileSystemStoredFile, HasMimeType, IsFiles, MaxFileSize } from 'nestjs-form-data';

export class FormDataTestDto {
  @IsFiles()
  @MaxFileSize(1e6, { each: true })
  @HasMimeType(['image/jpeg', 'image/png'], { each: true })
  avatars: FileSystemStoredFile[];
}
```

Send request (via Insomnia):

![image](https://user-images.githubusercontent.com/51157176/139556545-a8a1232d-3f1d-4325-9eff-98c294736d88.png)

### Mixed fields and files

```ts
export class CreateProductDto {
  @IsString()
  name: string;

  @IsNumber()
  @Type(() => Number)
  price: number;

  @IsFile()
  @MaxFileSize(5e6)
  @HasMimeType(['image/*'])
  image: MemoryStoredFile;
}
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
