const CustomEmbedBuilder = require('./embedBuilder');
const fs = require('fs-extra');
const path = require('path');

class ModalHandler {
    /**
     * Manejar envíos de modales
     */
    static async handleModalSubmit(interaction, client) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith('create_announcement_')) {
                await this.handleCreateAnnouncementModal(interaction);
            } else if (customId.startsWith('edit_announcement_')) {
                await this.handleEditAnnouncementModal(interaction);
            }
        } catch (error) {
            console.error('❌ Error manejando modal:', error);
            
            const errorMessage = {
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al procesar el modal.',
                    'error'
                )],
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    /**
     * Manejar modal de creación de anuncio
     */
    static async handleCreateAnnouncementModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const id = interaction.customId.replace('create_announcement_', '');
        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');
        const color = interaction.fields.getTextInputValue('color') || '#00FF88';
        const image = interaction.fields.getTextInputValue('image') || null;

        // Validar color
        if (!this.isValidHexColor(color)) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'El color debe ser un valor hexadecimal válido (ej: #FF0000).',
                    'error'
                )]
            });
        }

        // Crear nuevo anuncio
        const newAnnouncement = {
            title,
            description,
            color,
            options: []
        };

        if (image) {
            newAnnouncement.image = image;
        }

        // Guardar en configuración
        const config = await this.getConfig();
        config.announcements[id] = newAnnouncement;
        await this.saveConfig(config);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Anuncio Creado',
                `El anuncio "${id}" ha sido creado exitosamente.\n\n**Siguiente paso:** Usa \`/manage-announcements add-option\` para añadir opciones de ticket.`,
                'success'
            )]
        });
    }

    /**
     * Manejar modal de edición de anuncio
     */
    static async handleEditAnnouncementModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const id = interaction.customId.replace('edit_announcement_', '');
        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');
        const color = interaction.fields.getTextInputValue('color') || '#00FF88';
        const image = interaction.fields.getTextInputValue('image') || null;

        // Validar color
        if (!this.isValidHexColor(color)) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'El color debe ser un valor hexadecimal válido (ej: #FF0000).',
                    'error'
                )]
            });
        }

        // Actualizar anuncio
        const config = await this.getConfig();
        
        if (!config.announcements[id]) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'El anuncio ya no existe.',
                    'error'
                )]
            });
        }

        // Mantener las opciones existentes
        const existingOptions = config.announcements[id].options || [];

        config.announcements[id] = {
            title,
            description,
            color,
            options: existingOptions
        };

        if (image) {
            config.announcements[id].image = image;
        }

        await this.saveConfig(config);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Anuncio Actualizado',
                `El anuncio "${id}" ha sido actualizado exitosamente.`,
                'success'
            )]
        });
    }

    /**
     * Validar color hexadecimal
     */
    static isValidHexColor(color) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }

    /**
     * Obtener configuración
     */
    static async getConfig() {
        const configPath = path.join(__dirname, '..', 'config.json');
        return await fs.readJson(configPath);
    }

    /**
     * Guardar configuración
     */
    static async saveConfig(config) {
        const configPath = path.join(__dirname, '..', 'config.json');
        await fs.writeJson(configPath, config, { spaces: 2 });
    }
}

module.exports = ModalHandler;