import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Calcula la latencia del bot y la API"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const latency = Date.now() - interaction.createdTimestamp;
            const apiLatency = Math.round(interaction.client.ws.ping);

            const embed = createEmbed({ 
                title: "🏓 ¡Pong!", 
                description: "Estado de la conexión en tiempo real." 
            }).addFields(
                { name: "Latencia Bot", value: `\`${latency}ms\``, inline: true },
                { name: "Latencia API", value: `\`${apiLatency}ms\``, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error en comando ping:', error);
        }
    },
};
