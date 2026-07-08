import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import path from "path";
import { env } from "../config/env.js";

const s3Client = new S3Client({ region: env.QI_S3_REGION });

export async function prepareInspectionImageInput(input) {
  const preparedInput = { ...input };
  const existingS3Reference = resolveS3ReferenceFromValue(preparedInput.image_url);

  if (existingS3Reference) {
    preparedInput.image_storage_provider = "s3";
    preparedInput.image_s3_bucket = existingS3Reference.bucket;
    preparedInput.image_s3_key = existingS3Reference.key;
    preparedInput.image_s3_uri = buildS3Uri(existingS3Reference.bucket, existingS3Reference.key);
    return preparedInput;
  }

  if (
    preparedInput.image_base64 &&
    preparedInput.image_media_type?.startsWith("image/") &&
    env.QI_S3_AUDIT_PREFIX.configured
  ) {
    try {
      const uploadedImage = await uploadInspectionImageToAuditPrefix(preparedInput);
      preparedInput.image_storage_provider = "s3";
      preparedInput.image_s3_bucket = uploadedImage.bucket;
      preparedInput.image_s3_key = uploadedImage.key;
      preparedInput.image_s3_uri = uploadedImage.uri;
      console.log(
        `[s3-upload] component=${preparedInput.component_id} bucket=${uploadedImage.bucket} key=${uploadedImage.key}`
      );
    } catch (error) {
      console.warn(
        `[s3-upload] component=${preparedInput.component_id} audit upload failed; continuing with current flow. reason=${error.message}`
      );
    }
  }

  return preparedInput;
}

export async function resolveInspectionImageFromInput(input) {
  if (input.image_base64 && input.image_media_type?.startsWith("image/")) {
    return {
      mediaType: input.image_media_type,
      base64: stripDataUrlPrefix(input.image_base64),
    };
  }

  const s3Reference = resolveS3ReferenceFromInput(input);

  if (s3Reference) {
    return loadInspectionImageFromS3(s3Reference);
  }

  return loadInspectionImageFromUrl(input.image_url);
}

export function resolveS3ReferenceFromInput(input) {
  if (input.image_s3_bucket && input.image_s3_key) {
    return {
      bucket: input.image_s3_bucket,
      key: input.image_s3_key,
    };
  }

  return resolveS3ReferenceFromValue(input.image_url);
}

export function resolveS3ReferenceFromValue(value) {
  const imageValue = normalizeReferenceValue(value);

  if (!imageValue) {
    return null;
  }

  if (imageValue.startsWith("s3://")) {
    return parseS3Uri(imageValue);
  }

  if (imageValue.startsWith("http://") || imageValue.startsWith("https://")) {
    return parseS3HttpUrl(imageValue);
  }

  if (env.QI_S3_INPUT_PREFIX.configured) {
    return {
      bucket: env.QI_S3_INPUT_PREFIX.bucket,
      key: joinKeyParts(env.QI_S3_INPUT_PREFIX.keyPrefix, imageValue),
    };
  }

  return null;
}

export async function loadInspectionImageFromS3({ bucket, key }) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const mediaType = response.ContentType || inferMediaTypeFromKey(key);
  const body = await streamToBuffer(response.Body);

  return {
    mediaType,
    base64: body.toString("base64"),
  };
}

export async function loadInspectionImageFromUrl(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("http")) {
    return null;
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    return null;
  }

  const mediaType = response.headers.get("content-type") || "image/jpeg";

  if (!mediaType.startsWith("image/")) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    mediaType,
    base64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function uploadInspectionImageToAuditPrefix(input) {
  const bucket = env.QI_S3_AUDIT_PREFIX.bucket;

  if (!bucket) {
    throw new Error("QI_S3_AUDIT_PREFIX bucket is not configured");
  }

  const key = buildAuditObjectKey(input);
  const body = Buffer.from(stripDataUrlPrefix(input.image_base64), "base64");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: input.image_media_type || inferMediaTypeFromKey(key),
      Metadata: {
        component_id: input.component_id,
        inspection_station: input.inspection_station,
        line_id: input.line_id,
      },
    })
  );

  return {
    bucket,
    key,
    uri: buildS3Uri(bucket, key),
  };
}

function buildAuditObjectKey(input) {
  const basePrefix = env.QI_S3_AUDIT_PREFIX.keyPrefix;
  const safeComponentId = sanitizePathPart(input.component_id || "unknown-component");
  const safeTimestamp = sanitizePathPart(
    (input.timestamp || new Date().toISOString()).replace(/[:.]/g, "-")
  );
  const extension = deriveExtension(input.image_file_name, input.image_media_type);
  const objectName = `${safeComponentId}-${safeTimestamp}${extension}`;

  if (!basePrefix) {
    return objectName;
  }

  return `${basePrefix}/${objectName}`;
}

function parseS3Uri(uri) {
  const withoutScheme = uri.slice("s3://".length);
  const firstSlashIndex = withoutScheme.indexOf("/");

  if (firstSlashIndex === -1) {
    return {
      bucket: withoutScheme,
      key: "",
    };
  }

  return {
    bucket: withoutScheme.slice(0, firstSlashIndex),
    key: withoutScheme.slice(firstSlashIndex + 1),
  };
}

function parseS3HttpUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/^\/+/, "");

    const virtualHostedMatch = hostname.match(/^(.+)\.s3[.-][^.]+\.amazonaws\.com$/);

    if (virtualHostedMatch) {
      return {
        bucket: virtualHostedMatch[1],
        key: pathname,
      };
    }

    const pathHostedMatch = hostname.match(/^s3[.-][^.]+\.amazonaws\.com$/);

    if (pathHostedMatch) {
      const [bucket, ...keyParts] = pathname.split("/");

      if (!bucket) {
        return null;
      }

      return {
        bucket,
        key: keyParts.join("/"),
      };
    }

    return null;
  } catch {
    return null;
  }
}

function buildS3Uri(bucket, key) {
  return `s3://${bucket}/${key}`;
}

function joinKeyParts(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function normalizeReferenceValue(value) {
  const trimmed = String(value || "").trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function stripDataUrlPrefix(value) {
  const marker = "base64,";
  const markerIndex = value.indexOf(marker);

  if (markerIndex === -1) {
    return value;
  }

  return value.slice(markerIndex + marker.length);
}

function sanitizePathPart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveExtension(fileName, mediaType) {
  const fileExtension = path.extname(fileName || "").toLowerCase();

  if (fileExtension) {
    return fileExtension;
  }

  const byMediaType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
  };

  return byMediaType[mediaType] || ".jpg";
}

function inferMediaTypeFromKey(key) {
  const extension = path.extname(key || "").toLowerCase();

  const byExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  };

  return byExtension[extension] || "image/jpeg";
}

async function streamToBuffer(stream) {
  if (!stream) {
    return Buffer.alloc(0);
  }

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
