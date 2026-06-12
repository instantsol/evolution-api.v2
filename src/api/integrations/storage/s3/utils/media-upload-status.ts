import { PrismaRepository } from '@api/repository/repository.service';

type MediaUploadStatusPayload = {
  messageId: string;
  instanceId: string;
  type: string;
  fileName: string;
  mimetype: string;
};

const normalizeUploadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 5000);
};

const mediaUploadData = (data: MediaUploadStatusPayload) => ({
  messageId: data.messageId,
  instanceId: data.instanceId,
  type: data.type,
  fileName: data.fileName,
  mimetype: data.mimetype,
});

const mediaUploadUpdateData = (data: MediaUploadStatusPayload) => ({
  type: data.type,
  fileName: data.fileName,
  mimetype: data.mimetype,
});

export const markMediaUploadSuccess = async (prismaRepository: PrismaRepository, data: MediaUploadStatusPayload) => {
  const now = new Date();

  return prismaRepository.media.upsert({
    where: {
      messageId: data.messageId,
    },
    create: {
      ...mediaUploadData(data),
      uploadStatus: 'uploaded',
      uploadError: null,
      uploadedAt: now,
    },
    update: {
      ...mediaUploadUpdateData(data),
      uploadStatus: 'uploaded',
      uploadError: null,
      uploadedAt: now,
    },
  });
};

export const markMediaUploadFailed = async (
  prismaRepository: PrismaRepository,
  data: MediaUploadStatusPayload,
  error: unknown,
) =>
  prismaRepository.media.upsert({
    where: {
      messageId: data.messageId,
    },
    create: {
      ...mediaUploadData(data),
      uploadStatus: 'failed',
      uploadError: normalizeUploadError(error),
      uploadedAt: null,
    },
    update: {
      ...mediaUploadUpdateData(data),
      uploadStatus: 'failed',
      uploadError: normalizeUploadError(error),
      uploadedAt: null,
    },
  });
