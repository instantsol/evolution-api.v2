const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

const replaceOnce = (file, search, replacement) => {
  const fullPath = path.join(root, file);
  let content = fs.readFileSync(fullPath, 'utf8');

  if (content.includes(replacement)) {
    return;
  }

  if (!content.includes(search)) {
    if (
      file === 'node_modules/baileys/lib/Socket/messages-recv.js' &&
      replacement.includes('let originalMessage;') &&
      replacement.includes('decryptSecretEncryptedMessage')
    ) {
      const blockStart = `                cleanMessage(msg, authState.creds.me.id, authState.creds.me.lid);
`;
      const blockEnd = `                await upsertMessage(msg, node.attrs.offline ? 'append' : 'notify');
`;
      const start = content.indexOf(blockStart);
      const end = start === -1 ? -1 : content.indexOf(blockEnd, start);

      if (start !== -1 && end !== -1) {
        content = `${content.slice(0, start)}${replacement}${content.slice(end + blockEnd.length)}`;
        fs.writeFileSync(fullPath, content);
        return;
      }
    }

    throw new Error(`Unable to patch ${file}: expected snippet was not found`);
  }

  content = content.replace(search, replacement);
  fs.writeFileSync(fullPath, content);
};

const insertBefore = (file, marker, insertion) => {
  const content = read(file);

  if (content.includes(insertion.trim())) {
    return;
  }

  if (!content.includes(marker)) {
    throw new Error(`Unable to patch ${file}: marker was not found`);
  }

  write(file, content.replace(marker, `${insertion}${marker}`));
};

const upsertExportBefore = (file, marker, exportName, insertion) => {
  let content = read(file);

  if (!content.includes(marker)) {
    throw new Error(`Unable to patch ${file}: marker was not found`);
  }

  const exportStart = `export const ${exportName} =`;
  let markerIndex = content.indexOf(marker);
  let start = content.indexOf(exportStart);

  while (start !== -1 && start < markerIndex) {
    const end = content.indexOf('\n};\n', start);

    if (end === -1 || end > markerIndex) {
      throw new Error(`Unable to patch ${file}: existing ${exportName} end was not found`);
    }

    content = `${content.slice(0, start)}${content.slice(end + '\n};\n'.length)}`;
    markerIndex = content.indexOf(marker);
    start = content.indexOf(exportStart);
  }

  if (content.includes(insertion.trim())) {
    write(file, content);
    return;
  }

  write(file, content.replace(marker, `${insertion}${marker}`));
};

