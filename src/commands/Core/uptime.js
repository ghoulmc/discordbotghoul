import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Muestra cuánto tiempo lleva el bot encendido"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      let s = interaction.client.uptime / 1000;
      let d = Math.floor(s / 86400);
      let h = Math.floor((s % 86400) / 3600);
      let m = Math.floor((s % 3600) / 60);
      let sec = Math.floor(s % 60);

      const uptimeStr = `${d}d ${h}h ${m}m ${sec}s`;

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ 
          title: "⏱️ Tiempo en Línea", 
          description: `El bot ha estado activo por:\n\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (error) {
      logger.error('Error en comando uptime:', error);
    }
  },
};
