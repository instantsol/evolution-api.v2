import { InstanceDto } from '@api/dto/instance.dto';
import { SettingsDto } from '@api/dto/settings.dto';
import { Logger } from '@config/logger.config';

import { WAMonitoringService } from './monitor.service';

type idMap = {
  id: String;
};

export class SettingsService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('SettingsService');

  public async create(instance: InstanceDto, data: SettingsDto) {
    const service = this.waMonitor.waInstances[instance.instanceName];
    await service.setSettings(data);

    if (data.ignoreList && data.ignoreList.length > 0) {
      // Cleanup old messages
      try {
        const instance_object = await service.prismaRepository.instance.findFirst({
          where: { name: instance.instanceName },
        });
        const toDelete = await service.prismaRepository.messageWithRemoteJid.findMany({
          where: { instanceId: instance_object.id, remotejid: { in: data.ignoreList } },
          select: { id: true },
        });
        await service.prismaRepository.message.deleteMany({ where: { id: { in: toDelete.map((m: idMap) => m.id) } } });
      } catch (e) {
        console.log(e);
      }
    }

    return { settings: { ...instance, settings: data } };
  }

  public async find(instance: InstanceDto): Promise<SettingsDto> {
    try {
      const result = await this.waMonitor.waInstances[instance.instanceName].findSettings();

      if (Object.keys(result).length === 0) {
        throw new Error('Settings not found');
      }

      return result;
    } catch {
      return null;
    }
  }
}
