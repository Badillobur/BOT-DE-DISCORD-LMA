const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ConfigManager = require('./configManager');
const moment = require('moment');

class CustomEmbedBuilder {
    /**
     * Crear embed para anuncio personalizado
     * @param {string} announcementKey - Clave del anuncio en config
     * @param {Object} customData - Datos personalizados opcionales
     * @param {string} guildId - ID del servidor (opcional)
     */
    static async createAnnouncementEmbed(announcementKey, customData = {}, guildId = null) {
        let config;
        if (guildId) {
            config = await ConfigManager.getGuildConfig(guildId);
        } else {
            // Fallback a configuración global si no se especifica guildId
            const globalConfigPath = require('path').join(__dirname, '..', 'config.json');
            config = require('fs-extra').readJsonSync(globalConfigPath);
        }

        const announcement = config.announcements[announcementKey];
        if (!announcement) {
            throw new Error(`Anuncio "${announcementKey}" no encontrado en la configuración`);
        }

        const embed = new EmbedBuilder()
            .setTitle(customData.title || announcement.title)
            .setDescription(customData.description || announcement.description)
            .setColor(customData.color || announcement.color || config.embedColor)
            .setTimestamp()
            .setFooter({ 
                text: `${announcementKey.toUpperCase()} • ${moment().format('DD/MM/YYYY HH:mm')}`,
                iconURL: customData.footerIcon || null
            });

        if (announcement.image || customData.image) {
            embed.setImage(customData.image || announcement.image);
        }

        if (announcement.thumbnail || customData.thumbnail) {
            embed.setThumbnail(customData.thumbnail || announcement.thumbnail);
        }

        if (customData.author) {
            embed.setAuthor({
                name: customData.author.name,
                iconURL: customData.author.iconURL,
                url: customData.author.url
            });
        }

        return embed;
    }

    /**
     * Crear menú de selección para tickets
     * @param {string} announcementKey - Clave del anuncio
     * @param {string} customId - ID personalizado para el menú
     * @param {string} guildId - ID del servidor (opcional)
     */
    static async createTicketSelectMenu(announcementKey, customId = 'ticket_select', guildId = null) {
        let config;
        if (guildId) {
            config = await ConfigManager.getGuildConfig(guildId);
        } else {
            // Fallback a configuración global si no se especifica guildId
            const globalConfigPath = require('path').join(__dirname, '..', 'config.json');
            config = require('fs-extra').readJsonSync(globalConfigPath);
        }

        const announcement = config.announcements[announcementKey];
        if (!announcement || !announcement.options) {
            throw new Error(`Opciones de ticket no encontradas para "${announcementKey}"`);
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${customId}_${announcementKey}`)
            .setPlaceholder('Seleccionar una opción')
            .setMinValues(1)
            .setMaxValues(1);

        announcement.options.forEach(option => {
            selectMenu.addOptions({
                label: option.label,
                description: option.description,
                value: option.value,
                emoji: option.emoji || null
            });
        });

        return new ActionRowBuilder().addComponents(selectMenu);
    }

    /**
     * Crear botones de acción
     * @param {Array} buttons - Array de configuraciones de botones
     */
    static createActionButtons(buttons) {
        const row = new ActionRowBuilder();

        buttons.forEach(button => {
            const btn = new ButtonBuilder()
                .setCustomId(button.customId)
                .setLabel(button.label)
                .setStyle(button.style || ButtonStyle.Primary);

            if (button.emoji) btn.setEmoji(button.emoji);
            if (button.url) btn.setURL(button.url).setStyle(ButtonStyle.Link);
            if (button.disabled) btn.setDisabled(true);

            row.addComponents(btn);
        });

        return row;
    }

    /**
     * Crear embed de información de ticket
     * @param {Object} ticketData - Datos del ticket
     */
    static createTicketInfoEmbed(ticketData) {
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket: ${ticketData.type}`)
            .setDescription(`**Usuario:** <@${ticketData.userId}>\n**Opción:** ${ticketData.option}\n**Estado:** ${ticketData.status}`)
            .setColor('#FFD700')
            .setTimestamp()
            .addFields(
                { name: '📝 Descripción', value: ticketData.description || 'Sin descripción', inline: false },
                { name: '⏰ Creado', value: moment(ticketData.createdAt).format('DD/MM/YYYY HH:mm'), inline: true },
                { name: '🔢 ID', value: ticketData.id, inline: true }
            );

        return embed;
    }

    /**
     * Crear embed de confirmación
     * @param {string} title - Título del embed
     * @param {string} description - Descripción
     * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
     */
    static createConfirmationEmbed(title, description, type = 'success') {
        const colors = {
            success: '#00FF00',
            error: '#FF0000',
            warning: '#FFA500',
            info: '#0099FF'
        };

        const emojis = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        return new EmbedBuilder()
            .setTitle(`${emojis[type]} ${title}`)
            .setDescription(description)
            .setColor(colors[type])
            .setTimestamp();
    }

    /**
     * Crear embed de ayuda/información
     * @param {Array} commands - Lista de comandos
     * @param {string} guildId - ID del servidor (opcional)
     */
    static async createHelpEmbed(commands, guildId = null) {
        let config;
        if (guildId) {
            config = await ConfigManager.getGuildConfig(guildId);
        } else {
            // Fallback a configuración global
            const globalConfigPath = require('path').join(__dirname, '..', 'config.json');
            config = require('fs-extra').readJsonSync(globalConfigPath);
        }

        const embed = new EmbedBuilder()
            .setTitle('📚 Comandos Disponibles')
            .setDescription('Lista de comandos disponibles para el bot')
            .setColor(config.embedColor)
            .setTimestamp();

        commands.forEach(cmd => {
            embed.addFields({
                name: `${config.prefix}${cmd.name}`,
                value: cmd.description || 'Sin descripción',
                inline: true
            });
        });

        return embed;
    }
}

module.exports = CustomEmbedBuilder;