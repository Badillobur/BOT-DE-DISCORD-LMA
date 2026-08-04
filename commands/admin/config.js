const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurar el bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Ver configuración actual'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Cambiar una configuración')
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
                .setName('backup')
                .setDescription('Crear respaldo de la configuración'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Restablecer configuración por defecto')),

    adminOnly: true,

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'view':
                    await this.handleViewConfig(interaction);
                    break;
                
                case 'set':
                    await this.handleSetConfig(interaction);
                    break;
                
                case 'backup':
                    await this.handleBackupConfig(interaction);
                    break;
                
                case 'reset':
                    await this.handleResetConfig(interaction);
                    break;
                
                default:
                    await interaction.editReply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'Subcomando no válido.',
                            'error'
                        )]
                    });
            }

        } catch (error) {
            console.error('❌ Error en comando config:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al ejecutar el comando.',
                    'error'
                )]
            });
        }
    },

    async handleViewConfig(interaction) {
        const config = require('../../config.json');
        
        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            'Configuración Actual',
            `**Prefijo:** ${config.prefix}\n**Color de Embeds:** ${config.embedColor}\n**Roles Admin:** ${config.adminRoles.join(', ')}\n**Categoría de Tickets:** ${config.ticketCategory}\n**Canal de Logs:** ${config.logChannel}\n**Anuncios Disponibles:** ${Object.keys(config.announcements).join(', ')}`,
            'info'
        );

        await interaction.editReply({ embeds: [embed] });
    },

    async handleSetConfig(interaction) {
        const clave = interaction.options.getString('clave');
        const valor = interaction.options.getString('valor');
        
        const configPath = path.join(__dirname, '../../config.json');
        const config = await fs.readJson(configPath);

        // Validaciones
        if (clave === 'embedColor' && !valor.startsWith('#')) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'El color debe empezar con # (ejemplo: #FF0000)',
                    'error'
                )]
            });
        }

        if (clave === 'prefix' && valor.length > 3) {
            return await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'El prefijo no puede tener más de 3 caracteres.',
                    'error'
                )]
            });
        }

        // Actualizar configuración
        const oldValue = config[clave];
        config[clave] = valor;

        await fs.writeJson(configPath, config, { spaces: 2 });

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Configuración Actualizada',
                `**${clave}** cambiado de \`${oldValue}\` a \`${valor}\`\n\n*Reinicia el bot para aplicar algunos cambios.*`,
                'success'
            )]
        });
    },

    async handleBackupConfig(interaction) {
        const configPath = path.join(__dirname, '../../config.json');
        const backupPath = path.join(__dirname, '../../config-backup.json');
        
        await fs.copy(configPath, backupPath);

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Respaldo Creado',
                'Se ha creado un respaldo de la configuración en `config-backup.json`',
                'success'
            )]
        });
    },

    async handleResetConfig(interaction) {
        const defaultConfig = {
            "token": "TU_TOKEN_AQUI",
            "clientId": "TU_CLIENT_ID_AQUI",
            "prefix": "!",
            "embedColor": "#00FF88",
            "adminRoles": ["Admin", "Moderador"],
            "ticketCategory": "TICKETS",
            "logChannel": "logs",
            "announcements": {
                "foxrank": {
                    "title": "Fox Rank | Supreme",
                    "description": "**FEATURES:**\n\n• **Combat Mastery**\n> Rage Aim / Silent Aim / Aimbot Assist\n\n• **Weaponry**\n> Automatic Weapon Switch / Fast Fire\n\n• **Movement & Stealth**\n> Teleport / Speed / Teleport\n\n• **Tactics**\n> Cover Hit / No Hit Delay / Auto Assault\n\n• **Extra**\n> Wallhack / Esp / Chmas /& More Hidden Functions...",
                    "image": "https://i.imgur.com/example.png",
                    "color": "#00FF88",
                    "options": [
                        {
                            "label": "Panel Supreme - 3 Soles",
                            "description": "Tiempo: 1 Día",
                            "emoji": "💎",
                            "value": "panel_3soles"
                        },
                        {
                            "label": "Panel Supreme - 8 Soles",
                            "description": "Tiempo: 7 Día",
                            "emoji": "💎",
                            "value": "panel_8soles"
                        },
                        {
                            "label": "Panel Supreme - 20 Soles",
                            "description": "Tiempo: 30 Día",
                            "emoji": "💎",
                            "value": "panel_20soles"
                        }
                    ]
                }
            }
        };

        const configPath = path.join(__dirname, '../../config.json');
        await fs.writeJson(configPath, defaultConfig, { spaces: 2 });

        await interaction.editReply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Configuración Restablecida',
                'La configuración ha sido restablecida a los valores por defecto.\n\n*Recuerda configurar tu token y client ID.*',
                'success'
            )]
        });
    }
};