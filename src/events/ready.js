import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`¡Listo! Conectado como ${client.user.tag}`);
      startupLog(`Sirviendo a ${client.guilds.cache.size} servidor(es)`);
      startupLog(`${client.commands.size} comandos cargados`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reconciliación de roles por reacción: escaneados ${reconciliationSummary.scannedMessages}, eliminados ${reconciliationSummary.removedMessages}, errores ${reconciliationSummary.errors}`
      );
    } catch (error) {
      logger.error("Error en el evento ready:", error);
    }
  },
};