replaceOnce(
  'node_modules/baileys/lib/Utils/message-retry-manager.js',
  `    getRecentMessage(to, id) {
        const key = { to, id };
        const keyStr = this.keyToString(key);
        return this.recentMessagesMap.get(keyStr);
    }
`,
  `    getRecentMessage(to, id) {
        const key = { to, id };
        const keyStr = this.keyToString(key);
        return this.recentMessagesMap.get(keyStr);
    }
    /**
     * Get a recent message using only its message ID.
     */
    getRecentMessageById(id) {
        const keyStr = this.messageKeyIndex.get(id);
        return keyStr ? this.recentMessagesMap.get(keyStr) : undefined;
    }
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/message-retry-manager.d.ts',
  `    /**
     * Get a recent message from the cache
     */
    getRecentMessage(to: string, id: string): RecentMessage | undefined;
`,
  `    /**
     * Get a recent message from the cache
     */
    getRecentMessage(to: string, id: string): RecentMessage | undefined;
    /**
     * Get a recent message using only its message ID.
     */
    getRecentMessageById(id: string): RecentMessage | undefined;
`,
);

replaceOnce(
  'node_modules/baileys/WAProto/WAProto.proto',
  `            MESSAGE_EDIT = 2;
`,
  `            MESSAGE_EDIT = 2;
            MESSAGE_SCHEDULE = 3;
            POLL_EDIT = 4;
            POLL_ADD_OPTION = 5;
`,
);

replaceOnce(
  'node_modules/baileys/WAProto/index.d.ts',
  `                MESSAGE_EDIT = 2
`,
  `                MESSAGE_EDIT = 2,
                MESSAGE_SCHEDULE = 3,
                POLL_EDIT = 4,
                POLL_ADD_OPTION = 5
`,
);

replaceOnce(
  'node_modules/baileys/WAProto/index.js',
  `                case "MESSAGE_EDIT":
                case 2:
                    m.secretEncType = 2;
                    break;
`,
  `                case "MESSAGE_EDIT":
                case 2:
                    m.secretEncType = 2;
                    break;
                case "MESSAGE_SCHEDULE":
                case 3:
                    m.secretEncType = 3;
                    break;
                case "POLL_EDIT":
                case 4:
                    m.secretEncType = 4;
                    break;
                case "POLL_ADD_OPTION":
                case 5:
                    m.secretEncType = 5;
                    break;
`,
);

replaceOnce(
  'node_modules/baileys/WAProto/index.js',
  `                values[valuesById[2] = "MESSAGE_EDIT"] = 2;
`,
  `                values[valuesById[2] = "MESSAGE_EDIT"] = 2;
                values[valuesById[3] = "MESSAGE_SCHEDULE"] = 3;
                values[valuesById[4] = "POLL_EDIT"] = 4;
                values[valuesById[5] = "POLL_ADD_OPTION"] = 5;
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/process-message.js',
  `const REAL_MSG_REQ_ME_STUB_TYPES = new Set([WAMessageStubType.GROUP_PARTICIPANT_ADD]);
`,
  `const REAL_MSG_REQ_ME_STUB_TYPES = new Set([WAMessageStubType.GROUP_PARTICIPANT_ADD]);
const SECRET_ENC_TYPE_SCOPES = {
    [proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT]: 'Message Edit',
    [proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_SCHEDULE]: 'Message Schedule',
    [proto.Message.SecretEncryptedMessage.SecretEncType.POLL_EDIT]: 'Poll Edit',
    [proto.Message.SecretEncryptedMessage.SecretEncType.POLL_ADD_OPTION]: 'Poll Add Option'
};
const generateMsgSecretKey = (modificationType, origMsgId, origMsgSender, modificationSender, origMsgSecret) => {
    const info = Buffer.concat([
        Buffer.from(origMsgId),
        Buffer.from(jidNormalizedUser(origMsgSender)),
        Buffer.from(jidNormalizedUser(modificationSender)),
        Buffer.from(modificationType)
    ]);
    const salt = Buffer.alloc(32);
    const prk = hmacSign(origMsgSecret, salt, 'sha256');
    const t1 = hmacSign(Buffer.concat([info, Buffer.from([1])]), prk, 'sha256');
    return t1.slice(0, 32);
};
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/process-message.js',
  `    if (content?.pollUpdateMessage) {
        normaliseKey(content.pollUpdateMessage.pollCreationMessageKey);
    }
`,
  `    if (content?.pollUpdateMessage) {
        normaliseKey(content.pollUpdateMessage.pollCreationMessageKey);
    }
    if (content?.secretEncryptedMessage?.targetMessageKey) {
        const targetMessageKey = content.secretEncryptedMessage.targetMessageKey;
        normaliseKey(targetMessageKey);
        if (!message.key.fromMe) {
            targetMessageKey.remoteJidAlt = targetMessageKey.remoteJidAlt || message.key.remoteJidAlt;
            targetMessageKey.participantAlt = targetMessageKey.participantAlt || message.key.participantAlt;
        }
    }
`,
);

upsertExportBefore(
  'node_modules/baileys/lib/Utils/process-message.js',
  `// TODO: target:audit AUDIT THIS FUNCTION AGAIN
`,
  'decryptSecretEncryptedMessage',
  `export const decryptSecretEncryptedMessage = async (message, messageSecret, meId, meLid, logger) => {
    const content = normalizeMessageContent(message.message);
    const secretEncryptedMessage = content?.secretEncryptedMessage;
    if (!secretEncryptedMessage) {
        return;
    }
    const targetMessageKey = secretEncryptedMessage.targetMessageKey;
    const secretEncType = secretEncryptedMessage.secretEncType;
    const scope = SECRET_ENC_TYPE_SCOPES[secretEncType];
    if (!scope || !targetMessageKey?.id) {
        logger?.warn({
            secretEncType,
            targetMessageKey: secretEncryptedMessage.targetMessageKey
        }, 'unsupported secret encrypted message type');
        return;
    }
    if (!secretEncryptedMessage.encPayload?.length || !secretEncryptedMessage.encIv?.length) {
        logger?.warn({ targetMessageKey }, 'missing secret encrypted message payload');
        return;
    }
    const uniqueJids = (jids) => [...new Set(jids.filter(Boolean))];
    const usesLidAddressing =
        message.key.addressingMode === 'lid' ||
        isLidUser(message.key.remoteJid) ||
        isLidUser(message.key.remoteJidAlt) ||
        isLidUser(targetMessageKey.remoteJid) ||
        isLidUser(targetMessageKey.remoteJidAlt);
    const ownSenderCandidates = uniqueJids([
        usesLidAddressing && meLid ? meLid : undefined,
        message.key.addressingMode === 'lid' && meLid ? meLid : undefined,
        meId,
        meLid
    ]);
    const targetKeyFromMe =
        targetMessageKey.fromMe === true ||
        (targetMessageKey.fromMe === undefined && message.key.fromMe === true) ||
        (targetMessageKey.fromMe === undefined &&
            (areJidsSameUser(targetMessageKey.participant || targetMessageKey.remoteJid, meId) ||
                areJidsSameUser(targetMessageKey.participant || targetMessageKey.remoteJid, meLid)));
    const originalSenderCandidates = targetKeyFromMe
        ? ownSenderCandidates
        : uniqueJids([targetMessageKey.participant, targetMessageKey.participantAlt, targetMessageKey.remoteJid, targetMessageKey.remoteJidAlt]);
    const modificationSenderCandidates = message.key.fromMe
        ? ownSenderCandidates
        : uniqueJids([message.key.participant, message.key.participantAlt, message.key.remoteJid, message.key.remoteJidAlt]);
    if (!originalSenderCandidates.length || !modificationSenderCandidates.length) {
        logger?.warn({ targetMessageKey, messageKey: message.key }, 'missing sender for secret encrypted message');
        return;
    }
    let decryptedMessage;
    let decryptContext;
    let lastDecryptError;
    try {
        for (const originalSender of originalSenderCandidates) {
            for (const modificationSender of modificationSenderCandidates) {
                try {
                    const decryptKey = generateMsgSecretKey(scope, targetMessageKey.id, originalSender, modificationSender, messageSecret);
                    const decrypted = aesDecryptGCM(secretEncryptedMessage.encPayload, decryptKey, secretEncryptedMessage.encIv, Buffer.alloc(0));
                    decryptedMessage = proto.Message.decode(decrypted);
                    decryptContext = { originalSender, modificationSender };
                    break;
                }
                catch (err) {
                    lastDecryptError = err;
                }
            }
            if (decryptedMessage) {
                break;
            }
        }
        if (!decryptedMessage) {
            throw lastDecryptError;
        }
    }
    catch (err) {
        logger?.warn({
            err,
            targetMessageKey,
            messageKey: message.key,
            originalSenderCandidates,
            modificationSenderCandidates,
            secretEncType
        }, 'failed to decrypt secret encrypted message');
        return;
    }
    if (secretEncType === proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT) {
        if (message.message?.messageContextInfo && !decryptedMessage.messageContextInfo) {
            decryptedMessage.messageContextInfo = message.message.messageContextInfo;
        }
        message.message = {
            protocolMessage: {
                key: targetMessageKey,
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: decryptedMessage,
                timestampMs: toNumber(message.messageTimestamp) * 1000
            }
        };
        logger?.debug({ targetMessageKey, messageKey: message.key, ...decryptContext }, 'decrypted secret encrypted message edit');
        return;
    }
    logger?.warn({ secretEncType, targetMessageKey }, 'decrypted secret encrypted message type is not handled');
};
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/process-message.js',
  `        !normalizedContent?.protocolMessage &&
        !normalizedContent?.reactionMessage &&
`,
  `        !normalizedContent?.protocolMessage &&
        !normalizedContent?.secretEncryptedMessage &&
        !normalizedContent?.reactionMessage &&
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/process-message.d.ts',
  `export declare const cleanMessage: (message: WAMessage, meId: string, meLid: string) => void;
`,
  `export declare const cleanMessage: (message: WAMessage, meId: string, meLid: string) => void;
export declare const decryptSecretEncryptedMessage: (message: WAMessage, messageSecret: Uint8Array, meId: string, meLid: string, logger?: ILogger) => Promise<void>;
`,
);

replaceOnce(
  'node_modules/baileys/lib/Utils/messages.js',
  `    if ('contextInfo' in message && !!message.contextInfo) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        if ('contextInfo' in key && !!key.contextInfo) {
            key.contextInfo = { ...key.contextInfo, ...message.contextInfo };
        }
        else if (key) {
            key.contextInfo = message.contextInfo;
        }
    }
    return WAProto.Message.create(m);
