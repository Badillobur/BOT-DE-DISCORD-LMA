const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const ConfigManager = require('../../utils/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-config')
        .setDescription('Gestionar configuración específica del servidor')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Ver configuración actual del servidor'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Establecer configuración personalizada')
                .addStringOption(option =>
                    option.setName('clave')
                        .setDescription('Configuración a cambiar')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Prefijo', value: 'prefix' },
                            { name: 'Color de Embeds', value: 'embedColor' },
                            { name: 'Categoría de Tickets', value: 'ticketCategory' },
                            { name: 'Canal de Logs', value: 'logChannel' }
                        ))
                .addStringOption(option =>
                    option.setName('valor')
                        .setDescription('Nuevo valor')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Restablecer a configuración global'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Exportar configuración del servidor'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('import')
                .setDescription('Importar configuración')
                .addAttachmentOption(option =>
                    option.setName('archivo')
                        .setDescription('Archivo de configuración JSON')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Crear copia de seguridad de configuraciones'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('compare')
                .setDescription('Comparar con configuración global'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('validate')
                .setDescription('Validar configuración actual')),

    adminOnly: true,

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'view':
                    await this.handleViewConfig(interaction);
                    break;
                
                case 'set':
                    await this.handleSetConfig(interaction);
                    break;
                
                case 'reset':
                    await this.handleResetConfig(interaction);
                    break;
                
                case 'export':
                    await this.handleExportConfig(interaction);
                    break;
                
                case 'import':
                    await this.handleImportConfig(interaction);
                    break;
                
                case 'backup':
                    await this.handleBackupConfig(interaction);
                    break;
                
                case 'compare':
                    await this.handleCompareConfig(interaction);
                    break;
                
                case 'validate':
                    await this.handleValidateConfig(interaction);
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
            console.error('❌ Error en server-config:', error);
            
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

    async handleViewConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const fullConfig = await ConfigManager.getGuildConfig(guildId);
        const specificConfig = await ConfigManager.getGuildSpecificConfig(guildId);
        
        const hasCustomizations = Object.keys(specificConfig).length > 0;
        
        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            `Configuración de ${interaction.guild.name}`,
            hasCustomizations ? 
                'Este servidor tiene configuraciones personalizadas.' : 
                'Este servidor usa la configuración global por defecto.',
            'info'
        );

        embed.addFields(
            { name: '🔧 Prefijo', value: fullConfig.prefix || 'No definido', inline: true },
            { name: '🎨 Color de Embeds', value: fullConfig.embedColor || 'Por defecto', inline: true },
            { name: '📁 Categoría de Tickets', value: fullConfig.ticketCategory || 'TICKETS', inline: true },
            { name: '📋 Canal de Logs', value: fullConfig.logChannel || 'logs', inline: true },
            { name: '👥 Roles Admin', value: fullConfig.adminRoles?.join(', ') || 'Ninguno', inline: false },
            { name: '📢 Anuncios Disponibles', value: Object.keys(fullConfig.announcements || {}).join(', ') || 'Ninguno', inline: false }
        );

        if (hasCustomizations) {
            let customizationText = '';
            Object.keys(specificConfig).forEach(key => {
                if (key !== 'announcements') {
                    customizationText += `• **${key}**: Personalizado\n`;
                }
            });
            
            if (specificConfig.announcements) {
                customizationText += `• **announcements**: ${Object.keys(specificConfig.announcements).length} personalizados\n`;
            }
            
            embed.addFields({ 
                name: '⚙️ Personalizaciones', 
                value: customizationText || 'Ninguna', 
                inline: false 
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleSetConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const clave = interaction.options.getString('clave');
        const valor = interaction.options.getString('valor');

        // Validaciones específicas
        if (clave === 'embedColor' && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(valor)) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error de Validación',
                    'El color debe ser un valor hexadecimal válido (ej: #FF0000)',
                    'error'
                )]
            });
        }

        if (clave === 'prefix' && valor.length > 3) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error de Validación',
                    'El prefijo no puede tener más de 3 caracteres.',
                    'error'
                )]
            });
        }

        try {
            const oldConfig = await ConfigManager.getGuildConfig(guildId);
            const oldValue = oldConfig[clave];
            
            await ConfigManager.updateGuildConfig(guildId, clave, valor);
            
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Configuración Actualizada',
                    `**${clave}** del servidor actualizado:\n\n**Antes:** \`${oldValue || 'No definido'}\`\n**Ahora:** \`${valor}\`\n\n*Esta configuración solo afecta a este servidor.*`,
                    'success'
                )]
            });
        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No se pudo actualizar la configuración: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleResetConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const deleted = await ConfigManager.deleteGuildConfig(guildId);

        if (deleted) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Configuración Restablecida',
                    'Se han eliminado todas las personalizaciones del servidor.\nAhora se usa la configuración global por defecto.',
                    'success'
                )]
            });
        } else {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Cambios',
                    'Este servidor ya usa la configuración global por defecto.',
                    'info'
                )]
            });
        }
    },

    async handleExportConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guildId = interaction.guild.id;
            const configData = await ConfigManager.exportGuildConfig(guildId);
            
            const configJson = JSON.stringify(configData, null, 2);
            const fileName = `${interaction.guild.name.replace(/[^a-zA-Z0-9]/g, '_')}_config.json`;
            
            const attachment = new AttachmentBuilder(
                Buffer.from(configJson, 'utf-8'),
                { name: fileName }
            );

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Configuración Exportada',
                    `Se ha exportado la configuración del servidor.\n\n**Archivo:** ${fileName}\n**Tamaño:** ${(configJson.length / 1024).toFixed(2)} KB`,
                    'success'
                )],
                files: [attachment]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No se pudo exportar la configuración: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleImportConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const attachment = interaction.options.getAttachment('archivo');
            
            if (!attachment.name.endsWith('.json')) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        'El archivo debe ser un JSON válido.',
                        'error'
                    )]
                });
            }

            // Descargar y parsear archivo
            const response = await fetch(attachment.url);
            const configText = await response.text();
            const configData = JSON.parse(configText);

            // Validar estructura
            if (!configData.customizations && !configData.fullConfig) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        'El archivo no tiene el formato correcto.',
                        'error'
                    )]
                });
            }

            // Validar configuración
            const validation = ConfigManager.validateConfig(configData.customizations || configData.fullConfig);
            if (!validation.valid) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error de Validación',
                        `Errores encontrados:\n${validation.errors.map(e => `• ${e}`).join('\n')}`,
                        'error'
                    )]
                });
            }

            const guildId = interaction.guild.id;
            await ConfigManager.importGuildConfig(guildId, configData);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Configuración Importada',
                    'La configuración ha sido importada exitosamente al servidor.',
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No se pudo importar la configuración: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleBackupConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const backupPath = await ConfigManager.createBackup();
            const backupName = backupPath.split(/[/\\]/).pop();

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Copia de Seguridad Creada',
                    `Se ha creado una copia de seguridad completa de todas las configuraciones.\n\n**Ubicación:** \`${backupName}\`\n**Fecha:** ${new Date().toLocaleString()}`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No se pudo crear la copia de seguridad: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleCompareConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const guildConfig = await ConfigManager.getGuildConfig(guildId);
        const specificConfig = await ConfigManager.getGuildSpecificConfig(guildId);
        
        if (Object.keys(specificConfig).length === 0) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Diferencias',
                    'Este servidor usa exactamente la configuración global.',
                    'info'
                )]
            });
        }

        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            'Comparación de Configuraciones',
            'Diferencias entre la configuración del servidor y la global:',
            'info'
        );

        Object.keys(specificConfig).forEach(key => {
            if (key !== 'announcements') {
                embed.addFields({
                    name: `🔧 ${key}`,
                    value: `**Servidor:** \`${JSON.stringify(specificConfig[key])}\``,
                    inline: false
                });
            }
        });

        if (specificConfig.announcements) {
            const customAnnouncements = Object.keys(specificConfig.announcements).join(', ');
            embed.addFields({
                name: '📢 Anuncios Personalizados',
                value: customAnnouncements,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleValidateConfig(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const config = await ConfigManager.getGuildConfig(guildId);
        const validation = ConfigManager.validateConfig(config);

        if (validation.valid) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Configuración Válida',
                    '✅ La configuración del servidor es válida y no tiene errores.',
                    'success'
                )]
            });
        } else {
            const errorList = validation.errors.map(error => `• ${error}`).join('\n');
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Errores de Configuración',
                    `Se encontraron los siguientes errores:\n\n${errorList}`,
                    'error'
                )]
            });
        }
    }
};