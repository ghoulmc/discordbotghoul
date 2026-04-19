import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      
      if (oldMessage.content === newMessage.content) return;

      const fields = [];

      
      if (newMessage.author) {
        fields.push({
          name: '👤 Autor',
          value: `${newMessage.author.tag} (${newMessage.author.id})`,
          inline: true
        });
      }

      
      fields.push({
        name: '💬 Canal',
        value: `${newMessage.channel.toString()} (${newMessage.channel.id})`,
        inline: true
      });

      
      const oldContent = oldMessage.content || '*(mensaje vacío)*';
      const oldContentTruncated = oldContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH 
        ? oldContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3) + '...' 
        : oldContent;
      fields.push({
        name: '📝 Contenido Anterior',
        value: oldContentTruncated,
        inline: false
      });

      
      const newContent = newMessage.content || '*(mensaje vacío)*';
      const newContentTruncated = newContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH 
        ? newContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3) + '...' 
        : newContent;
      fields.push({
        name: '📝 Contenido Nuevo',
        value: newContentTruncated,
        inline: false
      });

      
      fields.push({
        name: '🆔 ID del Mensaje',
        value: newMessage.id,
        inline: true
      });

      await logEvent({
        client: newMessage.client,
        guildId: newMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          description: `Se editó un mensaje en ${newMessage.channel.toString()}`,
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
          fields
        }
      });

    } catch (error) {
      logger.error('Error en el evento messageUpdate:', error);
    }
  }
};
