import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
    getJoinToCreateConfig, 
    registerTemporaryChannel, 
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
    formatChannelName
} from '../utils/database.js';
import { sanitizeInput } from '../utils/sanitization.js';
import { logger } from '../utils/logger.js';

const channelCreationCooldown = new Map();
const VOICE_CREATE_COOLDOWN_MS = 2000;
const DEFAULT_VOICE_BITRATE = 64000;
const MAX_VOICE_BITRATE = 384000;
const MIN_VOICE_BITRATE = 8000;
const MAX_CHANNEL_NAME_LENGTH = 100;
const FALLBACK_CHANNEL_NAME = 'Sala de Voz';
const MAX_TRACKED_COOLDOWNS = 10000;

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        if (newState.member.user.bot) return;

        const guildId = newState.guild.id;
        const userId = newState.member.id;
        const cooldownKey = `${guildId}-${userId}`;
        cleanupCooldownEntries();

        try {
            const config = await getJoinToCreateConfig(client, guildId);

            if (!config.enabled || config.triggerChannels.length === 0) {
                return;
            }

            if (!oldState.channel && newState.channel) {
                await handleVoiceJoin(client, newState, config);
            }

            if (oldState.channel && !newState.channel) {
                await handleVoiceLeave(client, oldState, config);
            }

            if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await handleVoiceMove(client, oldState, newState, config);
            }

        } catch (error) {
            logger.error(`Error en voiceStateUpdate para el servidor ${guildId}:`, error);
        }

        async function handleVoiceJoin(client, state, config) {
            const { channel, member } = state;

            if (!config.triggerChannels.includes(channel.id)) {
                return;
            }

            const now = Date.now();
            if (channelCreationCooldown.has(cooldownKey)) {
                const lastCreation = channelCreationCooldown.get(cooldownKey);
if (now - lastCreation < VOICE_CREATE_COOLDOWN_MS) {
                    logger.warn(`El usuario ${member.id} está en cooldown para crear canales`);
                    return;
                }
            }

            const existingTempChannel = Object.keys(config.temporaryChannels || {}).find(
                tempChannelId => {
                    const tempInfo = config.temporaryChannels[tempChannelId];
                    return tempInfo && tempInfo.ownerId === member.id;
                }
            );

            if (existingTempChannel) {
                const tempChannel = state.guild.channels.cache.get(existingTempChannel);
                if (tempChannel) {
                    try {
                        await member.voice.setChannel(tempChannel);
                        return;
                    } catch (error) {
                        logger.warn(`Error al mover al usuario ${member.id} al canal existente ${existingTempChannel}:`, error);
                    }
                }
            }

            if (member.voice.channel?.id !== channel.id) {
                return;
            }

            channelCreationCooldown.set(cooldownKey, now);
            trimCooldownMapIfNeeded();

            await createTemporaryChannel(client, state, config);
        }

        async function handleVoiceLeave(client, state, config) {
            const { channel, member } = state;

            const tempChannelInfo = await getTemporaryChannelInfo(client, state.guild.id, channel.id);
            
            if (!tempChannelInfo) {
                return;
            }

            if (channel.members.size === 0) {
                await deleteTemporaryChannel(client, channel, state.guild.id);
            } else if (tempChannelInfo.ownerId === member.id) {
                const nextMember = channel.members.first();
                if (nextMember) {
                    await transferChannelOwnership(client, channel, state.guild.id, nextMember.id);
                }
            }
        }

        async function handleVoiceMove(client, oldState, newState, config) {
            if (oldState.channel) {
                const tempChannelInfo = await getTemporaryChannelInfo(client, oldState.guild.id, oldState.channel.id);
                
                if (tempChannelInfo) {
                    if (oldState.channel.members.size === 0) {
                        await deleteTemporaryChannel(client, oldState.channel, oldState.guild.id);
                    } else if (tempChannelInfo.ownerId === oldState.member.id) {
                        const nextMember = oldState.channel.members.first();
                        if (nextMember) {
                            await transferChannelOwnership(client, oldState.channel, oldState.guild.id, nextMember.id);
                        }
                    }
                }
            }

            if (config.triggerChannels.includes(newState.channel.id) && 
                !config.triggerChannels.includes(oldState.channel?.id)) {
                await handleVoiceJoin(client, newState, config);
            }
        }

        async function createTemporaryChannel(client, state, config) {
            const { channel: triggerChannel, member, guild } = state;

            try {
                const me = guild.members.me;
                if (!me) {
                    logger.warn(`Caché del bot no disponible al crear canal temporal en el servidor ${guild.id}`);
                    channelCreationCooldown.delete(cooldownKey);
                    return;
                }

                const triggerPermissions = triggerChannel.permissionsFor(me);
                if (!triggerPermissions?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect])) {
                    logger.warn(`Permisos insuficientes para crear canal temporal en el servidor ${guild.id} (canal disparador ${triggerChannel.id})`);
                    channelCreationCooldown.delete(cooldownKey);
                    return;
                }

                const channelOptions = config.channelOptions?.[triggerChannel.id] || {};
                const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate || "{username}'s Room";
                
                let userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
                const bitrate = clampVoiceBitrate(channelOptions.bitrate ?? config.bitrate ?? DEFAULT_VOICE_BITRATE);

                userLimit = Math.max(0, Math.min(99, userLimit || 0));

                logger.info(`Creando canal temporal para el usuario ${member.id} con límite de usuarios: ${userLimit}`);

                const channelName = sanitizeVoiceChannelName(formatChannelName(nameTemplate, {
                    username: member.user.username,
                    userTag: member.user.tag,
                    displayName: member.displayName,
                    guildName: guild.name,
                    channelName: triggerChannel.name
                }));

                if (!member.voice?.channel || member.voice.channel.id !== triggerChannel.id) {
                    logger.debug(`El miembro ${member.id} ya no está en el canal disparador ${triggerChannel.id}, cancelando creación del canal temporal`);
                    channelCreationCooldown.delete(cooldownKey);
                    return;
                }

                const tempChannel = await guild.channels.create({
                    name: channelName,
type: ChannelType.GuildVoice,
                    parent: triggerChannel.parentId,
userLimit: userLimit === 0 ? undefined : userLimit,
                    bitrate: bitrate,
                    permissionOverwrites: [
                        {
                            id: member.id,
                            allow: ['Connect', 'Speak', 'PrioritySpeaker', 'MoveMembers']
                        },
                        {
                            id: guild.id,
                            allow: ['Connect', 'Speak']
                        }
                    ]
                });

                await registerTemporaryChannel(client, guild.id, tempChannel.id, member.id, triggerChannel.id);

                if (member.voice?.channel?.id === triggerChannel.id) {
                    await member.voice.setChannel(tempChannel);
                } else {
                    logger.debug(`Se omitió mover a ${member.id} al canal temporal ${tempChannel.id} porque el estado de voz cambió`);
                }

                logger.info(`Canal de voz temporal ${tempChannel.name} (${tempChannel.id}) creado para ${member.user.tag} en ${guild.name} con límite de ${userLimit} usuarios`);

            } catch (error) {
                logger.error(`Error al crear canal temporal para ${member.user.tag} en ${guild.name}:`, error);
                
                channelCreationCooldown.delete(cooldownKey);
                
                try {
                    await member.send({
                        content: `❌ No se pudo crear tu canal de voz temporal. Contacta con un administrador del servidor GhoulMC.`
                    });
                } catch (dmError) {
                    logger.debug(`No se pudo enviar DM de fallo de canal temporal al usuario ${member.id}:`, dmError);
                }
            }
        }

        async function deleteTemporaryChannel(client, channel, guildId) {
            try {
                await unregisterTemporaryChannel(client, guildId, channel.id);

                await channel.delete('Canal de voz temporal - vacío');

                logger.info(`Canal de voz temporal ${channel.name} (${channel.id}) eliminado en ${channel.guild.name}`);

            } catch (error) {
                logger.error(`Error al eliminar el canal temporal ${channel.id}:`, error);
            }
        }

        async function transferChannelOwnership(client, channel, guildId, newOwnerId) {
            try {
                const config = await getJoinToCreateConfig(client, guildId);
                const tempChannelInfo = config.temporaryChannels[channel.id];
                
                if (!tempChannelInfo) return;

                config.temporaryChannels[channel.id].ownerId = newOwnerId;
                await client.db.set(`guild:${guildId}:jointocreate`, config);

                const newOwner = await channel.guild.members.fetch(newOwnerId);
                if (newOwner) {
                    const channelOptions = config.channelOptions?.[tempChannelInfo.triggerChannelId] || {};
                    const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate;
                    
                    const newChannelName = sanitizeVoiceChannelName(formatChannelName(nameTemplate, {
                        username: newOwner.user.username,
                        userTag: newOwner.user.tag,
                        displayName: newOwner.displayName,
                        guildName: channel.guild.name,
                        channelName: channel.guild.channels.cache.get(tempChannelInfo.triggerChannelId)?.name || 'Canal de Voz'
                    }));

                    await channel.setName(newChannelName);
                }

                logger.info(`Transferida la propiedad del canal temporal ${channel.id} al usuario ${newOwnerId}`);

            } catch (error) {
                logger.error(`Error al transferir la propiedad del canal ${channel.id}:`, error);
            }
        }
    }
};

function sanitizeVoiceChannelName(inputName) {
    const safeName = sanitizeInput(String(inputName || ''), MAX_CHANNEL_NAME_LENGTH)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return safeName || FALLBACK_CHANNEL_NAME;
}

function clampVoiceBitrate(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_VOICE_BITRATE;
    }

    return Math.max(MIN_VOICE_BITRATE, Math.min(MAX_VOICE_BITRATE, Math.floor(parsed)));
}

function cleanupCooldownEntries() {
    const now = Date.now();
    for (const [key, timestamp] of channelCreationCooldown.entries()) {
        if (now - timestamp >= VOICE_CREATE_COOLDOWN_MS) {
            channelCreationCooldown.delete(key);
        }
    }
}

function trimCooldownMapIfNeeded() {
    if (channelCreationCooldown.size <= MAX_TRACKED_COOLDOWNS) {
        return;
    }

    const entries = [...channelCreationCooldown.entries()].sort((a, b) => a[1] - b[1]);
    const removeCount = channelCreationCooldown.size - MAX_TRACKED_COOLDOWNS;
    for (let index = 0; index < removeCount; index += 1) {
        channelCreationCooldown.delete(entries[index][0]);
    }
}



