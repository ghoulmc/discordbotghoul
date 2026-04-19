import { SlashCommandBuilder, version } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Ver las estadísticas técnicas del bot"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

      const embed = createEmbed({ 
          title: "📊 Estadísticas del Sistema", 
          description: "Métricas de rendimiento de GhoulMC." 
      }).addFields(
        { name: "Servidores", value: `${totalGuilds}`, inline: true },
        { name: "Usuarios", value: `${totalMembers}`, inline: true },
        { name: "Memoria", value: `${memoryUsed} MB`, inline: true },
        { name: "Node.js", value: `\`${process.version}\``, inline: true },
        { name: "Discord.js", value: `\`v${version}\``, inline: true },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Error en comando stats:', error);
    }
  },
};

