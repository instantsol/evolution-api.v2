import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { kwikController } from '@api/server.module';
import { Logger } from '@config/logger.config';
import { RequestHandler, Router } from 'express';

const logger = new Logger('KwikRouter');

export class KwikRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router.get(this.routerPath('findChats'), ...guards, async (req, res) => {
      logger.verbose('request received in findChats');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.fetchChats(
            instance,
            Number(req.query.limit),
            Number(req.query.skip),
            req.query.sort,
            Number(req.query.messageTimestamp),
            req.query.remoteJid ? req.query.remoteJid.toString() : null,
          ),
      });

      return res.status(HttpStatus.OK).json(response);
    });
    this.router.post(this.routerPath('cleanup'), ...guards, async (req, res) => {
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.cleanup(instance),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get(this.routerPath('instanceInfo'), ...guards, async (req, res) => {
      logger.verbose('request received in instanceInfo');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.instanceInfo(instance, Number(req.query.messageTimestamp)),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('cleanChats'), ...guards, async (req, res) => {
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.cleanChats(instance),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('textSearch'), ...guards, async (req, res) => {
      logger.verbose('request received in textSearch');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.textSearch(instance, req.body),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get(this.routerPath('messageOffset'), ...guards, async (req, res) => {
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.messageOffset(
            instance,
            req.body.message_timestamp,
            req.body.remote_jid,
            req.body.sort,
            req.body.take,
            req.body.chat_message_id,
          ),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('updateContactCRM'), ...guards, async (req, res) => {
      logger.verbose('request received in updateContactCRM');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.updateContactCRM(
            instance,
            req.body.contact_id,
            req.body.kwik_contact_id,
            req.body.kwik_contact_name,
          ),
      });

      return res.status(HttpStatus.OK).json(response);
    });
    this.router.post(this.routerPath('updateCRMInfo'), ...guards, async (req, res) => {
      logger.verbose('request received in updateCRMInfo');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: () => kwikController.updateCRMInfo(req.body.kwik_contact_id, req.body.kwik_contact_name),
      });

      return res.status(HttpStatus.OK).json(response);
    });
    this.router.post(this.routerPath('deleteCRMInfo'), ...guards, async (req, res) => {
      logger.verbose('request received in deleteCRMInfo');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      logger.error('request received in deleteCRMInfo');
      logger.error('request body: ');
      logger.error(req.body);

      logger.error('request query: ');
      logger.error(req.query);
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: () => kwikController.deleteCRMInfo(req.body.kwik_contact_id),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('flagRestrictedWords'), ...guards, async (req, res) => {
      logger.verbose('request received in flagRestrictedWords');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.flagRestrictedWords(instance, req.body.message_id, req.body.word, req.body.group),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('updateTranscription'), ...guards, async (req, res) => {
      logger.verbose('request received in updateTranscription');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.updateTranscription(
            instance,
            req.body.message_id,
            req.body.transcription_text,
            req.body.transcription_status,
            req.body.transcription_error,
          ),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('findContacts'), ...guards, async (req, res) => {
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.fetchContacts(instance, req.body),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('findMessages'), ...guards, async (req, res) => {
      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.fetchMessages(instance, req.body),
      });

      return res.status(HttpStatus.OK).json(response);
    });
  }
  public readonly router = Router();
}