`,
  `    if ('contextInfo' in message && !!message.contextInfo) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        if ('contextInfo' in key && !!key.contextInfo) {
            key.contextInfo = { ...key.contextInfo, ...message.contextInfo };
        }
        else if (key) {
            key.contextInfo = message.contextInfo;
        }
    }
    if ('messageContextInfo' in message && !!message.messageContextInfo) {
        m.messageContextInfo = { ...(m.messageContextInfo || {}), ...message.messageContextInfo };
    }
    return WAProto.Message.create(m);
`,
);

replaceOnce(
  'node_modules/baileys/lib/Socket/messages-recv.js',
  `import { aesDecryptCTR, aesEncryptGCM, cleanMessage, Curve, decodeMediaRetryNode, decodeMessageNode, decryptMessageNode, delay, derivePairingCodeKey, encodeBigEndian, encodeSignedDeviceIdentity, extractAddressingContext, getCallStatusFromNode, getHistoryMsg, getNextPreKeys, getStatusFromReceiptType, hkdf, MISSING_KEYS_ERROR_TEXT, NACK_REASONS, NO_MESSAGE_FOUND_ERROR_TEXT, unixTimestampSeconds, xmppPreKey, xmppSignedPreKey } from '../Utils/index.js';
`,
  `import { aesDecryptCTR, aesEncryptGCM, cleanMessage, Curve, decodeMediaRetryNode, decodeMessageNode, decryptMessageNode, decryptSecretEncryptedMessage, delay, derivePairingCodeKey, encodeBigEndian, encodeSignedDeviceIdentity, extractAddressingContext, getCallStatusFromNode, getHistoryMsg, getNextPreKeys, getStatusFromReceiptType, hkdf, MISSING_KEYS_ERROR_TEXT, NACK_REASONS, NO_MESSAGE_FOUND_ERROR_TEXT, normalizeMessageContent, unixTimestampSeconds, xmppPreKey, xmppSignedPreKey } from '../Utils/index.js';
