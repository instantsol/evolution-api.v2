const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS contact_with_last_message`)
  await prisma.$executeRawUnsafe(`
    
      CREATE OR REPLACE VIEW contact_with_last_message AS
      SELECT c.*,
            m.id AS last_message_id,
            m.message AS message,
            m."messageTimestamp" as lastmessagetimestamp,
            m."messageType" as messagetype,
            (m.key->>'fromMe') AS fromme,
            i.name AS instancename
      FROM "Contact" c
      INNER JOIN "Instance" i on
      i.id = c."instanceId"
      LEFT JOIN LATERAL (
        SELECT *
        FROM "Message" m
        WHERE (m.key->>'remoteJid') = c."remoteJid" and "instanceId" = c."instanceId"
        ORDER BY "messageTimestamp" DESC
        LIMIT 1
      ) m ON TRUE
  `);
  await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_message_remotejid_createdat
      ON "Message" ((key->>'remoteJid'), "messageTimestamp" DESC);
  `);
  console.log('View contact_with_last_message criada com sucesso!');

    await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS message_with_remotejid`)
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW message_with_remotejid AS
      SELECT *, (key->>'remoteJid') as remoteJid,
      (key->>'id') AS messageId,
      (message->>'conversation') AS text
      FROM "Message" 
  `);
}



main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });