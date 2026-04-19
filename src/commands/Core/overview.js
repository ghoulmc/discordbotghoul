import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getWelcomeConfig, getApplicationSettings } from '../../utils/database.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function pill(enabled) {
    return enabled ? '✅ Activado' : '❌ Desactivado';
}

async function formatChannelMention(guild, id) {
    if (!id) return '`No configurado`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ No encontrado (${id})`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('overview')
        .setDescription('Snapshot de todos los sistemas del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction, guildConfig) {
        await InteractionHelper.safeDefer(interaction);

        try {
            const embed = createEmbed({
                title: `⚙️ Resumen de Sistemas: ${interaction.guild.name}`,
                color: 'primary'
            }).addFields(
                {
                    name: '🛡️ Seguridad y Logs',
                    value: [
                        `**Log de Auditoría:** ${await formatChannelMention(interaction.guild, guildConfig.logging?.channelId)}`,
                        `**Reportes:** ${await formatChannelMention(interaction.guild, guildConfig.moderation?.reportsChannelId)}`,
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🎫 Soporte (Tickets)',
                    value: [
                        `**Estado:** ${pill(guildConfig.tickets?.enabled)}`,
                        `**Categoría:** ${guildConfig.tickets?.categoryId || '`No definida`'}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: '📊 Niveles y XP',
                    value: [
                        `**Estado:** ${pill(guildConfig.leveling?.enabled)}`,
                        `**Multiplicador:** x${guildConfig.leveling?.multiplier || 1}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: '🕒 Instantánea tomada en',
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    inline: false,
                }
            ).setFooter({ text: 'Usa /config para modificar estos ajustes' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error en overview:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error de Sistema', 'No se pudo cargar el resumen del servidor.')],
            });
        }
    },
};