`,
);

replaceOnce(
  'node_modules/baileys/lib/Socket/messages-recv.js',
  `                cleanMessage(msg, authState.creds.me.id, authState.creds.me.lid);
                await upsertMessage(msg, node.attrs.offline ? 'append' : 'notify');
`,
  `                cleanMessage(msg, authState.creds.me.id, authState.creds.me.lid);
                if (msg.key?.remoteJid && msg.key?.id && msg.message && messageRetryManager) {
                    messageRetryManager.addRecentMessage(msg.key.remoteJid, msg.key.id, msg.message);
                }
                const content = normalizeMessageContent(msg.message);
                const secretEncryptedMessage = content?.secretEncryptedMessage;
                if (secretEncryptedMessage) {
                    const targetMessageKey = secretEncryptedMessage.targetMessageKey;
                    let originalMessage;
                    let messageSecret;
                    if (targetMessageKey?.id) {
                        const cachedOriginalMessage = messageRetryManager?.getRecentMessageById(targetMessageKey.id)?.message;
                        const cachedMessageSecret = normalizeMessageContent(cachedOriginalMessage)?.messageContextInfo?.messageSecret;
                        const envelopeMessageSecret = content?.messageContextInfo?.messageSecret;
                        if (cachedMessageSecret?.length) {
                            originalMessage = cachedOriginalMessage;
                            messageSecret = cachedMessageSecret;
                        }
                        else {
                            const getMessageCandidates = [
                                targetMessageKey,
                                { ...targetMessageKey, fromMe: targetMessageKey.fromMe ?? msg.key.fromMe },
                                { ...targetMessageKey, fromMe: targetMessageKey.fromMe ?? msg.key.fromMe, remoteJid: msg.key.remoteJid },
                                { ...targetMessageKey, fromMe: targetMessageKey.fromMe ?? msg.key.fromMe, remoteJid: msg.key.remoteJidAlt },
                            ].filter(candidate => candidate?.id && candidate?.remoteJid);
                            for (const getMessageKey of getMessageCandidates) {
                                originalMessage = await getMessage(getMessageKey).catch(err => {
                                    logger.warn({ err, targetMessageKey, getMessageKey }, 'failed to load original message for secret encrypted message');
                                    return undefined;
                                });
                                if (originalMessage) {
                                    break;
                                }
                            }
                            messageSecret =
                                normalizeMessageContent(originalMessage)?.messageContextInfo?.messageSecret ||
                                cachedMessageSecret ||
                                envelopeMessageSecret;
                        }
                    }
                    if (messageSecret?.length) {
                        await decryptSecretEncryptedMessage(msg, messageSecret, authState.creds.me.id, authState.creds.me.lid, logger);
                    }
                    else {
                        logger.warn({ targetMessageKey }, 'missing original message secret for secret encrypted message');
                    }
                    if (normalizeMessageContent(msg.message)?.secretEncryptedMessage) {
                        logger.warn({ targetMessageKey }, 'dropping undecrypted secret encrypted message');
                        return;
                    }
                }
                await upsertMessage(msg, node.attrs.offline ? 'append' : 'notify');
`,
);

console.log('Baileys secretEncryptedMessage patch applied');
