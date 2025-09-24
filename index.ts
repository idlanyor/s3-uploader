import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  tls: true,
});

const bucketName = process.env.S3_BUCKET_NAME || 'kanata-s3';

const app = new Elysia()
  .use(swagger({
    provider: 'swagger-ui',
    documentation: {
      info: {
        title: 'S3 Uploader API',
        version: '1.0.0',
        description: 'API untuk upload, delete, dan generate presigned URL untuk S3 storage dengan random hash filename generation'
      },
      servers: [
        {
          url: 'https://s3.antidonasi.web.id',
          description: 'Singapore(Main)'
        },
        {
          url: 'https://s3.kanata.web.id',
          description: 'Frankfurt(Backend)'
        },
        {
          url: 'http://localhost:3020',
          description: 'Development server'
        },

      ],
      tags: [
        { name: 'Upload', description: 'File upload operations' },
        { name: 'Delete', description: 'File deletion operations' },
        { name: 'Presigned URL', description: 'Presigned URL generation' },
        { name: 'Health', description: 'Health check endpoint' }
      ]
    }
  }))
  .get('/', async () => {
    const html = await Bun.file('./test.html').text();
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  })
  .post('/upload', async ({ body }: any) => {
    try {
      console.log('Upload request received');
      console.log('S3 Config:', {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        bucket: bucketName,
        forcePathStyle: true,
        tls: true
      });

      if (!body.file) {
        throw new Error('No file provided');
      }

      const file = body.file;
      const folder = body.folder || '';
      // Generate random hash for filename
      const fileExtension = file.name.split('.').pop() || '';
      const randomHash = randomBytes(16).toString('hex');
      const fileName = `${folder ? folder + '/' : ''}${randomHash}${fileExtension ? '.' + fileExtension : ''}`;

      console.log('File details:', {
        originalName: file.name,
        hashedName: fileName,
        size: file.size,
        type: file.type,
        randomHash: randomHash
      });

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: buffer,
        ContentType: file.type,
        ACL: 'public-read',
      });

      console.log('S3 Command:', {
        Bucket: bucketName,
        Key: fileName,
        ContentType: file.type,
        BodySize: buffer.length
      });

      await s3Client.send(command);

      const fileUrl = `${process.env.S3_ENDPOINT}/${bucketName}/${fileName}`;

      console.log('Upload successful:', { fileName, fileUrl });

      return {
        success: true,
        message: 'File uploaded successfully',
        data: {
          originalName: file.name,
          fileName,
          fileUrl,
          size: file.size,
          type: file.type,
          randomHash: randomHash,
        },
      };
    } catch (error) {
      console.error('Upload error:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        metadata: (error as any)?.$metadata,
        fault: (error as any)?.$fault,
        code: (error as any)?.Code,
        requestId: (error as any)?.RequestId
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }, {
    detail: {
      tags: ['Upload'],
      summary: 'Upload file to S3',
      description: 'Upload a file to S3 storage with random hash filename generation',
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description: 'File to upload'
                },
                folder: {
                  type: 'string',
                  description: 'Optional folder path (e.g., "documents/2024")',
                  example: 'documents/2024'
                }
              },
              required: ['file']
            }
          }
        }
      },
      responses: {
        '200': {
          description: 'File uploaded successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true
                  },
                  message: {
                    type: 'string',
                    example: 'File uploaded successfully'
                  },
                  data: {
                    type: 'object',
                    properties: {
                      originalName: {
                        type: 'string',
                        description: 'Original filename',
                        example: 'document.pdf'
                      },
                      fileName: {
                        type: 'string',
                        description: 'Hashed filename used in S3',
                        example: 'a1b2c3d4e5f6789012345678901234567.pdf'
                      },
                      fileUrl: {
                        type: 'string',
                        description: 'Public URL of uploaded file',
                        example: 'https://s3.nevaobjects.id/kanata-s3/a1b2c3d4e5f6789012345678901234567.pdf'
                      },
                      size: {
                        type: 'number',
                        description: 'File size in bytes',
                        example: 1024
                      },
                      type: {
                        type: 'string',
                        description: 'MIME type of the file',
                        example: 'application/pdf'
                      },
                      randomHash: {
                        type: 'string',
                        description: '32-character random hash used for filename',
                        example: 'a1b2c3d4e5f6789012345678901234567'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '400': {
          description: 'Bad request - No file provided',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  message: {
                    type: 'string',
                    example: 'No file provided'
                  }
                }
              }
            }
          }
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  message: {
                    type: 'string',
                    example: 'UnknownError'
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  .delete('/delete/:fileName', async ({ params }: { params: { fileName: string } }) => {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: params.fileName,
      });

      await s3Client.send(command);

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }, {
    detail: {
      tags: ['Delete'],
      summary: 'Delete file from S3',
      description: 'Delete a file from S3 storage by filename',
      parameters: [
        {
          name: 'fileName',
          in: 'path',
          required: true,
          schema: {
            type: 'string'
          },
          description: 'Name of the file to delete',
          example: 'a1b2c3d4e5f6789012345678901234567.pdf'
        }
      ],
      responses: {
        '200': {
          description: 'File deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true
                  },
                  message: {
                    type: 'string',
                    example: 'File deleted successfully'
                  }
                }
              }
            }
          }
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  message: {
                    type: 'string',
                    example: 'Delete failed'
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  .get('/presigned-url/:fileName', async ({ params }: { params: { fileName: string } }) => {
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: params.fileName,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return {
        success: true,
        data: {
          signedUrl,
          expiresIn: 3600,
        },
      };
    } catch (error) {
      console.error('Presigned URL error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate presigned URL',
      };
    }
  }, {
    detail: {
      tags: ['Presigned URL'],
      summary: 'Generate presigned URL',
      description: 'Generate a presigned URL for uploading a file directly to S3',
      parameters: [
        {
          name: 'fileName',
          in: 'path',
          required: true,
          schema: {
            type: 'string'
          },
          description: 'Name of the file for presigned URL',
          example: 'document.pdf'
        }
      ],
      responses: {
        '200': {
          description: 'Presigned URL generated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true
                  },
                  data: {
                    type: 'object',
                    properties: {
                      signedUrl: {
                        type: 'string',
                        description: 'Presigned URL for file upload',
                        example: 'https://s3.nevaobjects.id/kanata-s3/document.pdf?X-Amz-Algorithm=...'
                      },
                      expiresIn: {
                        type: 'number',
                        description: 'URL expiration time in seconds',
                        example: 3600
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  message: {
                    type: 'string',
                    example: 'Failed to generate presigned URL'
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }), {
    detail: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Check if the API is running and healthy',
      responses: {
        '200': {
          description: 'API is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    example: 'ok'
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                    example: '2024-01-01T12:00:00.000Z'
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  .listen(process.env.PORT || 3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);