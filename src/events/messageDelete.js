import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Entrada de rol por reacción limpiada para el mensaje eliminado manualmente ${message.id} en el servidor ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                description: `Reaction role message was deleted manually and removed from database.`,
                channelId: message.channel?.id,
                fields: [
                  {
                    name: '🗑️ ID del Mensaje',
                    value: message.id,
                    inline: true
                  },
                  {
                    name: '📍 Canal',
                    value: message.channel ? `${message.channel.toString()} (${message.channel.id})` : 'Desconocido',
                    inline: true
                  },
                  {
                    name: '🧹 Limpieza',
                    value: 'Entrada de la base de datos eliminada automáticamente',
                    inline: false
                  }
                ]
              }
            });
          } catch (logCleanupError) {
            logger.warn('Error al registrar la limpieza del rol por reacción tras la eliminación manual del mensaje:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Error al limpiar los datos de rol por reacción del mensaje eliminado ${message.id}:`, reactionRoleCleanupError);
      }

      if (message.author?.bot) return;

      const fields = [];

      
      if (message.author) {
        fields.push({
          name: '👤 Autor',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true
        });
      }

      
      fields.push({
        name: '💬 Canal',
        value: `${message.channel.toString()} (${message.channel.id})`,
        inline: true
      });

      
      if (message.content) {
        const content = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH 
          ? message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3) + '...' 
          : message.content;
        fields.push({
          name: '📝 Contenido',
          value: content || '*(mensaje vacío)*',
          inline: false
        });
      }

      
      fields.push({
        name: '🆔 ID del Mensaje',
        value: message.id,
        inline: true
      });

      
      fields.push({
        name: '📅 Creado',
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true
      });

      
      if (message.attachments.size > 0) {
        fields.push({
          name: '📎 Archivos adjuntos',
          value: message.attachments.size.toString(),
          inline: true
        });
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          description: `Se eliminó un mensaje en ${message.channel.toString()}`,
          userId: message.author?.id,
          channelId: message.channel.id,
          fields
        }
      });

    } catch (error) {
      logger.error('Error en el evento messageDelete:', error);
    }
  }
};
