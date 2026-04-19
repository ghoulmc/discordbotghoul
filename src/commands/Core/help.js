import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Identificadores y constantes
const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};

async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Todos los Comandos",
            description: "Ver lista completa de comandos con paginación",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Comandos de la categoría ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "GhoulMC";
    const embed = createEmbed({ 
        title: `🤖 Centro de Ayuda de ${botName}`,
        description: "Tu compañero integral para moderación, economía, diversión y gestión del servidor.",
        color: 'primary'
    });

    embed.addFields(
        { name: "🛡️ **Moderación**", value: "Herramientas de gestión y sanción", inline: true },
        { name: "💰 **Economía**", value: "Sistema de monedas y tiendas", inline: true },
        { name: "🎮 **Diversión**", value: "Juegos y comandos interactivos", inline: true },
        { name: "📊 **Niveles**", value: "XP y progresión de usuarios", inline: true },
        { name: "🎫 **Tickets**", value: "Sistema de soporte y gestión", inline: true },
        { name: "🎉 **Sorteos**", value: "Gestión de giveaways automáticos", inline: true },
        { name: "👋 **Bienvenida**", value: "Mensajes y roles de ingreso", inline: true },
        { name: "🎂 **Cumpleaños**", value: "Seguimiento de fechas especiales", inline: true },
        { name: "👥 **Comunidad**", value: "Postulaciones y herramientas sociales", inline: true },
        { name: "⚙️ **Config**", value: "Ajustes del bot y del servidor", inline: true },
        { name: "🔢 **Contadores**", value: "Canales de estadísticas en vivo", inline: true },
        { name: "🎙️ **Vocales**", value: "Canales temporales automáticos", inline: true }
    );

    embed.setFooter({ text: "Desarrollado con ❤️ para GhoulMC" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Reportar Error")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Servidor de Soporte")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Selecciona una categoría para ver los comandos",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([bugReportButton, supportButton]);

    return { embeds: [embed], components: [buttonRow, selectRow] };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Muestra el menú de ayuda con todos los comandos disponibles"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        // Auto-cierre del menú para limpiar la UI
        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Menú de ayuda cerrado",
                    description: "El tiempo ha expirado. Usa `/help` de nuevo si necesitas más ayuda.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (e) { /* Ignorar si el mensaje fue borrado */ }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
