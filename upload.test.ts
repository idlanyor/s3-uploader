import { test, expect, describe, beforeAll, afterAll, mock, spyOn } from "bun:test";
import { Elysia } from "elysia";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Mock S3Client
const mockS3Send = mock(() => Promise.resolve({}));
const mockS3Client = {
  send: mockS3Send,
} as any;

// Mock the S3Client constructor
spyOn(S3Client.prototype, "send").mockImplementation(mockS3Send);

describe("S3 Upload File Tests", () => {
  let app: Elysia;
  let server: any;

  beforeAll(async () => {
    // Setup test environment
    process.env.S3_BUCKET_NAME = "test-bucket";
    process.env.S3_ACCESS_KEY = "test-access-key";
    process.env.S3_SECRET_KEY = "test-secret-key";
    process.env.S3_ENDPOINT = "https://test-endpoint.com";
    process.env.S3_REGION = "us-east-1";
    process.env.PORT = "3023";

    // Create test app with upload endpoint
    app = new Elysia()
      .post("/upload", async ({ body }: any) => {
        try {
          if (!body.file) {
            throw new Error('No file provided');
          }

          const file = body.file;
          const folder = body.folder || '';
          // Generate random hash for filename
          const fileExtension = file.name.split('.').pop() || '';
          const randomHash = require('crypto').randomBytes(16).toString('hex');
          const fileName = `${folder ? folder + '/' : ''}${randomHash}${fileExtension ? '.' + fileExtension : ''}`;

          // Simulate S3 upload
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const command = new PutObjectCommand({
            Bucket: "test-bucket",
            Key: fileName,
            Body: buffer,
            ContentType: file.type,
            ACL: 'public-read',
          });

          await mockS3Client.send(command);

          const fileUrl = `https://test-endpoint.com/test-bucket/${fileName}`;

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
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Upload failed',
          };
        }
      })
      .listen(3023);
  });

  afterAll(async () => {
    if (app) {
      app.stop();
    }
  });

  test("Should upload image file successfully", async () => {
    // Create test image file
    const imageContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
    const imageFile = new File([imageContent], "test-image.png", { 
      type: "image/png" 
    });

    const formData = new FormData();
    formData.append("file", imageFile);

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(true);
    expect(result.message).toBe("File uploaded successfully");
    expect(result.data.fileName).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(result.data.originalName).toBe("test-image.png");
    expect(result.data.randomHash).toMatch(/^[a-f0-9]{32}$/);
    expect(result.data.fileUrl).toMatch(/[a-f0-9]{32}\.png$/);
    expect(result.data.size).toBe(imageContent.length);
    expect(result.data.type).toBe("image/png");

    // Verify S3 client was called
    expect(mockS3Send).toHaveBeenCalled();
  });

  test("Should upload text file successfully", async () => {
    const textContent = "This is a test file content";
    const textFile = new File([textContent], "test.txt", { 
      type: "text/plain" 
    });

    const formData = new FormData();
    formData.append("file", textFile);

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(true);
    expect(result.data.fileName).toMatch(/^[a-f0-9]{32}\.txt$/);
    expect(result.data.originalName).toBe("test.txt");
    expect(result.data.randomHash).toMatch(/^[a-f0-9]{32}$/);
    expect(result.data.type).toContain("text/plain");
    expect(result.data.size).toBe(textContent.length);
  });

  test("Should upload file with folder structure", async () => {
    const fileContent = "Test content for folder upload";
    const file = new File([fileContent], "document.pdf", { 
      type: "application/pdf" 
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "documents/2024");

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(true);
    expect(result.data.fileName).toContain("documents/2024/");
    expect(result.data.fileName).toMatch(/^documents\/2024\/[a-f0-9]{32}\.pdf$/);
    expect(result.data.originalName).toBe("document.pdf");
    expect(result.data.randomHash).toMatch(/^[a-f0-9]{32}$/);
    expect(result.data.fileUrl).toContain("documents/2024/");
  });

  test("Should handle large file upload", async () => {
    // Create a 1MB test file
    const largeContent = new Uint8Array(1024 * 1024); // 1MB
    largeContent.fill(65); // Fill with 'A' character
    
    const largeFile = new File([largeContent], "large-file.bin", { 
      type: "application/octet-stream" 
    });

    const formData = new FormData();
    formData.append("file", largeFile);

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(true);
    expect(result.data.size).toBe(1024 * 1024);
    expect(result.data.fileName).toMatch(/^[a-f0-9]{32}\.bin$/);
    expect(result.data.originalName).toBe("large-file.bin");
    expect(result.data.randomHash).toMatch(/^[a-f0-9]{32}$/);
  });

  test("Should reject upload without file", async () => {
    const formData = new FormData();
    // No file attached

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(false);
    expect(result.message).toBe("No file provided");
  });

  test("Should handle S3 upload failure", async () => {
    // Mock S3 to throw error
    mockS3Send.mockRejectedValueOnce(new Error("S3 connection failed"));

    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(200);
    
    const result = await response.json() as any;
    expect(result.success).toBe(false);
    expect(result.message).toBe("S3 connection failed");

    // Reset mock for other tests
    mockS3Send.mockResolvedValue({});
  });

  test("Should generate unique filenames", async () => {
    const file1 = new File(["content1"], "same-name.txt", { type: "text/plain" });
    const file2 = new File(["content2"], "same-name.txt", { type: "text/plain" });

    // Upload first file
    const formData1 = new FormData();
    formData1.append("file", file1);
    const response1 = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData1
    });
    const result1 = await response1.json() as any;

    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Upload second file
    const formData2 = new FormData();
    formData2.append("file", file2);
    const response2 = await fetch("http://localhost:3023/upload", {
      method: "POST",
      body: formData2
    });
    const result2 = await response2.json() as any;

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.data.fileName).not.toBe(result2.data.fileName);
    expect(result1.data.fileName).toMatch(/^[a-f0-9]{32}\.txt$/);
    expect(result2.data.fileName).toMatch(/^[a-f0-9]{32}\.txt$/);
    expect(result1.data.originalName).toBe("same-name.txt");
    expect(result2.data.originalName).toBe("same-name.txt");
    expect(result1.data.randomHash).not.toBe(result2.data.randomHash);
  });

  test("Should preserve file content type", async () => {
    const testCases = [
      { content: "test", name: "test.json", type: "application/json" },
      { content: "test", name: "test.xml", type: "application/xml" },
      { content: "test", name: "test.csv", type: "text/csv" },
      { content: new Uint8Array([255, 216, 255]), name: "test.jpg", type: "image/jpeg" }
    ];

    for (const testCase of testCases) {
      const file = new File([testCase.content], testCase.name, { 
        type: testCase.type 
      });
      
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:3023/upload", {
        method: "POST",
        body: formData
      });

      const result = await response.json() as any;
      expect(result.success).toBe(true);
      expect(result.data.type).toContain(testCase.type);
    }
  });
});