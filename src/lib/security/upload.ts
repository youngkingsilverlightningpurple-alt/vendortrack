/**
 * @fileoverview File Upload Security
 *
 * Validates all file uploads against:
 *   - File size limits
 *   - MIME type allowlists
 *   - File extension allowlists
 *   - Magic byte (file signature) verification
 *   - Filename sanitization (randomized filenames)
 *   - Virus scanning hook (pluggable)
 *
 * OWASP: A04:2021 — Insecure Design
 * OWASP: A03:2021 — Injection (file upload as injection vector)
 *
 * IMPORTANT: File uploads are not currently implemented in VendorTrack,
 * but this module provides the security infrastructure for when they are.
 * Product images currently use external URLs.
 */

import { randomBytes } from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('upload-security');

// ============================================================
// CONFIGURATION
// ============================================================

export interface UploadConfig {
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Allowed MIME types */
  allowedMimeTypes: string[];
  /** Allowed file extensions (lowercase, without dot) */
  allowedExtensions: string[];
  /** Whether to verify magic bytes */
  verifyMagicBytes: boolean;
  /** Whether to randomize filenames */
  randomizeFilenames: boolean;
  /** Maximum filename length */
  maxFilenameLength: number;
}

/**
 * Default upload configuration for product images.
 */
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ],
  allowedExtensions: [
    'jpg', 'jpeg', 'png', 'webp', 'gif',
  ],
  verifyMagicBytes: true,
  randomizeFilenames: true,
  maxFilenameLength: 255,
};

/**
 * Upload configuration for document files.
 */
export const DOCUMENT_UPLOAD_CONFIG: UploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  allowedExtensions: [
    'pdf', 'xls', 'xlsx',
  ],
  verifyMagicBytes: true,
  randomizeFilenames: true,
  maxFilenameLength: 255,
};

// ============================================================
// MAGIC BYTE SIGNATURES
// ============================================================

/**
 * File magic bytes (file signatures) for common image types.
 * These verify the ACTUAL file type, not just the declared MIME type.
 *
 * Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
 */
const FILE_SIGNATURES: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  'image/jpeg': [
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF] }, // JPEG SOI marker
  ],
  'image/png': [
    { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }, // PNG signature
  ],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  ],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    // Note: WebP also has WEBP at offset 8, but RIFF is sufficient for initial check
  ],
  'application/pdf': [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
};

/**
 * Verify that a file's magic bytes match its declared MIME type.
 * This prevents MIME type spoofing (e.g., a .exe renamed to .jpg).
 */
export function verifyMagicBytes(
  fileBuffer: ArrayBuffer,
  declaredMimeType: string
): boolean {
  const signatures = FILE_SIGNATURES[declaredMimeType];
  if (!signatures) {
    // Unknown MIME type — cannot verify magic bytes
    log.warn('No magic byte signatures for MIME type', {
      action: 'magic_byte_unknown',
      data: { mimeType: declaredMimeType },
    });
    return true; // Allow if we don't have signatures (conservative)
  }

  const bytes = new Uint8Array(fileBuffer);

  for (const sig of signatures) {
    if (bytes.length < sig.offset + sig.bytes.length) {
      return false; // File too short to contain signature
    }

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) return true;
  }

  return false;
}

// ============================================================
// FILE VALIDATION
// ============================================================

export interface UploadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedFilename?: string;
}

/**
 * Validate a file upload against security rules.
 *
 * @param file - The File object from the upload
 * @param config - Upload configuration
 * @returns Validation result with errors/warnings
 */
