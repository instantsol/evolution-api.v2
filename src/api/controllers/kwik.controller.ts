import { InstanceDto } from '@api/dto/instance.dto';
import { BUCKET, deleteFile } from '@api/integrations/storage/s3/libs/minio.server';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { SettingsService } from '@api/services/settings.service';
import { Logger } from '@config/logger.config';
import { calculateObjectSize } from 'bson';

const logger = new Logger('KwikController');

type SearchObject = {
  text_search: string;
  where: string[];
};

type keyId = { id: string };

export class KwikController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly settingsService: SettingsService,
    public readonly prismaRepository: PrismaRepository,
  ) {}

  private isTextMessage(messageType: any) {
    return [
      'senderKeyDistributionMessage',
      'conversation',
      'extendedTextMessage',
      'protocolMessage',
      'messageContextInfo',
    ].includes(messageType);
  }

  private async findOffsetByUUID(query: any, sortOrder: any, docUUID: string, batchSize = 1000) {
    const collection = this.prismaRepository.messageWithRemoteJid;

    let offset = 0;
    let found = false;

    while (!found) {
      // Fetch a batch of documents sorted as per the query
      const batch = await collection.findMany({
        where: query,
        orderBy: { messageTimestamp: 'desc' },
        skip: offset,
        take: batchSize,
      });

      //.orderBy(sortOrder).skip(offset).limit(batchSize).toArray();
      const index = batch.findIndex((doc) => (doc.key as keyId).id === docUUID);
      if (index !== -1) {
        // If the document is found in the batch, calculate its offset
        found = true;
        offset += index;
      } else if (batch.length < batchSize) {
        // If the batch is smaller than batchSize, we have exhausted the collection
        throw new Error(`Document with UUID ${docUUID} not found in the collection.`);
      } else {
        // Otherwise, move the offset forward by the batch size and continue searching
        offset += batchSize;
      }
    }

    return offset;
  }

  private firstMultipleBefore(X, Y) {
    return Math.floor(Y / X) * X;
  }

  private extractFileNameFromMediaUrl(mediaUrl?: string | null) {
    if (!mediaUrl) {
      return null;
    }

    try {
      let normalizedPath = decodeURIComponent(new URL(mediaUrl).pathname || '').replace(/^\/+/, '');
      const bucketName = BUCKET?.BUCKET_NAME;

      if (bucketName && normalizedPath.startsWith(`${bucketName}/`)) {
        normalizedPath = normalizedPath.substring(bucketName.length + 1);
      }

      if (normalizedPath.startsWith('evolution-api/')) {
        normalizedPath = normalizedPath.substring('evolution-api/'.length);
      }

      return normalizedPath || null;
    } catch {
      logger.warn(`Failed to parse mediaUrl for cleanup: ${mediaUrl}`);
      return null;
    }
  }

  private async deleteStoredMediaFiles(fileNames: string[]) {
    const uniqueFileNames = Array.from(new Set((fileNames || []).filter(Boolean)));
    const deletedFileNames: string[] = [];
    const failedFileNames: string[] = [];

    if (!BUCKET?.ENABLE || uniqueFileNames.length === 0) {
      return {
        attemptedCount: uniqueFileNames.length,
        deletedCount: 0,
        failedCount: 0,
        deletedFileNames,
        failedFileNames,
      };
    }

    for (const fileName of uniqueFileNames) {
      try {
        const result = await deleteFile('evolution-api', fileName);
        const failed = result instanceof Error || (result && typeof (result as any).message === 'string');

        if (failed) {
          failedFileNames.push(fileName);
        } else {
          deletedFileNames.push(fileName);
        }
      } catch (error) {
        logger.error(['Error deleting media file from bucket', fileName, error?.message, error?.stack]);
        failedFileNames.push(fileName);
      }
    }

    return {
      attemptedCount: uniqueFileNames.length,
      deletedCount: deletedFileNames.length,
      failedCount: failedFileNames.length,
      deletedFileNames,
      failedFileNames,
    };
  }

  public async messageOffset(
    { instanceName }: InstanceDto,
    messageTimestamp: number,
    remoteJid: string,
    sort: any,
    take: number,
    docUUID: string,
  ) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });

    const query = {
      remotejid: remoteJid,
      messageTimestamp: { gte: messageTimestamp },
      instanceId: instance.id,
    };

    const offset = await this.findOffsetByUUID(query, sort, docUUID);
    const multiple = this.firstMultipleBefore(take, offset);
    return multiple;
  }

  public async fetchChats(
    { instanceName }: InstanceDto,
    limit: number,
    skip: number,
    sort: any,
    messageTimestamp: number,
    remoteJid?: string,
  ) {
    //reprecated
    console.log(instanceName, limit, skip, sort, messageTimestamp, remoteJid);
    return [];
    // Get messages grouped by remoteJid, with latest message info

    // const msgs = await this.prismaRepository.messageWithRemoteJid.groupBy({
    //   by: 'remotejid', // TODO
    //   where: {
    //     instanceId: instanceName,
    //     ...(remoteJid ? { keyRemoteJid: remoteJid } : {}),
    //     messageTimestamp: {
    //       gte: messageTimestamp
    //     }
    //   },
    //   _min: {
    //     messageTimestamp: true,
    //     id: true
    //   },
    //   // _max: {
    //   //   messageTimestamp: true
    //   // }
    // });

    // // Extract chat IDs
    // const chat_id_list = msgs.map((m: any) => m.id);

    // // Fetch contacts for those chat IDs
    // const contacts = await this.prismaRepository.contact.findMany({
    //   where: {
    //     instanceId: instanceName,
    //     id: { in: chat_id_list }
    //   }
    // });

    //     const mm = msgs.map((msg: any) => {
    //       const [messageType] = msg.messageType;

    //       const chat_data = {
    //         id: msg.id,
    //         labels: [],
    //         owner: msg.instanceId,
    //         last_message_timestamp: msg.lastAllMsgTimestamp,
    //         message: this.isTextMessage(messageType) ? msg.message : null,
    //         message_type: messageType,
    //         fromMe: msg.key.fromMe,
    //         phone_num: null,
    //         profile_picture: null,
    //         name: null,
    //         sender: msg.name,
    //         type: null,
    //       };

    //       const info = msg._id.split('@');
    //       if (info[1] == 'g.us') {
    //         chat_data.type = 'GROUP';
    //         const group = groups[String(msg._id)];
    //         if (group) {
    //           chat_data.name = group.subject;
    //           chat_data.profile_picture = group.pictureUrl;
    //         }
    //       } else {
    //         const contact = contacts[String(msg._id)];
    //         chat_data.type = 'CONTACT';
    //         chat_data.phone_num = info[0];
    //         if (contact) {
    //           chat_data.name = contact.pushName;
    //           chat_data.profile_picture = contact.profilePictureUrl;
    //         }
    //       }

    //       return chat_data;
    //     });

    //     return mm;
  }
  public async cleanup({ instanceName }: InstanceDto) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });

    await Promise.all([
      this.prismaRepository.message.deleteMany({ where: { instanceId: instance.id } }),
      this.prismaRepository.chat.deleteMany({ where: { instanceId: instance.id } }),
      this.prismaRepository.contact.deleteMany({ where: { instanceId: instance.id } }),
      this.prismaRepository.messageUpdate.deleteMany({ where: { instanceId: instance.id } }),
      this.prismaRepository.setting.deleteMany({ where: { instanceId: instance.id } }),
      this.prismaRepository.integrationSession.deleteMany({ where: { instanceId: instance.id } }),
    ]);

    return { status: 'ok' };
  }
  public async instanceInfo({ instanceName }: InstanceDto, messageTimestamp: number, fullFetch?: number) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });
    const chatCount = await this.prismaRepository.messageWithRemoteJid.groupBy({
      by: 'remotejid', // equivalent to _id: '$key.remoteJid'
      where: {
        instanceId: instance.id,
        messageTimestamp: { gte: messageTimestamp },
      },
      _min: {
        instanceId: true,
        messageTimestamp: true,
        pushName: true,
      },
    });

    const rowCount = chatCount.length;

    if (fullFetch === 2) {
      let ended = false;
      const batchSize = 500;
      let totalSize = 0;
      let offset = 0;

      while (!ended) {
        const userMessages = await this.prismaRepository.message.findMany({
          where: { instanceId: instance.id, messageTimestamp: { gte: messageTimestamp } },
          orderBy: { messageTimestamp: 'desc' },
          take: batchSize,
        });

        userMessages.forEach(function (doc) {
          totalSize += calculateObjectSize(doc);
        });

        if (userMessages.length < batchSize) {
          ended = true;
        } else {
          offset += batchSize;
        }
      }
      logger.info(offset);
      await this.prismaRepository.setting.updateMany({ where: { id: instance.id }, data: { totalSize: totalSize } });
      return {
        chatCount: rowCount,
        totalSize: totalSize,
        newVal: 1,
      };
    } else {
      const settings = await this.prismaRepository.setting.findFirst({ where: { id: instance.id } });
      const totalSize = settings && settings.totalSize ? settings.totalSize : 0;

      return {
        chatCount: rowCount,
        totalSize: totalSize,
        newVal: 0,
      };
    }
  }
  public async cleanChats(instance: InstanceDto) {
    // Get settings from Prisma
    const instance_item = await this.prismaRepository.instance.findFirst({ where: { name: instance.instanceName } });
    const settings = await this.prismaRepository.setting.findUnique({
      where: { id: instance_item.id },
    });

    const initialConnection = settings?.initialConnection;

    if (initialConnection) {
      await this.prismaRepository.message.deleteMany({
        where: {
          instanceId: instance.instanceId,
          messageTimestamp: {
            lt: Math.floor(initialConnection.getTime() / 1000), // Prisma uses `lt` for "less than"
          },
        },
      });
    }

    return { status: 'ok' };
  }

  public async listMessagesBefore({ instanceName }: InstanceDto, beforeTimestamp: number, limit = 100, offset = 0) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });

    if (!instance) {
      return { status: 'error', message: `instance not found: ${instanceName}` };
    }

    const normalizedBeforeTimestamp = Math.floor(Number(beforeTimestamp));
    const normalizedLimit = Math.min(Math.max(Math.floor(Number(limit || 100)), 1), 500);
    const normalizedOffset = Math.max(Math.floor(Number(offset || 0)), 0);

    const where = {
      instanceId: instance.id,
      messageTimestamp: {
        lt: normalizedBeforeTimestamp,
      },
    };

    const [candidateCount, messages] = await Promise.all([
      this.prismaRepository.message.count({ where }),
      this.prismaRepository.messageWithRemoteJid.findMany({
        where,
        orderBy: { messageTimestamp: 'asc' },
        take: normalizedLimit,
        skip: normalizedOffset,
        select: {
          id: true,
          key: true,
          pushName: true,
          messageType: true,
          messageTimestamp: true,
          remotejid: true,
          text: true,
          messageid: true,
          message: true,
        },
      }),
    ]);

    const messageIds = messages.map((message) => message.id);
    const medias = messageIds.length
      ? await this.prismaRepository.media.findMany({
          where: {
            instanceId: instance.id,
            messageId: { in: messageIds },
          },
          select: {
            id: true,
            messageId: true,
            fileName: true,
            type: true,
            mimetype: true,
          },
        })
      : [];

    const mediaByMessageId = medias.reduce(
      (accumulator, media) => {
        if (!accumulator[media.messageId]) {
          accumulator[media.messageId] = [];
        }
        accumulator[media.messageId].push(media);
        return accumulator;
      },
      {} as Record<string, Array<{ id: string; messageId: string; fileName: string; type: string; mimetype: string }>>,
    );

    return {
      status: 'ok',
      beforeTimestamp: normalizedBeforeTimestamp,
      candidateCount,
      returnedCount: messages.length,
      offset: normalizedOffset,
      hasMore: candidateCount > normalizedOffset + messages.length,
      messages: messages.map((message) => {
        const linkedMedia = mediaByMessageId[message.id] || [];
        const fallbackMediaFile = this.extractFileNameFromMediaUrl((message.message as any)?.mediaUrl);
        const mediaFiles = linkedMedia.map((media) => media.fileName);

        if (fallbackMediaFile && !mediaFiles.includes(fallbackMediaFile)) {
          mediaFiles.push(fallbackMediaFile);
        }

        return {
          id: message.id,
          messageId: message.messageid,
          remoteJid: message.remotejid,
          pushName: message.pushName,
          messageType: message.messageType,
          messageTimestamp: message.messageTimestamp,
          fromMe: (message.key as any)?.fromMe ?? null,
          text: message.text,
          mediaCount: mediaFiles.length,
          mediaFiles,
          mediaTypes: linkedMedia.map((media) => media.type),
        };
      }),
    };
  }

  public async deleteMessagesBefore({ instanceName }: InstanceDto, beforeTimestamp: number) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });

    if (!instance) {
      return { status: 'error', message: `instance not found: ${instanceName}` };
    }

    const normalizedBeforeTimestamp = Math.floor(Number(beforeTimestamp));
    const batchSize = 500;
    let deletedCount = 0;
    let deletedMediaCount = 0;
    let deletedMediaFileCount = 0;
    let failedMediaFileCount = 0;
    const failedMediaFiles = new Set<string>();

    let hasMoreMessages = true;

    while (hasMoreMessages) {
      const messages = await this.prismaRepository.message.findMany({
        where: {
          instanceId: instance.id,
          messageTimestamp: {
            lt: normalizedBeforeTimestamp,
          },
        },
        orderBy: { messageTimestamp: 'asc' },
        take: batchSize,
        select: {
          id: true,
          message: true,
        },
      });

      if (!messages.length) {
        hasMoreMessages = false;
        continue;
      }

      const messageIds = messages.map((message) => message.id);
      const medias = await this.prismaRepository.media.findMany({
        where: {
          instanceId: instance.id,
          messageId: { in: messageIds },
        },
        select: {
          id: true,
          messageId: true,
          fileName: true,
        },
      });

      const mediaFileNames = new Set<string>();

      for (const media of medias) {
        if (media.fileName) {
          mediaFileNames.add(media.fileName);
        }
      }

      for (const message of messages) {
        const fallbackMediaFile = this.extractFileNameFromMediaUrl((message.message as any)?.mediaUrl);
        if (fallbackMediaFile) {
          mediaFileNames.add(fallbackMediaFile);
        }
      }

      const mediaDeletionResult = await this.deleteStoredMediaFiles(Array.from(mediaFileNames));
      deletedMediaFileCount += mediaDeletionResult.deletedCount;
      failedMediaFileCount += mediaDeletionResult.failedCount;
      mediaDeletionResult.failedFileNames.forEach((fileName) => failedMediaFiles.add(fileName));

      if (medias.length) {
        const deletedMedia = await this.prismaRepository.media.deleteMany({
          where: {
            id: { in: medias.map((media) => media.id) },
          },
        });
        deletedMediaCount += deletedMedia.count;
      }

      const deletedMessages = await this.prismaRepository.message.deleteMany({
        where: {
          id: { in: messageIds },
        },
      });
      deletedCount += deletedMessages.count;

      await this.prismaRepository.messageUpdate.deleteMany({
        where: {
          messageId: { in: messageIds },
        },
      });
    }

    return {
      status: 'ok',
      beforeTimestamp: normalizedBeforeTimestamp,
      deletedCount,
      deletedMediaCount,
      deletedMediaFileCount,
      failedMediaFileCount,
      failedMediaFiles: Array.from(failedMediaFiles).slice(0, 50),
      storageEnabled: BUCKET?.ENABLE === true,
    };
  }

  public async textSearch({ instanceName }: InstanceDto, query: SearchObject) {
    console.log('ignore search:', instanceName);
    const instances = await this.prismaRepository.instance.findMany({
      where: { name: { in: query.where } },
      select: { id: true, name: true },
    });
    const InstancesObject = Object.fromEntries(instances.map((instance) => [instance.id, instance.name]));
    const messages = await this.prismaRepository.messageWithRemoteJid.findMany({
      where: {
        instanceId: { in: Object.keys(InstancesObject) },
        text: { contains: query.text_search, mode: 'insensitive' },
      },
      orderBy: { messageTimestamp: 'desc' },
      take: 100,
    });
    const data = [];

    const uniqueContacts = Array.from(
      new Set(messages.filter((m) => !m.remotejid.includes('@g.us')).map((m) => `${m.instanceId}#${m.remotejid}`)),
    );
    const contacts_promises = uniqueContacts.map((m) => {
      return this.prismaRepository.contact.findFirst({
        where: { instanceId: m.split('#')[0], remoteJid: m.split('#')[1] },
      });
    });
    const uniqueGroups = Array.from(
      new Set(messages.filter((m) => m.remotejid.includes('@g.us')).map((m) => `${m.instanceId}#${m.remotejid}`)),
    );

    const groups_promises = uniqueGroups.map(async (g) => {
      const instanceId = g.split('#')[0];
      const instanceName = InstancesObject[instanceId];
      const groupJid = g.split('#')[1];
      const group = await this.waMonitor.waInstances[instanceName].findGroup({ groupJid }, 'inner');

      return group ? { ...group, instanceId: instanceId, instanceName } : null;
    });

    const [...contacts_solved] = await Promise.all([...contacts_promises]);
    const [...groups_solved] = await Promise.all([...groups_promises]);

    const contacts = Object.fromEntries(
      contacts_solved.filter((c) => c != null).map((c) => [`${c.instanceId}#${c.remoteJid}`, c]),
    );
    const groups = Object.fromEntries(
      groups_solved.filter((g) => g !== null).map((g) => [`${g.instanceId}#${g.id}`, g]),
    );

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const info = message.remotejid.split('@');
      let type;
      let tinfo;
      if (info[1] == 'g.us') {
        tinfo = groups[`${message.instanceId}#${message.remotejid}`];
        type = 'GROUP';
      } else {
        tinfo = contacts[`${message.instanceId}#${message.remotejid}`];
        type = 'CONTACT';
      }

      data.push({
        message: message,

        owner: InstancesObject[message.instanceId],
        conversation: `${InstancesObject[message.instanceId]}#${info}`,
        type: type,
        info: tinfo,
      });
    }

    return { data };
  }
  public async updateContactCRM(
    { instanceName }: InstanceDto,
    contact_id: string,
    kwik_contact_id: number,
    kwik_contact_name: string,
  ) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });
    const contact = await this.prismaRepository.contact.findFirst({
      where: { instanceId: instance.id, id: contact_id },
    });
    if (contact) {
      const updated = await this.prismaRepository.contact.update({
        where: { instanceId: instance.id, id: contact_id },
        data: { kwik_contact_id: kwik_contact_id.toString(), kwik_contact_name },
      });

      return { status: 'ok', updated: updated };
    } else {
      return { status: 'error', message: 'contact not found' };
    }
  }

  public async updateCRMInfo(kwik_contact_id: number, kwik_contact_name: string) {
    const response = await this.prismaRepository.contact.updateMany({
      where: { kwik_contact_id: kwik_contact_id.toString() },
      data: { kwik_contact_name },
    });
    const response2 = await this.prismaRepository.contact.updateMany({
      where: { kwik_contact_id: kwik_contact_id.toString() },
      data: { kwik_contact_name },
    });

    // Prisma only gives you `count`
    const totalUpdated = response.count + response2.count;

    return { status: 'ok', updated: totalUpdated };
  }

  public async deleteCRMInfo(kwik_contact_id: number) {
    const response = await this.prismaRepository.contact.updateMany({
      where: { kwik_contact_id: kwik_contact_id.toString() },
      data: { kwik_contact_name: '', kwik_contact_id: '' },
    });
    const response2 = await this.prismaRepository.contact.updateMany({
      where: { kwik_contact_id: kwik_contact_id.toString() },
      data: { kwik_contact_name: '', kwik_contact_id: '' },
    });

    // Prisma only gives you `count`
    const totalUpdated = response.count + response2.count;

    return { status: 'ok', updated: totalUpdated };
  }

  public async flagRestrictedWords({ instanceName }: InstanceDto, message_id: string, word: string, group: string) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });

    if (!instance) {
      return { status: 'error', message: `instance not found: ${instanceName}` };
    }

    let message: any = null;

    const viewMessage = await this.prismaRepository.messageWithRemoteJid.findFirst({
      where: { instanceId: instance.id, messageid: message_id },
      select: { id: true, messageid: true, remotejid: true },
    });

    if (viewMessage) {
      message = { id: viewMessage.id };
    } else {
      message = await this.prismaRepository.message.findFirst({
        where: {
          instanceId: instance.id,
          key: {
            path: ['id'],
            equals: message_id,
          },
        },
        select: { id: true },
      });
    }

    if (!message) {
      return { status: 'error', message: 'message not found' };
    }

    const updated = await this.prismaRepository.message.update({
      where: {
        id: message.id,
      },
      data: {
        restricted: true,
        restricted_word: word,
        restricted_group: group,
      },
    });

    return { status: 'ok', updated: updated };
  }

  public async updateTranscription(
    { instanceName }: InstanceDto,
    message_id: string,
    text: string,
    status: string,
    error: string,
  ) {
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: instanceName } });
    const message = await this.prismaRepository.message.findFirst({
      where: { instanceId: instance.id, id: message_id },
    });

    if (message) {
      const updated = await this.prismaRepository.message.update({
        where: {
          instanceId: instance.id,
          id: message_id,
        },
        data: {
          transcription: text,
          transcription_status: status,
          transcription_error: error,
        },
      });
      return { status: 'ok', updated: updated };
    } else {
      return { status: 'error', message: 'message not found' };
    }
  }

  public async fetchContacts({ instanceName }: InstanceDto, body: any) {
    const owner = body?.where?.owner;
    const instances = await this.prismaRepository.instance.findMany({ where: { name: owner || instanceName } });

    //const where: any = { instanceId: instance.id, lastmessagetimestamp: { not: null } };
    const where: any = {
      instanceId: { in: instances.map((instance) => instance.id) },
      lastmessagetimestamp: { not: null },
    };

    if (body?.where?.id) where.remoteJid = body.where.id;

    const data = await this.prismaRepository.contactWithLastMessage.findMany({
      where: where,
      orderBy: { lastmessagetimestamp: 'desc' },
      take: parseInt(body?.limit || 100),
      skip: parseInt(body?.skip || 0),
    });

    return data;
  }

  public async fetchMessages({ instanceName }: InstanceDto, body: any) {
    const owner = body?.where?.owner;
    const instance = await this.prismaRepository.instance.findFirst({ where: { name: owner || instanceName } });

    const payload: any = {
      ...body,
      where: {
        ...body.where,
        instanceId: instance.id,
      },
    };

    const data = await this.prismaRepository.messageWithRemoteJid.findMany({
      ...payload,
      select: {
        id: true,
        key: true,
        pushName: true,
        participant: true,
        messageType: true,
        message: true,
        contextInfo: true,
        messageTimestamp: true,
        restricted: true,
        remotejid: true,
        instanceId: true,
        text: true,
        messageid: true,
      },
    });

    const pollMessages = data.filter((item: any) => item?.messageType === 'pollCreationMessageV3' && item?.id);

    if (!pollMessages.length) {
      return data;
    }

    const pollMessageIds = pollMessages.map((item: any) => item.id);
    const pollUpdateRows = await this.prismaRepository.messageUpdate.findMany({
      where: {
        messageId: {
          in: pollMessageIds,
        },
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        messageId: true,
        pollUpdates: true,
      },
    });

    const latestPollUpdates = new Map();

    for (const row of pollUpdateRows as any[]) {
      if (latestPollUpdates.has(row.messageId)) {
        continue;
      }

      if (Array.isArray(row.pollUpdates) && row.pollUpdates.length) {
        latestPollUpdates.set(row.messageId, row.pollUpdates);
      }
    }

    return data.map((item: any) => {
      if (item?.messageType !== 'pollCreationMessageV3') {
        return item;
      }

      const pollUpdates = latestPollUpdates.get(item.id) || [];
      return {
        ...item,
        pollUpdates,
      };
    });
  }
}
