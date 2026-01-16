from pymongo import MongoClient
import os
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

    curr.execute('delete from "Webhook"')
    
    curr.execute('select name from "Instance"')
    ignorelist = set([each[0] for each in curr.fetchall()])

    for instance in mongo_authentication.find(
      #{'_id': 'isacr00123_5511952970249'}
      #{'instanceId': 'd5260865-787a-4cda-afd3-4f8ec3651804'}
      ):
      #integration = db["integration"].find_one({'_id': instance['_id']})
      if instance['_id'] in ignorelist:
        print('ignoring ', instance['_id'])
        continue
      try:
        accountcode, phone_number = instance['_id'].split('_')
      except:
        print(f'ignoring id: [{instance["_id"]}]. Not splittable.')
        continue
      # Create instance
      
      curr.execute("""INSERT INTO "Webhook" (id, url, enabled, events, "webhookByEvents", "webhookBase64", "updatedAt", "instanceId")
                   VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)""", tuple([instance['instanceId'], WEBHOOK_URL, True, json.dumps(WEBHOOK_EVENTS),
                                                                      False, True, instance['instanceId']]))

      postgresql.commit()


  postgresql.close()

if __name__ == '__main__':
  migrate()
