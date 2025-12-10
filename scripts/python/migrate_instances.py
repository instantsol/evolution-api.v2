from pymongo import MongoClient
import os
from datetime import datetime
from dotenv import load_dotenv
import psycopg2
import json
import base64

load_dotenv()

def bool2(text: str) -> bool:
  if text == 'false' or not text:
    return False
  return True

def convert_bytes(obj):
    if isinstance(obj, bytes):
        return base64.b64encode(obj).decode("utf-8")
    raise TypeError(f"Tipo não serializável: {type(obj)}")

WEBHOOK_EVENTS = ["QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE",
                  "CONTACTS_UPDATE", "CHATS_UPSERT", "CHATS_UPDATE", "CHATS_DELETE", "GROUPS_UPSERT", "GROUP_UPDATE", "CONNECTION_UPDATE"] 
WEBHOOK_URL = os.getenv('WEBHOOK')

def migrate():


  client = MongoClient(os.getenv('MONGO_STRING'))  
  postgresql = psycopg2.connect(os.getenv('POSTGRES_STRING'))


  db = client["evolution-whatsapp-api"]


  mongo_authentication = db["authentication"]
  # mongo_contacts = db["contacts"]
  # mongo_settings = db["settings"]
  # mongo_messages = db["messages"]
  # mongo_chats = db["chats"]


  


  with postgresql.cursor() as curr:
    # Executar consulta
    curr.execute("SET search_path TO evolution_api;")
    curr.execute('delete from "Instance"')
    curr.execute('delete from "Session"')
    curr.execute('delete from "Contact"')
    curr.execute('delete from "Setting"')
    curr.execute('delete from "Message"')
    curr.execute('delete from "Chat"')
    curr.execute('delete from "Webhook"')
    
    for instance in mongo_authentication.find(
      #{'instanceId': 'd5260865-787a-4cda-afd3-4f8ec3651804'}
      ):
      #integration = db["integration"].find_one({'_id': instance['_id']})
      try:
        accountcode, phone_number = instance['_id'].split('_')
      except:
        print(f'ignoring id: [{instance["_id"]}]. Not splittable.')
        continue
      # Create instance
      curr.execute("""INSERT INTO "Instance" (id, name, "connectionStatus", integration, token, "clientName", "createdAt", "updatedAt", "ownerJid", number) 
                 VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, %s)""", 
                 tuple([instance['instanceId'], instance['_id'], 'open', 'WHATSAPP-BAILEYS',
                        instance['apikey'], 'evolution_exchange', f'{phone_number}@s.whatsapp.net', phone_number]))
      
      # Create session
      mongo_instance = client['evolution-instances'][instance['_id']].find_one({'_id': 'creds'})
      mongo_instance.pop('_id', '')
      session_data = json.dumps(json.dumps(mongo_instance)).replace(' ', '')
      curr.execute("""
                   INSERT INTO "Session" (id, "sessionId", creds, "createdAt") VALUES (%s, %s, %s, NOW())
                   """, tuple([instance['instanceId'], instance['instanceId'], session_data]))
      # Get contacts
      mongo_contacts = [contact for contact in db["contacts"].find({"owner": instance['_id']})]
      contact_list = {f"{contact['id']}_{instance['instanceId']}":tuple([f"{index}-{instance['instanceId']}", 
                          contact['id'], contact.get('pushName') or '', contact['profilePictureUrl'], instance['instanceId'],
                          contact.get('kwik_contact_id'), contact.get('kwik_contact_name')]) 
                      for index, contact in enumerate(mongo_contacts) if contact['id'] is not None}
      curr.executemany("""
                       INSERT INTO "Contact" (id, "remoteJid", "pushName", "profilePicUrl", "updatedAt", "instanceId", kwik_contact_id, kwik_contact_name)
                       VALUES (%s, %s, %s, %s, NOW(), %s, %s, %s)
                       """, tuple(contact_list.values()))
      # Get Settings
      mongo_settings = db["settings"].find_one({'_id': instance['_id']})
      settings = tuple([instance['_id'],
                     bool2(mongo_settings['reject_call']), mongo_settings['msg_call'], bool2(mongo_settings['groups_ignore']),
                     bool2(mongo_settings['always_online']), bool2(mongo_settings['read_messages']), bool2(mongo_settings['read_status']),
                     bool2(mongo_settings['sync_full_history']), instance['instanceId'], mongo_settings['ignore_list'],
                     datetime.fromtimestamp(mongo_settings.get('initial_connection') or 0),
                     mongo_settings.get('media_types') or []
                   ])
      curr.execute("""
                   INSERT INTO "Setting" (
                   id, 
                   "rejectCall", "msgCall", "groupsIgnore", 
                   "alwaysOnline", "readMessages", "readStatus", "syncFullHistory", 
                   "createdAt", "updatedAt", "instanceId", "ignoreList",
                   "initialConnection", "mediaTypes", "wavoipToken") 
                   VALUES (%s, %s, 
                   %s, %s, %s, %s, %s, %s, 
                   NOW(), NOW(), %s, %s, %s, %s, '')
                   """, settings)      
      # Get messages
      mongo_messages = [message for message in db["messages"].find({"owner": instance['_id']})]
      message_list = [tuple([
        f"{index}-{instance['instanceId']}",
        json.dumps(message['key']), 
        message.get('pushName') or '', message['messageType'], json.dumps(message['message'], default=convert_bytes), 'web',
        message['messageTimestamp'], instance['instanceId'], 
        ]) for index, message in enumerate(mongo_messages)]

      curr.executemany("""
                       INSERT INTO "Message" (id, "key", "pushName", "messageType", "message", "source", "messageTimestamp", "instanceId")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       """, tuple(message_list))

      curr.execute("""INSERT INTO "Webhook" (id, url, enabled, events, "webhookByEvents", "webhookBase64", "updatedAt", "instanceId")
                   VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)""", tuple([instance['instanceId'], WEBHOOK_URL, True, json.dumps(WEBHOOK_EVENTS),
                                                                      False, True, instance['instanceId']]))

      postgresql.commit()


  postgresql.close()

if __name__ == '__main__':
  migrate()