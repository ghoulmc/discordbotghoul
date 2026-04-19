import { 
    getJoinToCreateConfig, 
    removeJoinToCreateTrigger,
    unregisterTemporaryChannel,
    getTicketData,
    saveTicketData
} from '../utils/database.js';
import { getServerCounters, saveServerCounters } from '../services/serverstatsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: 'channelDelete',
    async execute(channel, client) {
        // Gestionar eliminación de canal de ticket
        if (channel.type === 0 && channel.guild) {
            try {
                const ticketData = await getTicketData(channel.guild.id, channel.id);
                if (ticketData && ticketData.status === 'open') {
                    ticketData.status = 'deleted';
                    ticketData.closedAt = new Date().toISOString();
                    await saveTicketData(channel.guild.id, channel.id, ticketData);
                    logger.info(`El canal de ticket ${channel.id} fue eliminado manualmente en el servidor ${channel.guild.id}, marcado como eliminado`);
                }
            } catch (err) {
                logger.warn(`No se pudo limpiar el registro de ticket del canal eliminado ${channel.id}:`, err);
            }
        }

if (channel.type !== 2 && channel.type !== 4) {
            return;
        }

        const guildId = channel.guild.id;

        try {
            // Comprobar si este canal es un canal de contador
            const counters = await getServerCounters(client, guildId);
            const orphanedCounter = counters.find(c => c.channelId === channel.id);
            
            if (orphanedCounter) {
                logger.info(`El canal de contador ${channel.name} (${channel.id}) fue eliminado, eliminando el contador ${orphanedCounter.id} de la base de datos`);
                
                const updatedCounters = counters.filter(c => c.channelId !== channel.id);
                const success = await saveServerCounters(client, guildId, updatedCounters);
                
                if (success) {
                    logger.info(`Contador huérfano ${orphanedCounter.id} (tipo: ${orphanedCounter.type}) eliminado correctamente del servidor ${guildId}`);
                } else {
                    logger.warn(`Error al eliminar el contador huérfano ${orphanedCounter.id} del servidor ${guildId}`);
                }
            }

            const config = await getJoinToCreateConfig(client, guildId);

            if (!config.enabled) {
                return;
            }

            if (config.triggerChannels.includes(channel.id)) {
                logger.info(`El canal disparador de Unirse para Crear ${channel.name} (${channel.id}) fue eliminado, quitando de la configuración`);
                
                const success = await removeJoinToCreateTrigger(client, guildId, channel.id);
                if (success) {
                    logger.info(`Canal disparador ${channel.id} eliminado correctamente de la configuración de Unirse para Crear`);
                } else {
                    logger.warn(`Error al eliminar el canal disparador ${channel.id} de la configuración de Unirse para Crear`);
                }
            }

            if (config.temporaryChannels[channel.id]) {
                logger.info(`El canal temporal de Unirse para Crear ${channel.name} (${channel.id}) fue eliminado, limpiando la base de datos`);
                
                const success = await unregisterTemporaryChannel(client, guildId, channel.id);
                if (success) {
                    logger.info(`Canal temporal ${channel.id} limpiado correctamente de la base de datos`);
                } else {
                    logger.warn(`Error al limpiar el canal temporal ${channel.id} de la base de datos`);
                }
            }

            if (config.categoryId === channel.id) {
                logger.warn(`La categoría ${channel.name} (${channel.id}) usada por Unirse para Crear fue eliminada. Unirse para Crear será desactivado.`);
                
                config.categoryId = null;
                config.enabled = false;
                
                try {
                    await client.db.set(`guild:${guildId}:jointocreate`, config);
                    logger.info(`Unirse para Crear desactivado para el servidor ${guildId} por eliminación de categoría`);
                } catch (error) {
                    logger.error(`Error al desactivar Unirse para Crear para el servidor ${guildId}:`, error);
                }
            }

        } catch (error) {
            logger.error(`Error en el evento channelDelete para el servidor ${guildId}:`, error);
        }
    }
};