export async function validateFileUpload(
  file: {
    name: string;
    size: number;
    type: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  },
  config: UploadConfig = DEFAULT_UPLOAD_CONFIG
): Promise<UploadValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check file size
  if (file.size > config.maxFileSize) {
    const maxSizeMB = (config.maxFileSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    errors.push(`File size (${fileSizeMB} MB) exceeds maximum (${maxSizeMB} MB)`);
  }

  // 2. Check file size is not zero
  if (file.size === 0) {
    errors.push('File is empty');
  }

  // 3. Check MIME type
  if (file.type && !config.allowedMimeTypes.includes(file.type)) {
    errors.push(`File type "${file.type}" is not allowed. Allowed types: ${config.allowedMimeTypes.join(', ')}`);
  }

  // 4. Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !config.allowedExtensions.includes(extension)) {
    errors.push(`File extension ".${extension || 'none'}" is not allowed. Allowed extensions: ${config.allowedExtensions.join(', ')}`);
  }

  // 5. Verify MIME type matches extension
  if (extension && file.type) {
    const mimeExtMap: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'image/webp': ['webp'],
      'application/pdf': ['pdf'],
    };
    const expectedExtensions = mimeExtMap[file.type];
    if (expectedExtensions && !expectedExtensions.includes(extension)) {
      warnings.push(`File extension ".${extension}" does not match MIME type "${file.type}"`);
    }
  }

  // 6. Verify magic bytes (if file content is available)
  if (config.verifyMagicBytes && file.arrayBuffer && file.type) {
    try {
      const buffer = await file.arrayBuffer();
      const magicBytesValid = verifyMagicBytes(buffer, file.type);
      if (!magicBytesValid) {
        errors.push('File content does not match declared file type. The file may be corrupted or disguised.');
      }
    } catch {
      warnings.push('Could not verify file signature (magic bytes check failed)');
    }
  }

  // 7. Sanitize filename
  const sanitizedFilename = config.randomizeFilenames
    ? generateSafeFilename(file.name, extension)
    : sanitizeFilename(file.name, config.maxFilenameLength);

  // 8. Check for double extensions (e.g., image.jpg.exe)
  const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
  if (nameWithoutExt.includes('.')) {
    const innerExt = nameWithoutExt.split('.').pop()?.toLowerCase();
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'ps1', 'sh', 'php', 'jsp', 'asp', 'aspx', 'py', 'rb', 'pl', 'cgi', 'svg', 'js', 'html', 'htm'];
    if (innerExt && dangerousExtensions.includes(innerExt)) {
      errors.push(`File has a dangerous double extension (.${innerExt}.${extension})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedFilename,
  };
}

// ============================================================
// FILENAME SANITIZATION
// ============================================================

/**
 * Generate a random, safe filename while preserving the extension.
 * This prevents:
 *   - Path traversal (../../../etc/passwd)
 *   - Filename collisions
 *   - Predictable filenames
 */
export function generateSafeFilename(
  originalName: string,
  extension?: string
): string {
  const ext = extension || originalName.split('.').pop()?.toLowerCase() || 'bin';
  const randomId = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${timestamp}_${randomId}.${ext}`;
}

/**
 * Sanitize a filename without randomizing it.
 * Removes path traversal and special characters.
 */
export function sanitizeFilename(
  filename: string,
  maxLength: number = 255
): string {
  if (!filename || typeof filename !== 'string') return 'unnamed';

  return filename
    // Remove path separators
    .replace(/[\/\\]/g, '_')
    // Remove path traversal sequences
    .replace(/\.\./g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove special characters except alphanumeric, dash, underscore, dot
    .replace(/[^a-zA-Z0-9\-_.]/g, '_')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '')
    // Trim to max length
    .substring(0, maxLength);
}

// ============================================================
// VIRUS SCANNING HOOK
// ============================================================

/**
 * Virus scanning interface.
 * Implement this interface to integrate with a virus scanning service
 * (e.g., ClamAV, VirusTotal, AWS S3 virus scanning).
 */
export interface VirusScanner {
  scan(buffer: ArrayBuffer, filename: string): Promise<{
    clean: boolean;
    threats?: string[];
    scanId?: string;
  }>;
}

/**
 * Default virus scanner — REJECTS files in production when no real scanner is configured.
 * SECURITY: In production, files are REJECTED unless a real scanner is set via setVirusScanner().
 * This prevents malicious files from being accepted without scanning.
 *
 * To enable file uploads in production, configure a real scanner:
 *   setVirusScanner(clamavScanner);  // or VirusTotal, AWS S3 scanning, etc.
 */
export const defaultVirusScanner: VirusScanner = {
  async scan(buffer: ArrayBuffer, filename: string) {
    // SECURITY: In production WITHOUT a real scanner, REJECT all files.
    // This is fail-safe: no file gets through without scanning.
    if (process.env.NODE_ENV === 'production') {
      console.error(
        `[SECURITY] No virus scanner configured — file "${filename}" was REJECTED. ` +
        'Call setVirusScanner() with a real implementation before accepting user uploads.'
      );
      return { clean: false, threats: ['No virus scanner configured — upload blocked for safety'] };
    }
    // In non-production (dev/test), allow through with a warning
    console.warn(
      `[SECURITY] No virus scanner configured — file "${filename}" was NOT scanned (dev/test only).`
    );
    return { clean: true };
  },
};

/**
 * Set a custom virus scanner implementation.
 * Call this at application startup with your virus scanning service.
 */
let activeVirusScanner: VirusScanner = defaultVirusScanner;

export function setVirusScanner(scanner: VirusScanner): void {
  activeVirusScanner = scanner;
}

/**
 * Scan a file for viruses using the configured scanner.
 */
export async function scanForViruses(
  buffer: ArrayBuffer,
  filename: string
): Promise<{ clean: boolean; threats?: string[]; scanId?: string }> {
  try {
    return await activeVirusScanner.scan(buffer, filename);
  } catch (error) {
    log.error('Virus scan failed', { action: 'virus_scan_error' }, error);
    // Fail-safe: reject the file if scanning fails
    return { clean: false, threats: ['Virus scan failed'] };
  }
}

// ============================================================
// IMAGE URL VALIDATION
// ============================================================

/**
 * Validate an image URL (used when product images are external URLs).
 * Prevents SSRF and open redirect attacks through image URLs.
 */
export function validateImageURL(url: string): { valid: boolean; reason?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'Image URL is required' };
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS (and HTTP in development)
    if (parsed.protocol !== 'https:') {
      if (parsed.protocol !== 'http:' || process.env.NODE_ENV !== 'development') {
        return { valid: false, reason: 'Image URL must use HTTPS' };
      }
    }

    // Block private/internal IPs (SSRF prevention)
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      '169.254.169.254', // AWS metadata endpoint
      'metadata.google.internal', // GCP metadata
      '100.100.100.200', // Alibaba Cloud metadata
    ];

    if (blockedHosts.includes(hostname)) {
      return { valid: false, reason: 'Image URL points to blocked internal address' };
    }

    // Block private IP ranges
    if (hostname.match(/^10\./) || hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./) || hostname.match(/^192\.168\./)) {
      return { valid: false, reason: 'Image URL points to private IP address' };
    }

    // Check for allowed image hosting domains
    const allowedDomains = [
      'lh3.googleusercontent.com', 'supabase.co',
    ];

    const isAllowed = allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      // In production, you may want to restrict to specific domains
      // For now, allow any public domain but log a warning
      log.warn('Image URL from untrusted domain', {
        action: 'untrusted_image_domain',
        data: { hostname },
      });
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid image URL format' };
  }
}
