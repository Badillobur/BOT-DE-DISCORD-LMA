const { SlashCommandBuilder } = require('discord.js');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Crear un anuncio con sistema de tickets')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de anuncio a crear')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(config.announcements).map(key => ({
                        name: key.charAt(0).toUpperCase() + key.slice(1),
                        value: key
                    }))
                ))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde enviar el anuncio (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('Título personalizado (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('descripcion')
                .setDescription('Descripción personalizada (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('imagen')
                .setDescription('URL de imagen personalizada (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Color del embed en hexadecimal (opcional, ej: #FF0000)')
                .setRequired(false)),

    adminOnly: true,

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const tipo = interaction.options.getString('tipo');
            const canal = interaction.options.getChannel('canal') || interaction.channel;
            const titulo = interaction.options.getString('titulo');
            const descripcion = interaction.options.getString('descripcion');
            const imagen = interaction.options.getString('imagen');
            const color = interaction.options.getString('color');

            // Verificar que el tipo de anuncio existe
            if (!config.announcements[tipo]) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        `El tipo de anuncio "${tipo}" no existe en la configuración.`,
                        'error'
                    )]
                });
            }

            // Datos personalizados
            const customData = {};
            if (titulo) customData.title = titulo;
            if (descripcion) customData.description = descripcion;
            if (imagen) customData.image = imagen;
            if (color) customData.color = color;

            // Crear embed del anuncio
            const embed = CustomEmbedBuilder.createAnnouncementEmbed(tipo, customData);
            
            // Crear menú de selección
            const selectMenu = CustomEmbedBuilder.createTicketSelectMenu(tipo);

            // Enviar anuncio
            const message = await canal.send({
                embeds: [embed],
                components: [selectMenu]
            });

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Anuncio Creado',
                    `El anuncio ha sido enviado exitosamente a ${canal}.\n\n[Ver mensaje](${message.url})`,
                    'success'
                )]
            });

        } catch (error) {
            console.error('❌ Error creando anuncio:', error);
            
            const errorMessage = {
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al crear el anuncio. Verifica los parámetros.',
                    'error'
                )]
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ ...errorMessage, ephemeral: true });
            }
        }
    },
};