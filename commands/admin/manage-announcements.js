const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage-announcements')
        .setDescription('Gestionar anuncios personalizados')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Ver todos los anuncios disponibles'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Crear un nuevo tipo de anuncio')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID único para el anuncio (sin espacios)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('titulo')
                        .setDescription('Título del anuncio')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Editar un anuncio existente')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID del anuncio a editar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Eliminar un anuncio')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID del anuncio a eliminar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Vista previa de un anuncio')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID del anuncio a previsualizar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-option')
                .setDescription('Añadir opción a un anuncio existente')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID del anuncio')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('label')
                        .setDescription('Texto de la opción')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Descripción de la opción')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('Valor único de la opción')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Emoji para la opción (opcional)')
                        .setRequired(false))),

    adminOnly: true,

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'list':
                    await this.handleListAnnouncements(interaction);
                    break;
                
                case 'create':
                    await this.handleCreateAnnouncement(interaction);
                    break;
                
                case 'edit':
                    await this.handleEditAnnouncement(interaction);
                    break;
                
                case 'delete':
                    await this.handleDeleteAnnouncement(interaction);
                    break;
                
                case 'preview':
                    await this.handlePreviewAnnouncement(interaction);
                    break;
                
                case 'add-option':
                    await this.handleAddOption(interaction);
                    break;
                
                default:
                    await interaction.reply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'Subcomando no válido.',
                            'error'
                        )],
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('❌ Error en manage-announcements:', error);
            
            const errorMessage = {
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al ejecutar el comando.',
                    'error'
                )],
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply(errorMessage);
            }
        }
    },

    async handleListAnnouncements(interaction) {
        const config = await this.getConfig();
        const announcements = config.announcements;

        if (Object.keys(announcements).length === 0) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Anuncios',
                    'No hay anuncios configurados.',
                    'info'
                )],
                ephemeral: true
            });
        }

        let description = '';
        Object.entries(announcements).forEach(([id, announcement]) => {
            const optionsCount = announcement.options ? announcement.options.length : 0;
            description += `**${id}**\n`;
            description += `📋 ${announcement.title}\n`;
            description += `🎯 ${optionsCount} opciones\n`;
            description += `🎨 Color: ${announcement.color || 'Por defecto'}\n\n`;
        });

        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            'Anuncios Disponibles',
            description,
            'info'
        );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleCreateAnnouncement(interaction) {
        const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
        const titulo = interaction.options.getString('titulo');

        // Verificar que el ID no existe
        const config = await this.getConfig();
        if (config.announcements[id]) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Ya existe un anuncio con el ID "${id}".`,
                    'error'
                )],
                ephemeral: true
            });
        }

        // Crear modal para más detalles
        const modal = new ModalBuilder()
            .setCustomId(`create_announcement_${id}`)
            .setTitle('Crear Nuevo Anuncio');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Título del Anuncio')
            .setStyle(TextInputStyle.Short)
            .setValue(titulo)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Descripción del Anuncio')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Escribe la descripción completa del anuncio...')
            .setRequired(true);

        const colorInput = new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Color (Hexadecimal)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('#00FF88')
            .setValue('#00FF88')
            .setRequired(false);

        const imageInput = new TextInputBuilder()
            .setCustomId('image')
            .setLabel('URL de Imagen (Opcional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://ejemplo.com/imagen.png')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    },

    async handleEditAnnouncement(interaction) {
        const id = interaction.options.getString('id');
        const config = await this.getConfig();

        if (!config.announcements[id]) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No existe un anuncio con el ID "${id}".`,
                    'error'
                )],
                ephemeral: true
            });
        }

        const announcement = config.announcements[id];

        // Crear modal con datos existentes
        const modal = new ModalBuilder()
            .setCustomId(`edit_announcement_${id}`)
            .setTitle(`Editar Anuncio: ${id}`);

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Título del Anuncio')
            .setStyle(TextInputStyle.Short)
            .setValue(announcement.title)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Descripción del Anuncio')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(announcement.description)
            .setRequired(true);

        const colorInput = new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Color (Hexadecimal)')
            .setStyle(TextInputStyle.Short)
            .setValue(announcement.color || '#00FF88')
            .setRequired(false);

        const imageInput = new TextInputBuilder()
            .setCustomId('image')
            .setLabel('URL de Imagen (Opcional)')
            .setStyle(TextInputStyle.Short)
            .setValue(announcement.image || '')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    },

    async handleDeleteAnnouncement(interaction) {
        const id = interaction.options.getString('id');
        const config = await this.getConfig();

        if (!config.announcements[id]) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No existe un anuncio con el ID "${id}".`,
                    'error'
                )],
                ephemeral: true
            });
        }

        // Crear botones de confirmación
        const confirmButtons = CustomEmbedBuilder.createActionButtons([
            {
                customId: `confirm_delete_${id}`,
                label: 'Confirmar Eliminación',
                style: 4, // Danger
                emoji: '🗑️'
            },
            {
                customId: `cancel_delete_${id}`,
                label: 'Cancelar',
                style: 2, // Secondary
                emoji: '❌'
            }
        ]);

        await interaction.reply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Confirmar Eliminación',
                `¿Estás seguro de que quieres eliminar el anuncio "${id}"?\n\n**Esta acción no se puede deshacer.**`,
                'warning'
            )],
            components: [confirmButtons],
            ephemeral: true
        });
    },

    async handlePreviewAnnouncement(interaction) {
        const id = interaction.options.getString('id');
        const config = await this.getConfig();

        if (!config.announcements[id]) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No existe un anuncio con el ID "${id}".`,
                    'error'
                )],
                ephemeral: true
            });
        }

        try {
            const embed = CustomEmbedBuilder.createAnnouncementEmbed(id);
            const selectMenu = CustomEmbedBuilder.createTicketSelectMenu(id);

            await interaction.reply({
                content: `**Vista previa del anuncio "${id}":**`,
                embeds: [embed],
                components: [selectMenu],
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al generar vista previa: ${error.message}`,
                    'error'
                )],
                ephemeral: true
            });
        }
    },

    async handleAddOption(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const id = interaction.options.getString('id');
        const label = interaction.options.getString('label');
        const description = interaction.options.getString('description');
        const value = interaction.options.getString('value');
        const emoji = interaction.options.getString('emoji');

        const config = await this.getConfig();

        if (!config.announcements[id]) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No existe un anuncio con el ID "${id}".`,
                    'error'
                )]
            });
        }

        if (!config.announcements[id].options) {
            config.announcements[id].options = [];
        }

        // Verificar que el valor no exista
        const existingOption = config.announcements[id].options.find(opt => opt.value === value);
        if (existingOption) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Ya existe una opción con el valor "${value}".`,
                    'error'
                )]
            });
        }

        // Añadir nueva opción
        const newOption = { label, description, value };
        if (emoji) newOption.emoji = emoji;

        config.announcements[id].options.push(newOption);

        await this.saveConfig(config);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Opción Añadida',
                `Se ha añadido la opción "${label}" al anuncio "${id}".`,
                'success'
            )]
        });
    },

    async getConfig() {
        const configPath = path.join(__dirname, '../../config.json');
        return await fs.readJson(configPath);
    },

    async saveConfig(config) {
        const configPath = path.join(__dirname, '../../config.json');
        await fs.writeJson(configPath, config, { spaces: 2 });
    }
};