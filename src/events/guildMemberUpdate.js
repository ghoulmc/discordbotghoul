import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      const fields = [];

      
      fields.push({
        name: '👤 Miembro',
        value: `${newMember.user.tag} (${newMember.user.id})`,
        inline: true
      });

      
      if (oldMember.nickname !== newMember.nickname) {
        fields.push({
          name: '🏷️ Apodo Anterior',
          value: oldMember.nickname || '*(sin apodo)*',
          inline: true
        });

        fields.push({
          name: '🏷️ Apodo Nuevo',
          value: newMember.nickname || '*(sin apodo)*',
          inline: true
        });

        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `Apodo de miembro cambiado: ${newMember.user.tag}`,
            userId: newMember.user.id,
            fields
          }
        });

        return;
      }

    } catch (error) {
      logger.error('Error en el evento guildMemberUpdate:', error);
    }
  }
};
